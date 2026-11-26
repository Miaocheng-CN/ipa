import Foundation
import Network

// Loopback HTTP serves playlists only. Video bytes continue to use their original URL.
final class HLSProxy: @unchecked Sendable {
    static let shared = HLSProxy()
    private let queue = DispatchQueue(label:"qingying.hls.proxy")
    private var listener: NWListener?
    private var port: UInt16 = 0
    private var tickets: [String: URL] = [:]
    private var waiters: [(Bool) -> Void] = []
    func prepare(_ original: URL) async -> URL {
        guard original.path.lowercased().hasSuffix(".m3u8"), (UserDefaults.standard.object(forKey:"adFilter") as? Bool ?? true) else { return original }
        return await withCheckedContinuation { continuation in
            queue.async {
                self.start { ok in continuation.resume(returning: ok ? self.register(original) : original) }
            }
        }
    }
    private func start(_ done: @escaping (Bool) -> Void) {
        if port != 0 { done(true); return }
        waiters.append(done)
        if listener != nil { return }
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host:"127.0.0.1",port:.any)
            let listener = try NWListener(using:parameters)
            self.listener = listener
            listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
            listener.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                switch state {
                case .ready: self.port = listener.port?.rawValue ?? 0; self.finish(self.port != 0)
                case .failed: self.listener = nil; self.port = 0; self.finish(false)
                default: break
                }
            }
            listener.start(queue:queue)
        } catch { listener = nil; finish(false) }
    }
    private func finish(_ ok: Bool) { let pending = waiters; waiters.removeAll(); pending.forEach { $0(ok) } }
    private func register(_ original: URL) -> URL {
        let key = UUID().uuidString + ".m3u8"; tickets[key] = original
        return URL(string:"http://127.0.0.1:\(port)/\(key)")!
    }
    private func accept(_ connection: NWConnection) {
        connection.start(queue:queue); receive(connection,Data())
        queue.asyncAfter(deadline:.now()+25) { connection.cancel() }
    }
    private func receive(_ connection: NWConnection, _ previous: Data) {
        connection.receive(minimumIncompleteLength:1,maximumLength:16384) { [weak self] data,_,complete,error in
            guard let self else { connection.cancel(); return }
            var request = previous; if let data { request.append(data) }
            guard request.count <= 16384, error == nil else { connection.cancel(); return }
            guard let text = String(data:request,encoding:.utf8), text.contains("\r\n\r\n") else {
                if complete { connection.cancel() } else { self.receive(connection,request) }; return
            }
            let words = text.components(separatedBy:"\r\n")[0].split(separator:" ")
            guard words.count >= 2, words[0] == "GET", let url = self.tickets[String(words[1].dropFirst()).components(separatedBy:"?")[0]] else { self.respond(connection,status:404,data:Data()); return }
            var upstream = URLRequest(url:url); upstream.timeoutInterval = 20
            upstream.setValue("Mozilla/5.0",forHTTPHeaderField:"User-Agent")
            upstream.setValue("https://www.kkys16.com/",forHTTPHeaderField:"Referer")
            URLSession.shared.dataTask(with:upstream) { data,response,error in
                self.queue.async {
                    guard error == nil, let data, data.count <= 8*1024*1024, let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode), let source = String(data:data,encoding:.utf8), source.trimmingCharacters(in:.whitespacesAndNewlines).hasPrefix("#EXTM3U") else { self.respond(connection,status:502,data:Data()); return }
                    let filtered = (UserDefaults.standard.object(forKey:"adFilter") as? Bool ?? true) ? HLSAdFilter.filter(source) : source
                    let base = response.url ?? url
                    let rewritten = filtered.components(separatedBy:"\n").map { line -> String in
                        let s = line.trimmingCharacters(in:.whitespacesAndNewlines)
                        if !s.isEmpty && !s.hasPrefix("#"), let target = URL(string:s,relativeTo:base)?.absoluteURL {
                            return target.path.lowercased().hasSuffix(".m3u8") ? self.register(target).absoluteString : target.absoluteString
                        }
                        guard s.contains("URI=\""), let regex = try? NSRegularExpression(pattern:"URI=\"([^\"]+)\"") else { return line }
                        var result = line
                        for match in regex.matches(in:line,range:NSRange(line.startIndex...,in:line)).reversed() {
                            guard let r = Range(match.range(at:1),in:line), let target = URL(string:String(line[r]),relativeTo:base)?.absoluteURL else { continue }
                            let uri = target.path.lowercased().hasSuffix(".m3u8") ? self.register(target).absoluteString : target.absoluteString
                            result.replaceSubrange(r,with:uri)
                        }
                        return result
                    }.joined(separator:"\n")
                    self.respond(connection,status:200,data:Data(rewritten.utf8))
                }
            }.resume()
        }
    }
    private func respond(_ connection: NWConnection, status: Int, data: Data) {
        var response = Data("HTTP/1.1 \(status) \(status == 200 ? "OK" : "Error")\r\nContent-Type: application/vnd.apple.mpegurl\r\nContent-Length: \(data.count)\r\nConnection: close\r\n\r\n".utf8)
        response.append(data); connection.send(content:response,completion:.contentProcessed { _ in connection.cancel() })
    }
}
