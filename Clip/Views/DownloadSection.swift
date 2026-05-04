// Views/DownloadSection.swift
import SwiftUI

struct DownloadSectionView: View {
    @ObservedObject var mainVM: MainViewModel
    @ObservedObject var downloadVM: DownloadViewModel

    var body: some View {
        Button {
            startDownload()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "arrow.down.circle.fill")
                Text("Download")
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 2)
        }
        .buttonStyle(PillButtonStyle(color: .clipAccent))
        .disabled(!canDownload)
        .opacity(canDownload ? 1.0 : 0.5)
    }

    private var canDownload: Bool {
        mainVM.metadata != nil || mainVM.isValidURL
    }

    private func startDownload() {
        let item = mainVM.buildDownloadItem(saveLocation: downloadVM.saveLocation)
        downloadVM.enqueue(item: item)
        mainVM.clearURL()
    }
}
