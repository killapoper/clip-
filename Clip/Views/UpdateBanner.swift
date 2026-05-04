// Views/UpdateBanner.swift
import SwiftUI

struct UpdateBannerView: View {
    @ObservedObject var updateService: UpdateService
    @State private var isDismissed = false

    var body: some View {
        if updateService.updateAvailable && !isDismissed {
            GlassCard(padding: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "arrow.down.circle.fill")
                        .foregroundStyle(.clipAccent)

                    VStack(alignment: .leading, spacing: 1) {
                        Text("Update Available")
                            .font(.caption.weight(.semibold))
                        if let v = updateService.latestVersion {
                            Text("Version \(v) is ready")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    HStack(spacing: 6) {
                        if let urlStr = updateService.releaseURL, let url = URL(string: urlStr) {
                            Button("Download") {
                                NSWorkspace.shared.open(url)
                            }
                            .buttonStyle(PillButtonStyle(isSmall: true))
                        }

                        Button {
                            withAnimation(.easeOut(duration: 0.2)) {
                                isDismissed = true
                            }
                        } label: {
                            Image(systemName: "xmark")
                                .font(.caption.weight(.bold))
                        }
                        .buttonStyle(GhostPillButtonStyle())
                    }
                }
            }
            .transition(.asymmetric(
                insertion: .push(from: .top).combined(with: .opacity),
                removal: .push(from: .bottom).combined(with: .opacity)
            ))
        }
    }
}
