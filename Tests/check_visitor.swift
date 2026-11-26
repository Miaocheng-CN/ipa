// Run using Tests/check-visitor.sh on a Mac with Xcode.
let vectors = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [[String: Any]]
for vector in vectors {
    let actual = try YunmanVisitor.headers(path: vector["path"] as! String,
        body: vector["body"] as! String, timestamp: vector["timestamp"] as! String,
        nonce: vector["nonce"] as! String)
    precondition(actual == vector["headers"] as! [String: String], "Android/Swift signing mismatch")
    let body = vector["path"] as! String == "/api/home-sections" ? nil : vector["body"] as? String
    let request = try YunmanVisitor.request(URL(string:"https://mangayun.com" + (vector["path"] as! String))!,body:body)
    precondition(request.httpMethod == (body == nil ? "GET" : "POST"))
    precondition(request.httpBody == body.map { Data($0.utf8) })
    precondition(request.value(forHTTPHeaderField: "Origin") == "https://mangayun.com")
    precondition(request.value(forHTTPHeaderField: "x-ym-sign")?.count == 64)
}
for address in ["http://mangayun.com/api/search", "https://evil.example/api/search", "https://mangayun.com/api/search?extra=1", "https://mangayun.com/other"] {
    do { _ = try YunmanVisitor.request(URL(string:address)!, body:"{}");fatalError("Invalid URL accepted") }
    catch {}
}
print("PASS: exact Android reference vectors, methods, UTF-8 bytes, headers and URL boundary")
