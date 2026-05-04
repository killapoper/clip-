// Services/UpdateService.swift
import Foundation

@MainActor
final class UpdateService: ObservableObject {
    @Published var latestVersion: String?
    @Published var updateAvailable: Bool = false
    @Published var releaseURL: String?

    func checkForUpdates() async {
        guard let url = URL(string: ClipConstants.updateCheckURL) else { return }
        var req = URLRequest(url: url)
        req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        req.timeoutInterval = 10

        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let tag  = json["tag_name"] as? String else { return }

        let version = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        latestVersion  = version
        updateAvailable = version.compare(ClipConstants.currentVersion, options: .numeric) == .orderedDescending
        releaseURL     = (json["html_url"] as? String)
    }
}
