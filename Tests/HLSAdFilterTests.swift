import Foundation
let marked = "#EXTM3U\n#EXTINF:100,\na.ts\n#EXT-X-CUE-OUT:10\n#EXTINF:10,\nad.ts\n#EXT-X-CUE-IN\n#EXT-X-DISCONTINUITY\n#EXTINF:100,\nb.ts\n#EXT-X-ENDLIST\n"
let clean = HLSAdFilter.filter(marked)
precondition(!clean.contains("ad.ts") && clean.contains("b.ts") && clean.contains("#EXT-X-DISCONTINUITY"))
for sample in [marked.replacingOccurrences(of:"#EXT-X-ENDLIST",with:""), marked.replacingOccurrences(of:"#EXT-X-CUE-IN",with:""), marked.replacingOccurrences(of:"#EXTM3U",with:"#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key\"")] { precondition(HLSAdFilter.filter(sample) == sample) }
print("PASS: Swift cue filtering and safe pass-through")
