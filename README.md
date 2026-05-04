# Clip — yt-dlp macOS Frontend

Minimal, polished macOS video downloader built with SwiftUI (Tahoe Liquid Glass design language).
macOS 14+, Swift 5.9, hardened runtime.

---

## Prerequisites

```bash
brew install xcodegen
```

## Bundled Binaries

Drop universal (arm64 + x86_64) binaries into `Clip/Resources/bin/`:

| Binary   | Source                                                   |
|----------|----------------------------------------------------------|
| yt-dlp   | https://github.com/yt-dlp/yt-dlp/releases               |
| ffmpeg   | https://evermeet.cx/ffmpeg/ (static universal build)     |
| ffprobe  | https://evermeet.cx/ffmpeg/ (static universal build)     |

```bash
mkdir -p Clip/Resources/bin
# Download and place: yt-dlp, ffmpeg, ffprobe
chmod +x Clip/Resources/bin/*
```

## Build & Run

```bash
# 1. Generate Xcode project
xcodegen generate

# 2. Build (Debug)
xcodebuild -project Clip.xcodeproj -scheme Clip \
           -configuration Debug \
           -derivedDataPath build \
           build

# 3. Install to /Applications
rm -rf /Applications/Clip.app
cp -R build/Build/Products/Debug/Clip.app /Applications/

# 4. Remove quarantine & launch
xattr -cr /Applications/Clip.app
open /Applications/Clip.app
```

## Architecture

```
Clip/
├── ClipApp.swift          – @main, NSApplicationDelegateAdaptor, menu bar setup
├── ClipTheme.swift        – Tahoe tokens, GlassCard, GlassProgressBar, button styles
├── ClipConstants.swift    – Named layout / timing / path constants
├── Models/
│   ├── Platform.swift     – Platform enum + detection
│   ├── DownloadItem.swift – @MainActor ObservableObject, state machine
│   ├── DownloadHistory.swift – JSON-persisted history
│   └── VideoMetadata.swift   – yt-dlp JSON model
├── ViewModels/
│   ├── MainViewModel.swift    – URL input + metadata analysis
│   └── DownloadViewModel.swift – Concurrent download queue (max 3)
├── Views/
│   ├── ContentView.swift  – Root layout, tab switcher, clipboard bridge
│   ├── URLInput.swift     – Paste/Analyze, drag-drop, platform badge
│   ├── VideoPreview.swift – Async thumbnail, title, duration, uploader
│   ├── FormatPicker.swift – Format / Resolution / Target Size / Clip toggle
│   ├── ClipRange.swift    – Dual-handle timecode slider
│   ├── DownloadSection.swift – Download button
│   ├── DownloadList.swift – Per-item progress rows
│   ├── History.swift      – Completed download history
│   ├── SaveLocation.swift – Folder picker strip
│   ├── StatusBar.swift    – NSStatusItem + NSPopover (2-step flow)
│   ├── UpdateBanner.swift – GitHub release banner
│   └── Settings.swift     – Preferences window
└── Services/
    ├── YTDLPService.swift     – actor: fetch metadata, download, cancel
    ├── FFmpegService.swift    – actor: compress, clip trim
    ├── URLDetector.swift      – URL validation + extraction
    ├── ClipboardMonitor.swift – Periodic pasteboard polling
    ├── RedditResolver.swift   – api.reddit.com custom resolver
    └── UpdateService.swift    – GitHub releases check
```

## Design — Tahoe Liquid Glass

- **GlassCard**: `controlBackgroundColor` fill + 6% stroke + 4pt shadow
- **GlassProgressBar**: Capsule track, tinted fill, `easeOut` animation
- **PillButtonStyle**: Capsule, scale+opacity on press, 0.2s easeInOut
- **GhostPillButtonStyle**: Bordered capsule, accent tint when selected
- Colors: AccentColor (blue), ClipLavender, ClipRosewood, ClipCoral, ClipBronze, ClipSuccess

## Supported Platforms

YouTube · X/Twitter · Instagram · TikTok · Reddit · any yt-dlp-compatible URL

## Key Notes

- Binary path resolved via `Bundle.main.bundlePath + "/Contents/Resources/bin"` (never `bundle.path(forResource:)`)
- Reddit uses custom `api.reddit.com` resolver (yt-dlp extractor is broken for some URLs)
- Instagram auto-detects Safari cookies
- Window close hides instead of destroying (keeps queue alive)
- `@MainActor` for all UI; `actor` for YTDLPService; `NSLock` in OutputPathHolder
