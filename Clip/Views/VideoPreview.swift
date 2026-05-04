// Views/VideoPreview.swift
import SwiftUI

struct VideoPreviewView: View {
    let metadata: VideoMetadata
    let platform: Platform

    var body: some View {
        GlassCard {
            HStack(spacing: 14) {
                // Thumbnail
                ThumbnailView(urlString: metadata.thumbnailURL)
                    .frame(width: 100, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: ClipConstants.smallCornerRadius, style: .continuous))

                VStack(alignment: .leading, spacing: 5) {
                    Text(metadata.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 8) {
                        PlatformBadgeView(platform: platform)

                        if !metadata.durationFormatted.isEmpty {
                            Label(metadata.durationFormatted, systemImage: "clock")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        if !metadata.formattedViewCount.isEmpty {
                            Label(metadata.formattedViewCount, systemImage: "eye")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if let uploader = metadata.uploaderName {
                        Text(uploader)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }

                Spacer(minLength: 0)
            }
        }
        .transition(.asymmetric(
            insertion: .scale(scale: 0.97).combined(with: .opacity),
            removal: .opacity
        ))
    }
}

// MARK: - Async Thumbnail
struct ThumbnailView: View {
    let urlString: String?
    @State private var image: NSImage?
    @State private var isLoading = true

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: ClipConstants.smallCornerRadius, style: .continuous)
                .fill(Color.primary.opacity(0.06))

            if let img = image {
                Image(nsImage: img)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity.animation(.easeIn(duration: 0.2)))
            } else if isLoading {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "film")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
        }
        .task(id: urlString) {
            await loadImage()
        }
    }

    private func loadImage() async {
        isLoading = true
        image     = nil
        guard let str = urlString, let url = URL(string: str) else {
            isLoading = false; return
        }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let img = NSImage(data: data) else {
            isLoading = false; return
        }
        image     = img
        isLoading = false
    }
}
