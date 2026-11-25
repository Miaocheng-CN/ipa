import SwiftUI
import WebKit

@MainActor struct OfflineGames: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let web = WKWebView()
        if let entry = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Games") {
            web.loadFileURL(entry, allowingReadAccessTo: entry.deletingLastPathComponent())
        }
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {}
}
