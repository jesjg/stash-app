import ExpoModulesCore
import PDFKit
import UIKit
import Vision
import VisionKit

/// Turns a ticket file (PDF or image) into page images plus every barcode found on them.
/// Everything runs on-device: PDFKit renders the pages, Vision finds the codes.
public class StubsScannerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StubsScanner")

    /// Returns one entry per page:
    /// { pageIndex, imageUri, width, height, codes: [{ symbology, payload, cropUri }] }
    AsyncFunction("scanFileAsync") { (uri: String, outDir: String) throws -> [[String: Any]] in
      guard let fileUrl = Self.fileURL(from: uri) else {
        throw ScanError.badUri(uri)
      }
      guard let outUrl = Self.fileURL(from: outDir) else {
        throw ScanError.badUri(outDir)
      }
      try FileManager.default.createDirectory(at: outUrl, withIntermediateDirectories: true)

      let images = try Self.pageImages(for: fileUrl)
      let pdfText = Self.pdfPageTexts(for: fileUrl)
      var pages: [[String: Any]] = []

      for (index, image) in images.enumerated() {
        guard let cg = image.cgImage else { continue }
        let pageName = "page-\(UUID().uuidString).jpg"
        let pageUrl = outUrl.appendingPathComponent(pageName)
        if let data = image.jpegData(compressionQuality: 0.85) {
          try data.write(to: pageUrl)
        }

        let codes = try Self.detectCodes(in: cg, outUrl: outUrl)
        // Prefer the PDF's own text; fall back to on-device recognition for images and scans.
        var text = index < pdfText.count ? pdfText[index] : ""
        if text.trimmingCharacters(in: .whitespacesAndNewlines).count < 20 {
          text = Self.recognizeText(in: cg)
        }
        pages.append([
          "text": text,
          "pageIndex": index,
          "imageUri": pageUrl.absoluteString,
          "width": cg.width,
          "height": cg.height,
          "codes": codes,
        ])
      }
      return pages
    }

    /// Apple Intelligence on this iPhone: available | notEnabled | notReady | notEligible | unavailable | unsupported
    Function("aiStatus") { () -> String in
      TicketAIBridge.status()
    }

    /// Reads a ticket's text with the on-device model. Resolves with { error } when it can't.
    AsyncFunction("readTicketAsync") { (text: String, today: String) async -> [String: Any] in
      await TicketAIBridge.read(text: text, today: today)
    }

    /// Opens Apple's document camera (edge detection, straightening) for paper tickets.
    /// Resolves with the scanned pages as JPEG file URIs, or [] if the person cancels.
    AsyncFunction("scanPaperAsync") { (outDir: String, promise: Promise) in
      guard let outUrl = Self.fileURL(from: outDir) else {
        promise.reject("ERR_BAD_URI", "Bad folder: \(outDir)")
        return
      }
      DispatchQueue.main.async {
        guard VNDocumentCameraViewController.isSupported else {
          promise.reject("ERR_UNSUPPORTED", "This iPhone can't scan documents.")
          return
        }
        guard let presenter = self.appContext?.utilities?.currentViewController() else {
          promise.reject("ERR_NO_VIEW", "Couldn't open the camera.")
          return
        }
        let camera = VNDocumentCameraViewController()
        let delegate = PaperScanDelegate(outUrl: outUrl, promise: promise) { [weak self] in self?.paperDelegate = nil }
        self.paperDelegate = delegate
        camera.delegate = delegate
        presenter.present(camera, animated: true)
      }
    }
  }

  /// Kept alive while the document camera is open.
  var paperDelegate: PaperScanDelegate?

  // MARK: - Rendering

  private static let maxPages = 20
  private static let targetLongEdge: CGFloat = 2400

  static func fileURL(from string: String) -> URL? {
    if string.hasPrefix("file://") {
      return URL(string: string)
    }
    if string.hasPrefix("/") {
      return URL(fileURLWithPath: string)
    }
    return URL(string: string)
  }

  static func pageImages(for url: URL) throws -> [UIImage] {
    let accessing = url.startAccessingSecurityScopedResource()
    defer { if accessing { url.stopAccessingSecurityScopedResource() } }

    if url.pathExtension.lowercased() == "pdf" || isPDF(url) {
      guard let document = PDFDocument(url: url) else {
        throw ScanError.unreadable(url.lastPathComponent)
      }
      var result: [UIImage] = []
      let count = min(document.pageCount, maxPages)
      for i in 0..<count {
        guard let page = document.page(at: i) else { continue }
        result.append(render(page: page))
      }
      return result
    }

    guard let image = UIImage(contentsOfFile: url.path) else {
      throw ScanError.unreadable(url.lastPathComponent)
    }
    return [normalized(image)]
  }

  static func isPDF(_ url: URL) -> Bool {
    guard let handle = try? FileHandle(forReadingFrom: url) else { return false }
    defer { try? handle.close() }
    let header = handle.readData(ofLength: 5)
    return header == Data("%PDF-".utf8)
  }

  static func render(page: PDFPage) -> UIImage {
    var bounds = page.bounds(for: .mediaBox).size
    if page.rotation % 180 != 0 {
      bounds = CGSize(width: bounds.height, height: bounds.width)
    }
    let longEdge = max(bounds.width, bounds.height, 1)
    let scale = targetLongEdge / longEdge
    let size = CGSize(width: (bounds.width * scale).rounded(), height: (bounds.height * scale).rounded())
    // thumbnail(of:for:) respects page rotation and paints a white background.
    return normalized(page.thumbnail(of: size, for: .mediaBox))
  }

  /// Bakes orientation into the pixels and pins the scale to 1 so pixel maths is simple.
  static func normalized(_ image: UIImage) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let pixelSize = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
    let renderer = UIGraphicsImageRenderer(size: pixelSize, format: format)
    return renderer.image { ctx in
      UIColor.white.setFill()
      ctx.fill(CGRect(origin: .zero, size: pixelSize))
      image.draw(in: CGRect(origin: .zero, size: pixelSize))
    }
  }

  // MARK: - Text

  static func pdfPageTexts(for url: URL) -> [String] {
    guard url.pathExtension.lowercased() == "pdf" || isPDF(url) else { return [] }
    let accessing = url.startAccessingSecurityScopedResource()
    defer { if accessing { url.stopAccessingSecurityScopedResource() } }
    guard let document = PDFDocument(url: url) else { return [] }
    let count = min(document.pageCount, maxPages)
    return (0..<count).map { document.page(at: $0)?.string ?? "" }
  }

  /// On-device OCR, returned as lines in reading order (top to bottom, left to right).
  static func recognizeText(in cg: CGImage) -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    if #available(iOS 16.0, *) {
      request.automaticallyDetectsLanguage = true
    }
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do {
      try handler.perform([request])
    } catch {
      return ""
    }
    let lines = (request.results ?? []).compactMap { obs -> (CGRect, String)? in
      guard let best = obs.topCandidates(1).first else { return nil }
      return (obs.boundingBox, best.string)
    }
    let sorted = lines.sorted {
      if abs($0.0.midY - $1.0.midY) > 0.012 { return $0.0.midY > $1.0.midY }
      return $0.0.minX < $1.0.minX
    }
    // Join boxes on the same visual line with a tab so "SEAT" and "14" stay together.
    var out: [String] = []
    var lastY: CGFloat = -1
    for (box, str) in sorted {
      if lastY >= 0, abs(box.midY - lastY) <= 0.012, let prev = out.popLast() {
        out.append(prev + "\t" + str)
      } else {
        out.append(str)
      }
      lastY = box.midY
    }
    return out.joined(separator: "\n")
  }

  // MARK: - Detection

  static func detectCodes(in cg: CGImage, outUrl: URL) throws -> [[String: Any]] {
    let request = VNDetectBarcodesRequest()
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    try handler.perform([request])

    let width = CGFloat(cg.width)
    let height = CGFloat(cg.height)
    var seen = Set<String>()
    var codes: [[String: Any]] = []

    let observations = (request.results ?? []).sorted {
      // Top-to-bottom, then left-to-right (Vision's origin is bottom-left).
      if abs($0.boundingBox.maxY - $1.boundingBox.maxY) > 0.02 {
        return $0.boundingBox.maxY > $1.boundingBox.maxY
      }
      return $0.boundingBox.minX < $1.boundingBox.minX
    }

    for obs in observations {
      let payload = obs.payloadStringValue
      let symbology = shortName(obs.symbology)
      let key = "\(symbology)|\(payload ?? "\(obs.boundingBox)")"
      if seen.contains(key) { continue }
      seen.insert(key)

      let box = obs.boundingBox
      var rect = CGRect(
        x: box.minX * width,
        y: (1 - box.maxY) * height,
        width: box.width * width,
        height: box.height * height
      )
      // Keep a quiet zone around the code so scanners at the gate can read the crop.
      let pad = max(rect.width, rect.height) * 0.12 + 8
      rect = rect.insetBy(dx: -pad, dy: -pad).intersection(CGRect(x: 0, y: 0, width: width, height: height)).integral

      var cropUri = ""
      if let cropped = cg.cropping(to: rect) {
        let cropUrl = outUrl.appendingPathComponent("code-\(UUID().uuidString).png")
        if let data = UIImage(cgImage: cropped).pngData() {
          try data.write(to: cropUrl)
          cropUri = cropUrl.absoluteString
        }
      }

      var code: [String: Any] = [
        "symbology": symbology,
        "cropUri": cropUri,
      ]
      if let payload = payload {
        code["payload"] = payload
      }
      codes.append(code)
    }
    return codes
  }

  static func shortName(_ symbology: VNBarcodeSymbology) -> String {
    switch symbology {
    case .qr, .microQR: return "qr"
    case .aztec: return "aztec"
    case .pdf417, .microPDF417: return "pdf417"
    case .dataMatrix: return "datamatrix"
    default: return "linear"
    }
  }
}

enum ScanError: Error, CustomStringConvertible {
  case badUri(String)
  case unreadable(String)

  var description: String {
    switch self {
    case .badUri(let uri): return "Not a file path: \(uri)"
    case .unreadable(let name): return "Couldn't open \(name)"
    }
  }
}


/// Saves each scanned page and hands the file URIs back to JavaScript.
final class PaperScanDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
  private let outUrl: URL
  private let promise: Promise
  private let done: () -> Void

  init(outUrl: URL, promise: Promise, done: @escaping () -> Void) {
    self.outUrl = outUrl
    self.promise = promise
    self.done = done
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
    var uris: [String] = []
    do {
      try FileManager.default.createDirectory(at: outUrl, withIntermediateDirectories: true)
      for i in 0..<min(scan.pageCount, 10) {
        let url = outUrl.appendingPathComponent("paper-\(UUID().uuidString).jpg")
        if let data = scan.imageOfPage(at: i).jpegData(compressionQuality: 0.9) {
          try data.write(to: url)
          uris.append(url.absoluteString)
        }
      }
    } catch {
      controller.dismiss(animated: true)
      promise.reject("ERR_SAVE", error.localizedDescription)
      done()
      return
    }
    controller.dismiss(animated: true)
    promise.resolve(uris)
    done()
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true)
    promise.resolve([String]())
    done()
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
    controller.dismiss(animated: true)
    promise.reject("ERR_SCAN", error.localizedDescription)
    done()
  }
}
