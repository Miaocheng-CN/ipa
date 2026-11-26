import SwiftUI
import WebKit
import UIKit
import CryptoKit

private let catalogHosts: Set<String> = ["m.wmh1234.com","wmh1234.com","www.wmh1234.com","reader.hqread.cc","mangayun.com"]
private func remoteOK(_ u: URL, image: Bool) -> Bool {
    guard u.scheme == "https",u.user == nil,u.password == nil,u.port == nil || u.port == 443,let h=u.host?.lowercased() else {return false}
    if !image {return catalogHosts.contains(h)}
    return h.contains(".") && !h.hasSuffix(".local") && !h.hasSuffix(".localhost") && h.range(of:"^[a-z0-9.-]+\\.[a-z]{2,}$",options:.regularExpression) != nil
}
private final class ComicRedirect: NSObject, URLSessionTaskDelegate {
    let image:Bool
    init(_ image:Bool){self.image=image}
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void){// API redirects must not leak path-bound authentication headers.
        if !image && task.originalRequest?.url?.host?.lowercased() == "mangayun.com" {
            completionHandler(nil);return
        }
        completionHandler(request.url.map{remoteOK($0,image:image)} == true ? request:nil)}
}
// Port of Android 1.1.35 YunmanApi.visitorHeaders.
// Hash the exact UTF-8 body transmitted; never reserialize after signing.
enum YunmanVisitor {
    static let paths: Set<String> = ["/api/search", "/api/home-sections", "/api/details", "/api/chapter-images"]
    static func sha(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    static func headers(path: String, body: String, timestamp: String, nonce: String) throws -> [String: String] {
        guard paths.contains(path), let milliseconds = Int64(timestamp), milliseconds >= 0 else {
            throw ReaderError.message("无效漫画请求")
        }
        let feature = "1"
        let suffix = String(((2026 * 7) ^ 90) & 255, radix: 16)
        let seed = sha("ym-cloud_ream-2026_v9-aegis_" + suffix + "|" +
                       String(milliseconds / 300000) + "|" + String(path.prefix(12)))
        var proof = 0
        while proof < 4096 {
            try Task.checkCancellation()
            if sha(seed + ":" + timestamp + ":" + nonce + ":" + feature + ":" + String(proof)).hasPrefix("00") { break }
            proof += 1
        }
        guard proof < 4096 else { throw ReaderError.message("访客请求校验生成失败，请重试") }
        let signature = sha([path, body.isEmpty ? "" : sha(body), timestamp, nonce, feature, String(proof), seed].joined(separator: "|"))
        return ["x-ym-ts": timestamp, "x-ym-nonce": nonce, "x-ym-feat": feature,
                "x-ym-pow": String(proof), "x-ym-sign": signature]
    }
    static func request(_ url: URL, body: String?) throws -> URLRequest {
        guard url.scheme == "https", url.host?.lowercased() == "mangayun.com",
              url.user == nil, url.password == nil, url.port == nil || url.port == 443,
              url.query == nil, paths.contains(url.path),
              (url.path == "/api/home-sections") == (body == nil) else {
            throw ReaderError.message("无效漫画接口或请求方法")
        }
        let text = body ?? ""
        let timestamp = String(Int64(Date().timeIntervalSince1970 * 1000))
        let nonce = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(12))
        var request = URLRequest(url: url)
        request.timeoutInterval = 26
        request.httpMethod = body == nil ? "GET" : "POST"
        request.httpBody = body.map { Data($0.utf8) }
        request.setValue("Qingying-iPad/1.1.40", forHTTPHeaderField: "User-Agent")
        request.setValue("https://mangayun.com/", forHTTPHeaderField: "Referer")
        request.setValue("https://mangayun.com", forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json; charset=UTF-8", forHTTPHeaderField: "Content-Type")
        for (key, value) in try headers(path: url.path, body: text, timestamp: timestamp, nonce: nonce) {
            request.setValue(value, forHTTPHeaderField: key)
        }
        return request
    }
}
@MainActor final class ComicBridge:NSObject,WKScriptMessageHandlerWithReply,WKURLSchemeHandler,WKNavigationDelegate {
    let quit:()->Void
    let dir=FileManager.default.urls(for:.cachesDirectory,in:.userDomainMask)[0].appendingPathComponent("ComicImages",isDirectory:true)
    var jobs:[ObjectIdentifier:Task<Void,Never>]=[:]
    init(_ quit:@escaping()->Void){self.quit=quit;super.init();try? FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)}
    func get(_ u:URL,body:String?=nil,image:Bool=false) async throws -> (Data,URLResponse){
        guard remoteOK(u,image:image) else {throw ReaderError.message("不支持的来源地址")}
        let api = !image && u.host?.lowercased() == "mangayun.com"
        var r: URLRequest
        if api { r = try YunmanVisitor.request(u, body: body) }
        else {
            r = URLRequest(url:u);r.timeoutInterval=18
            r.setValue("Qingying-iPad/1.1.40",forHTTPHeaderField:"User-Agent")
            if let body {r.httpMethod="POST";r.httpBody=Data(body.utf8);r.setValue("application/json",forHTTPHeaderField:"Content-Type")}
        }
        let (data,response)=try await URLSession.shared.data(for:r,delegate:ComicRedirect(image))
        guard let h=response as? HTTPURLResponse,(200..<300).contains(h.statusCode) else {
            var reason = ""
            if api, let json = try? JSONSerialization.jsonObject(with: data.prefix(65536)) as? [String: Any] {
                reason = String((json["message"] as? String ?? json["error"] as? String ?? "").prefix(240))
            }
            throw ReaderError.message("\(response.url?.host ?? u.host ?? "漫画来源") 返回 HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)" + (reason.isEmpty ? "" : " · " + reason))
        }
        guard data.count <= (image ? 24:6)*1024*1024 else {throw ReaderError.message("资源过大")}
        return (data,response)
    }
    func webView(_ web:WKWebView,decidePolicyFor a:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
        decisionHandler(a.request.url?.standardizedFileURL == Bundle.main.url(forResource:"index",withExtension:"html",subdirectory:"Comics")?.standardizedFileURL ? .allow:.cancel)
    }
    func userContentController(_ controller:WKUserContentController,didReceive m:WKScriptMessage,replyHandler:@escaping(Any?,String?)->Void){
        guard m.frameInfo.isMainFrame,m.frameInfo.request.url?.isFileURL == true,let d=m.body as? [String:String] else {replyHandler(nil,"无效页面");return}
        Task { do { switch d["action"] {
        case "exit": replyHandler(true,nil);quit()
        case "copyDiagnostic": UIPasteboard.general.string=String((d["value"] ?? "").prefix(2000));replyHandler(true,nil)
        case "clear": try? FileManager.default.removeItem(at:dir);try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true);replyHandler(true,nil)
        case "document":
            guard let url=URL(string:d["url"] ?? "") else {throw ReaderError.message("无效地址")}
            if url.host?.lowercased() == "mangayun.com" &&
                !["/api/search","/api/home-sections","/api/details","/api/chapter-images"].contains(url.path) {
                throw ReaderError.message("不支持的漫画接口")
            }
            let (data,res)=try await get(url,body:d["body"])
            replyHandler(["url":res.url?.absoluteString ?? url.absoluteString,"text":String(decoding:data,as:UTF8.self)],nil)
        default: throw ReaderError.message("未知操作")
        }} catch {replyHandler(nil,error.localizedDescription)} }
    }
    func webView(_ webView:WKWebView,start task:WKURLSchemeTask){
        let key=ObjectIdentifier(task as AnyObject)
        jobs[key]=Task {
            defer{jobs.removeValue(forKey:key)}
            do { guard let address=task.request.url,let parts=URLComponents(url:address,resolvingAgainstBaseURL:false),let raw=parts.queryItems?.first(where:{$0.name=="u"})?.value,let url=URL(string:raw),remoteOK(url,image:true) else{throw ReaderError.message("无效图片")}
                let hash=SHA256.hash(data:Data(raw.utf8)).map{String(format:"%02x",$0)}.joined(),file=dir.appendingPathComponent(hash)
                let data:Data
                if let cached=try? Data(contentsOf:file){data=cached}else{let (received,_)=try await get(url,image:true);try Task.checkCancellation();guard UIImage(data:received) != nil else {throw ReaderError.message("来源没有返回图片")};data=received;try? data.write(to:file,options:.atomic);prune()}
                try Task.checkCancellation()
                let mime:String
                if data.starts(with:[0x89,0x50,0x4e,0x47]){mime="image/png"}else if data.starts(with:[0x52,0x49,0x46,0x46]){mime="image/webp"}else if data.starts(with:[0x47,0x49,0x46]){mime="image/gif"}else if data.starts(with:[0xff,0xd8]){mime="image/jpeg"}else{mime="application/octet-stream"}
                task.didReceive(URLResponse(url:address,mimeType:mime,expectedContentLength:data.count,textEncodingName:nil));task.didReceive(data);task.didFinish()
            }catch {if !Task.isCancelled{task.didFailWithError(error)}}
        }
    }
    var writes=0
    func prune(){writes+=1;if writes%12 != 1{return}
        let fm=FileManager.default,keys:Set<URLResourceKey>=[.fileSizeKey,.contentModificationDateKey]
        let files=((try? fm.contentsOfDirectory(at:dir,includingPropertiesForKeys:Array(keys))) ?? []).compactMap{u -> (URL,Int,Date)? in guard let v=try? u.resourceValues(forKeys:keys) else{return nil};return(u,v.fileSize ?? 0,v.contentModificationDate ?? .distantPast)}
        var total=files.reduce(0){$0+$1.1};for f in files.sorted(by:{$0.2<$1.2}) where total>180*1024*1024 {if (try? fm.removeItem(at:f.0)) != nil {total-=f.1}}
    }
    func webView(_ webView:WKWebView,stop task:WKURLSchemeTask){jobs.removeValue(forKey:ObjectIdentifier(task as AnyObject))?.cancel()}
}
@MainActor struct ComicHost:UIViewRepresentable {
    let quit:()->Void
    func makeCoordinator()->ComicBridge{ComicBridge(quit)}
    func makeUIView(context:Context)->WKWebView{
        let cfg=WKWebViewConfiguration();cfg.userContentController.addScriptMessageHandler(context.coordinator,contentWorld:.page,name:"comics")
        cfg.setURLSchemeHandler(context.coordinator,forURLScheme:"qcomic")
        let w=WKWebView(frame:.zero,configuration:cfg);w.navigationDelegate=context.coordinator
        w.scrollView.contentInsetAdjustmentBehavior = .never
        if let url=Bundle.main.url(forResource:"index",withExtension:"html",subdirectory:"Comics"){w.loadFileURL(url,allowingReadAccessTo:url.deletingLastPathComponent())}
        return w
    }
    func updateUIView(_ uiView:WKWebView,context:Context){}
    static func dismantleUIView(_ uiView:WKWebView,coordinator:ComicBridge){uiView.stopLoading();uiView.configuration.userContentController.removeScriptMessageHandler(forName:"comics",contentWorld:.page)}
}
