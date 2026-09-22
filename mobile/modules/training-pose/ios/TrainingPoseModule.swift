import ExpoModulesCore
import AVFoundation
import Vision

public final class TrainingPoseModule: Module {
  private let lock = NSLock()
  private var active: String?
  private var cancelled = false
  private var progress = 0.0

  public func definition() -> ModuleDefinition {
    Name("TrainingPose")
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
      self.lock.unlock()
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
        if self.active == job { self.active = nil }
        self.lock.unlock()
      }
      try self.check(job)
      return try self.extract(uri, job: job, fps: fps, limitMs: limitMs, maxSamples: maxSamples,
                              imageSize: imageSize, minConfidence: minConfidence)
    }.runOnQueue(DispatchQueue(label: "training.pose.frames", qos: .userInitiated))
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
  private func extract(_ uri: String, job: String, fps: Double, limitMs: Double,
                       maxSamples: Int, imageSize: Int, minConfidence: Double) throws -> [String: Any] {
    // Native ceilings defend the bridge; the TS config owns requested settings.
    guard fps.isFinite, fps > 0, fps <= 10, limitMs.isFinite, limitMs > 0, limitMs <= 60000,
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
    return ["frames": frames, "durationMs": duration, "warnings": warnings, "nativeRevision": 1]
  }
}
