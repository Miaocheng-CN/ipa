import SwiftUI
import AVKit

@main @MainActor struct QingyingApp: App {
    @StateObject private var reader = SourceReader()
    @StateObject private var player = PlayerModel()
    @StateObject private var downloads = DownloadStore()
    var body: some Scene { WindowGroup { ContentView(reader:reader,player:player,downloads:downloads).preferredColorScheme(.dark) } }
}
@MainActor struct ContentView: View {
    @ObservedObject var reader: SourceReader
    @ObservedObject var player: PlayerModel
    @ObservedObject var downloads: DownloadStore
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("adFilter") private var adFilter = true
    @State private var query = ""
    @State private var films: [Film] = []
    @State private var selected: Film?
    @State private var episodes: [Episode] = []
    @State private var selectedGroup = ""
    @State private var summary = ""
    @State private var busy = false
    @State private var message = ""
    @State private var tab = "推荐"
    @State private var fullscreen = false
    @State private var adStart: Double?
    @State private var adEpisode=""
    @State private var skipSheet = false
    @State private var downloadSheet = false
    @StateObject private var queue = ThunderList()
    @State private var comicSheet = false
    @State private var queueSheet = false
    @AppStorage("thunderLoop") private var loop = false
    @AppStorage("background") private var backgroundPlay = true
    @State private var gamesSheet = false
    @State private var cloudSheet = false
    @State private var favorites:[Film] = (UserDefaults.standard.data(forKey:"favorites").flatMap{try? JSONDecoder().decode([Film].self,from:$0)} ?? [])
    @State private var task: Task<Void,Never>?
    private var groups: [String] { episodes.reduce(into: [String]()) { if !$0.contains($1.group) { $0.append($1.group) } } }
    var body: some View {
        NavigationStack {
            VStack(spacing:12) {
                HStack {
                    Text("清影 · iPad · \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")").font(.title2.bold())
                    Menu("更多") {
                        Button("雷霆大列表") { queueSheet = true }
                        Button("小游戏") { gamesSheet = true }
                        Button("同步与备份") { cloudSheet = true }
                        Toggle("后台播放", isOn:$backgroundPlay)
                    }
                    Button("漫画书架") { player.leave(); comicSheet = true }
                    Button("下载管理") { downloadSheet = true }.buttonStyle(.bordered)
                    Toggle("过滤广告",isOn:$adFilter).fixedSize()
                    Spacer()
                    TextField("搜索影片或粘贴站内链接",text:$query).textFieldStyle(.roundedBorder).frame(maxWidth:430).onSubmit { search() }
                    Button("搜索") { search() }.buttonStyle(.borderedProminent).disabled(busy)
                }
                if busy { HStack { ProgressView(); Text("正在连接…"); Button("取消") { task?.cancel(); reader.web.stopLoading(); busy = false } } }
                if !message.isEmpty { Text(message).font(.callout).foregroundStyle(.orange).textSelection(.enabled) }
                if let film = selected {
                    GeometryReader { geo in
                        if geo.size.width > 850 {
                            HStack(alignment:.top,spacing:20) { playback(film).frame(width:geo.size.width*0.59); ScrollView { detail(film) }.frame(maxWidth:.infinity) }
                        } else { ScrollView { playback(film); detail(film) } }
                    }
                    HStack { Button("返回片库") { player.leave(); selected = nil }; Spacer(); Text("清影 iPad · 预览版").font(.caption).foregroundStyle(.secondary) }
                } else {
                    Picker("页面",selection:$tab) { Text("推荐").tag("推荐"); Text("排行").tag("排行"); Text("历史").tag("历史"); Text("收藏").tag("收藏") }.pickerStyle(.segmented).onChange(of:tab) { _,value in if value != "历史" && value != "收藏" { catalog() } }
                    ScrollView {
                        if tab == "历史" {
                            LazyVStack { ForEach(player.history) { record in Button { open(record.film, resume:record.episode) } label: { HStack { Text(record.film.title); Spacer(); Text(record.episode.title + " · " + stamp(record.position)) }.padding().background(.white.opacity(0.07),in:RoundedRectangle(cornerRadius:12)) } } }
                        } else {
                            LazyVGrid(columns:[GridItem(.adaptive(minimum:145,maximum:205))],spacing:20) {
                                ForEach(tab == "收藏" ? favorites : films) { film in Button { open(film) } label: { VStack(alignment:.leading) { PosterView(film:film,reader:reader).frame(height:215).clipped().clipShape(RoundedRectangle(cornerRadius:12)); Text(film.title).lineLimit(2).frame(height:44,alignment:.topLeading) } }.buttonStyle(.plain) }
                            }
                        }
                    }.refreshable { catalog(refresh:true) }
                }
            }.padding(20).background(Color(red:0.07,green:0.08,blue:0.11))
            .background(ReaderHost(reader:reader).frame(width:900,height:650).offset(x:-2000).allowsHitTesting(false).accessibilityHidden(true))
            .background(ReaderHost(reader:PosterStore.shared.coverReader).frame(width:900,height:650).offset(x:-4000).allowsHitTesting(false).accessibilityHidden(true))
            .task { _ = CloudHost.shared; player.changeEpisode = { delta in adjacent(delta) }; catalog() }
            .onChange(of:scenePhase) { _,phase in CloudHost.shared.tick(); if phase == .background && !backgroundPlay && !player.pictureInPicture { player.leave(); CloudHost.shared.tick() } }
            .onDisappear { if !fullscreen && !player.pictureInPicture { player.leave() } }
            .fullScreenCover(isPresented:$fullscreen) {
                CustomPlayerView(model:player,fullscreen:true,title:player.film?.title ?? "清影",onFullscreen:{ fullscreen = false },onPrevious:{ adjacent(-1) },onNext:{ adjacent(1) },onEpisodes:{ queueSheet = true },onDownload:{ fullscreen = false; Task { try? await Task.sleep(for:.milliseconds(450)); downloadCurrent() } },onSkipSettings:{ fullscreen = false; Task { try? await Task.sleep(for:.milliseconds(450)); skipSheet = true } })
                    .ignoresSafeArea().statusBarHidden().sheet(isPresented:$queueSheet){ queueView }
            }
            .sheet(isPresented:Binding(get:{queueSheet && !fullscreen},set:{if !$0 && !fullscreen { queueSheet = false }})){ queueView }
            .fullScreenCover(isPresented:$comicSheet){ComicHost { comicSheet = false }.ignoresSafeArea().statusBarHidden()}
            .sheet(isPresented:$skipSheet) { if let f = selected { SkipEditor(film:f,player:player) } }
            .sheet(isPresented:$downloadSheet) { downloadsView }
            .sheet(isPresented:$gamesSheet) { NavigationStack { OfflineGames().navigationTitle("小游戏").navigationBarTitleDisplayMode(.inline).toolbar { Button("关闭") { gamesSheet = false } } } }
            .sheet(isPresented:$cloudSheet) { CloudSyncView() }
            .onReceive(NotificationCenter.default.publisher(for:.cloudDataChanged)) { _ in favorites=UserDefaults.standard.data(forKey:"favorites").flatMap{try? JSONDecoder().decode([Film].self,from:$0)} ?? [] }
        }.tint(.yellow)
    }
    @ViewBuilder func playback(_ film: Film) -> some View {
        VStack(alignment:.leading,spacing:10) {
            HStack {Text(film.title).font(.title3.bold());Spacer();Button(favorites.contains(where:{$0.url==film.url}) ? "取消收藏" : "收藏影片") { if favorites.contains(where:{$0.url==film.url}) {favorites.removeAll{$0.url==film.url}}else{favorites.append(film)};if let data=try? JSONEncoder().encode(favorites){UserDefaults.standard.set(data,forKey:"favorites")} }}
            if !fullscreen {
                CustomPlayerView(model:player,fullscreen:false,title:film.title,onFullscreen:{ fullscreen = true },onPrevious:{ adjacent(-1) },onNext:{ adjacent(1) },onEpisodes:{ queueSheet = true },onDownload:{ downloadCurrent() },onSkipSettings:{ skipSheet = true })
                    .frame(minHeight:250).aspectRatio(16/9,contentMode:.fit).clipShape(RoundedRectangle(cornerRadius:12))
            }
            HStack {
                Button { downloadCurrent() } label: { Label("下载本集",systemImage:"arrow.down.to.line") }.disabled(player.mediaURL == nil)
                Button("队列"){queueSheet = true};Text(player.episode?.title ?? "请选择集数").foregroundStyle(.secondary); Spacer(); Menu("倍速") { ForEach([0.75,1,1.25,1.5,2],id:\.self) { rate in Button(String(format:"%.2g×",rate)) { player.setRate(Float(rate)) } } }; Button("片头片尾") { skipSheet = true } }
            HStack {
                Menu("广告时间段") {
                    Button("标记当前位置为开始") { adStart=player.position;adEpisode=player.episode?.url ?? "" }
                    Button("标记结束并保存") {if let e=player.episode,let start=adStart,adEpisode==e.url,start<player.position{player.setRanges(player.ranges(e)+[[start,player.position]],e);adStart=nil;message="本集广告段已保存"}else{message="请先在本集标记开始位置，再播放到结束位置"}}
                    Button("清除本集标记",role:.destructive){if let e=player.episode{player.setRanges([],e)};adStart=nil}
                }.disabled(player.episode==nil)
                Menu("定时暂停") {ForEach([15,30,45,60],id:\.self){n in Button("\(n) 分钟"){player.sleepAfter(n)}};Button("取消计时"){player.sleepAfter(0)}}
                if let deadline=player.timerDeadline{Text(deadline,style:.timer).font(.caption)}
            }
            if !player.failure.isEmpty { Text(player.failure).foregroundStyle(.orange) }
        }
    }
    @ViewBuilder func detail(_ film: Film) -> some View {
        VStack(alignment:.leading,spacing:16) {
            if !summary.isEmpty { Text(summary).font(.callout).foregroundStyle(.secondary).lineLimit(5) }
            Text("播放线路").font(.headline)
            ScrollView(.horizontal,showsIndicators:false) { HStack { ForEach(Array(groups.enumerated()),id:\.element) { index,group in Button("线路\(index+1)") { selectedGroup = group }.buttonStyle(.bordered).tint(group == selectedGroup ? .yellow:.gray) } } }
            Button("整季加入雷霆大列表"){queue.add(film,route:episodes.filter{$0.group == selectedGroup}); queueSheet = true}.disabled(episodes.isEmpty)
            Text("选集").font(.headline)
            LazyVGrid(columns:[GridItem(.adaptive(minimum:80))],spacing:10) {
                ForEach(episodes.filter { $0.group == selectedGroup }) { episode in Button { play(film,episode) } label: { VStack { Text(episode.title).lineLimit(1); let t = player.resume(film,episode); if t>0 { Text(stamp(t)).font(.caption).foregroundStyle(.secondary) } }.frame(maxWidth:.infinity,minHeight:45).padding(5).background(player.episode?.url == episode.url ? Color.yellow.opacity(0.3):Color.white.opacity(0.07),in:RoundedRectangle(cornerRadius:10)) }.disabled(busy) }
            }
        }.padding(.vertical,12)
    }
    @ViewBuilder var downloadsView: some View {
        NavigationStack {
            List {
                if downloads.downloading {
                    Section("正在下载") {
                        Text(downloads.state)
                        ProgressView(value: downloads.progress)
                    }
                }
                Section("已下载") {
                    if downloads.items.isEmpty { Text("还没有下载的视频").foregroundStyle(.secondary) }
                    ForEach(downloads.items) { video in
                        HStack {
                            Text(video.title).lineLimit(2)
                            Spacer()
                            Button("播放") {
                                if let url = downloads.file(video) {
                                    downloadSheet = false
                                    selected = nil
                                    player.openLocal(video,url:url)
                                    fullscreen = true
                                }
                            }
                            Button(role:.destructive) { downloads.delete(video) } label: { Image(systemName:"trash") }
                        }
                    }
                }
                if !downloads.state.isEmpty && !downloads.downloading { Text(downloads.state).foregroundStyle(.secondary) }
            }.navigationTitle("下载管理")
                .toolbar { Button("完成") { downloadSheet = false } }
        }
    }
    func downloadCurrent() {
        guard let url = player.mediaURL, let f = player.film, let e = player.episode else { message = "请先播放本集"; return }
        downloads.start(url:url,title:f.title + " · " + e.title,id:e.url)
        downloadSheet = true
    }
    func run(_ action: @escaping () async throws -> Void) {
        task?.cancel(); message = ""; busy = true
        task = Task { do { try await action() } catch is CancellationError {} catch { message = error.localizedDescription }; if !Task.isCancelled { busy = false } }
    }
    func apply(_ data: [String:Any]) { PosterStore.shared.newPage(); var seen = Set<String>(); films = (data["items"] as? [[String:Any]] ?? []).map(Film.init).filter { !$0.url.isEmpty && seen.insert($0.url).inserted } }
    func catalog(refresh: Bool = false) { run { let url = tab == "排行" ? SourceReader.home+"ranking/index.html":SourceReader.home; apply(try await reader.read(url,refresh:refresh)) } }
    func search() { let q = query.trimmingCharacters(in:.whitespacesAndNewlines); guard !q.isEmpty else { return }; selected = nil; run { if q.hasPrefix("https://") { let data = try await reader.read(q); if !(data["episodes"] as? [Any] ?? []).isEmpty { selected = Film(["url":q,"title":data["title"] as? String ?? "影片","cover":data["cover"] as? String ?? ""]); summary = data["description"] as? String ?? ""; episodes = (data["episodes"] as? [[String:Any]] ?? []).map(Episode.init); selectedGroup = episodes.first?.group ?? "" } else { apply(data) } } else { apply(try await reader.search(q)) } } }
    func open(_ film: Film, resume: Episode? = nil) {
        run {
            let data = try await reader.read(film.url); selected = film; summary = data["description"] as? String ?? ""
            var seen = Set<String>(); episodes = (data["episodes"] as? [[String:Any]] ?? []).map(Episode.init).filter { !$0.url.isEmpty && seen.insert($0.url).inserted }
            selectedGroup = resume?.group ?? episodes.first?.group ?? ""
            if let e = resume { let target=episodes.first(where:{$0.url==e.url}) ?? episodes.first(where:{$0.title==e.title}) ?? e; selectedGroup=target.group; let url = try await reader.media(target.url); player.open(film,target,url:url,all:episodes) }
        }
    }
    func play(_ film: Film, _ e: Episode) { run { let url = try await reader.media(e.url); player.open(film,e,url:url,all:episodes) } }
    func adjacent(_ delta: Int) {
        guard !busy, let f = player.film, let e = player.episode else { return }
        if let i = queue.rows.firstIndex(where:{$0.film.url == f.url && $0.episode.url == e.url}) {
            let n = i + delta, count = queue.rows.count
            guard loop || queue.rows.indices.contains(n) else {message = delta>0 ? "已播至队列末尾":"已在队列开头";return}
            playRow(queue.rows[(n + count) % count]); return
        }
        let route = player.episodes.filter { $0.group == e.group }
        guard let index = route.firstIndex(where: { $0.url == e.url }), route.indices.contains(index+delta) else { message = delta>0 ? "已是当前线路最后一集":"已是当前线路第一集"; return }
        selected = f; episodes = player.episodes; selectedGroup = e.group; play(f,route[index+delta])
    }
    var queueView: some View { ThunderSheet(queue:queue,current:player.film.flatMap{f in player.episode.map{f.url+"\n"+$0.url}},play:playRow) }
    func playRow(_ row:QueueEpisode) {
        run {
            let url = try await reader.media(row.episode.url)
            try Task.checkCancellation()
            let same = selected?.url == row.film.url
            let all = same && episodes.contains(where:{$0.url == row.episode.url}) ? episodes : queue.rows.filter{$0.film.url == row.film.url}.map(\.episode)
            if !same {summary = ""}
            selected = row.film; selectedGroup = row.episode.group; episodes = all
            player.open(row.film,row.episode,url:url,all:all)
        }
    }
    func stamp(_ seconds: Double) -> String { let n = max(0,Int(seconds)); return String(format:"%02d:%02d",n/60,n%60) }
}
@MainActor struct SkipEditor: View {
    let film: Film
    @ObservedObject var player: PlayerModel
    @Environment(\.dismiss) private var dismiss
    @State private var head = "0"
    @State private var tail = "0"
    @State private var error = ""
    var body: some View {
        NavigationStack { Form {
            Section(film.title) { HStack { Text("跳过片头（秒）"); Spacer(); TextField("0",text:$head).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(width:100) }; HStack { Text("跳过片尾（秒）"); Spacer(); TextField("0",text:$tail).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(width:100) } }
            Text("每部剧单独保存，各集共用。0 关闭；开启自动下一集后，跳过片尾时会接着播放。").foregroundStyle(.secondary)
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
        }.navigationTitle("片头片尾").toolbar {
            ToolbarItem(placement:.cancellationAction) { Button("取消") { dismiss() } }
            ToolbarItem(placement:.confirmationAction) { Button("保存") { guard let h = Double(head), let t = Double(tail), h.isFinite,t.isFinite,h>=0,t>=0,h<=86400,t<=86400 else { error="请输入有效秒数";return }; if player.film?.url == film.url && player.duration>0 && h+t>=player.duration { error="总时长必须小于本集时长";return };player.setSkip(film,head:h,tail:t);dismiss() } }
        }.onAppear { head=String(Int(player.skip(film,"head")));tail=String(Int(player.skip(film,"tail"))) } }
    }
}
