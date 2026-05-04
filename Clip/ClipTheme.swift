// ClipTheme.swift
import SwiftUI

// MARK: - Color Tokens
extension Color {
    static let clipAccent     = Color.accentColor
    static let clipLavender   = Color(red: 0.58, green: 0.44, blue: 0.86)
    static let clipRosewood   = Color(red: 0.86, green: 0.34, blue: 0.56)
    static let clipCoral      = Color(red: 0.94, green: 0.38, blue: 0.34)
    static let clipBronze     = Color(red: 0.94, green: 0.62, blue: 0.24)
    static let clipSuccess    = Color(red: 0.24, green: 0.78, blue: 0.52)
    static let clipMuted      = Color.secondary.opacity(0.7)
}

// MARK: - GlassCard
struct GlassCard<Content: View>: View {
    var radius: CGFloat = ClipConstants.cardCornerRadius
    var padding: CGFloat = ClipConstants.cardPadding
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(Color(nsColor: .controlBackgroundColor))
                    .overlay(
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.06), radius: 4, x: 0, y: 2)
            )
    }
}

// MARK: - GlassProgressBar
struct GlassProgressBar: View {
    var progress: Double          // 0…1
    var tint: Color = .clipAccent
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.black.opacity(0.05))
                    .frame(height: height)
                Capsule()
                    .fill(tint)
                    .frame(width: max(0, geo.size.width * progress), height: height)
                    .animation(.easeOut(duration: 0.3), value: progress)
            }
        }
        .frame(height: height)
    }
}

// MARK: - PillButtonStyle
struct PillButtonStyle: ButtonStyle {
    var color: Color = .clipAccent
    var isSmall: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(isSmall ? .caption.weight(.semibold) : .subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, isSmall ? 12 : 16)
            .padding(.vertical, isSmall ? 5 : 8)
            .background(
                Capsule()
                    .fill(color)
                    .opacity(configuration.isPressed ? 0.8 : 1.0)
            )
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.easeInOut(duration: ClipConstants.quickAnimation), value: configuration.isPressed)
    }
}

// MARK: - GhostPillButtonStyle
struct GhostPillButtonStyle: ButtonStyle {
    var isSelected: Bool = false
    var color: Color = .clipAccent

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.medium))
            .foregroundStyle(isSelected ? color : .secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(isSelected ? color.opacity(0.12) : Color.clear)
                    .overlay(
                        Capsule()
                            .strokeBorder(isSelected ? color.opacity(0.25) : Color.primary.opacity(0.08), lineWidth: 1)
                    )
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: ClipConstants.quickAnimation), value: configuration.isPressed)
    }
}

// MARK: - SegmentedTabStyle helper
struct SegmentedTab: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
        }
        .buttonStyle(GhostPillButtonStyle(isSelected: isSelected))
    }
}

// MARK: - PlatformBadge color helper
extension Platform {
    var badgeColor: Color {
        switch self {
        case .youtube:   return .clipCoral
        case .twitter:   return .clipAccent
        case .instagram: return .clipRosewood
        case .tiktok:    return Color.black
        case .reddit:    return .clipBronze
        case .unknown:   return .clipMuted
        }
    }
    var iconName: String {
        switch self {
        case .youtube:   return "play.rectangle.fill"
        case .twitter:   return "bird.fill"
        case .instagram: return "camera.fill"
        case .tiktok:    return "music.note"
        case .reddit:    return "bubble.left.and.bubble.right.fill"
        case .unknown:   return "globe"
        }
    }
}

// MARK: - WindowBackground tint
struct TranslucentWindowBackground: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            window.identifier = NSUserInterfaceItemIdentifier("ClipMainWindow")
            window.isOpaque = false
            window.backgroundColor = .clear
            if let effectView = window.contentView?.superview {
                let blur = NSVisualEffectView(frame: effectView.bounds)
                blur.autoresizingMask = [.width, .height]
                blur.blendingMode = .behindWindow
                blur.material = .hudWindow
                blur.state = .active
                effectView.addSubview(blur, positioned: .below, relativeTo: effectView)
            }
        }
        return view
    }
    func updateNSView(_ nsView: NSView, context: Context) {}
}
