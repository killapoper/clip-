// Models/VideoMetadata.swift
import Foundation

struct VideoMetadata: Codable {
    let title: String
    let duration: Double?
    let thumbnailURL: String?
    let uploaderName: String?
    let viewCount: Int?
    let formats: [VideoFormat]

    enum CodingKeys: String, CodingKey {
        case title
        case duration
        case thumbnailURL = "thumbnail"
        case uploaderName = "uploader"
        case viewCount    = "view_count"
        case formats
    }
}

struct VideoFormat: Codable, Identifiable {
    var id: String { formatID }
    let formatID: String
    let ext: String
    let resolution: String?
    let fps: Double?
    let vcodec: String?
    let acodec: String?
    let filesize: Int64?
    let formatNote: String?

    enum CodingKeys: String, CodingKey {
        case formatID   = "format_id"
        case ext
        case resolution
        case fps
        case vcodec
        case acodec
        case filesize
        case formatNote = "format_note"
    }

    var isVideoOnly: Bool { acodec == "none" }
    var isAudioOnly: Bool { vcodec == "none" }
    var hasVideo: Bool    { vcodec != nil && vcodec != "none" }
    var hasAudio: Bool    { acodec != nil && acodec != "none" }

    var displayResolution: String {
        resolution ?? formatNote ?? formatID
    }
}

extension VideoMetadata {
    var durationFormatted: String {
        guard let d = duration else { return "" }
        let total = Int(d)
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%d:%02d", m, s)
    }

    var formattedViewCount: String {
        guard let v = viewCount else { return "" }
        if v >= 1_000_000 { return String(format: "%.1fM views", Double(v) / 1_000_000) }
        if v >= 1_000     { return String(format: "%.0fK views", Double(v) / 1_000) }
        return "\(v) views"
    }
}
