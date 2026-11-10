import ExpoModulesCore
import AVFoundation
import Vision
import CoreMedia
import CoreVideo
import ImageIO

public final class TrainingPoseModule: Module {
  private let lock = NSLock()
  private var active: String?
  private var cancelled = false
  private var progress = 0.0
  private var running = false
  private var generator: AVAssetImageGenerator?

  public func definition() -> ModuleDefinition {
    Name("TrainingPose")
    AsyncFunction("displaySize") { (uri: String) -> [String: Double] in
      guard let url = URL(string: uri), url.isFileURL,
        let track = AVURLAsset(url: url).tracks(withMediaType: .video).first else {
        throw self.failure("Video display geometry unavailable.")
      }
      let size = CGRect(origin: .zero, size: track.naturalSize).applying(track.preferredTransform).standardized.size
      guard size.width.isFinite, size.height.isFinite, size.width > 0, size.height > 0 else {
        throw self.failure("Invalid video display geometry.")
      }
      return ["width": Double(size.width), "height": Double(size.height)]
    }.runOnQueue(DispatchQueue(label: "training.pose.metadata", qos: .utility))
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
      guard self.active == nil else { throw self.failure("Movement analysis already running.") }
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
    AsyncFunction("extract") { (uri: String, job: String, fps: Double, limitMs: Double,
                               maxSamples: Int, imageSize: Int, minConfidence: Double) -> [String: Any] in
      defer {
        self.lock.lock()
        if self.active == job { self.active = nil; self.running = false; self.generator = nil }
        self.lock.unlock()
      }
      try self.begin(job)
      try self.check(job)
      return try self.extract(uri, job: job, fps: fps, limitMs: limitMs, maxSamples: maxSamples,
                              imageSize: imageSize, minConfidence: minConfidence)
    }.runOnQueue(DispatchQueue(label: "training.pose.frames", qos: .userInitiated))
    // Every frame between fromMs and toMs (one run of a drill): both hands (Vision hand pose) and the box around the
    // person (works on a partial body). Frames are decoded in order with AVAssetReader, not sampled.
    AsyncFunction("extractHands") { (uri: String, job: String, fromMs: Double, toMs: Double, maxFrames: Int,
                                     imageSize: Int, minConfidence: Double) -> [String: Any] in
      defer {
        self.lock.lock()
        if self.active == job { self.active = nil; self.running = false; self.generator = nil }
        self.lock.unlock()
      }
      try self.begin(job)
      try self.check(job)
      return try self.extractHands(uri, job: job, fromMs: fromMs, toMs: toMs, maxFrames: maxFrames,
                                   imageSize: imageSize, minConfidence: minConfidence)
    }.runOnQueue(DispatchQueue(label: "training.pose.hands", qos: .userInitiated))
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
    NSError(domain: "TrainingPose", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
  private func check(_ job: String) throws {
    lock.lock()
    let stopped = active != job || cancelled
    lock.unlock()
    if stopped { throw failure("Movement analysis cancelled.") }
  }
  /// Upright orientation of a track's buffers from its preferred transform (phones record sideways and rotate on play).
  private func orientation(of transform: CGAffineTransform) -> CGImagePropertyOrientation {
    if transform.a == 0 && transform.b == 1 && transform.c == -1 && transform.d == 0 { return .right }
    if transform.a == 0 && transform.b == -1 && transform.c == 1 && transform.d == 0 { return .left }
    if transform.a == -1 && transform.d == -1 { return .down }
    return .up
  }
  private func extractHands(_ uri: String, job: String, fromMs: Double, toMs: Double, maxFrames: Int,
                            imageSize: Int, minConfidence: Double) throws -> [String: Any] {
    guard fromMs.isFinite, toMs.isFinite, fromMs >= 0, toMs > fromMs, toMs - fromMs <= 30000,
      maxFrames > 0, maxFrames <= 1800, imageSize >= 160, imageSize <= 1280,
      minConfidence.isFinite, minConfidence >= 0, minConfidence <= 1,
      let url = URL(string: uri), url.isFileURL else { throw failure("Unsupported local hand request.") }
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first else { throw failure("Unsupported or zero-duration video.") }
    let natural = track.naturalSize
    guard natural.width > 0, natural.height > 0 else { throw failure("Invalid video geometry.") }
    // Frames at their own size (Vision scales internally); only the pixel format is set, the safest reader setting.
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)
    ])
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw failure("This video can't be read frame by frame.") }
    reader.add(output)
    reader.timeRange = CMTimeRange(start: CMTime(seconds: fromMs / 1000, preferredTimescale: 600),
                                   end: CMTime(seconds: toMs / 1000, preferredTimescale: 600))
    guard reader.startReading() else { throw failure("This video can't be read frame by frame.") }
    defer { if reader.status == .reading { reader.cancelReading() } }
    let upright = orientation(of: track.preferredTransform)
    let sideways = upright == .right || upright == .left
    let width = sideways ? natural.height : natural.width, height = sideways ? natural.width : natural.height
    let joints: [(String, VNHumanHandPoseObservation.JointName)] = [
      ("wrist", .wrist), ("thumbTip", .thumbTip), ("indexMCP", .indexMCP), ("indexTip", .indexTip),
      ("middleMCP", .middleMCP), ("middleTip", .middleTip), ("littleMCP", .littleMCP)
    ]
    var frames: [[String: Any]] = []
    var warnings: [String] = []
    let expected = max(1.0, Double(track.nominalFrameRate) * (toMs - fromMs) / 1000)
    while let sample = output.copyNextSampleBuffer() {
      try check(job)
      if frames.count >= maxFrames { warnings.append("Frame limit reached; the end of the run wasn't tracked."); break }
      try autoreleasepool {
        guard let pixels = CMSampleBufferGetImageBuffer(sample) else { return }
        let ms = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)) * 1000
        guard ms.isFinite else { return }
        let hands = VNDetectHumanHandPoseRequest()
        hands.maximumHandCount = 2
        let person = VNDetectHumanRectanglesRequest()
        person.upperBodyOnly = false
        try VNImageRequestHandler(cvPixelBuffer: pixels, orientation: upright, options: [:]).perform([hands, person])
        var found: [[String: Any]] = []
        for observation in (hands.results ?? []).prefix(2) {
          let points = try observation.recognizedPoints(.all)
          var named: [String: Any] = [:]
          for (name, key) in joints {
            guard let point = points[key], Double(point.confidence) >= minConfidence,
              point.location.x.isFinite, point.location.y.isFinite else { continue }
            named[name] = ["x": Double(point.location.x), "y": 1 - Double(point.location.y), "confidence": Double(point.confidence)]
          }
          let side = observation.chirality == .left ? "left" : observation.chirality == .right ? "right" : "unknown"
          found.append(["chirality": side, "confidence": Double(observation.confidence), "joints": named])
        }
        var frame: [String: Any] = ["timestampMs": ms, "hands": found]
        if let body = (person.results ?? []).max(by: { $0.boundingBox.height < $1.boundingBox.height }) {
          let box = body.boundingBox
          frame["person"] = ["x": Double(box.minX), "y": Double(1 - box.maxY), "width": Double(box.width), "height": Double(box.height), "confidence": Double(body.confidence)]
        }
        frames.append(frame)
      }
      lock.lock()
      progress = min(1, Double(frames.count) / expected)
      lock.unlock()
    }
    try check(job)
    if reader.status == .failed { throw failure("The video stopped decoding: \(reader.error?.localizedDescription ?? "unknown error").") }
    return ["frames": frames, "width": Double(width), "height": Double(height), "fps": Double(track.nominalFrameRate),
            "fromMs": fromMs, "toMs": toMs, "warnings": warnings, "nativeRevision": 3]
  }
  private func extract(_ uri: String, job: String, fps: Double, limitMs: Double,
                       maxSamples: Int, imageSize: Int, minConfidence: Double) throws -> [String: Any] {
    // Native ceilings defend the bridge; the TS config owns requested settings. Up to 60 frames a second for the
    // movement breakdown of a short run (the sample cap keeps the work bounded).
    guard fps.isFinite, fps > 0, fps <= 60, limitMs.isFinite, limitMs > 0, limitMs <= 60000,
      maxSamples > 0, maxSamples <= 600, imageSize > 0, imageSize <= 640,
      minConfidence.isFinite, minConfidence >= 0, minConfidence <= 1,
      let url = URL(string: uri), url.isFileURL else { throw failure("Unsupported local pose request.") }
    let asset = AVURLAsset(url: url)
    let durationMs = CMTimeGetSeconds(asset.duration) * 1000
    guard durationMs.isFinite, durationMs > 0, let track = asset.tracks(withMediaType: .video).first else {
      throw failure("Unsupported or zero-duration video.")
    }
    let duration = min(durationMs, limitMs)
    let transform = track.preferredTransform
    let mirrored = transform.a * transform.d - transform.b * transform.c < 0
    let generator = AVAssetImageGenerator(asset: asset)
    lock.lock(); self.generator = generator; lock.unlock()
    try check(job)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: CGFloat(imageSize), height: CGFloat(imageSize))
    // Actual returned presentation time, not requested time, is authoritative.
    let tolerance = CMTime(seconds: 0.5 / fps, preferredTimescale: 60000)
    generator.requestedTimeToleranceBefore = tolerance
    generator.requestedTimeToleranceAfter = tolerance
    defer { generator.cancelAllCGImageGeneration() }
    let jointNames: [(String, VNHumanBodyPoseObservation.JointName)] = [
      ("nose", .nose), ("neck", .neck), ("leftShoulder", .leftShoulder), ("rightShoulder", .rightShoulder),
      ("leftElbow", .leftElbow), ("rightElbow", .rightElbow), ("leftWrist", .leftWrist), ("rightWrist", .rightWrist),
      ("leftHip", .leftHip), ("rightHip", .rightHip), ("leftKnee", .leftKnee), ("rightKnee", .rightKnee),
      ("leftAnkle", .leftAnkle), ("rightAnkle", .rightAnkle)
    ]
    let count = min(maxSamples, Int(ceil(duration * fps / 1000)))
    var frames: [[String: Any]] = []
    var warnings: [String] = []
    var previousMs = -1.0
    if durationMs > limitMs || Int(ceil(duration * fps / 1000)) > maxSamples {
      warnings.append("Pose analysis limit reached; only the initial bounded video interval was sampled.")
    }
    for index in 0..<count {
      try check(job)
      try autoreleasepool {
        var actual = CMTime.zero
        let image = try generator.copyCGImage(at: CMTime(seconds: Double(index) / fps, preferredTimescale: 60000), actualTime: &actual)
        let timestampMs = CMTimeGetSeconds(actual) * 1000
        guard timestampMs.isFinite, timestampMs >= 0 else { throw failure("Invalid video frame timestamp.") }
        if timestampMs <= previousMs || timestampMs > duration { return }
        previousMs = timestampMs
        try check(job)
        let request = VNDetectHumanBodyPoseRequest()
        request.revision = VNDetectHumanBodyPoseRequestRevision1
        // Pixels already include preferred rotation/mirroring; do not rotate twice.
        try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])
        let observations = request.results ?? []
        var people: [[String: Any]] = []
        for observation in observations.prefix(4) {
          let points = try observation.recognizedPoints(.all)
          var joints: [String: Any] = [:]
          for (name, key) in jointNames {
            guard let point = points[key], Double(point.confidence) >= minConfidence,
              point.location.x.isFinite, point.location.y.isFinite,
              point.location.x >= 0, point.location.x <= 1, point.location.y >= 0, point.location.y <= 1 else { continue }
            joints[name] = ["x": Double(point.location.x), "y": 1 - Double(point.location.y), "confidence": Double(point.confidence)]
          }
          people.append(["confidence": Double(observation.confidence), "joints": joints])
        }
        frames.append(["timestampMs": timestampMs, "width": image.width, "height": image.height,
                       "mirrored": mirrored, "people": people, "crowded": observations.count > 4])
      }
      lock.lock()
      progress = Double(index + 1) / Double(count)
      lock.unlock()
    }
    try check(job)
    return ["frames": frames, "durationMs": duration, "warnings": warnings, "nativeRevision": 2]
  }
}
