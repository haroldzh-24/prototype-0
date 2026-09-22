import ExpoModulesCore
import AVFoundation
import Vision

public final class TrainingCloseUpModule: Module {
  private let lock = NSLock()
  private var active: String?
  private var cancelled = false
  private var progress = 0.0
  private var running = false
  private var generator: AVAssetImageGenerator?

  public func definition() -> ModuleDefinition {
    Name("TrainingCloseUp")
    OnDestroy { self.stop() }
    OnAppEntersBackground { self.stop() }
    Function("release") { (job: String) in
      self.lock.lock()
      defer { self.lock.unlock() }
      if self.active == job && !self.running { self.active = nil }
    }
    // Reserve synchronously so cancellation also works while extract is queued.
    Function("prepare") { (job: String) in
      self.lock.lock()
      defer { self.lock.unlock() }
      guard self.active == nil else { throw self.failure("Close-up analysis already running.") }
      self.active = job
      self.cancelled = false
      self.progress = 0
    }
    Function("cancel") { (job: String) in
      self.lock.lock()
      if self.active == job { self.cancelled = true }
      let generator = self.active == job ? self.generator : nil
      self.lock.unlock()
      generator?.cancelAllCGImageGeneration()
    }
    Function("progress") { (job: String) -> Double in
      self.lock.lock()
      defer { self.lock.unlock() }
      return self.active == job ? self.progress : 1
    }
    AsyncFunction("extract") { (uri: String, job: String, startMs: Double, region: [String: Double]) -> [String: Any] in
      defer { self.lock.lock(); if self.active == job { self.active = nil; self.running = false; self.generator = nil }; self.lock.unlock() }
      try self.begin(job)
      try self.check(job)
      return try self.extract(uri, job: job, startMs: startMs, region: region)
    }.runOnQueue(DispatchQueue(label: "training.close.frames", qos: .userInitiated))
  }
  private func begin(_ job: String) throws {
    lock.lock()
    defer { lock.unlock() }
    guard active == job, !running else { throw failure("Analysis job is no longer available.") }
    running = true
  }
  private func stop() {
    lock.lock()
    cancelled = true
    let current = generator
    lock.unlock()
    current?.cancelAllCGImageGeneration()
  }
  private func failure(_ message: String) -> NSError {
    NSError(domain: "TrainingCloseUp", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
  private func check(_ job: String) throws {
    lock.lock()
    let stopped = active != job || cancelled
    lock.unlock()
    if stopped { throw failure("Close-up analysis cancelled.") }
  }
  private func extract(_ uri: String, job: String, startMs: Double, region: [String: Double]) throws -> [String: Any] {
    guard let url = URL(string: uri), url.isFileURL, startMs.isFinite, startMs >= 0,
      let x = region["x"], let y = region["y"], let w = region["width"], let h = region["height"],
      [x,y,w,h].allSatisfy({ $0.isFinite }), x >= 0, y >= 0, w > 0, h > 0, x+w <= 1, y+h <= 1 else {
      throw failure("Invalid selected region or local media.")
    }
    let asset = AVURLAsset(url: url)
    let rawDuration = CMTimeGetSeconds(asset.duration) * 1000
    guard rawDuration.isFinite, rawDuration > 0, asset.tracks(withMediaType: .video).first != nil else { throw failure("Unsupported or empty video.") }
    let duration = min(rawDuration, 60000)
    guard startMs < duration else { throw failure("Select a frame within the first 60 seconds.") }
    let generator = AVAssetImageGenerator(asset: asset)
    lock.lock(); self.generator = generator; lock.unlock()
    try check(job)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: 640, height: 640)
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero
    defer { generator.cancelAllCGImageGeneration() }
    var tracked: VNDetectedObjectObservation? = VNDetectedObjectObservation(boundingBox: CGRect(x: x, y: 1-y-h, width: w, height: h))
    let sequence = VNSequenceRequestHandler()
    var previousImage: CGImage?
    var previousMs = -1.0
    var frames: [[String: Any]] = []
    var warnings = ["Tracking starts at the selected frame; earlier event windows are unavailable.",
      "Global registration estimates ambiguity; it does not compensate camera motion."]
    if rawDuration > duration { warnings.append("Analysis limited to the first 60 seconds.") }
    let names: [(String, VNHumanHandPoseObservation.JointName)] = [
      ("wrist", .wrist), ("thumbCMC", .thumbCMC), ("thumbMP", .thumbMP), ("thumbIP", .thumbIP), ("thumbTip", .thumbTip),
      ("indexMCP", .indexMCP), ("indexPIP", .indexPIP), ("indexDIP", .indexDIP), ("indexTip", .indexTip),
      ("middleMCP", .middleMCP), ("middlePIP", .middlePIP), ("middleDIP", .middleDIP), ("middleTip", .middleTip),
      ("ringMCP", .ringMCP), ("ringPIP", .ringPIP), ("ringDIP", .ringDIP), ("ringTip", .ringTip),
      ("littleMCP", .littleMCP), ("littlePIP", .littlePIP), ("littleDIP", .littleDIP), ("littleTip", .littleTip)]
    let count = min(600, Int(ceil((duration-startMs)/100)))
    for index in 0..<count {
      try check(job)
      try autoreleasepool {
        var actual = CMTime.zero
        let image = try generator.copyCGImage(at: CMTime(seconds: (startMs + Double(index)*100)/1000, preferredTimescale: 60000), actualTime: &actual)
        let ms = CMTimeGetSeconds(actual)*1000
        guard ms.isFinite, ms >= 0, ms <= duration, ms > previousMs else { return }
        try check(job)
        if let previous = previousImage, previous.width != image.width || previous.height != image.height {
          tracked = nil
          previousImage = nil
        }
        previousMs = ms
        let request = VNDetectHumanHandPoseRequest()
        request.maximumHandCount = 2
        request.revision = VNDetectHumanHandPoseRequestRevision1
        try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])
        var hands: [[String: Any]] = []
        for hand in request.results ?? [] {
          let points = try hand.recognizedPoints(.all)
          var joints: [String: Any] = [:]
          for (name, key) in names {
            guard let p = points[key], p.confidence >= 0.45, p.location.x.isFinite, p.location.y.isFinite,
              p.location.x >= 0, p.location.x <= 1, p.location.y >= 0, p.location.y <= 1 else { continue }
            joints[name] = ["x": Double(p.location.x), "y": 1-Double(p.location.y), "confidence": Double(p.confidence)]
          }
          hands.append(["joints": joints])
        }
        var object: [String: Any] = ["status": "LOST", "confidence": 0.0]
        if let observation = tracked {
          let tracking = VNTrackObjectRequest(detectedObjectObservation: observation)
          tracking.trackingLevel = .accurate
          do {
            try sequence.perform([tracking], on: image, orientation: .up)
            if let result = tracking.results?.first as? VNDetectedObjectObservation, result.confidence >= 0.45 {
              let r = result.boundingBox
              if [r.minX, r.minY, r.maxX, r.maxY, r.width, r.height].allSatisfy({ $0.isFinite })
                && r.minX >= 0 && r.minY >= 0 && r.maxX <= 1 && r.maxY <= 1 && r.width > 0 && r.height > 0 {
                tracked = result
                object = ["status": "TRACKED", "confidence": Double(result.confidence),
                  "region": ["x": Double(r.minX), "y": 1-Double(r.maxY), "width": Double(r.width), "height": Double(r.height)],
                  "center": ["x": Double(r.midX), "y": 1-Double(r.midY)]]
              } else { tracked = nil }
            } else { tracked = nil }
          } catch { tracked = nil }
        }
        var global: Any = NSNull()
        if let previous = previousImage {
          let registration = VNTranslationalImageRegistrationRequest(targetedCGImage: previous, options: [:])
          if (try? VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([registration])) != nil,
             let result = registration.results?.first as? VNImageTranslationAlignmentObservation {
            let t = result.alignmentTransform
            if t.tx.isFinite && t.ty.isFinite { global = ["x": Double(t.tx)/Double(image.width), "y": -Double(t.ty)/Double(image.height)] }
          }
        }
        previousImage = image
        frames.append(["timestampMs": ms, "width": image.width, "height": image.height, "hands": hands, "object": object, "globalMotion": global])
      }
      lock.lock(); progress = Double(index+1)/Double(count); lock.unlock()
    }
    try check(job)
    return ["durationMs": duration, "frames": frames, "warnings": warnings]
  }
}
