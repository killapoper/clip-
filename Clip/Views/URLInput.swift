// Views/URLInput.swift
import SwiftUI

struct URLInputView: View {
    @ObservedObject var vm: MainViewModel
    @State private var isTargeted: Bool = false
    @FocusState private var isFocused: Bool

    var body: some View {
        GlassCard {
            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "link")
                        .foregroundStyle(.secondary)
                        .frame(width: 18)

                    TextField("Paste a video URL…", text: $vm.urlText)
                        .textFieldStyle(.plain)
                        .font(.system(.body, design: .monospaced).weight(.regular))
                        .focused($isFocused)
                        .onSubmit { vm.analyzeURL() }

                    if !vm.urlText.isEmpty {
                        Button {
                            vm.clearURL()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }

                HStack(spacing: 8) {
                    Button("Paste") {
                        if let url = NSPasteboard.general.string(forType: .string) {
                            vm.setURL(url.trimmingCharacters(in: .whitespacesAndNewlines))
                        }
                    }
                    .buttonStyle(GhostPillButtonStyle())

                    Button {
                        vm.analyzeURL()
                    } label: {
                        HStack(spacing: 6) {
                            if vm.isAnalyzing {
                                ProgressView()
                                    .controlSize(.small)
                                    .scaleEffect(0.8)
                            } else {
                                Image(systemName: "magnifyingglass")
                            }
                            Text("Analyze")
                        }
                    }
                    .buttonStyle(PillButtonStyle())
                    .disabled(!vm.isValidURL || vm.isAnalyzing)

                    Spacer()

                    if vm.isValidURL {
                        PlatformBadgeView(platform: vm.detectedPlatform)
                    }
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: ClipConstants.cardCornerRadius, style: .continuous)
                .strokeBorder(Color.clipAccent.opacity(isTargeted ? 0.5 : 0), lineWidth: 2)
                .animation(.easeInOut(duration: 0.2), value: isTargeted)
        )
        .onDrop(of: [.url, .text], isTargeted: $isTargeted) { providers in
            providers.first?.loadObject(ofClass: URL.self) { url, _ in
                if let url {
                    Task { @MainActor in vm.setURL(url.absoluteString) }
                }
            }
            return true
        }
    }
}

struct PlatformBadgeView: View {
    let platform: Platform

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: platform.iconName)
                .font(.caption2)
            Text(platform.rawValue)
                .font(.caption.weight(.semibold))
        }
        .foregroundStyle(platform.badgeColor)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(platform.badgeColor.opacity(0.12))
                .overlay(Capsule().strokeBorder(platform.badgeColor.opacity(0.2), lineWidth: 0.5))
        )
    }
}
