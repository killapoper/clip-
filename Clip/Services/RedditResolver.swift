// Services/RedditResolver.swift
import Foundation

struct RedditResolver {
    /// Converts a reddit.com URL to a direct video URL via the JSON API
    static func resolve(url: String) async throws -> String {
        guard var components = URLComponents(string: url) else { return url }

        // Normalise: ensure we hit the json endpoint
        var path = components.path
        if path.hasSuffix("/") { path.removeLast() }
        if !path.hasSuffix(".json") { path += ".json" }
        components.host   = "api.reddit.com"
        components.scheme = "https"
        components.path   = path
        components.query  = nil

        guard let apiURL = components.url else { return url }

        var request         = URLRequest(url: apiURL)
        request.setValue("Clip/1.0 macOS yt-dlp wrapper", forHTTPHeaderField: "User-Agent")

        let (data, _) = try await URLSession.shared.data(for: request)

        // Reddit JSON: array of two listings; first → children → data → media/secure_media
        if let json  = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
           let first = json.first,
           let data2 = first["data"] as? [String: Any],
           let children = data2["children"] as? [[String: Any]],
           let post  = children.first?["data"] as? [String: Any] {

            // Try crosspost source
            if let xposts = post["crosspost_parent_list"] as? [[String: Any]],
               let parent = xposts.first,
               let media  = parent["secure_media"] as? [String: Any],
               let reddit = media["reddit_video"] as? [String: Any],
               let dashURL = reddit["fallback_url"] as? String {
                return dashURL
            }

            // Direct reddit video
            if let media  = post["secure_media"] as? [String: Any],
               let reddit = media["reddit_video"] as? [String: Any],
               let dashURL = reddit["fallback_url"] as? String {
                return dashURL
            }

            // Preview images (gif videos)
            if let preview = post["preview"] as? [String: Any],
               let videos  = preview["reddit_video_preview"] as? [String: Any],
               let dashURL = videos["fallback_url"] as? String {
                return dashURL
            }

            // url_overridden_by_dest for external links
            if let dest = post["url_overridden_by_dest"] as? String { return dest }
            if let postURL = post["url"] as? String { return postURL }
        }

        return url // Fallback to original
    }
}
