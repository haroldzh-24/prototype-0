import ExpoModulesCore
import PhotosUI
import UniformTypeIdentifiers
import UIKit

private func mediaFailure(_ message: String) -> NSError {
  NSError(domain: "TrainingMedia", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

/// PHPicker runs out of process: the app only receives the item the user picks, so no photo library
/// permission (NSPhotoLibraryUsageDescription) is requested or needed.
private final class VideoPickerDelegate: NSObject, PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
  var completion: ((Result<[String: Any]?, Error>) -> Void)?

  func finish(_ result: Result<[String: Any]?, Error>) {
    let callback = completion
    completion = nil
    callback?(result)
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    guard let provider = results.first?.itemProvider else { finish(.success(nil)); return }
    guard provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) else {
      finish(.failure(mediaFailure("Choose a video.")))
      return
    }
    let suggested = provider.suggestedName
    _ = provider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { url, error in
      // The system deletes the provided file when this handler returns, so copy it first.
      guard let url = url else {
        DispatchQueue.main.async { self.finish(.failure(error ?? mediaFailure("The video could not be read."))) }
        return
      }
      do {
        let ext = url.pathExtension.isEmpty ? "mov" : url.pathExtension
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
  private let pickerDelegate = VideoPickerDelegate()

  public func definition() -> ModuleDefinition {
    Name("TrainingMedia")
    AsyncFunction("pickVideo") { (promise: Promise) in
      guard self.pickerDelegate.completion == nil else {
        promise.reject("PICKER_BUSY", "The video picker is already open.")
        return
      }
      guard let controller = self.appContext?.utilities?.currentViewController(),
            controller.viewIfLoaded?.window != nil,
            controller.presentedViewController == nil else {
        promise.reject("PICKER_UNAVAILABLE", "Close the current panel and try again.")
        return
      }
      var configuration = PHPickerConfiguration()
      configuration.filter = .videos
      configuration.selectionLimit = 1
      configuration.preferredAssetRepresentationMode = .current
      let picker = PHPickerViewController(configuration: configuration)
      picker.delegate = self.pickerDelegate
      picker.presentationController?.delegate = self.pickerDelegate
      self.pickerDelegate.completion = { result in
        switch result {
        case .success(let value): promise.resolve(value)
        case .failure(let error): promise.reject(error)
        }
      }
      controller.present(picker, animated: true)
    }.runOnQueue(.main)
  }
}
