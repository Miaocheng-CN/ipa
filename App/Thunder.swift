import SwiftUI

struct QueueEpisode: Codable, Identifiable {
    var film: Film
    var episode: Episode
    var id: String { film.url + "\n" + episode.url }
}

@MainActor final class ThunderList: ObservableObject {
    @Published var rows: [QueueEpisode] = (UserDefaults.standard.data(forKey: "thunderRows").flatMap { try? JSONDecoder().decode([QueueEpisode].self, from: $0) } ?? []) {
        didSet { if let data = try? JSONEncoder().encode(rows) { UserDefaults.standard.set(data, forKey: "thunderRows") } }
    }
    func add(_ film: Film, route: [Episode]) {
        var seen = Set(rows.map(\.id))
        let items = route.map { QueueEpisode(film: film, episode: $0) }
        rows += items.filter { !$0.episode.url.isEmpty && seen.insert($0.id).inserted }
    }
    func insertNext(_ item: QueueEpisode, after current: String?) {
        guard let current, current != item.id, rows.contains(where: { $0.id == current }) else { return }
        var list = rows.filter { $0.id != item.id }
        if let idx = list.firstIndex(where: { $0.id == current }) { list.insert(item, at: idx + 1); rows = list }
    }
}
struct ThunderSheet: View {
    @ObservedObject var queue: ThunderList
    let current: String?
    let play: (QueueEpisode) -> Void
    @AppStorage("autoNext") var autoNext = true
    @AppStorage("thunderLoop") var loop = false
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Toggle("自动下一集", isOn: $autoNext)
                Toggle("播完列表后循环", isOn: $loop)
                if queue.rows.isEmpty { Text("在影片详情选好线路，点「整季加入雷霆大列表」。") }
                ForEach(queue.rows) { row in
                    HStack {
                        Button { dismiss(); play(row) } label: {
                            VStack(alignment: .leading) {
                                Text(row.film.title)
                                Text((row.id == current ? "▶ 当前 · " : "") + row.episode.title).font(.caption)
                            }
                        }.buttonStyle(.borderless)
                        Spacer()
                        Menu { Button("下一集播放") { queue.insertNext(row, after: current) }.disabled(current == nil || current == row.id || !queue.rows.contains(where:{$0.id == current})); Button("移除", role: .destructive) { queue.rows.removeAll { $0.id == row.id } } } label:{Image(systemName:"ellipsis.circle")}
                    }
                }.onMove { queue.rows.move(fromOffsets:$0,toOffset:$1) }.onDelete { queue.rows.remove(atOffsets:$0) }
            }.navigationTitle("雷霆大列表").toolbar { ToolbarItem(placement:.topBarLeading){Button("完成"){dismiss()}};ToolbarItem(placement:.topBarTrailing){EditButton()} }
        }
    }
}
