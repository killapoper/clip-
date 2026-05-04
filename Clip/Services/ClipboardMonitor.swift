// Services/ClipboardMonitor.swift
import AppKit
import Combine

@MainActor
final class ClipboardMonitor: ObservableObject {
    @Published var detectedURL: String?

    private var timer: Timer?
    private var lastChangeCount: Int = NSPasteboard.general.changeCount
    private var isEnabled: Bool = false

    func start() {
        guard !isEnabled else { return }
        isEnabled = true
        lastChangeCount = NSPasteboard.general.changeCount
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.checkClipboard()
            }
        }
    }

    func stop() {
        isEnabled = false
        timer?.invalidate()
        timer = nil
    }

    private func checkClipboard() {
        let pb = NSPasteboard.general
        guard pb.changeCount != lastChangeCount else { return }
        lastChangeCount = pb.changeCount
        guard let text = pb.string(forType: .string) else { return }
        if URLDetector.isValidVideoURL(text) {
            detectedURL = text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    func currentURL() -> String? {
        guard let text = NSPasteboard.general.string(forType: .string) else { return nil }
        return URLDetector.isValidVideoURL(text) ? text.trimmingCharacters(in: .whitespacesAndNewlines) : nil
    }
}
