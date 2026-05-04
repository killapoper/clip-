// ClipConstants.swift
import Foundation

enum ClipConstants {
    // MARK: - Layout
    static let cardCornerRadius: CGFloat = 16
    static let smallCornerRadius: CGFloat = 10
    static let cardPadding: CGFloat = 16
    static let sectionSpacing: CGFloat = 12
    static let itemSpacing: CGFloat = 8

    // MARK: - Window
    static let minWindowWidth: CGFloat = 560
    static let minWindowHeight: CGFloat = 620
    static let defaultWindowWidth: CGFloat = 580
    static let defaultWindowHeight: CGFloat = 720

    // MARK: - Popover
    static let popoverWidth: CGFloat = 360
    static let popoverHeight: CGFloat = 480

    // MARK: - Animations
    static let quickAnimation: Double = 0.2
    static let standardAnimation: Double = 0.3
    static let springResponse: Double = 0.4
    static let springDamping: Double = 0.75

    // MARK: - Downloads
    static let maxConcurrentDownloads: Int = 3
    static let historyMaxItems: Int = 200

    // MARK: - Process
    static let resourcesBinPath: String = "/Contents/Resources/bin"
    static let ytdlpBinary: String = "yt-dlp"
    static let ffmpegBinary: String = "ffmpeg"
    static let ffprobeBinary: String = "ffprobe"

    // MARK: - Defaults
    static let defaultDownloadFolder: String = "~/Downloads"
    static let defaultFormat: String = "mp4"
    static let defaultResolution: String = "1080p"

    // MARK: - Timeout
    static let metadataTimeoutSeconds: Double = 30
    static let downloadTimeoutSeconds: Double = 3600

    // MARK: - Reddit
    static let redditAPIBase: String = "https://api.reddit.com"

    // MARK: - Update
    static let updateCheckURL: String = "https://api.github.com/repos/clip-app/clip/releases/latest"
    static let currentVersion: String = "1.0.0"
}
