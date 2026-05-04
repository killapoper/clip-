// Models/DownloadItem.swift
import Foundation
import AppKit
import Combine

enum DownloadState: String, Codable {
    case queued
    case fetchingMetadata
    case downloading
    case processing
    case completed
    case failed
    case cancelled
}

enum OutputFormat: String, CaseIterable, Codable {
    case mp4   = "MP4"
    case mov   = "MOV"
    case webm  = "WebM"
    case mp3   = "MP3"

    var isAudioOnly: Bool { self == .mp3 }
    var fileExtension: String {
        switch self {
        case .mp4:  return "mp4"
        case .mov:  return "mov"
        case .webm: return "webm"
        case .mp3:  return "mp3"
        }
    }
}

enum ResolutionPreset: String, CaseIterable, Codable {
    case r4k   = "4K"
    case r1440 = "1440p"
    case r1080 = "1080p"
    case r720  = "720p"
    case r480  = "480p"
    case r360  = "360p"
    case best  = "Best"

    var ytdlpHeight: Int? {
        switch self {
        case .r4k:   return 2160
        case .r1440: return 1440
        case .r1080: return 1080
        case .r720:  return 720
        case .r480:  return 480
        case .r360:  return 360
        case .best:  return nil
        }
    }
}

enum TargetSize: Codable, Equatable {
    case original
    case custom(mb: Int)

    var displayName: String {
        switch self {
        case .original:      return "Original"
        case .custom(let m): return "\(m) MB"
        }
    }
}

@MainActor
final class DownloadItem: ObservableObject, Identifiable {
    let id: UUID
    let url: String
    let platform: Platform

    @Published var title: String
    @Published var thumbnailURL: String?
    @Published var state: DownloadState
    @Published var progress: Double        // 0…1
    @Published var progressLabel: String
    @Published var errorMessage: String?
    @Published var outputPath: String?
    @Published var fileSizeBytes: Int64?

    var format: OutputFormat
    var resolution: ResolutionPreset
    var targetSize: TargetSize
    var clipStart: Double?
    var clipEnd: Double?
    var duration: Double?

    let createdAt: Date

    init(
        id: UUID = .init(),
        url: String,
        platform: Platform,
        title: String = "Analyzing…",
        thumbnailURL: String? = nil,
        state: DownloadState = .queued,
        format: OutputFormat = .mp4,
        resolution: ResolutionPreset = .r1080,
        targetSize: TargetSize = .original
    ) {
        self.id            = id
        self.url           = url
        self.platform      = platform
        self.title         = title
        self.thumbnailURL  = thumbnailURL
        self.state         = state
        self.format        = format
        self.resolution    = resolution
        self.targetSize    = targetSize
        self.progress      = 0
        self.progressLabel = ""
        self.createdAt     = .now
    }
}

// MARK: - Codable support for history
struct DownloadRecord: Codable, Identifiable {
    let id: UUID
    let url: String
    let title: String
    let platform: Platform
    let format: OutputFormat
    let resolution: ResolutionPreset
    let outputPath: String?
    let completedAt: Date
    let fileSizeBytes: Int64?
}

extension DownloadItem {
    func toRecord() -> DownloadRecord {
        DownloadRecord(
            id: id,
            url: url,
            title: title,
            platform: platform,
            format: format,
            resolution: resolution,
            outputPath: outputPath,
            completedAt: .now,
            fileSizeBytes: fileSizeBytes
        )
    }
}
