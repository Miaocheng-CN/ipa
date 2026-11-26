import SwiftUI
import WebKit
import Security
import CryptoKit

extension Notification.Name { static let cloudDataChanged = Notification.Name("QingyueCloudDataChanged") }
@MainActor final class CloudHost: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate {
    static let shared = CloudHost()
    let web: WKWebView
    private let folder: URL
    private var config: [String:Any] = [:]
    private var timer: Timer?
    @Published var exportFile: URL?
    private let deviceKey = "qingyue.cloud.device"
    override init() {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .nonPersistent()
        web = WKWebView(frame:.zero,configuration:cfg)
        folder = FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("CloudSync",isDirectory:true)
        super.init()
        try? FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        config = read("connection.json") as? [String:Any] ?? [:]
        cfg.userContentController.add(self,name:"cloud")
        web.navigationDelegate = self
        if let index = Bundle.main.url(forResource:"index",withExtension:"html",subdirectory:"Cloud") { web.loadFileURL(index,allowingReadAccessTo:index.deletingLastPathComponent()) }
        timer = Timer.scheduledTimer(withTimeInterval:30,repeats:true) { [weak self] _ in Task { @MainActor in self?.tick() } }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy)->Void) {
        guard let url = action.request.url, url.isFileURL, let root=Bundle.main.resourceURL, url.standardizedFileURL.path.hasPrefix(root.appendingPathComponent("Cloud").path+"/") else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func tick() { web.evaluateJavaScript("window.CloudTick && window.CloudTick()",completionHandler:{_,_ in}) }
    private func read(_ name:String)->Any? { guard let data=try? Data(contentsOf:folder.appendingPathComponent(name)) else {return nil};return try? JSONSerialization.jsonObject(with:data,options:.fragmentsAllowed) }
    private func write(_ name:String,_ value:Any)throws { let data=try JSONSerialization.data(withJSONObject:value,options:[.sortedKeys,.fragmentsAllowed]);try data.write(to:folder.appendingPathComponent(name),options:.atomic) }
    private func credential(_ value:String? = nil)throws->String {
        let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.qingying.ipad.sync",kSecAttrAccount as String:"device-token"]
        if let value=value { let bytes=Data(value.utf8);let update:[String:Any]=[kSecValueData as String:bytes,kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly];let status=SecItemUpdate(query as CFDictionary,update as CFDictionary);if status==errSecItemNotFound { var entry=query;for(k,v)in update{entry[k]=v};guard SecItemAdd(entry as CFDictionary,nil)==errSecSuccess else{throw ReaderError.message("保存同步凭证失败")}}else if status != errSecSuccess{throw ReaderError.message("更新同步凭证失败")};return value }
        var q=query;q[kSecReturnData as String]=true;q[kSecMatchLimit as String]=kSecMatchLimitOne;var result:CFTypeRef?;let status=SecItemCopyMatching(q as CFDictionary,&result);if status==errSecItemNotFound{return ""};guard status==errSecSuccess,let bytes=result as? Data,let text=String(data:bytes,encoding:.utf8) else{throw ReaderError.message("读取同步凭证失败")};return text
    }
    private func decoded(_ key:String,_ fallback:Any)->Any { if let data=UserDefaults.standard.data(forKey:key),let value=try? JSONSerialization.jsonObject(with:data){return value};return fallback }
    private func values()->[String:Any] {
        let d=UserDefaults.standard
        var v:[String:Any]=["history":decoded("history",[]),"favorites":decoded("favorites",[]),"syncedProgress":decoded("syncedProgress",[:]),"syncedSkips":decoded("syncedSkips",[:])]
        for k in ["adFilter","speed","autoNext","background"] { if let x=d.object(forKey:k){v[k]=x} }
        var skips=v["syncedSkips"] as? [String:Any] ?? [:]
        for case let h as [String:Any] in v["history"] as? [Any] ?? [] { if let f=h["film"] as? [String:Any],let u=f["url"] as? String {if d.object(forKey:"skip:"+u+"head") != nil || d.object(forKey:"skip:"+u+"tail") != nil { skips[u]=["intro":d.double(forKey:"skip:"+u+"head"),"outro":d.double(forKey:"skip:"+u+"tail")] }} }
        v["syncedSkips"]=skips;return v
    }
    private func fingerprint(_ v:[String:Any])throws->String { SHA256.hash(data:try JSONSerialization.data(withJSONObject:v,options:.sortedKeys)).map{String(format:"%02x",$0)}.joined() }
    private func snapshot()throws->[String:Any] {
        let d=UserDefaults.standard;var id=d.string(forKey:deviceKey);if id==nil{id=UUID().uuidString;d.set(id,forKey:deviceKey)}
        let v=values();let jobs=(decoded("downloads",[]) as? [[String:Any]] ?? []).map{["id":$0["id"] ?? "","title":$0["title"] ?? "","status":"本机已下载"]}
        return ["platform":"ios","deviceId":id!,"values":v,"downloads":jobs,"localFingerprint":try fingerprint(v)]
    }
    private func apply(_ s:[String:Any])throws {
        guard s["localFingerprint"] as? String == (try fingerprint(values())) else {throw ReaderError.message("本机记录刚发生变化，稍后自动重试")}
        guard let v=s["values"] as? [String:Any] else {throw ReaderError.message("同步数据格式不正确")}
        let d=UserDefaults.standard
        let old=values()["syncedProgress"] as? [String:[String:Any]] ?? [:]
        let incoming=v["syncedProgress"] as? [String:[String:Any]] ?? [:]
        for (k,p) in old where incoming[k]==nil { if let f=p["film"] as? [String:Any],let e=p["episode"] as? [String:Any],let u=f["url"] as? String,let eu=e["url"] as? String {d.removeObject(forKey:"progress:"+nativeKey(u,e["title"] as? String ?? "",eu))} }
        for p in incoming.values { if let f=p["film"] as? [String:Any],let e=p["episode"] as? [String:Any],let u=f["url"] as? String,let eu=e["url"] as? String {d.set(p["position"] as? Double ?? 0,forKey:"progress:"+nativeKey(u,e["title"] as? String ?? "",eu))} }
        let oldSkips=values()["syncedSkips"] as? [String:Any] ?? [:],skips=v["syncedSkips"] as? [String:[String:Any]] ?? [:]
        for k in Set(oldSkips.keys).union(skips.keys) {d.set(skips[k]?["intro"] as? Double ?? 0,forKey:"skip:"+k+"head");d.set(skips[k]?["outro"] as? Double ?? 0,forKey:"skip:"+k+"tail")}
        for k in ["history","favorites","syncedProgress","syncedSkips"] { let fallback:Any = (k=="history" || k=="favorites") ? [Any]() : [String:Any]();d.set(try JSONSerialization.data(withJSONObject:v[k] ?? fallback),forKey:k) }
        for k in ["adFilter","speed","autoNext","background"] {if let x=v[k]{d.set(x,forKey:k)}else{d.removeObject(forKey:k)}}
        NotificationCenter.default.post(name:.cloudDataChanged,object:nil)
    }
    private func nativeKey(_ film:String,_ title:String,_ page:String)->String { if title.range(of:#"^第?\s*\d+\s*[集话期]$"#,options:.regularExpression) != nil { return film+"|"+String(Int(title.filter(\.isNumber)) ?? 0)+String(title.suffix(1)) };return page }
    private func backup()throws->URL {let s=try snapshot(),b:[String:Any]=["format":"qingyue-backup","version":1,"platform":"ios","createdAt":Date().timeIntervalSince1970*1000,"data":s];let name="backup-"+UUID().uuidString+".json";try write(name,b);return folder.appendingPathComponent(name)}
    private func request(_ path:String,_ body:Any?,_ cfg:[String:Any]?=nil,_ pairing:Bool=false) async throws -> Any {
        let c=cfg ?? config
        guard path.range(of:#"^/api/(state\?cursor=\d+|status|sync|pair)$"#,options:.regularExpression) != nil,let address=c["serverURL"] as? String,let root=URLComponents(string:address),root.scheme=="https",root.host != nil,root.user==nil,root.password==nil,root.query==nil,root.fragment==nil,(root.path.isEmpty || root.path=="/"),let url=URL(string:address.trimmingCharacters(in:CharacterSet(charactersIn:"/"))+path) else {throw ReaderError.message("请输入 HTTPS 服务器根地址")}
        var req=URLRequest(url:url,timeoutInterval:20);req.setValue("application/json",forHTTPHeaderField:"Content-Type")
        if !pairing { req.setValue("Bearer "+(try credential()),forHTTPHeaderField:"Authorization") }
        if let b=body,!(b is NSNull){req.httpMethod="POST";req.httpBody=try JSONSerialization.data(withJSONObject:b)}
        let cfg=URLSessionConfiguration.ephemeral;cfg.timeoutIntervalForResource=30
        let session=URLSession(configuration:cfg,delegate:NoCloudRedirect(),delegateQueue:nil);defer{session.invalidateAndCancel()}
        let (data,response)=try await session.data(for:req)
        guard data.count<=20*1024*1024 else {throw ReaderError.message("同步响应过大")}
        let value=try JSONSerialization.jsonObject(with:data)
        guard let http=response as? HTTPURLResponse,(200..<300).contains(http.statusCode) else {throw ReaderError.message((value as? [String:Any])?["error"] as? String ?? "服务器返回错误")};return value
    }
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage) {
        guard message.frameInfo.isMainFrame,let text=message.body as? String,let bytes=text.data(using:.utf8),let r=try? JSONSerialization.jsonObject(with:bytes) as? [String:Any],let id=r["id"] as? String,let method=r["method"] as? String else{return}
        Task { var reply:[String:Any];do{let value=try await command(method,r["data"],r["connectionId"] as? String);reply=["value":value]}catch{reply=["error":error.localizedDescription]};guard let out=try? JSONSerialization.data(withJSONObject:[id,reply]),let array=String(data:out,encoding:.utf8) else{return};web.evaluateJavaScript("window.CloudReply.apply(null,"+array+")",completionHandler:{_,_ in}) }
    }
    private func command(_ method:String,_ raw:Any?,_ connection:String?) async throws -> Any {
        if ["http","apply","journal-read","journal-write"].contains(method),connection != (config["deviceId"] as? String ?? "") {throw ReaderError.message("连接已更改，稍后重新同步")}
        let d=raw as? [String:Any] ?? [:]
        switch method {
        case "snapshot":return try snapshot()
        case "apply":try apply(d);return true
        case "journal-read":let file=folder.appendingPathComponent("journal-"+(config["deviceId"] as? String ?? "unpaired")+".json");if !FileManager.default.fileExists(atPath:file.path){return NSNull()};return try JSONSerialization.jsonObject(with:Data(contentsOf:file))
        case "journal-write":try write("journal-"+(config["deviceId"] as? String ?? "unpaired")+".json",d);return true
        case "backup-auto":_ = try backup();return true
        case "status":return ["connected":!(try credential()).isEmpty,"enabled":config["enabled"] as? Bool ?? true,"serverURL":config["serverURL"] as? String ?? "","name":config["name"] as? String ?? "","connectionId":config["deviceId"] as? String ?? ""]
        case "enabled":config["enabled"]=raw as? Bool ?? false;try write("connection.json",config);return true
        case "http":return try await request(d["path"] as? String ?? "",d["body"])
        case "pair":
            _ = try backup()
            var c:[String:Any]=["serverURL":d["url"] as? String ?? "","name":d["name"] as? String ?? "iPad","enabled":true]
            guard let result=try await request("/api/pair",["code":d["code"] as? String ?? "","name":c["name"]!],c,true) as? [String:Any],let token=result["token"] as? String,let device=result["deviceId"] as? String else {throw ReaderError.message("配对响应无效")}
            _ = try credential(token);c["deviceId"]=device;config=c;try write("connection.json",config);return true
        case "export":exportFile=try backup();return ["message":"请在分享菜单保存 JSON 备份。"]
        default:throw ReaderError.message("未知同步操作")
        }
    }
}
final class NoCloudRedirect:NSObject,URLSessionTaskDelegate {
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void) {completionHandler(nil)}
}
struct CloudWebView:UIViewRepresentable {
    func makeUIView(context:Context)->WKWebView {CloudHost.shared.web}
    func updateUIView(_ uiView:WKWebView,context:Context) {}
}
struct CloudShare:UIViewControllerRepresentable {
    let file:URL
    func makeUIViewController(context:Context)->UIActivityViewController {UIActivityViewController(activityItems:[file],applicationActivities:nil)}
    func updateUIViewController(_ uiViewController:UIActivityViewController,context:Context) {}
}
struct CloudSyncView:View {
    @ObservedObject var host=CloudHost.shared
    @Environment(\.dismiss) var dismiss
    @State var share=false
    var body:some View {NavigationStack {CloudWebView().navigationTitle("同步与备份").navigationBarTitleDisplayMode(.inline).toolbar{Button("完成"){dismiss()}}.onChange(of:host.exportFile){_,value in if value != nil{share=true}}.sheet(isPresented:$share){if let file=host.exportFile{CloudShare(file:file)}}}}
}
