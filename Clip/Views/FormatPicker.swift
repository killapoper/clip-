// Views/FormatPicker.swift
import SwiftUI

struct FormatPickerView: View {
    @ObservedObject var vm: MainViewModel

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 14) {
                // Format row
                VStack(alignment: .leading, spacing: 6) {
                    Label("Format", systemImage: "doc.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(OutputFormat.allCases, id: \.self) { fmt in
                                Button(fmt.rawValue) {
                                    withAnimation(.easeInOut(duration: ClipConstants.quickAnimation)) {
                                        vm.selectedFormat = fmt
                                    }
                                }
                                .buttonStyle(GhostPillButtonStyle(isSelected: vm.selectedFormat == fmt))
                            }
                        }
                        .padding(.horizontal, 1)
                    }
                }

                Divider().opacity(0.5)

                // Resolution row (hidden for audio-only)
                if !vm.selectedFormat.isAudioOnly {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Resolution", systemImage: "rectangle.and.arrow.up.right.and.arrow.down.left")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(ResolutionPreset.allCases, id: \.self) { res in
                                    Button(res.rawValue) {
                                        withAnimation(.easeInOut(duration: ClipConstants.quickAnimation)) {
                                            vm.selectedResolution = res
                                        }
                                    }
                                    .buttonStyle(GhostPillButtonStyle(isSelected: vm.selectedResolution == res))
                                }
                            }
                            .padding(.horizontal, 1)
                        }
                    }

                    Divider().opacity(0.5)
                }

                // Target size row
                VStack(alignment: .leading, spacing: 6) {
                    Label("Target Size", systemImage: "arrow.down.circle")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    HStack(spacing: 8) {
                        Button("Original") {
                            withAnimation(.easeInOut(duration: ClipConstants.quickAnimation)) {
                                vm.targetSize = .original
                            }
                        }
                        .buttonStyle(GhostPillButtonStyle(isSelected: vm.targetSize == .original))

                        Button("Custom MB") {
                            withAnimation(.easeInOut(duration: ClipConstants.quickAnimation)) {
                                vm.targetSize = .custom(mb: vm.customSizeMB)
                            }
                        }
                        .buttonStyle(GhostPillButtonStyle(
                            isSelected: {
                                if case .custom = vm.targetSize { return true }
                                return false
                            }()
                        ))

                        if case .custom = vm.targetSize {
                            HStack(spacing: 4) {
                                TextField("MB", value: $vm.customSizeMB, format: .number)
                                    .textFieldStyle(.plain)
                                    .frame(width: 44)
                                    .multilineTextAlignment(.center)
                                    .font(.subheadline.weight(.medium))
                                    .onChange(of: vm.customSizeMB) { _, new in
                                        vm.targetSize = .custom(mb: new)
                                    }
                                Text("MB")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(
                                RoundedRectangle(cornerRadius: ClipConstants.smallCornerRadius, style: .continuous)
                                    .fill(Color.primary.opacity(0.05))
                            )
                            .transition(.scale.combined(with: .opacity))
                        }

                        Spacer(minLength: 0)
                    }
                }

                Divider().opacity(0.5)

                // Clip toggle
                HStack {
                    Label("Clip Range", systemImage: "scissors")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .symbolEffect(.bounce, value: vm.clipEnabled)

                    Spacer()

                    Toggle("", isOn: $vm.clipEnabled.animation(.spring(response: ClipConstants.springResponse, dampingFraction: ClipConstants.springDamping)))
                        .toggleStyle(.switch)
                        .labelsHidden()
                        .controlSize(.small)
                }
            }
        }
    }
}
