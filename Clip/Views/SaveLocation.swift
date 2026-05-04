// Views/SaveLocation.swift
import SwiftUI

struct SaveLocationView: View {
    @ObservedObject var downloadVM: DownloadViewModel

    var body: some View {
        GlassCard(padding: 12) {
            HStack(spacing: 10) {
                Image(systemName: "folder.fill")
                    .foregroundStyle(Color.clipBronze)
                    .frame(width: 18)

                VStack(alignment: .leading, spacing: 1) {
                    Text("Save to")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    Text(displayPath)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Spacer(minLength: 0)

                Button("Choose…") {
                    chooseSaveLocation()
                }
                .buttonStyle(GhostPillButtonStyle())
            }
        }
    }

    private var displayPath: String {
        downloadVM.saveLocation
            .replacingOccurrences(of: NSHomeDirectory(), with: "~")
    }

    private func chooseSaveLocation() {
        let panel = NSOpenPanel()
        panel.canChooseFiles        = false
        panel.canChooseDirectories  = true
        panel.allowsMultipleSelection = false
        panel.prompt                = "Choose"
        panel.message               = "Choose where to save downloaded videos"
        panel.directoryURL          = URL(fileURLWithPath: downloadVM.saveLocation)

        if panel.runModal() == .OK, let url = panel.url {
            downloadVM.saveLocation = url.path
        }
    }
}
