// Views/History.swift
import SwiftUI

struct HistoryView: View {
    @ObservedObject var history: DownloadHistory

    var body: some View {
        VStack(spacing: 8) {
            if history.records.isEmpty {
                emptyState
            } else {
                HStack {
                    Text("\(history.records.count) downloads")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Clear All") {
                        withAnimation {
                            history.clear()
                        }
                    }
                    .buttonStyle(GhostPillButtonStyle())
                    .font(.caption)
                }

                ForEach(history.records) { record in
                    HistoryRowView(record: record) {
                        withAnimation {
                            history.remove(record)
                        }
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 36))
                .foregroundStyle(.quaternary)
            Text("No history yet")
                .font(.subheadline)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }
}

// MARK: - HistoryRowView
struct HistoryRowView: View {
    let record: DownloadRecord
    let onDelete: () -> Void

    @State private var isHovered = false

    var body: some View {
        GlassCard(padding: 12) {
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(record.platform.badgeColor.opacity(0.12))
                        .frame(width: 32, height: 32)
                    Image(systemName: record.platform.iconName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(record.platform.badgeColor)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(record.title)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)

                    HStack(spacing: 6) {
                        Text(record.format.rawValue)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("·")
                            .foregroundStyle(.tertiary)
                        Text(record.resolution.rawValue)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let size = record.fileSizeBytes {
                            Text("·")
                                .foregroundStyle(.tertiary)
                            Text(formatBytes(size))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Text(record.completedAt, style: .relative)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                Spacer(minLength: 0)

                HStack(spacing: 6) {
                    if let path = record.outputPath {
                        Button {
                            NSWorkspace.shared.selectFile(path, inFileViewerRootedAtPath: "")
                        } label: {
                            Image(systemName: "folder")
                                .font(.caption.weight(.medium))
                        }
                        .buttonStyle(GhostPillButtonStyle())
                        .opacity(isHovered ? 1 : 0)
                    }

                    Button(action: onDelete) {
                        Image(systemName: "xmark")
                            .font(.caption.weight(.bold))
                    }
                    .buttonStyle(GhostPillButtonStyle())
                    .opacity(isHovered ? 1 : 0)
                }
            }
        }
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovered = hovering
            }
        }
        .transition(.asymmetric(
            insertion: .push(from: .top).combined(with: .opacity),
            removal: .scale(scale: 0.95).combined(with: .opacity)
        ))
    }

    private func formatBytes(_ bytes: Int64) -> String {
        let mb = Double(bytes) / (1024 * 1024)
        if mb >= 1000 { return String(format: "%.1f GB", mb / 1024) }
        return String(format: "%.0f MB", mb)
    }
}
