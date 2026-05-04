// Services/URLDetector.swift
import Foundation

struct URLDetector {
    static let supportedHosts: Set<String> = [
        "youtube.com", "www.youtube.com", "youtu.be",
        "twitter.com", "www.twitter.com", "x.com", "www.x.com",
        "instagram.com", "www.instagram.com",
        "tiktok.com", "www.tiktok.com", "vm.tiktok.com",
        "reddit.com", "www.reddit.com", "old.reddit.com", "redd.it"
    ]

    static func extractURL(from text: String) -> URL? {
        // Try direct URL first
        if let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
           url.scheme != nil {
            return url
        }
        // Detect URL in text using data detector
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return nil
        }
        let range   = NSRange(text.startIndex..., in: text)
        let matches = detector.matches(in: text, options: [], range: range)
        return matches.first?.url
    }

    static func isSupported(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return supportedHosts.contains(host) || url.scheme == "https" || url.scheme == "http"
    }

    static func isValidVideoURL(_ string: String) -> Bool {
        guard let url = extractURL(from: string) else { return false }
        return url.scheme == "https" || url.scheme == "http"
    }
}
