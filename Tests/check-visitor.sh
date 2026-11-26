#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
python3 - "$scratch/main.swift" <<'PY'
from pathlib import Path
import sys
source=Path("App/ComicHost.swift").read_text()
a=source.index("enum YunmanVisitor {")
b=source.index("@MainActor final class ComicBridge",a)
prelude='import Foundation\nimport CryptoKit\nenum ReaderError: Error { case message(String) }\n'
# Real newline characters in the generated Swift file.
prelude=prelude.replace('\\n','\n')
Path(sys.argv[1]).write_text(prelude+source[a:b]+Path("Tests/check_visitor.swift").read_text())
PY
xcrun swiftc "$scratch/main.swift" -o "$scratch/check"
"$scratch/check" Tests/visitor-vectors.json
