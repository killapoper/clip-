// ClipApp.swift
import SwiftUI
import AppKit

@main
struct ClipApp: App {
    @NSApplicationDelegateAdaptor(ClipAppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    setupWindow()
                }
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandGroup(after: .appInfo) {
                Button("Check for Updates…") {
                    // Handled by UpdateService in ContentView
                }
            }
        }

        Settings {
            SettingsView(downloadVM: appDelegate.downloadVM)
        }
    }

    private func setupWindow() {
        DispatchQueue.main.async {
            for window in NSApplication.shared.windows {
                if window.identifier?.rawValue == "ClipMainWindow" ||
                   window.contentViewController != nil {
                    window.delegate = appDelegate.closeInterceptor
                    window.setContentSize(NSSize(
                        width: ClipConstants.defaultWindowWidth,
                        height: ClipConstants.defaultWindowHeight
                    ))
                    window.minSize = NSSize(
                        width: ClipConstants.minWindowWidth,
                        height: ClipConstants.minWindowHeight
                    )
                    window.titlebarAppearsTransparent = true
                    window.titleVisibility = .hidden
                    window.styleMask.insert(.fullSizeContentView)
                    break
                }
            }
        }
    }
}

// MARK: - App Delegate
final class ClipAppDelegate: NSObject, NSApplicationDelegate, ObservableObject {
    let downloadVM       = DownloadViewModel()
    let closeInterceptor = WindowCloseInterceptor()
    private var statusBarController: StatusBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Set up menu bar item
        statusBarController = StatusBarController(downloadVM: downloadVM)

        // Prevent termination on last window close (menu bar app pattern)
        NSApp.setActivationPolicy(.regular)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            for window in sender.windows {
                window.makeKeyAndOrderFront(nil)
            }
        }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        // Keep running for menu bar
        return false
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first else { return }
        // Handle clip:// URL scheme
        if url.scheme == "clip", let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let videoURL = components.queryItems?.first(where: { $0.name == "url" })?.value {
            NotificationCenter.default.post(name: .clipOpenURL, object: videoURL)
        }
    }
}

extension Notification.Name {
    static let clipOpenURL = Notification.Name("clipOpenURL")
}
