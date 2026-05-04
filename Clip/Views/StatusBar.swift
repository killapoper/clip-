// Views/StatusBar.swift
import SwiftUI
import AppKit

// MARK: - StatusBarController
final class StatusBarController: NSObject {
    private var statusItem: NSStatusItem!
    private var popover: NSPopover!
    private var downloadVM: DownloadViewModel

    init(downloadVM: DownloadViewModel) {
        self.downloadVM = downloadVM
        super.init()
        setupStatusItem()
        setupPopover()
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        guard let button = statusItem.button else { return }
        button.image = NSImage(systemSymbolName: "arrow.down.circle", accessibilityDescription: "Clip")
        button.image?.isTemplate = true
        button.action = #selector(togglePopover)
        button.target = self
    }

    private func setupPopover() {
        popover = NSPopover()
        popover.contentSize = NSSize(width: ClipConstants.popoverWidth, height: ClipConstants.popoverHeight)
        popover.behavior     = .transient
        popover.animates     = true
        popover.contentViewController = NSHostingController(
            rootView: MenuBarView(downloadVM: downloadVM)
                .frame(width: ClipConstants.popoverWidth, height: ClipConstants.popoverHeight)
        )
    }

    @objc private func togglePopover() {
        if popover.isShown {
            popover.performClose(nil)
        } else if let button = statusItem.button {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }
    }

    func updateProgress(_ progress: Double) {
        guard let button = statusItem.button else { return }
        if progress > 0 && progress < 1 {
            button.image = progressIcon(progress: progress)
        } else {
            let img = NSImage(systemSymbolName: "arrow.down.circle", accessibilityDescription: "Clip")
            img?.isTemplate = true
            button.image = img
        }
    }

    private func progressIcon(progress: Double) -> NSImage {
        let size: CGFloat = 18
        let image = NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
            let center = CGPoint(x: size / 2, y: size / 2)
            let radius: CGFloat = (size - 4) / 2
            let startAngle = CGFloat(90)
            let endAngle   = CGFloat(90) - CGFloat(progress * 360)

            // Background arc
            NSColor.tertiaryLabelColor.setStroke()
            let bgPath = NSBezierPath()
            bgPath.appendArc(withCenter: center, radius: radius, startAngle: startAngle, endAngle: startAngle - 360, clockwise: true)
            bgPath.lineWidth = 2
            bgPath.stroke()

            // Progress arc
            NSColor.labelColor.setStroke()
            let fgPath = NSBezierPath()
            fgPath.appendArc(withCenter: center, radius: radius, startAngle: startAngle, endAngle: endAngle, clockwise: true)
            fgPath.lineWidth = 2
            fgPath.stroke()

            return true
        }
        image.isTemplate = true
        return image
    }
}

// MARK: - MenuBarView (popover content)
struct MenuBarView: View {
    @ObservedObject var downloadVM: DownloadViewModel
    @StateObject private var mainVM = MainViewModel()
    @State private var step: MenuStep = .input

    enum MenuStep { case input, configure }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Image(systemName: "scissors")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.clipAccent)
                Text("Clip")
                    .font(.title3.weight(.bold))
                Spacer()
                if step == .configure {
                    Button {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            step = .input
                            mainVM.analysisState = .idle
                        }
                    } label: {
                        Image(systemName: "chevron.left")
                        Text("Back")
                    }
                    .buttonStyle(GhostPillButtonStyle())
                    .font(.caption)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()

            ScrollView {
                VStack(spacing: 12) {
                    if step == .input {
                        inputStep
                    } else {
                        configureStep
                    }
                }
                .padding(16)
            }
        }
        .frame(width: ClipConstants.popoverWidth)
        .onChange(of: mainVM.analysisState) { _, state in
            if case .loaded = state {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    step = .configure
                }
            }
        }
    }

    @ViewBuilder
    private var inputStep: some View {
        URLInputView(vm: mainVM)

        if case .error(let msg) = mainVM.analysisState {
            GlassCard(padding: 10) {
                Label(msg, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.clipCoral)
            }
        }
    }

    @ViewBuilder
    private var configureStep: some View {
        if let meta = mainVM.metadata {
            VideoPreviewView(metadata: meta, platform: mainVM.detectedPlatform)
        }

        FormatPickerView(vm: mainVM)

        if mainVM.clipEnabled, mainVM.metadata?.duration != nil {
            ClipRangeView(vm: mainVM)
        }

        SaveLocationView(downloadVM: downloadVM)

        DownloadSectionView(mainVM: mainVM, downloadVM: downloadVM)
    }
}
