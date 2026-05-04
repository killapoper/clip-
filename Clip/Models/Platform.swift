// Models/Platform.swift
import Foundation

enum Platform: String, Codable, CaseIterable {
    case youtube   = "YouTube"
    case twitter   = "X / Twitter"
    case instagram = "Instagram"
    case tiktok    = "TikTok"
    case reddit    = "Reddit"
    case unknown   = "Web"

    static func detect(from url: String) -> Platform {
        let lower = url.lowercased()
        if lower.contains("youtube.com") || lower.contains("youtu.be") { return .youtube }
        if lower.contains("twitter.com") || lower.contains("x.com")    { return .twitter }
        if lower.contains("instagram.com")                              { return .instagram }
        if lower.contains("tiktok.com")                                 { return .tiktok }
        if lower.contains("reddit.com") || lower.contains("redd.it")   { return .reddit }
        return .unknown
    }
}
