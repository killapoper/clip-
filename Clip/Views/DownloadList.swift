// Views/DownloadList.swift
import SwiftUI

struct DownloadListView: View {
    @ObservedObject var vm: DownloadViewModel

    var body: some View {
        VStack(spacing: 8) {
            if vm.items.isEmpty {
                emptyState
            } else {
                ForEach(vm.items) { item in
                    DownloadRowView(item: item, onCancel: {
                        vm.cancelItem(item)
                    }, onRemove: {
                        vm.remove(item)
                    }, onReveal: {
                        revealInFinder(item)
                    })
                    .transition(.asymmetric(
                        insertion: .push(from: .top).combined(with: .opacity),
                        removal:   .scale(scale: 0.95).combined(with: .opacity)
                    ))
                }
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: vm.items.count)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "arrow.down.circle.dotted")
                .font(.system(size: 36))
                .foregroundStyle(.quaternary)
            Text("No downloads yet")
                .font(.subheadline)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }

    private func revealInFinder(_ item: DownloadItem) {
        guard let path = item.outputPath else { return }
        NSWorkspace.shared.selectFile(path, inFileViewerRootedAtPath: "")
    }
}

// MARK: - DownloadRowView
struct DownloadRowView: View {
    @ObservedObject var item: DownloadItem
    let onCancel: () -> Void
    let onRemove: () -> Void
    let onReveal: () -> Void

    @State private var isHovered = false

    var body: some View {
        GlassCard(padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    // Platform icon
                    ZStack {
                        Circle()
                            .fill(item.platform.badgeColor.opacity(0.12))
                            .frame(width: 32, height: 32)
                        Image(systemName: item.platform.iconName)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(item.platform.badgeColor)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title)
                            .font(.subheadline.weight(.medium))
                            .lineLimit(1)

                        HStack(spacing: 6) {
                            stateLabel
                            if !item.progressLabel.isEmpty && item.state == .downloading {
                                Text("·")
                                    .foregroundStyle(.tertiary)
                                Text(item.progressLabel)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .monospacedDigit()
                            }
                        }
                    }

                    Spacer(minLength: 0)

                    // Actions
                    HStack(spacing: 6) {
                        if item.state == .completed {
                            Button(action: onReveal) {
                                Image(systemName: "folder")
                                    .font(.caption.weight(.medium))
                            }
                            .buttonStyle(GhostPillButtonStyle())
                            .opacity(isHovered ? 1 : 0)
                        }

                        if item.state == .downloading || item.state == .queued || item.state == .processing {
                            Button(action: onCancel) {
                                Image(systemName: "xmark")
                                    .font(.caption.weight(.bold))
                            }
                            .buttonStyle(GhostPillButtonStyle())
                        }

                        if item.state == .completed || item.state == .failed || item.state == .cancelled {
                            Button(action: onRemove) {
                                Image(systemName: "xmark")
                                    .font(.caption.weight(.bold))
                            }
                            .buttonStyle(GhostPillButtonStyle())
                            .opacity(isHovered ? 1 : 0)
                        }
                    }
                }

                // Progress bar
                if item.state == .downloading || item.state == .processing || item.state == .fetchingMetadata {
                    GlassProgressBar(progress: item.progress, tint: progressTint)
                }

                // Error message
                if let err = item.errorMessage, item.state == .failed {
                    Text(err)
                        .font(.caption)
                        .foregroundStyle(.clipCoral)
                        .lineLimit(2)
                }
            }
        }
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovered = hovering
            }
        }
    }

    private var progressTint: Color {
        switch item.state {
        case .processing: return .clipLavender
        default:          return .clipAccent
        }
    }

    @ViewBuilder
    private var stateLabel: some View {
        switch item.state {
        case .queued:
            Label("Queued", systemImage: "clock")
                .font(.caption)
                .foregroundStyle(.secondary)
        case .fetchingMetadata:
            Label("Analyzing…", systemImage: "magnifyingglass")
                .font(.caption)
                .foregroundStyle(.clipBronze)
        case .downloading:
            Label(String(format: "%.0f%%", item.progress * 100), systemImage: "arrow.down")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.clipAccent)
        case .processing:
            Label("Processing…", systemImage: "gearshape")
                .font(.caption)
                .foregroundStyle(.clipLavender)
        case .completed:
            Label("Done", systemImage: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.clipSuccess)
        case .failed:
            Label("Failed", systemImage: "exclamationmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.clipCoral)
        case .cancelled:
            Label("Cancelled", systemImage: "slash.circle")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
