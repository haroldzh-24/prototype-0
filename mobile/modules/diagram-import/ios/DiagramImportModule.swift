import ExpoModulesCore
import PDFKit
import Vision
import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit
import AVFoundation
import ImageIO
import QuickLook

private func failure(_ message: String) -> NSError {
  NSError(domain: "DiagramImport", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}
private func localURL(_ uri: String) throws -> URL {
  guard let url = URL(string: uri), url.isFileURL,
        [FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].standardizedFileURL.path + "/", NSTemporaryDirectory()].contains(where: { url.standardizedFileURL.path.hasPrefix($0) }) else { throw failure("Only app-owned local documents are supported.") }
  let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
  guard size > 0 && size <= 50 * 1024 * 1024 else { throw failure("Choose a document up to 50 MB.") }
  return url
}
private func writeImage(_ image: UIImage, pageCount: Int = 1) throws -> [String: Any] {
  guard let cg = image.cgImage, let data = image.pngData() else { throw failure("Could not render the document.") }
  let url = FileManager.default.temporaryDirectory.appendingPathComponent("diagram-\(UUID().uuidString).png")
  try data.write(to: url, options: .atomic)
  return ["uri": url.absoluteString, "width": cg.width, "height": cg.height, "pageCount": pageCount]
}
private func loadImage(_ url: URL) throws -> UIImage {
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
        let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
        let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
        width.doubleValue.isFinite, height.doubleValue.isFinite,
        width.doubleValue > 0, height.doubleValue > 0,
        width.doubleValue * height.doubleValue <= 80_000_000 else { throw failure("Image is unreadable or exceeds 80 megapixels. Export a smaller diagram; the original is preserved.") }
  guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 2048] as CFDictionary) else { throw failure("This image format could not be decoded.") }
  return UIImage(cgImage: cg)
}

private final class PaperCamera: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
  var completion: ((Result<String?, Error>) -> Void)?
  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: false) { self.completion?(.success(nil)); self.completion = nil }
  }
  func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
    var result: Result<String?, Error>
    do {
      guard let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.95) else { throw failure("No photograph was returned.") }
      let url = FileManager.default.temporaryDirectory.appendingPathComponent("paper-\(UUID().uuidString).jpg")
      try data.write(to: url, options: .atomic); result = .success(url.absoluteString)
    } catch { result = .failure(error) }
    picker.dismiss(animated: false) { self.completion?(result); self.completion = nil }
  }
}
private final class OriginalDocument: NSObject, QLPreviewControllerDataSource {
  var url: URL?
  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { url == nil ? 0 : 1 }
  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url! as NSURL }
}

public class DiagramImportModule: Module {
  private let camera = PaperCamera()
  private let original = OriginalDocument()
  public func definition() -> ModuleDefinition {
    Name("DiagramImport")
    AsyncFunction("pixels") { (uri: String) -> [String: Any] in
      let image = try loadImage(localURL(uri))
      guard let cg = image.cgImage else { throw failure("The prepared image is unavailable.") }
      let ratio = min(1, 1024.0 / Double(max(cg.width, cg.height)))
      let width = max(1, Int((Double(cg.width) * ratio).rounded())), height = max(1, Int((Double(cg.height) * ratio).rounded()))
      var data = Data(count: width * height * 4)
      try data.withUnsafeMutableBytes { (bytes: UnsafeMutableRawBufferPointer) in
        guard let context = CGContext(data: bytes.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { throw failure("Could not decode diagram pixels.") }
        context.setFillColor(UIColor.white.cgColor); context.fill(CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
        context.interpolationQuality = .high
        context.draw(cg, in: CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
      }
      return ["width": width, "height": height, "rgba": data.base64EncodedString()]
    }
    AsyncFunction("openOriginal") { (uri: String) in
      let url = try localURL(uri)
      guard let controller = self.appContext?.utilities?.currentViewController(), controller.viewIfLoaded?.window != nil else { throw failure("No active screen is available to open the original document.") }
      self.original.url = url
      let preview = QLPreviewController(); preview.dataSource = self.original
      controller.present(preview, animated: false)
    }.runOnQueue(.main)
    AsyncFunction("capture") { (promise: Promise) in
      guard UIImagePickerController.isSourceTypeAvailable(.camera), self.camera.completion == nil else { promise.reject("CAMERA_UNAVAILABLE", "Camera is unavailable or already open. Import an existing image instead."); return }
      AVCaptureDevice.requestAccess(for: .video) { granted in
        DispatchQueue.main.async {
          guard granted else { promise.reject("CAMERA_DENIED", "Camera access was denied. Import an existing photograph instead."); return }
          guard let controller = self.appContext?.utilities?.currentViewController(), controller.viewIfLoaded?.window != nil, controller.presentedViewController == nil else { promise.reject("CAMERA_UNAVAILABLE", "Close the current panel and try again."); return }
          let picker = UIImagePickerController(); picker.sourceType = .camera; picker.cameraCaptureMode = .photo; picker.delegate = self.camera
          self.camera.completion = { result in
            switch result { case .success(let uri): promise.resolve(uri); case .failure(let error): promise.reject(error) }
          }
          controller.present(picker, animated: false)
          // If UIKit silently refuses the presentation, no delegate callback ever arrives; settle the call so the
          // import screen does not stay busy and later captures are not refused as "already open".
          DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            if picker.presentingViewController == nil, let pending = self.camera.completion {
              self.camera.completion = nil
              pending(.failure(failure("The camera could not open. Close other panels and try again.")))
            }
          }
        }
      }
    }.runOnQueue(.main)
    AsyncFunction("page") { (uri: String, pdf: Bool, pageNumber: Int) -> [String: Any] in
      let url = try localURL(uri)
      var image: UIImage, count = 1
      if pdf {
        guard let document = PDFDocument(url: url), !document.isLocked, document.pageCount > 0, document.pageCount <= 500,
              pageNumber >= 1, pageNumber <= document.pageCount, let page = document.page(at: pageNumber - 1) else { throw failure("PDF is locked, unreadable, over 500 pages, or the page is invalid.") }
        count = document.pageCount
        let bounds = page.bounds(for: .cropBox)
        guard bounds.width.isFinite && bounds.height.isFinite && bounds.width > 0 && bounds.height > 0 else { throw failure("PDF page has no renderable area.") }
        // PDFKit applies the page rotation. Bound decoded output rather than guessing physical scale from DPI.
        image = page.thumbnail(of: CGSize(width: 2048, height: 2048), for: .cropBox)
      } else {
        guard pageNumber == 1 else { throw failure("An image has only one page.") }
        image = try loadImage(url)
      }
      var result = try writeImage(image, pageCount: count)
      if !pdf, let cg = image.cgImage {
        let request = VNDetectRectanglesRequest(); request.maximumObservations = 1; request.minimumConfidence = 0.6; request.minimumSize = 0.2; request.minimumAspectRatio = 0.2
        // Boundary detection is advisory; a failed detector must leave manual corners usable.
        try? VNImageRequestHandler(cgImage: cg).perform([request])
        if let rectangle = request.results?.first {
          // Vision uses Y up. All JS document coordinates use upright Y down.
          result["corners"] = [rectangle.topLeft, rectangle.topRight, rectangle.bottomRight, rectangle.bottomLeft].map { ["x": $0.x, "y": 1 - $0.y] }
        }
      }
      return result
    }
    AsyncFunction("align") { (uri: String, corners: [[String: Double]], rotation: Int, crop: [String: Double]) -> [String: Any] in
      guard corners.count == 4, corners.allSatisfy({ p in guard let x = p["x"], let y = p["y"] else { return false }; return x.isFinite && y.isFinite && (0...1).contains(x) && (0...1).contains(y) }), [0,90,180,270].contains(rotation) else { throw failure("Invalid page corners or rotation.") }
      for i in 0..<4 {
        let a = corners[i], b = corners[(i+1)%4], c = corners[(i+2)%4]
        let cross = (b["x"]! - a["x"]!) * (c["y"]! - b["y"]!) - (b["y"]! - a["y"]!) * (c["x"]! - b["x"]!)
        guard cross > 0.00001 else { throw failure("Page corners must form a non-crossing quadrilateral.") }
      }
      let uiImage = try loadImage(localURL(uri))
      guard let cg = uiImage.cgImage else { throw failure("Image unavailable.") }
      var image = CIImage(cgImage: cg)
      let points = corners.map { CGPoint(x: $0["x"]! * image.extent.width, y: (1 - $0["y"]!) * image.extent.height) }
      let filter = CIFilter.perspectiveCorrection(); filter.inputImage = image
      filter.topLeft = points[0]; filter.topRight = points[1]; filter.bottomRight = points[2]; filter.bottomLeft = points[3]
      guard let corrected = filter.outputImage, !corrected.extent.isInfinite, !corrected.extent.isNull, corrected.extent.width.isFinite, corrected.extent.height.isFinite, corrected.extent.width > 0, corrected.extent.height > 0 else { throw failure("Perspective correction failed. Adjust the page corners.") }
      image = corrected.oriented(rotation == 90 ? .right : rotation == 180 ? .down : rotation == 270 ? .left : .up)
      image = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
      guard let x = crop["x"], let y = crop["y"], let w = crop["width"], let h = crop["height"], [x,y,w,h].allSatisfy({ $0.isFinite }), x >= 0, y >= 0, w > 0.001, h > 0.001, x+w <= 1.000001, y+h <= 1.000001 else { throw failure("Crop must be inside the rotated page.") }
      let region = CGRect(x: x * image.extent.width, y: (1-y-h) * image.extent.height, width: w * image.extent.width, height: h * image.extent.height)
      image = image.cropped(to: region)
      let factor = min(1, 2048 / max(image.extent.width, image.extent.height))
      image = image.transformed(by: CGAffineTransform(scaleX: factor, y: factor))
      guard let output = CIContext().createCGImage(image, from: image.extent) else { throw failure("Could not align the page.") }
      return try writeImage(UIImage(cgImage: output))
    }
  }
}
