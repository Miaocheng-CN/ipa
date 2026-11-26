# 清影 iPad 1.1.40
适用 iPadOS 17 或以上。这里提供的是 Xcode 源工程，不含已签名的 IPA。
## 漫画
工作区修改（版本仍为 1.1.40）：参照 Android 1.1.35 添加云漫访客签名；四源原生路由保留，没有网页跳转或强制换源。联网结果见 Tests/live-results.json。没有在 Xcode 或 iPad 上执行 Swift 代码，不能据此认定 IPA 已修复。
首页 → 漫画书架 → 进入章节 → 轻点画面 → 阅读设置。可选连续下滑、单页翻页或双页并排，翻页动效可单独关闭。双页推荐横屏；左右滑动或点箭头翻页；单数末页单独显示，再向前翻进入下一章。设置和阅读进度在本机保存。
## 影视与播放队列
从首页的「更多」打开雷霆大列表，或从影片详情加入季/集；可调整顺序、指定接下来播放的集数。播放器还包括观看历史、跳片头片尾、手动广告区间、画中画和下载入口。小游戏在「更多」里。云同步代码未更改；未验证漫画阅读进度跨设备同步。安卓终端不在此版本范围内。线上片库、封面、播放线路和漫画源受站点可用性影响，不能保证与 Android 的每一条线路一致。
## 在 Mac 构建
解压后，在安装了完整 Xcode 及 iOS SDK 的 Mac 打开终端进入本目录，执行：
    bash Build-iPad.command
成功后，输出 build/Qingying-iPad-1.1.40-unsigned.ipa。此文件需要用自己的 Apple 开发签名后才能安装。也可以直接用 Xcode 打开 Qingying.xcodeproj，在 Signing & Capabilities 选择自己的 Team；如标识被占用，需要改为自己的唯一标识，再选择 iPad 运行。
## 验证范围
可用 Node.js 运行 `node Tests/search_fixture.js`，验证漫画1234搜索重试、来源状态和旧书架历史保留。此测试使用模拟响应。
阅读交互用本地测试章节验证，包含单双页、奇数末页、跨章、重开续读及连续模式。Tests/reader_fixture.py 提供同类浏览器回归测试（Python、Playwright 和 Chromium）。当前交付未经 Xcode 编译或 iPad 真机验收。

## 认证回归
在 Mac 执行 `bash Tests/check-visitor.sh`：从实际 ComicHost.swift 提取认证代码，用 Android 原方法产生的四组固定向量验证签名、UTF-8 请求体和请求方法。Build-iPad.command 会先执行此检查再编译。
执行 `python3 Tests/live_yunman.py` 需要 Java 21 和 curl，测试 Android 参考协议的真实搜索、推荐、三源目录/图片；此测试不代替 iOS 真机测试。
