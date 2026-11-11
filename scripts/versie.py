#!/usr/bin/env python3
"""Hoogt het versienummer op in index.html en sw.js, zodat iPhone en browser
de nieuwe bestanden ophalen in plaats van de bewaarde.

Gebruik:  python3 scripts/versie.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sw = ROOT / "sw.js"
html = ROOT / "index.html"

old = int(re.search(r"const V = (\d+);", sw.read_text()).group(1))
new = old + 1
sw.write_text(re.sub(r"const V = \d+;", f"const V = {new};", sw.read_text(), count=1))
text, n = re.subn(r"(styles\.css|app\.js)\?v=\d+", rf"\1?v={new}", html.read_text())
assert n == 2, "verwacht styles.css?v= en app.js?v= in index.html"
html.write_text(text)
print(f"Versie {old} → {new}")
