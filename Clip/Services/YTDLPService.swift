// Services/YTDLPService.swift
import Foundation

// Thread-safe holder for output path during download
final class OutputPathHolder {
    private let lock = NSLock()
    private var _path: String?

    var path: String? {
        get { lock.withLock { _path } }
        set { lock.withLock { _path = newValue } }
    }
}

actor YTDLPService {
    private let binDir: String
    private let ytdlpPath: String
    private var activeProcesses: [UUID: Process] = [:]

    init() {
        self.binDir   = Bundle.main.bundlePath + ClipConstants.resourcesBinPath
        self.ytdlpPath = binDir + "/" + ClipConstants.ytdlpBinary
    }

    // MARK: - Metadata
    func fetchMetadata(url: String) async throws -> VideoMetadata {
        let resolvedURL = try await resolveURL(url)
        let args = [resolvedURL, "--dump-json", "--no-playlist", "--no-warnings"]
        let output = try await runProcess(ytdlpPath, args: args)
        guard let data = output.data(using: .utf8) else {
            throw YTDLPError.parseError("No output from yt-dlp")
        }
        do {
            return try JSONDecoder().decode(VideoMetadata.self, from: data)
        } catch {
            throw YTDLPError.parseError("JSON decode failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Download
    func download(
        item: DownloadItem,
        outputDir: String,
        progressHandler: @escaping (Double, String) -> Void
    ) async throws -> String {
        let resolvedURL = try await resolveURL(item.url)
        var args = buildArgs(item: item, outputDir: outputDir, url: resolvedURL)

        let holder = OutputPathHolder()
        let process = makeProcess(executable: ytdlpPath, args: args)

        await MainActor.run { _ = item } // ensure MainActor access is ok
        activeProcesses[item.id] = process

        defer { activeProcesses.removeValue(forKey: item.id) }

        return try await withCheckedThrowingContinuation { continuation in
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError  = pipe

            var buffer = ""
            pipe.fileHandleForReading.readabilityHandler = { handle in
                let data   = handle.availableData
                guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
                buffer += text
                let lines  = buffer.components(separatedBy: "\n")
                buffer     = lines.last ?? ""
                for line in lines.dropLast() {
                    let trimmed = line.trimmingCharacters(in: .whitespaces)
                    if let (pct, label) = Self.parseProgress(trimmed) {
                        progressHandler(pct, label)
                    }
                    if trimmed.hasPrefix("[download] Destination:") ||
                       trimmed.hasPrefix("[Merger] Merging formats into") ||
                       trimmed.hasPrefix("[ffmpeg]") {
                        if let path = Self.extractPath(from: trimmed) {
                            holder.path = path
                        }
                    }
                }
            }

            process.terminationHandler = { proc in
                pipe.fileHandleForReading.readabilityHandler = nil
                if proc.terminationStatus == 0, let path = holder.path {
                    continuation.resume(returning: path)
                } else if proc.terminationStatus == 0 {
                    // Try to find latest file in outputDir
                    continuation.resume(returning: outputDir)
                } else {
                    continuation.resume(throwing: YTDLPError.downloadFailed("Exit code \(proc.terminationStatus)"))
                }
            }

            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    func cancel(id: UUID) {
        if let process = activeProcesses[id] {
            activeProcesses.removeValue(forKey: id)
            process.terminate()
        }
    }

    // MARK: - Helpers
    private func resolveURL(_ url: String) async throws -> String {
        if url.lowercased().contains("reddit.com") || url.lowercased().contains("redd.it") {
            return try await RedditResolver.resolve(url: url)
        }
        return url
    }

    private func buildArgs(item: DownloadItem, outputDir: String, url: String) -> [String] {
        var args: [String] = []

        // Output template
        let template = outputDir + "/%(title)s.%(ext)s"
        args += ["-o", template]

        // Format selection
        switch item.format {
        case .mp3:
            args += ["-x", "--audio-format", "mp3", "--audio-quality", "0"]
        case .mp4, .mov, .webm:
            let ext = item.format.fileExtension
            if let height = item.resolution.ytdlpHeight {
                args += ["-f", "bestvideo[height<=\(height)][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=\(height)]+bestaudio/best[height<=\(height)]"]
            } else {
                args += ["-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"]
            }
            if ext != "mp4" {
                args += ["--recode-video", ext]
            } else {
                args += ["--merge-output-format", "mp4"]
            }
        }

        // FFmpeg location
        args += ["--ffmpeg-location", binDir]

        // Clip range
        if let start = item.clipStart, let end = item.clipEnd {
            args += ["--download-sections", "*\(Int(start))-\(Int(end))"]
            args += ["--force-keyframes-at-cuts"]
        }

        // Instagram cookies
        if item.platform == .instagram {
            args += ["--cookies-from-browser", "safari"]
        }

        // No playlist
        args += ["--no-playlist"]

        // Progress output
        args += ["--newline"]

        args.append(url)
        return args
    }

    private func makeProcess(executable: String, args: [String]) -> Process {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments     = args
        process.environment   = buildEnvironment()
        return process
    }

    private func buildEnvironment() -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        var path = binDir
        path += ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        if let existing = env["PATH"] {
            path += ":" + existing
        }
        env["PATH"] = path
        return env
    }

    private func runProcess(_ executable: String, args: [String]) async throws -> String {
        let process = makeProcess(executable: executable, args: args)
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError  = pipe

        return try await withCheckedThrowingContinuation { continuation in
            process.terminationHandler = { proc in
                let data   = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8) ?? ""
                if proc.terminationStatus == 0 {
                    continuation.resume(returning: output)
                } else {
                    continuation.resume(throwing: YTDLPError.processError(output))
                }
            }
            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    // MARK: - Progress parsing
    static func parseProgress(_ line: String) -> (Double, String)? {
        // [download]  45.2% of ~100.00MiB at 2.50MiB/s ETA 00:30
        guard line.hasPrefix("[download]") else { return nil }
        let parts = line.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        guard parts.count >= 2 else { return nil }
        let pctStr = parts[1].replacingOccurrences(of: "%", with: "")
        guard let pct = Double(pctStr) else { return nil }
        let label: String
        if let atIdx = parts.firstIndex(of: "at"), parts.count > atIdx + 1 {
            let speed = parts[atIdx + 1]
            if let etaIdx = parts.firstIndex(of: "ETA"), parts.count > etaIdx + 1 {
                label = "\(speed) · ETA \(parts[etaIdx + 1])"
            } else {
                label = speed
            }
        } else {
            label = "\(Int(pct))%"
        }
        return (pct / 100.0, label)
    }

    static func extractPath(from line: String) -> String? {
        if line.hasPrefix("[download] Destination:") {
            return line.replacingOccurrences(of: "[download] Destination:", with: "").trimmingCharacters(in: .whitespaces)
        }
        if line.contains("Merging formats into") {
            // [Merger] Merging formats into "path/file.mp4"
            if let start = line.firstIndex(of: "\""), let end = line.lastIndex(of: "\""), start != end {
                return String(line[line.index(after: start)..<end])
            }
        }
        return nil
    }
}

// MARK: - Errors
enum YTDLPError: LocalizedError {
    case notInstalled
    case parseError(String)
    case downloadFailed(String)
    case processError(String)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .notInstalled:          return "yt-dlp binary not found in app bundle."
        case .parseError(let m):     return "Parse error: \(m)"
        case .downloadFailed(let m): return "Download failed: \(m)"
        case .processError(let m):   return "Process error: \(m)"
        case .cancelled:             return "Cancelled"
        }
    }
}
