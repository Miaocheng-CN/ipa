# iPad 1.1.0 同步更新（尚未编译 IPA）

- App/CloudSync.swift：私有 WKWebView + 仅随包资源的桥接，HTTPS 同步请求，Keychain 设备凭证，本机 JSON 自动备份和分享。
- App/Cloud：与 Android/Windows 一致的记录协议、持久化离线队列、版本比较、删除与冲突处理。
- 影视续播、收藏、历史、片头片尾、倍速、广告过滤与服务器同步；换线路续播按剧集标题匹配。
- 原 bundle ID com.qingying.ipad 保留，版本提升为 1.1.0/build2。
- 当前 iPad 原生应用没有漫画和小游戏界面；它们的共享数据不会在 iPad 直接变成相应功能。
- .github/workflows/ios.yml 是可自行运行的 macOS 构建流程，构建产物是未签名 IPA。

本源包未经过 Xcode 编译或 iPad 实机验证。不要把旧 IPA 当作本更新安装。
