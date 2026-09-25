// Renders icon.png into a 1024x1024 asset with the standard macOS icon margins.
// Usage: swift Scripts/make-icon.swift <input.png> <AppIcon.appiconset directory>
import AppKit
import Foundation

let arguments = CommandLine.arguments
guard arguments.count == 3, let source = NSImage(contentsOfFile: arguments[1]) else {
    FileHandle.standardError.write(Data("usage: make-icon.swift <input.png> <appiconset dir>\n".utf8))
    exit(1)
}

let outputDirectory = URL(fileURLWithPath: arguments[2], isDirectory: true)
try? FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

/// Trims transparent margins so the artwork fills the canvas predictably.
func trimmedBitmap(_ image: NSImage) -> NSBitmapImageRep {
    guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
    let width = cgImage.width, height = cgImage.height
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    let context = CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    var minX = width, minY = height, maxX = 0, maxY = 0
    for y in 0..<height {
        for x in 0..<width where pixels[(y * width + x) * 4 + 3] > 8 {
            minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
        }
    }
    let rect = CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
    guard let cropped = cgImage.cropping(to: rect) else { exit(1) }
    return NSBitmapImageRep(cgImage: cropped)
}

let artwork = trimmedBitmap(source)
let canvas = 1024.0
let artworkSize = 832.0 // Apple's macOS template keeps ~96pt of margin around the icon.
let scale = artworkSize / Double(max(artwork.pixelsWide, artwork.pixelsHigh))
let drawSize = NSSize(width: Double(artwork.pixelsWide) * scale, height: Double(artwork.pixelsHigh) * scale)

let sizes: [(Int, Int)] = [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)]
var contents: [[String: Any]] = []
for (points, factor) in sizes {
    let pixels = points * factor
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4,
                               hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current?.imageInterpolation = .high
    let ratio = Double(pixels) / canvas
    let size = NSSize(width: drawSize.width * ratio, height: drawSize.height * ratio)
    let origin = NSPoint(x: (Double(pixels) - size.width) / 2, y: (Double(pixels) - size.height) / 2)
    artwork.draw(in: NSRect(origin: origin, size: size), from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
    NSGraphicsContext.restoreGraphicsState()
    let filename = "icon_\(points)x\(points)@\(factor)x.png"
    try! rep.representation(using: .png, properties: [:])!.write(to: outputDirectory.appendingPathComponent(filename))
    contents.append(["filename": filename, "idiom": "mac", "scale": "\(factor)x", "size": "\(points)x\(points)"])
}
let json: [String: Any] = ["images": contents, "info": ["author": "xcode", "version": 1]]
try! JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys]).write(to: outputDirectory.appendingPathComponent("Contents.json"))
print("Wrote \(sizes.count) icon sizes to \(outputDirectory.path)")
