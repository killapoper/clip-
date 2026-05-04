// Models/DownloadHistory.swift
import Foundation

@MainActor
final class DownloadHistory: ObservableObject {
    @Published private(set) var records: [DownloadRecord] = []

    private let fileURL: URL = {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = support.appendingPathComponent("Clip", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("history.json")
    }()

    init() {
        load()
    }

    func add(_ record: DownloadRecord) {
        records.insert(record, at: 0)
        if records.count > ClipConstants.historyMaxItems {
            records = Array(records.prefix(ClipConstants.historyMaxItems))
        }
        save()
    }

    func remove(_ record: DownloadRecord) {
        records.removeAll { $0.id == record.id }
        save()
    }

    func clear() {
        records = []
        save()
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        let decoded = try? JSONDecoder().decode([DownloadRecord].self, from: data)
        records = decoded ?? []
    }

    private func save() {
        let data = try? JSONEncoder().encode(records)
        try? data?.write(to: fileURL)
    }
}
