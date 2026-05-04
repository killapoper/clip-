// ViewModels/DownloadViewModel.swift
import SwiftUI
import Combine

@MainActor
final class DownloadViewModel: ObservableObject {
    @Published var items: [DownloadItem] = []
    @Published var saveLocation: String = NSHomeDirectory() + "/Downloads"

    let history = DownloadHistory()
    private let ytdlp    = YTDLPService()
    private let ffmpeg   = FFmpegService()
    private var activeCount: Int = 0

    // MARK: - Enqueue
    func enqueue(item: DownloadItem) {
        items.insert(item, at: 0)
        startNextQueued()
    }

    func remove(_ item: DownloadItem) {
        cancelIfNeeded(item)
        items.removeAll { $0.id == item.id }
    }

    func cancelItem(_ item: DownloadItem) {
        cancelIfNeeded(item)
        item.state = .cancelled
        activeCount = max(0, activeCount - 1)
        startNextQueued()
    }

    private func cancelIfNeeded(_ item: DownloadItem) {
        if item.state == .downloading || item.state == .processing {
            Task { await ytdlp.cancel(id: item.id) }
        }
    }

    // MARK: - Queue management
    private func startNextQueued() {
        while activeCount < ClipConstants.maxConcurrentDownloads {
            guard let next = items.first(where: { $0.state == .queued }) else { break }
            activeCount += 1
            startDownload(item: next)
        }
    }

    private func startDownload(item: DownloadItem) {
        item.state = .downloading
        item.progress = 0

        Task {
            do {
                let outputPath = try await ytdlp.download(
                    item: item,
                    outputDir: saveLocation,
                    progressHandler: { [weak item] pct, label in
                        Task { @MainActor [weak item] in
                            item?.progress      = pct
                            item?.progressLabel = label
                        }
                    }
                )

                guard item.state != .cancelled else { return }

                // Post-process: compress if target size set
                if case .custom(let mb) = item.targetSize, mb > 0 {
                    item.state         = .processing
                    item.progressLabel = "Compressing…"
                    let ext    = item.format.fileExtension
                    let outPath = outputPath.hasSuffix("." + ext)
                        ? outputPath
                        : outputPath + "." + ext
                    let compOut = outPath.replacingOccurrences(of: ".\(ext)", with: "_\(mb)mb.\(ext)")
                    try await ffmpeg.compress(inputPath: outputPath, outputPath: compOut, targetMB: mb)
                    item.outputPath = compOut
                } else {
                    item.outputPath = outputPath
                }

                item.state         = .completed
                item.progress      = 1.0
                item.progressLabel = "Done"

                if let path = item.outputPath {
                    let attrs = try? FileManager.default.attributesOfItem(atPath: path)
                    item.fileSizeBytes = attrs?[.size] as? Int64
                }

                history.add(item.toRecord())

            } catch {
                guard item.state != .cancelled else { return }
                item.state        = .failed
                item.errorMessage = error.localizedDescription
            }

            activeCount = max(0, activeCount - 1)
            startNextQueued()
        }
    }

    // MARK: - Computed
    var activeItems: [DownloadItem] {
        items.filter { $0.state != .completed && $0.state != .failed && $0.state != .cancelled }
    }

    var overallProgress: Double {
        let active = items.filter { $0.state == .downloading }
        guard !active.isEmpty else { return 0 }
        return active.map { $0.progress }.reduce(0, +) / Double(active.count)
    }
}
