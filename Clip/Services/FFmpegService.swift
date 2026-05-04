// Services/FFmpegService.swift
import Foundation

actor FFmpegService {
    private let binDir: String
    private let ffmpegPath: String
    private let ffprobePath: String

    init() {
        self.binDir     = Bundle.main.bundlePath + ClipConstants.resourcesBinPath
        self.ffmpegPath  = binDir + "/" + ClipConstants.ffmpegBinary
        self.ffprobePath = binDir + "/" + ClipConstants.ffprobeBinary
    }

    // MARK: - Compress to target size
    func compress(inputPath: String, outputPath: String, targetMB: Int) async throws {
        // Probe duration first
        let durationStr = try await probeDuration(inputPath: inputPath)
        guard let duration = Double(durationStr), duration > 0 else {
            throw FFmpegError.probeFailed("Could not determine duration")
        }
        // target_size_bits = targetMB * 8 * 1024 * 1024
        // audio ~128kbps, rest for video
        let audioBitrate = 128_000
        let totalBits    = Double(targetMB) * 8 * 1024 * 1024
        let videoBitrate = Int((totalBits / duration) - Double(audioBitrate))
        guard videoBitrate > 0 else {
            throw FFmpegError.bitrateError("Target size too small for this duration")
        }

        let args: [String] = [
            "-i", inputPath,
            "-b:v", "\(videoBitrate)",
            "-b:a", "\(audioBitrate)",
            "-y",
            outputPath
        ]
        try await runFFmpeg(args: args)
    }

    // MARK: - Clip trim (fast copy)
    func clip(inputPath: String, outputPath: String, start: Double, end: Double) async throws {
        let args: [String] = [
            "-i", inputPath,
            "-ss", String(start),
            "-to", String(end),
            "-c", "copy",
            "-y",
            outputPath
        ]
        try await runFFmpeg(args: args)
    }

    // MARK: - Probe duration
    private func probeDuration(inputPath: String) async throws -> String {
        let args: [String] = [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            inputPath
        ]
        let process = makeProcess(executable: ffprobePath, args: args)
        let pipe    = Pipe()
        process.standardOutput = pipe
        process.standardError  = Pipe()

        return try await withCheckedThrowingContinuation { cont in
            process.terminationHandler = { _ in
                let data   = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8) ?? ""
                cont.resume(returning: output.trimmingCharacters(in: .whitespacesAndNewlines))
            }
            try? process.run()
        }
    }

    private func runFFmpeg(_ args: [String]) async throws {
        // Ensure ffmpeg exists, else skip (binaries may not be bundled in dev)
        guard FileManager.default.fileExists(atPath: ffmpegPath) else { return }
        let process = makeProcess(executable: ffmpegPath, args: args)
        let errPipe = Pipe()
        process.standardError = errPipe

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            process.terminationHandler = { proc in
                if proc.terminationStatus == 0 {
                    cont.resume()
                } else {
                    let data = errPipe.fileHandleForReading.readDataToEndOfFile()
                    let msg  = String(data: data, encoding: .utf8) ?? "ffmpeg error"
                    cont.resume(throwing: FFmpegError.failed(msg))
                }
            }
            do {
                try process.run()
            } catch {
                cont.resume(throwing: error)
            }
        }
    }

    private func makeProcess(executable: String, args: [String]) -> Process {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments     = args
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = binDir + ":/usr/bin:/bin"
        process.environment = env
        return process
    }
}

enum FFmpegError: LocalizedError {
    case failed(String)
    case probeFailed(String)
    case bitrateError(String)

    var errorDescription: String? {
        switch self {
        case .failed(let m):      return "FFmpeg error: \(m)"
        case .probeFailed(let m): return "Probe failed: \(m)"
        case .bitrateError(let m): return m
        }
    }
}
