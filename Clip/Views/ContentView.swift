// Views/ContentView.swift
import SwiftUI

enum MainTab: String, CaseIterable {
    case downloads = "Downloads"
    case history   = "History"
}

struct ContentView: View {
    @StateObject private var mainVM     = MainViewModel()
    @StateObject private var downloadVM = DownloadViewModel()
    @StateObject private var updateSvc  = UpdateService()
    @StateObject private var clipboard  = ClipboardMonitor()

    @State private var selectedTab: MainTab = .downloads
    @AppStorage("clipboardMonitor") private var clipboardMonitorEnabled = true

    var body: some View {
        ZStack {
            TranslucentWindowBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Toolbar / header
                headerBar

                Divider().opacity(0.4)

                // Scrollable content
                ScrollView {
                    VStack(spacing: ClipConstants.sectionSpacing) {
                        // Update banner
                        UpdateBannerView(updateService: updateSvc)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)

                        // Input area
                        Group {
                            URLInputView(vm: mainVM)
                                .padding(.horizontal, 16)

                            // Error state
                            if case .error(let msg) = mainVM.analysisState {
                                GlassCard(padding: 10) {
                                    Label(msg, systemImage: "exclamationmark.triangle")
                                        .font(.caption)
                                        .foregroundStyle(.clipCoral)
                                }
                                .padding(.horizontal, 16)
                                .transition(.scale(scale: 0.97).combined(with: .opacity))
                            }

                            // Metadata preview
                            if let meta = mainVM.metadata {
                                VideoPreviewView(metadata: meta, platform: mainVM.detectedPlatform)
                                    .padding(.horizontal, 16)
                            }

                            // Format options (only when URL valid)
                            if mainVM.isValidURL || mainVM.metadata != nil {
                                FormatPickerView(vm: mainVM)
                                    .padding(.horizontal, 16)
                                    .transition(.scale(scale: 0.97).combined(with: .opacity))
                            }

                            // Clip range
                            if mainVM.clipEnabled, mainVM.metadata?.duration != nil {
                                ClipRangeView(vm: mainVM)
                                    .padding(.horizontal, 16)
                            }

                            // Save location
                            if mainVM.isValidURL || mainVM.metadata != nil {
                                SaveLocationView(downloadVM: downloadVM)
                                    .padding(.horizontal, 16)
                                    .transition(.scale(scale: 0.97).combined(with: .opacity))

                                DownloadSectionView(mainVM: mainVM, downloadVM: downloadVM)
                                    .padding(.horizontal, 16)
                                    .transition(.scale(scale: 0.97).combined(with: .opacity))
                            }
                        }
                        .animation(.spring(response: ClipConstants.springResponse, dampingFraction: ClipConstants.springDamping), value: mainVM.isValidURL)
                        .animation(.spring(response: ClipConstants.springResponse, dampingFraction: ClipConstants.springDamping), value: mainVM.metadata != nil)
                        .animation(.spring(response: ClipConstants.springResponse, dampingFraction: ClipConstants.springDamping), value: mainVM.clipEnabled)

                        Divider()
                            .padding(.horizontal, 16)
                            .opacity(0.4)

                        // Tab switcher
                        tabSwitcher
                            .padding(.horizontal, 16)

                        // Tab content
                        Group {
                            if selectedTab == .downloads {
                                DownloadListView(vm: downloadVM)
                                    .padding(.horizontal, 16)
                                    .transition(.asymmetric(
                                        insertion: .push(from: .leading).combined(with: .opacity),
                                        removal: .push(from: .trailing).combined(with: .opacity)
                                    ))
                            } else {
                                HistoryView(history: downloadVM.history)
                                    .padding(.horizontal, 16)
                                    .transition(.asymmetric(
                                        insertion: .push(from: .trailing).combined(with: .opacity),
                                        removal: .push(from: .leading).combined(with: .opacity)
                                    ))
                            }
                        }
                        .animation(.easeInOut(duration: 0.2), value: selectedTab)

                        Spacer(minLength: 20)
                    }
                    .padding(.bottom, 8)
                }
            }
        }
        .frame(minWidth: ClipConstants.minWindowWidth, minHeight: ClipConstants.minWindowHeight)
        .onAppear {
            if clipboardMonitorEnabled { clipboard.start() }
            Task { await updateSvc.checkForUpdates() }
        }
        .onDisappear { clipboard.stop() }
        .onChange(of: clipboard.detectedURL) { _, url in
            guard let url else { return }
            if mainVM.urlText.isEmpty {
                mainVM.setURL(url)
            }
        }
    }

    // MARK: - Header
    private var headerBar: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "scissors")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.clipAccent)
                Text("Clip")
                    .font(.title3.weight(.bold))
            }

            Spacer()

            // Active download badge
            if !downloadVM.activeItems.isEmpty {
                HStack(spacing: 5) {
                    ProgressView()
                        .controlSize(.mini)
                        .scaleEffect(0.75)
                    Text("\(downloadVM.activeItems.count) active")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(Color.clipAccent.opacity(0.1))
                )
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Tab Switcher
    private var tabSwitcher: some View {
        HStack(spacing: 6) {
            ForEach(MainTab.allCases, id: \.self) { tab in
                Button {
                    withAnimation(.easeInOut(duration: ClipConstants.quickAnimation)) {
                        selectedTab = tab
                    }
                } label: {
                    HStack(spacing: 5) {
                        Text(tab.rawValue)
                        if tab == .downloads && !downloadVM.items.isEmpty {
                            Text("\(downloadVM.items.count)")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Capsule().fill(Color.clipAccent))
                        }
                    }
                }
                .buttonStyle(GhostPillButtonStyle(isSelected: selectedTab == tab))
            }
            Spacer()
        }
    }
}

// MARK: - Window Close Interceptor
final class WindowCloseInterceptor: NSObject, NSWindowDelegate {
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }
}
