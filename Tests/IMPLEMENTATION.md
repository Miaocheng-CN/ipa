# 1.1.40 访客请求适配工作稿
代码：ComicHost.swift 移植 Android 1.1.35 访客签名，绑定四类 API 的路径和实际请求体；bridge.js 补齐图片代理处理；app.js 删除单源失败后自动换源；Build-iPad.command 增加 Swift 签名回归。
实际联网测试：使用从 Android 原适配器提取的 Java 签名代码和与 Swift 请求构造相同的头、方法、UTF-8 请求体，真实搜索/推荐 HTTP200。漫画之家458章、31张首话图片；如漫画459章、9张；读漫屋407章、9张。三个源首张图片HTTP200并通过文件头检查。
这些是参考协议测试，不是 Swift 二进制或 IPA 真机联网测试。Java 四组固定签名已独立交叉验证，供 Mac 执行 Tests/check-visitor.sh 比对实际 Swift。此环境无 Swift/Xcode，未执行该检查或编译 IPA。上游部分作品曾返回500/超时；读漫屋通过的是同源另一条搜索结果，不表示全部作品可读。
保留四源、双页、连续接章、书架、历史、缓存及现有云同步代码。未验证跨设备同步。版本未增加，工程包是工作稿而非已验收发布包。
测试细节：Tests/live-results.json（包含失败尝试）、Tests/native_routes.js、Tests/visitor-vectors.json。
