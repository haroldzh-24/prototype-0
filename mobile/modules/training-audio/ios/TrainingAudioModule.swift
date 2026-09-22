import ExpoModulesCore
import AVFoundation
import AudioToolbox

public final class TrainingAudioModule: Module {
  private let lock = NSLock()
  private var cancelled = Set<String>()
  private var jobs = Set<String>()
  private var running = false
  private var reader: AVAssetReader?
  private var progress = 0.0

  public func definition() -> ModuleDefinition {
    Name("TrainingAudio")
    Function("prepare") { (jobId: String) in
      self.lock.lock()
      defer { self.lock.unlock() }
      guard self.jobs.isEmpty else { throw self.failure("Audio extraction already running.") }
      self.jobs.insert(jobId)
      self.progress = 0
    }
    Function("release") { (jobId: String) in
      self.lock.lock()
      defer { self.lock.unlock() }
      if !self.running { self.jobs.remove(jobId); self.cancelled.remove(jobId) }
    }
    Function("progress") { (jobId: String) -> Double in
      self.lock.lock()
      defer { self.lock.unlock() }
      return self.jobs.contains(jobId) ? self.progress : 1
    }
    OnDestroy { self.stop() }
    OnAppEntersBackground { self.stop() }
    Function("cancel") { (jobId: String) in
      self.lock.lock()
      if self.jobs.contains(jobId) { self.cancelled.insert(jobId) }
      let reader = self.jobs.contains(jobId) ? self.reader : nil
      self.lock.unlock()
      reader?.cancelReading()
    }
    AsyncFunction("extract") { (uri: String, jobId: String, rate: Int, limitMs: Double) -> [String: Any] in
      self.lock.lock()
      guard self.jobs.contains(jobId), !self.running else {
        self.lock.unlock()
        throw self.failure("Audio extraction already running.")
      }
      self.running = true
      self.lock.unlock()
      defer {
        self.lock.lock()
        self.jobs.remove(jobId)
        self.cancelled.remove(jobId)
        self.reader = nil
        self.running = false
        self.lock.unlock()
      }
      try self.checkCancellation(jobId)
      return try self.decode(uri, jobId: jobId, rate: rate, limitMs: limitMs)
    }.runOnQueue(DispatchQueue(label: "training.audio.decode", qos: .userInitiated))
  }

  private func stop() {
    lock.lock()
    cancelled.formUnion(jobs)
    let current = reader
    lock.unlock()
    current?.cancelReading()
  }

  private func failure(_ message: String) -> NSError {
    NSError(domain: "TrainingAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
  private func checkCancellation(_ jobId: String) throws {
    lock.lock()
    let stopped = cancelled.contains(jobId)
    lock.unlock()
    if stopped { throw failure("Audio analysis cancelled.") }
  }

  private func decode(_ uri: String, jobId: String, rate: Int, limitMs: Double) throws -> [String: Any] {
    // Native safety ceilings match the JS config, even for malformed bridge calls.
    guard rate == 16000, limitMs.isFinite, limitMs > 0, limitMs <= 60000,
      let url = URL(string: uri), url.isFileURL else { throw failure("Unsupported local media request.") }
    let asset = AVURLAsset(url: url)
    let durationMs = CMTimeGetSeconds(asset.duration) * 1000
    guard durationMs.isFinite, durationMs > 0 else { throw failure("Media has zero or invalid duration.") }
    let duration = min(durationMs, limitMs)
    var warnings: [String] = durationMs > limitMs ? ["Duration limit reached; only the first \(Int(limitMs / 1000)) seconds were analyzed."] : []
    let tracks = asset.tracks(withMediaType: .audio)
    guard let track = tracks.first else {
      return ["samples": [Float](), "sampleRate": rate, "offsetMs": 0,
        "durationMs": duration, "warnings": warnings, "noAudio": true]
    }
    if tracks.count > 1 { warnings.append("Multiple audio tracks: only the first track was analyzed.") }
    try checkCancellation(jobId)
    let reader = try AVAssetReader(asset: asset)
    lock.lock(); self.reader = reader; lock.unlock()
    defer { reader.cancelReading() }
    try checkCancellation(jobId)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
      AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: rate, AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true,
      AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false
    ])
    guard reader.canAdd(output) else { throw failure("Unsupported audio format.") }
    reader.add(output)
    reader.timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: duration / 1000, preferredTimescale: 60000))
    guard reader.startReading() else { throw failure("Audio decode failed: \(reader.error?.localizedDescription ?? "unknown format")") }
    // Preserve video PTS, including audio-track delay and packet gaps. Silence is
    // placed in gaps; PCM sample zero is video zero, not audio-track zero.
    var samples = [Float](repeating: 0, count: Int(ceil(duration * Double(rate) / 1000)))
    var decoded = false
    while let buffer = output.copyNextSampleBuffer() {
      try checkCancellation(jobId)
      try autoreleasepool {
        guard let description = CMSampleBufferGetFormatDescription(buffer),
          let format = CMAudioFormatDescriptionGetStreamBasicDescription(description),
          format.pointee.mSampleRate == Double(rate), format.pointee.mChannelsPerFrame == 1,
          format.pointee.mBitsPerChannel == 32,
          (format.pointee.mFormatFlags & kAudioFormatFlagIsFloat) != 0,
          let block = CMSampleBufferGetDataBuffer(buffer) else { throw failure("Unsupported decoded PCM layout.") }
        let pts = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(buffer))
        guard pts.isFinite, abs(pts) < 86400 else { throw failure("Invalid audio timestamps.") }
        let count = CMSampleBufferGetNumSamples(buffer)
        guard count > 0, count <= rate * 2, CMBlockBufferGetDataLength(block) == count * MemoryLayout<Float>.size else {
          throw failure("Malformed decoded audio buffer.")
        }
        var packet = [Float](repeating: 0, count: count)
        let status = packet.withUnsafeMutableBytes { bytes in
          CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: bytes.count, destination: bytes.baseAddress!)
        }
        guard status == kCMBlockBufferNoErr else { throw failure("Audio buffer copy failed.") }
        let start = Int((pts * Double(rate)).rounded())
        for index in packet.indices {
          guard packet[index].isFinite else { throw failure("Malformed PCM sample.") }
          let destination = start + index
          if destination >= 0 && destination < samples.count {
            samples[destination] = max(-1, min(1, packet[index]))
            decoded = true
          }
        }
        lock.lock()
        progress = max(progress, min(1, max(0, (pts * 1000) / duration)))
        lock.unlock()
      }
    }
    try checkCancellation(jobId)
    guard reader.status == .completed else { throw failure("Audio decode failed: \(reader.error?.localizedDescription ?? "incomplete stream")") }
    if !decoded { warnings.append("Audio track contains no samples in the analyzed interval.") }
    return ["samples": samples, "sampleRate": rate, "offsetMs": 0,
      "durationMs": duration, "warnings": warnings, "noAudio": false]
  }
}
