import ExpoModulesCore
import PhotosUI
import UniformTypeIdentifiers
import UIKit

private func mediaFailure(_ message: String) -> NSError {
  NSError(domain: "TrainingMedia", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

/// PHPicker runs out of process: the app only receives the item the user picks, so no photo library
/// permission (NSPhotoLibraryUsageDescription) is requested or needed. One delegate per media kind.
private final class MediaPickerDelegate: NSObject, PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
  let type: UTType
  let noun: String
  let fallbackExtension: String
  var completion: ((Result<[String: Any]?, Error>) -> Void)?

  init(type: UTType, noun: String, fallbackExtension: String) {
    self.type = type
    self.noun = noun
    self.fallbackExtension = fallbackExtension
    super.init()
  }

  func finish(_ result: Result<[String: Any]?, Error>) {
    let callback = completion
    completion = nil
    callback?(result)
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    guard let provider = results.first?.itemProvider else { finish(.success(nil)); return }
    guard provider.hasItemConformingToTypeIdentifier(type.identifier) else {
      finish(.failure(mediaFailure("Choose a \(self.noun).")))
      return
    }
    let suggested = provider.suggestedName
    let fallback = fallbackExtension
    let label = self.noun
    _ = provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, error in
      // The system deletes the provided file when this handler returns, so copy it first.
      guard let url = url else {
        DispatchQueue.main.async { self.finish(.failure(error ?? mediaFailure("The \(label) could not be read."))) }
        return
      }
      do {
        let ext = url.pathExtension.isEmpty ? fallback : url.pathExtension
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent("picked-\(UUID().uuidString).\(ext)")
        try FileManager.default.copyItem(at: url, to: destination)
        let size = (try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        let name = suggested.map { "\($0).\(ext)" } ?? url.lastPathComponent
        DispatchQueue.main.async { self.finish(.success(["uri": destination.absoluteString, "name": name, "size": size])) }
      } catch {
        DispatchQueue.main.async { self.finish(.failure(error)) }
      }
    }
  }

  /// Swiping the picker sheet away counts as cancel, so the promise always settles.
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish(.success(nil))
  }
}

public final class TrainingMediaModule: Module {
  private let videoDelegate = MediaPickerDelegate(type: .movie, noun: "video", fallbackExtension: "mov")
  /// Stage diagrams: match book pages, printouts and screenshots from the photo album (HEIC, JPEG or PNG).
  private let imageDelegate = MediaPickerDelegate(type: .image, noun: "picture", fallbackExtension: "jpg")

  private func present(_ delegate: MediaPickerDelegate, filter: PHPickerFilter, promise: Promise) {
    guard videoDelegate.completion == nil, imageDelegate.completion == nil else {
      promise.reject("PICKER_BUSY", "The photo picker is already open.")
      return
    }
    guard let controller = self.appContext?.utilities?.currentViewController(),
          controller.viewIfLoaded?.window != nil,
          controller.presentedViewController == nil else {
      promise.reject("PICKER_UNAVAILABLE", "Close the current panel and try again.")
      return
    }
    var configuration = PHPickerConfiguration()
    configuration.filter = filter
    configuration.selectionLimit = 1
    configuration.preferredAssetRepresentationMode = .current
    let picker = PHPickerViewController(configuration: configuration)
    picker.delegate = delegate
    picker.presentationController?.delegate = delegate
    delegate.completion = { result in
      switch result {
      case .success(let value): promise.resolve(value)
      case .failure(let error): promise.reject(error)
      }
    }
    controller.present(picker, animated: true)
  }

  public func definition() -> ModuleDefinition {
    Name("TrainingMedia")
    AsyncFunction("pickVideo") { (promise: Promise) in
      self.present(self.videoDelegate, filter: .videos, promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("pickImage") { (promise: Promise) in
      self.present(self.imageDelegate, filter: .images, promise: promise)
    }.runOnQueue(.main)
  }
}
