#!/usr/bin/env python3
"""Bouwt data/species.json uit data/soorten.txt.

Haalt per soort op:
- iNaturalist: taxon-id, verwantschap (voor lastige afleiders), foto's met open licentie
- iNaturalist: aantal waarnemingen in Nederland en binnen 15 km rond Best
- Nederlandse Wikipedia: korte introductietekst
En apart in data/info.json (wordt pas in de app geladen als het nodig is):
- Wikipedia-secties zoals kenmerken, leefgebied, leefwijze en voortplanting
- iNaturalist: waarnemingen per maand in Nederland (wanneer te zien)
- iNaturalist: soorten waarmee hij het vaakst verward wordt

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
INFO = ROOT / "data" / "info.json"
CACHE = ROOT / "scripts" / ".cache.json"
# Per foto-id wat erop staat, met de hand nagekeken voor alle categorieën:
#   "a"       = gewone, goed herkenbare foto (volwassen dier, bloeiende plant, tak met blad, hele paddenstoel)
#   rups/pop/ei/larve/nimf/jong, boom (hele boom), bloei, vrucht
#             = herkenbaar maar lastiger; de app toont die pas als je de soort kent, met een label
#   "detail"  = ongeschikt (los zaadje, los blad, schors, knop, schedel, spoor, nest, witte of afwijkende
#               exemplaren, silhouet in de verte …); komt niet in de app
STADIA = json.loads((ROOT / "scripts" / "stadia.json").read_text())
MIN_GOOD = 4    # minder gewone foto's dan dit: aanvullen met de best gewaardeerde waarnemingen
MAX_TOTAL = 8   # gewone foto's (hooguit MAX_PHOTOS) plus lastigere

UA = "NatuurTrainer/1.0 (persoonlijke leer-app)"
NL_PLACE = 7506
BEST = (51.507, 5.390, 15)  # lat, lng, straal km
MAX_PHOTOS = 6

cache = {}
if CACHE.exists() and "--vers" not in sys.argv:
    cache = json.loads(CACHE.read_text())

_last = [0.0]


def get(url, soft=False):
    """soft=True: bij blijvende serverfout None teruggeven in plaats van stoppen."""
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
            if soft and e.code >= 500 and attempt >= 1:
                print(f"  ! {e} — overgeslagen", file=sys.stderr)
                _last[0] = time.time()
                return None
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


# Welke Wikipedia-kopjes we tonen, in deze volgorde. Eerste passende kop wint.
SECTIONS = [
    ("Kenmerken", ("kenmerk", "determinatie", "beschrijving", "uiterlijk", "morfologie", "herkenning", "bouw")),
    ("Verschil met lijkende soorten", ("onderscheid", "gelijkende", "verwarring", "verwisseling")),
    ("Leefgebied", ("verspreiding", "habitat", "leefgebied", "voorkomen", "standplaats", "biotoop")),
    ("Leefwijze", ("leefwijze", "levenswijze", "gedrag", "voedsel", "ecologie", "waardplant")),
    ("Voortplanting", ("voortplanting", "levenscyclus", "ontwikkeling", "bloei", "broed", "nest")),
    ("Goed om te weten", ("toxiciteit", "giftig", "eetba", "bescherming", "bedreiging", "gebruik", "toepassing", "betekenis voor de mens")),
]
SKIP = ("taxonomie", "naamgeving", "etymologie", "externe link", "bron", "referentie", "zie ook", "afbeelding", "galerij", "literatuur", "ondersoort", "synoniem")


def trim(text, limit):
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    out = ""
    for s in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text):
        if len(out) + len(s) > limit and out:
            break
        out += (" " if out else "") + s
    return out


def wiki_sections(title):
    """Opgegeven Wikipedia-artikel opknippen in de kopjes uit SECTIONS."""
    params = {"action": "query", "format": "json", "prop": "extracts", "explaintext": 1,
              "exsectionformat": "wiki", "redirects": 1, "titles": title}
    d = get("https://nl.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
    pages = list(d.get("query", {}).get("pages", {}).values())
    text = (pages[0].get("extract") or "") if pages else ""
    parts = re.split(r"^(=={1,4}) ?(.*?) ?={2,5}\s*$", text, flags=re.M)
    heads = []  # (niveau, kop, tekst)
    for i in range(1, len(parts) - 2, 3):
        heads.append((len(parts[i]), parts[i + 1].strip(), parts[i + 2].strip()))
    out, taken = [], set()
    for label, keys in SECTIONS:
        for k, (lvl, h, body) in enumerate(heads):
            hl = h.lower()
            if k in taken or any(x in hl for x in SKIP) or not any(x in hl for x in keys):
                continue
            # neem ook onderliggende kopjes mee
            chunk = [body]
            for lvl2, h2, b2 in heads[k + 1:]:
                if lvl2 <= lvl:
                    break
                if not any(x in h2.lower() for x in SKIP):
                    chunk.append(b2)
            t = trim(" ".join(c for c in chunk if c), 520)
            if len(t) >= 80:
                out.append({"h": label, "t": t})
                taken.add(k)
                break
    return out


def months(taxon):
    url = ("https://api.inaturalist.org/v1/observations/histogram?interval=month_of_year&verifiable=true"
           f"&place_id={NL_PLACE}&taxon_id={taxon}")
    m = (get(url, soft=True) or {}).get("results", {}).get("month_of_year", {})
    vals = [m.get(str(i), 0) for i in range(1, 13)]
    top = max(vals) or 1
    return [round(100 * v / top) for v in vals] if sum(vals) >= 12 else None


def similar(taxon, by_inat):
    url = f"https://api.inaturalist.org/v1/identifications/similar_species?taxon_id={taxon}&place_id={NL_PLACE}&locale=nl"
    res = [r for r in (get(url, soft=True) or {}).get("results", []) if r["taxon"].get("rank") in ("species", "hybrid") and r["count"] >= 2]
    out = []
    for r in res[:4]:
        t = r["taxon"]
        if t["id"] in by_inat:
            out.append({"id": by_inat[t["id"]]})
        else:
            n = t.get("preferred_common_name") or ""
            n = (n[:1].upper() + n[1:].lower()) if n else t["name"]
            out.append({"n": n, "s": t["name"]})
    return out


def top_photos(taxon):
    """Eerste foto van de best gewaardeerde, goedgekeurde waarnemingen met een open licentie (NL)."""
    lic = "cc0,cc-by,cc-by-nc,cc-by-sa,cc-by-nc-sa,cc-by-nd,cc-by-nc-nd"
    d = get(f"https://api.inaturalist.org/v1/observations?taxon_id={taxon}&place_id={NL_PLACE}&quality_grade=research"
            f"&photo_license={lic}&order_by=votes&order=desc&per_page=20", soft=True) or {}
    out = []
    for o in d.get("results", []):
        for ph in (o.get("photos") or [])[:1]:
            if ph.get("license_code"):
                out.append(ph)
    return out


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

    out, used, unknown = [], set(), []
    for sp in rows:
        t = taxa.get(sp["inat"], {})
        cands = [(tp.get("photo", {}), False) for tp in t.get("taxon_photos", [])]
        good = sum(1 for ph, _ in cands if ph.get("license_code") and STADIA.get(str(ph.get("id")), "a") == "a")
        if good < MIN_GOOD and sp["inat"]:
            cands += [(ph, True) for ph in top_photos(sp["inat"])]
        regular, harder, seen = [], [], set()
        for ph, extra in cands:
            pid = str(ph.get("id"))
            if not ph.get("license_code") or "/square." not in (ph.get("url") or "") or pid in seen:
                continue
            seen.add(pid)
            stage = STADIA.get(pid)
            if stage is None:
                unknown.append(f"{sp['cat']} | {sp['nl']} | {pid} | {ph['url'].replace('/square.', '/small.')}")
                if extra:
                    continue  # aanvulfoto's alleen na controle
            if stage == "detail":
                continue
            item = {
                "u": ph["url"].replace("/square.", "/{s}."),
                "a": maker(ph.get("attribution") or ""),
                "l": ph["license_code"].upper(),
            }
            dim = ph.get("original_dimensions") or {}
            if dim.get("width") and dim.get("height"):
                item["r"] = round(dim["width"] / dim["height"], 2)  # verhouding breedte/hoogte
            if stage and stage != "a":
                item["st"] = stage
                harder.append(item)
            else:
                regular.append(item)
        photos = regular[:MAX_PHOTOS]
        photos += harder[:MAX_TOTAL - len(photos)]  # gewone foto's eerst, lastigere erachter
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

    print("5/5 extra info: Wikipedia-kopjes, seizoen en lijkende soorten…")
    by_inat = {sp["inat"]: sp["id"] for sp in out}
    info = {}
    for n, sp in enumerate(out, 1):
        wk = w.get(sp["sci"]) or w.get(sp["nl"])
        info[sp["id"]] = {
            "m": months(sp["inat"]),
            "sim": [x for x in similar(sp["inat"], by_inat) if x.get("id") != sp["id"]],
            "sec": wiki_sections(wk["title"]) if wk else [],
        }
        if n % 20 == 0:
            save_cache()
            print(f"  {n}/{len(out)}")
    save_cache()
    INFO.write_text(json.dumps(info, ensure_ascii=False, separators=(",", ":")))
    nosec = sum(1 for v in info.values() if not v["sec"])
    print(f"Info: {INFO.relative_to(ROOT)} ({INFO.stat().st_size // 1024} kB); {nosec} soorten zonder Wikipedia-kopjes")

    OUT.write_text(json.dumps({"generated": time.strftime("%Y-%m-%d"), "species": out}, ensure_ascii=False, separators=(",", ":")))
    near = sum(1 for s in out if s["bestObs"] > 0)
    print(f"Klaar: {len(out)} soorten → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} kB); {near} gezien rond Best")
    nak = ROOT / "scripts" / ".nakijken.txt"
    if unknown:
        nak.write_text("\n".join(unknown) + "\n")
        print(f"{len(unknown)} foto's nog niet nagekeken → {nak.relative_to(ROOT)} (cat | soort | foto-id | url).")
        print("  Taxonfoto's tellen voorlopig als gewone foto; aanvulfoto's worden pas gebruikt als ze in stadia.json staan.")
    elif nak.exists():
        nak.unlink()
    few = [f"{s['nl']} ({sum(1 for p in s['photos'] if 'st' not in p)})" for s in out if sum(1 for p in s["photos"] if "st" not in p) < 3]
    if few:
        print("Weinig gewone foto's:", ", ".join(few))
    nowiki = [s["nl"] for s in out if not s["wiki"]]
    if nowiki:
        print("Zonder Wikipedia-tekst:", ", ".join(nowiki))


if __name__ == "__main__":
    main()
