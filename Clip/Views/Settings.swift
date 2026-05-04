// Views/Settings.swift
import SwiftUI

struct SettingsView: View {
    @ObservedObject var downloadVM: DownloadViewModel
    @AppStorage("clipboardMonitor")    private var clipboardMonitor    = true
    @AppStorage("launchAtLogin")       private var launchAtLogin       = false
    @AppStorage("showDockIcon")        private var showDockIcon        = true
    @AppStorage("maxConcurrent")       private var maxConcurrent       = 3
    @AppStorage("notifyOnComplete")    private var notifyOnComplete    = true

    var body: some View {
        Form {
            Section("General") {
                Toggle("Launch at login", isOn: $launchAtLogin)
                Toggle("Show in Dock", isOn: $showDockIcon)
                Toggle("Monitor clipboard for URLs", isOn: $clipboardMonitor)
                Toggle("Notify when download completes", isOn: $notifyOnComplete)
            }

            Section("Downloads") {
                HStack {
                    Text("Max concurrent downloads")
                    Spacer()
                    Picker("", selection: $maxConcurrent) {
                        ForEach(1...5, id: \.self) { n in
                            Text("\(n)").tag(n)
                        }
                    }
                    .pickerStyle(.menu)
                    .frame(width: 60)
                }

                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Default save location")
                        Text(downloadVM.saveLocation
                            .replacingOccurrences(of: NSHomeDirectory(), with: "~"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer()
                    Button("Change…") {
                        chooseSaveLocation()
                    }
                    .buttonStyle(GhostPillButtonStyle())
                }
            }

            Section("About") {
                HStack {
                    Text("Version")
                    Spacer()
                    Text(ClipConstants.currentVersion)
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Text("yt-dlp")
                    Spacer()
                    Text("bundled")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 420, height: 380)
    }

    private func chooseSaveLocation() {
        let panel = NSOpenPanel()
        panel.canChooseFiles         = false
        panel.canChooseDirectories   = true
        panel.allowsMultipleSelection = false
        panel.prompt                 = "Choose"
        if panel.runModal() == .OK, let url = panel.url {
            downloadVM.saveLocation = url.path
        }
    }
}
