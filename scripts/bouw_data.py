#!/usr/bin/env python3
"""Bouwt data/species.json uit data/soorten.txt.

Haalt per soort op:
- iNaturalist: taxon-id, verwantschap (voor lastige afleiders), foto's met open licentie
- iNaturalist: aantal waarnemingen in Nederland en binnen 15 km rond Best
- Nederlandse Wikipedia: korte introductietekst

Gebruik:  python3 scripts/bouw_data.py          (gebruikt cache waar mogelijk)
          python3 scripts/bouw_data.py --vers   (alles opnieuw ophalen)
Alleen standaardbibliotheek, geen installatie nodig.
"""
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "soorten.txt"
OUT = ROOT / "data" / "species.json"
CACHE = ROOT / "scripts" / ".cache.json"

UA = "NatuurTrainer/1.0 (persoonlijke leer-app)"
NL_PLACE = 7506
BEST = (51.507, 5.390, 15)  # lat, lng, straal km
MAX_PHOTOS = 6

cache = {}
if CACHE.exists() and "--vers" not in sys.argv:
    cache = json.loads(CACHE.read_text())

_last = [0.0]


def get(url):
    if url in cache:
        return cache[url]
    wait = (2.0 if "wikipedia" in url else 1.05) - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", "Api-User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode())
            break
        except urllib.error.HTTPError as e:
            retry = int(e.headers.get("Retry-After") or 0)
            pause = max(retry, 10 * (attempt + 1))
            print(f"  ! {e} — over {pause}s opnieuw ({attempt + 1})", file=sys.stderr)
            time.sleep(pause)
        except Exception as e:  # noqa: BLE001
            print(f"  ! {e} — opnieuw ({attempt + 1})", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    else:
        raise SystemExit(f"Mislukt: {url}")
    _last[0] = time.time()
    cache[url] = data
    return data


def save_cache():
    CACHE.write_text(json.dumps(cache))


def norm(s):
    s = s.replace("×", "x").replace(" x ", " ").lower()
    return re.sub(r"\s+", " ", s).strip()


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def parse():
    rows = []
    for line in SRC.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        cat, nl, sci, tip = [p.strip() for p in line.split("|", 3)]
        rows.append({"cat": cat, "nl": nl, "sci": sci, "tip": tip})
    return rows


# Soorten die de zoekfunctie van iNaturalist niet goed vindt
OVERRIDE = {"Dama dama": 42161}


def resolve(sp):
    if sp["sci"] in OVERRIDE:
        return OVERRIDE[sp["sci"]]
    q = urllib.parse.quote(sp["sci"].replace("×", "").replace("  ", " "))
    d = get(f"https://api.inaturalist.org/v1/taxa?q={q}&is_active=true&rank=species,subspecies,hybrid&per_page=10")
    res = d.get("results", [])
    want = norm(sp["sci"])
    for r in res:
        if norm(r["name"]) == want:
            return r["id"]
    for r in res:  # synoniem (bijv. Anemone nemorosa → Anemonoides nemorosa)
        if norm(r.get("matched_term") or "") == want:
            print(f"  = {sp['sci']} → {r['name']} (synoniem)")
            return r["id"]
    for r in res:
        if r.get("rank") in ("species", "hybrid") and norm(r["name"]).split()[0] == want.split()[0]:
            print(f"  ~ {sp['sci']} → {r['name']} (benadering)")
            return r["id"]
    print(f"  ✗ niet gevonden: {sp['sci']}")
    return None


def maker(attr):
    """'(c) Naam, some rights reserved (CC BY-NC), uploaded by X' → '© Naam'."""
    up = re.search(r"uploaded by (.+)$", attr)
    if attr.lower().startswith("no rights reserved"):
        return up.group(1).strip() if up else "Publiek domein"
    name = re.sub(r"^\(c\)\s*", "", attr)
    name = re.split(r",?\s*(?:some|all|no) rights reserved|\s*\(CC", name)[0].split(",")[0].strip(" ,;")
    return ("© " + name) if name else "iNaturalist"


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def counts(ids, extra):
    """Waarnemingen per soort (inclusief ondersoorten), via species_counts."""
    out = {i: 0 for i in ids}
    for part in chunks(ids, 60):
        url = (
            "https://api.inaturalist.org/v1/observations/species_counts?verifiable=true&per_page=500"
            f"&taxon_id={','.join(map(str, part))}&{extra}"
        )
        for r in get(url).get("results", []):
            t = r["taxon"]
            lineage = set(t.get("ancestor_ids") or []) | {t["id"]}
            for i in part:
                if i in lineage:
                    out[i] += r["count"]
                    break
    return out


def wiki(titles):
    """Introtekst van nl.wikipedia, per opgegeven titel."""
    result = {}
    for part in chunks(titles, 10):
        params = {
            "action": "query", "format": "json", "redirects": 1, "prop": "extracts|pageprops|info",
            "inprop": "url", "exintro": 1, "explaintext": 1, "exlimit": "max", "ppprop": "disambiguation",
            "titles": "|".join(part),
        }
        d = get("https://nl.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
        q = d.get("query", {})
        mapping = {t: t for t in part}
        for n in q.get("normalized", []):
            for k, v in list(mapping.items()):
                if v == n["from"]:
                    mapping[k] = n["to"]
        for n in q.get("redirects", []):
            for k, v in list(mapping.items()):
                if v == n["from"]:
                    mapping[k] = n["to"]
        pages = {p.get("title"): p for p in q.get("pages", {}).values()}
        for orig, final in mapping.items():
            p = pages.get(final)
            if not p or "missing" in p or "disambiguation" in p.get("pageprops", {}):
                continue
            text = (p.get("extract") or "").strip()
            if len(text) < 60:
                continue
            # houd het kort: max ~3 zinnen / 480 tekens
            sentences = re.split(r"(?<=[.!?])\s+", text.replace("\n", " "))
            short = ""
            for s in sentences:
                if len(short) + len(s) > 480 and short:
                    break
                short += (" " if short else "") + s
            result[orig] = {"text": short, "url": p.get("fullurl"), "title": p.get("title")}
    return result


def main():
    rows = parse()
    print(f"{len(rows)} soorten in bronlijst")

    print("1/4 soorten opzoeken op iNaturalist…")
    for sp in rows:
        sp["inat"] = resolve(sp)
    save_cache()
    ids = [sp["inat"] for sp in rows if sp["inat"]]

    print("2/4 foto's en verwantschap ophalen…")
    taxa = {}
    for part in chunks(ids, 30):
        d = get(f"https://api.inaturalist.org/v1/taxa/{','.join(map(str, part))}?locale=nl")
        for t in d.get("results", []):
            taxa[t["id"]] = t
    save_cache()

    print("3/4 waarnemingen tellen (NL en rond Best)…")
    nl_counts = counts(ids, f"place_id={NL_PLACE}")
    local_counts = counts(ids, f"lat={BEST[0]}&lng={BEST[1]}&radius={BEST[2]}")
    save_cache()

    print("4/4 Wikipedia-teksten ophalen…")
    w = wiki([sp["sci"] for sp in rows])
    missing = [sp["nl"] for sp in rows if sp["sci"] not in w]
    w.update(wiki(missing))
    save_cache()

    out, used = [], set()
    for sp in rows:
        t = taxa.get(sp["inat"], {})
        photos = []
        for tp in t.get("taxon_photos", []):
            ph = tp.get("photo", {})
            if not ph.get("license_code") or not ph.get("url"):
                continue
            url = ph["url"]
            if "/square." not in url:
                continue
            photos.append({
                "u": url.replace("/square.", "/{s}."),
                "a": maker(ph.get("attribution") or ""),
                "l": ph["license_code"].upper(),
            })
            if len(photos) >= MAX_PHOTOS:
                break
        if not photos:
            print(f"  ! geen open foto's voor {sp['nl']} — overgeslagen")
            continue
        sid = slug(sp["nl"])
        while sid in used:
            sid += "-2"
        used.add(sid)
        wk = w.get(sp["sci"]) or w.get(sp["nl"])
        out.append({
            "id": sid,
            "cat": sp["cat"],
            "nl": sp["nl"],
            "sci": sp["sci"],
            "tip": sp["tip"],
            "inat": sp["inat"],
            "anc": (t.get("ancestor_ids") or [])[-8:],
            "nlObs": nl_counts.get(sp["inat"], 0),
            "bestObs": local_counts.get(sp["inat"], 0),
            "photos": photos,
            "wiki": {"t": wk["text"], "u": wk["url"]} if wk else None,
        })

    OUT.write_text(json.dumps({"generated": time.strftime("%Y-%m-%d"), "species": out}, ensure_ascii=False, separators=(",", ":")))
    near = sum(1 for s in out if s["bestObs"] > 0)
    print(f"Klaar: {len(out)} soorten → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} kB); {near} gezien rond Best")
    nowiki = [s["nl"] for s in out if not s["wiki"]]
    if nowiki:
        print("Zonder Wikipedia-tekst:", ", ".join(nowiki))


if __name__ == "__main__":
    main()
