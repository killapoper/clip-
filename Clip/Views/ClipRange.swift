// Views/ClipRange.swift
import SwiftUI

struct ClipRangeView: View {
    @ObservedObject var vm: MainViewModel

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label("Clip Range", systemImage: "scissors")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(rangeLabel)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }

                DualHandleSlider(
                    lowerValue: $vm.clipStart,
                    upperValue: $vm.clipEnd,
                    range: 0...(vm.metadata?.duration ?? 100)
                )
                .frame(height: 32)

                HStack {
                    TimecodeField(label: "Start", value: $vm.clipStart, max: vm.clipEnd)
                    Spacer()
                    TimecodeField(label: "End", value: $vm.clipEnd, max: vm.metadata?.duration ?? 100)
                }
            }
        }
        .transition(.asymmetric(
            insertion: .scale(scale: 0.97, anchor: .top).combined(with: .opacity),
            removal:   .scale(scale: 0.97, anchor: .top).combined(with: .opacity)
        ))
    }

    private var rangeLabel: String {
        let dur = vm.clipEnd - vm.clipStart
        let m   = Int(dur) / 60
        let s   = Int(dur) % 60
        return String(format: "%d:%02d selected", m, s)
    }
}

// MARK: - DualHandleSlider
struct DualHandleSlider: View {
    @Binding var lowerValue: Double
    @Binding var upperValue: Double
    let range: ClosedRange<Double>

    @State private var isDraggingLower = false
    @State private var isDraggingUpper = false

    private let trackHeight: CGFloat = 4
    private let handleSize:  CGFloat = 20

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width

            ZStack(alignment: .leading) {
                // Track background
                Capsule()
                    .fill(Color.black.opacity(0.08))
                    .frame(height: trackHeight)
                    .frame(maxWidth: .infinity)

                // Selected range fill
                let lX = xPos(for: lowerValue, in: width)
                let uX = xPos(for: upperValue, in: width)
                Capsule()
                    .fill(Color.clipAccent)
                    .frame(width: max(0, uX - lX), height: trackHeight)
                    .offset(x: lX)

                // Lower handle
                handle(isDragging: isDraggingLower)
                    .offset(x: lX - handleSize / 2)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { v in
                                isDraggingLower = true
                                let newVal = value(for: v.location.x, in: width)
                                lowerValue = min(max(range.lowerBound, newVal), upperValue - 1)
                            }
                            .onEnded { _ in
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    isDraggingLower = false
                                }
                            }
                    )

                // Upper handle
                handle(isDragging: isDraggingUpper)
                    .offset(x: uX - handleSize / 2)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { v in
                                isDraggingUpper = true
                                let newVal = value(for: v.location.x, in: width)
                                upperValue = max(min(range.upperBound, newVal), lowerValue + 1)
                            }
                            .onEnded { _ in
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    isDraggingUpper = false
                                }
                            }
                    )
            }
            .frame(height: handleSize)
        }
    }

    @ViewBuilder
    private func handle(isDragging: Bool) -> some View {
        Circle()
            .fill(Color.white)
            .frame(width: handleSize, height: handleSize)
            .overlay(
                Circle()
                    .strokeBorder(Color.clipAccent, lineWidth: 2)
            )
            .shadow(color: Color.black.opacity(0.15), radius: isDragging ? 6 : 3, x: 0, y: isDragging ? 3 : 1)
            .scaleEffect(isDragging ? 1.15 : 1.0)
            .animation(.spring(response: ClipConstants.springResponse, dampingFraction: ClipConstants.springDamping), value: isDragging)
    }

    private func xPos(for value: Double, in width: CGFloat) -> CGFloat {
        let span = range.upperBound - range.lowerBound
        guard span > 0 else { return 0 }
        return CGFloat((value - range.lowerBound) / span) * width
    }

    private func value(for x: CGFloat, in width: CGFloat) -> Double {
        let span = range.upperBound - range.lowerBound
        let clamped = min(max(0, x), width)
        return range.lowerBound + Double(clamped / width) * span
    }
}

// MARK: - TimecodeField
struct TimecodeField: View {
    let label: String
    @Binding var value: Double
    let max: Double

    private var timecode: String {
        let t = Int(value)
        let h = t / 3600
        let m = (t % 3600) / 60
        let s = t % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%d:%02d", m, s)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.tertiary)
            Text(timecode)
                .font(.caption.monospacedDigit().weight(.medium))
                .foregroundStyle(.secondary)
        }
    }
}
