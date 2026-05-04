// ViewModels/MainViewModel.swift
import SwiftUI
import Combine

enum AnalysisState {
    case idle
    case loading
    case loaded(VideoMetadata)
    case error(String)
}

@MainActor
final class MainViewModel: ObservableObject {
    @Published var urlText: String = ""
    @Published var analysisState: AnalysisState = .idle
    @Published var selectedFormat: OutputFormat = .mp4
    @Published var selectedResolution: ResolutionPreset = .r1080
    @Published var targetSize: TargetSize = .original
    @Published var clipEnabled: Bool = false
    @Published var clipStart: Double = 0
    @Published var clipEnd: Double = 0
    @Published var customSizeMB: Int = 50

    private let ytdlp = YTDLPService()
    private var analysisTask: Task<Void, Never>?

    var detectedPlatform: Platform {
        Platform.detect(from: urlText)
    }

    var isValidURL: Bool {
        URLDetector.isValidVideoURL(urlText)
    }

    var metadata: VideoMetadata? {
        if case .loaded(let m) = analysisState { return m }
        return nil
    }

    var isAnalyzing: Bool {
        if case .loading = analysisState { return true }
        return false
    }

    func setURL(_ url: String) {
        urlText = url
        analysisState = .idle
    }

    func analyzeURL() {
        guard isValidURL else { return }
        analysisTask?.cancel()
        analysisState = .loading
        analysisTask  = Task {
            do {
                let meta = try await ytdlp.fetchMetadata(url: urlText)
                guard !Task.isCancelled else { return }
                analysisState = .loaded(meta)
                // Set clip end to duration
                if let d = meta.duration {
                    clipEnd = d
                }
            } catch {
                guard !Task.isCancelled else { return }
                analysisState = .error(error.localizedDescription)
            }
        }
    }

    func clearURL() {
        analysisTask?.cancel()
        urlText        = ""
        analysisState  = .idle
        clipEnabled    = false
        clipStart      = 0
        clipEnd        = 0
    }

    func buildDownloadItem(saveLocation: String) -> DownloadItem {
        let item = DownloadItem(
            url: urlText,
            platform: detectedPlatform,
            title: metadata?.title ?? urlText,
            thumbnailURL: metadata?.thumbnailURL,
            format: selectedFormat,
            resolution: selectedResolution,
            targetSize: targetSize
        )
        item.duration  = metadata?.duration
        item.clipStart = clipEnabled ? clipStart : nil
        item.clipEnd   = clipEnabled ? clipEnd   : nil
        return item
    }
}
