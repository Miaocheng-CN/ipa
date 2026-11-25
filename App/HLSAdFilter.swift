import Foundation

enum HLSAdFilter {
    // Only complete, explicitly marked VOD cue ranges. Ordinary discontinuities stay.
    static func filter(_ text: String) -> String {
        func matches(_ value: String, _ pattern: String) -> Bool { value.range(of: pattern, options: .regularExpression) != nil }
        guard text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("#EXTM3U"), text.contains("#EXT-X-ENDLIST"), !matches(text,"#EXT-X-(BYTERANGE|MAP|PART|SKIP|STREAM-INF):"), !matches(text,"#EXT-X-KEY:(?![^\\n]*METHOD=NONE)") else { return text }
        let lines = text.replacingOccurrences(of:"\r\n",with:"\n").components(separatedBy:"\n")
        var cue = false, prefix: Int?, inf: Int?, duration = 0.0, total = 0.0, removed = 0.0, count = 0
        var ranges: [ClosedRange<Int>] = []
        for (i,line) in lines.enumerated() {
            let s = line.trimmingCharacters(in: .whitespaces)
            if matches(s,"^#EXT-X-CUE-OUT(?::|$)") { if cue { return text }; cue = true }
            if matches(s,"^#EXT-X-CUE-IN(?::|$)") { if !cue { return text }; cue = false }
            if matches(s,"^#EXT-X-(DISCONTINUITY$|PROGRAM-DATE-TIME:|CUE-)") && prefix == nil { prefix = i }
            if s.hasPrefix("#EXTINF:") {
                guard inf == nil, let value = Double(String(s.dropFirst(8)).components(separatedBy:",")[0]), value.isFinite, value > 0 else { return text }
                inf = i; duration = value
            }
            if !s.isEmpty && !s.hasPrefix("#") {
                guard let start = inf else { return text }; count += 1; total += duration
                if cue { ranges.append((prefix ?? start)...i); removed += duration }
                prefix = nil; inf = nil
            }
        }
        guard !cue, inf == nil, !ranges.isEmpty, ranges.count < count, removed <= 180, removed <= total * 0.25 else { return text }
        let drop = Set(ranges.flatMap { Array($0) })
        return lines.enumerated().filter { !drop.contains($0.offset) && !matches($0.element.trimmingCharacters(in:.whitespaces),"^#EXT-X-CUE-(OUT|OUT-CONT|IN)(?::|$)") }.map(\.element).joined(separator:"\n")
    }
}
