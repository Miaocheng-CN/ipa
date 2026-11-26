import SwiftUI
import AVKit
import MediaPlayer

struct WatchRecord: Codable, Identifiable {
    var film: Film; var episode: Episode; var position: Double; var date: Date
    var duration: Double? = nil; var completed: Bool? = nil
    var id: String { episode.url }
}
@MainActor final class PlayerModel: ObservableObject {
    let player = AVPlayer()
    @Published var film: Film?
    @Published var episode: Episode?
    @Published var episodes: [Episode] = []
    @Published var position = 0.0
    @Published var duration = 0.0
    @Published var playing = false
    @Published var pictureInPicture = false
    @Published var preferredRate: Float = 1
    @Published var mediaURL: URL?
    @Published var history: [WatchRecord] = []
    @Published var failure = ""
    private var observer: Any?
    private var notificationToken: NSObjectProtocol?
    private var statusObserver: NSKeyValueObservation?
    private var lastSaved = 0.0
    private var ended = false
    private var headPending = true
    private var restoring = false
    private var loadGeneration = 0
    private var cloudObserver: NSObjectProtocol?
    @Published var timerDeadline: Date?
    private var sleepTask: Task<Void,Never>?
    func sleepAfter(_ minutes:Int){
        sleepTask?.cancel();timerDeadline=nil
        guard minutes>0 else{return}
        timerDeadline=Date().addingTimeInterval(Double(minutes)*60)
        sleepTask=Task {try? await Task.sleep(nanoseconds:UInt64(minutes)*60_000_000_000);guard !Task.isCancelled else{return};player.pause();save();timerDeadline=nil}
    }
    func ranges(_ e:Episode)->[[Double]]{UserDefaults.standard.array(forKey:"adRanges:"+e.url) as? [[Double]] ?? []}
    func setRanges(_ list:[[Double]],_ e:Episode){UserDefaults.standard.set(list,forKey:"adRanges:"+e.url)}
    var changeEpisode: ((Int) -> Void)?
    init() {
        if let rate=UserDefaults.standard.object(forKey:"speed") as? Double,rate>=0.5,rate<=3{preferredRate=Float(rate)}
        if let data = UserDefaults.standard.data(forKey: "history"), let saved = try? JSONDecoder().decode([WatchRecord].self, from: data) { history = saved }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)
        observer = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 600), queue: .main) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        notificationToken = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] note in
            guard let item = note.object as? AVPlayerItem else { return }
            Task { @MainActor in guard let self = self, item === self.player.currentItem else { return }; self.finishCurrent() }
        }
        cloudObserver = NotificationCenter.default.addObserver(forName:.cloudDataChanged,object:nil,queue:.main) { [weak self] _ in
            Task { @MainActor in if let data=UserDefaults.standard.data(forKey:"history"),let saved=try? JSONDecoder().decode([WatchRecord].self,from:data){self?.history=saved};if let rate=UserDefaults.standard.object(forKey:"speed") as? Double,rate>=0.5,rate<=3{self?.preferredRate=Float(rate)} }
        }
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in Task { @MainActor in self?.start() }; return .success }
        center.pauseCommand.addTarget { [weak self] _ in Task { @MainActor in self?.player.pause() }; return .success }
        center.skipForwardCommand.preferredIntervals = [17]
        center.skipBackwardCommand.preferredIntervals = [17]
        center.skipForwardCommand.addTarget { [weak self] _ in Task { @MainActor in self?.jump(17) }; return .success }
        center.skipBackwardCommand.addTarget { [weak self] _ in Task { @MainActor in self?.jump(-17) }; return .success }
        center.nextTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.changeEpisode?(1) }; return .success }
        center.previousTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.changeEpisode?(-1) }; return .success }
    }
    func key(_ f: Film, _ e: Episode) -> String {
        if e.title.range(of: #"^第?\s*\d+\s*[集话期]$"#, options: .regularExpression) != nil {
            let number = Int(e.title.filter(\.isNumber)) ?? 0
            return f.url + "|" + String(number) + String(e.title.suffix(1))
        }
        return e.url
    }
    func resume(_ f: Film, _ e: Episode) -> Double { UserDefaults.standard.double(forKey: "progress:" + key(f,e)) }
    func skip(_ f: Film, _ part: String) -> Double { UserDefaults.standard.double(forKey: "skip:" + f.url + part) }
    func setSkip(_ f: Film, head: Double, tail: Double) { UserDefaults.standard.set(head, forKey: "skip:" + f.url + "head"); UserDefaults.standard.set(tail, forKey: "skip:" + f.url + "tail"); headPending = true }
    func open(_ f: Film, _ e: Episode, url: URL, all: [Episode]) {
        save(); film = f; episode = e; episodes = all; failure = ""; ended = false; headPending = true
        position = resume(f,e); duration = 0; lastSaved = 0; mediaURL = url
        loadGeneration += 1
        let token = loadGeneration
        restoring = true
        player.pause()
        Task {
            let playbackURL = await HLSProxy.shared.prepare(url)
            guard token == loadGeneration else { return }
            attach(AVPlayerItem(url: playbackURL))
        }
    }
    private func attach(_ item: AVPlayerItem) {
        player.replaceCurrentItem(with: item)
        restoring = true
        statusObserver = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self = self, item === self.player.currentItem else { return }
                if item.status == .failed {
                    self.failure = item.error?.localizedDescription ?? "播放失败，请更换线路"
                    self.restoring = false
                } else if item.status == .readyToPlay && self.restoring {
                    let target = self.position
                    let finished = await self.player.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
                    guard item === self.player.currentItem else { return }
                    self.restoring = false
                    if finished { self.start() }
                }
            }
        }
    }

    func tick() {
        guard !restoring else { return }
        playing = player.timeControlStatus == .playing
        let current = player.currentTime().seconds
        if current.isFinite && !ended { position = max(0,current) }
        let total = player.currentItem?.duration.seconds ?? 0
        duration = total.isFinite ? max(0,total) : 0
        if !ended,playing,let e=episode,(UserDefaults.standard.object(forKey:"adFilter") as? Bool ?? true),let range=ranges(e).first(where:{$0.count==2 && $0[0]<=position && position<$0[1] && $0[1]<=duration}){
            seek(range[1]);return
        }
        if let f = film, duration > 0, !ended {
            let head = skip(f,"head"), tail = skip(f,"tail")
            if head + tail < duration {
                if headPending { headPending = false; if position < head { seek(head) } }
                if tail > 0 && playing && position >= duration-tail { finishCurrent() }
            }
        }
        if Date().timeIntervalSince1970-lastSaved > 3 { save(); lastSaved = Date().timeIntervalSince1970 }
        if let f = film, let e = episode {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = [MPMediaItemPropertyTitle:f.title, MPMediaItemPropertyArtist:e.title, MPMediaItemPropertyPlaybackDuration:duration, MPNowPlayingInfoPropertyElapsedPlaybackTime:position, MPNowPlayingInfoPropertyPlaybackRate:playing ? player.rate : 0]
        }
    }
    private func finishCurrent() {
        guard !ended, !restoring else { return }
        ended = true; player.pause(); position = 0; save()
        if mediaURL?.isFileURL == false && (UserDefaults.standard.object(forKey:"autoNext") as? Bool ?? true) { changeEpisode?(1) }
    }
    func save() {
        guard !restoring, let f = film, let e = episode else { return }
        UserDefaults.standard.set(ended ? 0 : position, forKey: "progress:" + key(f,e))
        history.removeAll { $0.id == e.url }
        history.insert(WatchRecord(film:f,episode:e,position:ended ? 0 : position,date:Date(),duration:duration,completed:ended),at:0)
        history = Array(history.prefix(300))
        if let data = try? JSONEncoder().encode(history) { UserDefaults.standard.set(data,forKey:"history") }
    }
    func leave() { loadGeneration += 1; save(); player.pause(); playing = false; MPNowPlayingInfoCenter.default().nowPlayingInfo = nil }
    func stop() { leave(); player.replaceCurrentItem(with: nil); mediaURL = nil; episode = nil }
    func openLocal(_ video: SavedVideo, url: URL) {
        stop()
        failure = ""; duration = 0; position = 0; ended = false; restoring = false
        film = Film(["url":video.id,"title":video.title,"cover":""]); episode = Episode(["url":url.absoluteString,"title":"本地文件","group":"本地"]); episodes = []
        mediaURL = url; player.replaceCurrentItem(with: AVPlayerItem(url: url)); start()
    }
    func seek(_ seconds: Double) { ended = false; position = max(0,duration>0 ? min(seconds,duration):seconds); player.seek(to:CMTime(seconds:position,preferredTimescale:600)); save() }
    func jump(_ seconds: Double) { seek(position+seconds) }
    func start() { if ended { headPending = true; seek(0) }; player.play(); player.rate = preferredRate }
    func setRate(_ rate: Float) { UserDefaults.standard.set(Double(rate),forKey:"speed"); preferredRate = rate; if player.timeControlStatus == .playing { player.rate = rate } }
    func toggle() { if player.timeControlStatus == .playing { player.pause(); save() } else { start() } }
}
