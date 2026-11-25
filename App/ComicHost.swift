import SwiftUI
import WebKit
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
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void){completionHandler(request.url.map{remoteOK($0,image:image)} == true ? request:nil)}
}
@MainActor final class ComicBridge:NSObject,WKScriptMessageHandlerWithReply,WKURLSchemeHandler,WKNavigationDelegate {
    let quit:()->Void
    let dir=FileManager.default.urls(for:.cachesDirectory,in:.userDomainMask)[0].appendingPathComponent("ComicImages",isDirectory:true)
    var jobs:[ObjectIdentifier:Task<Void,Never>]=[:]
    init(_ quit:@escaping()->Void){self.quit=quit;super.init();try? FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)}
    func get(_ u:URL,body:String?=nil,image:Bool=false) async throws -> (Data,URLResponse){
        guard remoteOK(u,image:image) else {throw ReaderError.message("不支持的来源地址")}
        var r=URLRequest(url:u);r.timeoutInterval=18;r.setValue("Qingyue-iPad/1.1.36",forHTTPHeaderField:"User-Agent")
        if let body {r.httpMethod="POST";r.httpBody=Data(body.utf8);r.setValue("application/json",forHTTPHeaderField:"Content-Type")}
        let (data,response)=try await URLSession.shared.data(for:r,delegate:ComicRedirect(image))
        guard let h = response as? HTTPURLResponse else {
    throw ReaderError.message("无效的服务器响应")
}

guard (200..<300).contains(h.statusCode) else {
    let detail = String(
        decoding: data.prefix(500),
        as: UTF8.self
    )

    throw ReaderError.message(
        "HTTP \(h.statusCode)\n\(detail)"
    )
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
        case "clear": try? FileManager.default.removeItem(at:dir);try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true);replyHandler(true,nil)
        case "document":
            guard let url=URL(string:d["url"] ?? "") else {throw ReaderError.message("无效地址")}
            if url.host == "mangayun.com" && !["/api/search","/api/home-sections","/api/details","/api/chapter-images"].contains(url.path){throw ReaderError.message("不支持的接口")}
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
