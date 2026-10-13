"""Accident-photo verification.

Three layers, strongest evidence first. Each produces 'signals' with a level: info / warn / fail.
  1. Local forensics (always on, no token): reused/duplicate photo detection, AI-generator
     metadata, EXIF timestamp + GPS vs. the pinned location, flat-graphic / screenshot / blank checks.
  2. Optional Claude vision (ANTHROPIC_API_KEY): does it plausibly show a REAL emergency scene?
  3. Optional Hugging Face models (HF_TOKEN): AI-image detector + CLIP scene relevance.

Verdict:  rejected  -> any 'fail' signal (report is removed, nothing is dispatched)
          review    -> warning weight >= 2 (goes to a human; never silently dispatched)
          verified  -> everything else (resources may be allocated)
This is a risk estimate, not proof of authenticity. Thresholds should be tuned on real images.
"""
from __future__ import annotations
import io, os, json, math, base64, hashlib, time, re
import urllib.request, urllib.error
from datetime import datetime

HF_ENDPOINT = "https://router.huggingface.co/hf-inference/models/"
MAX_BYTES = 5 * 1000 * 1000
SCENE_LABELS = [
    "a road traffic accident with damaged vehicles", "an injured person on the ground after an accident",
    "a fire or burn emergency", "a normal street or building with no emergency",
    "a selfie or portrait photo", "a screenshot, meme, cartoon or document",
]
EMERGENCY = set(SCENE_LABELS[:3])
AI_SIZES = {(512, 512), (768, 768), (1024, 1024), (1536, 1536), (2048, 2048), (1792, 1024), (1024, 1792),
            (1344, 768), (768, 1344), (1216, 832), (832, 1216), (1536, 1024), (1024, 1536)}
SCREEN_SIZES = {(1080, 1920), (1080, 2400), (1170, 2532), (1284, 2778), (1080, 2340), (1440, 3200), (1920, 1080),
                (1366, 768), (2560, 1440), (1440, 2560), (750, 1334), (828, 1792), (1242, 2688)}
AI_MARKERS = [b"trainedalgorithmicmedia", b"stable diffusion", b"midjourney", b"dall-e", b"dall\xc2\xb7e",
              b"adobe firefly", b"made with google ai", b"sdxl", b"comfyui"]
PNG_AI_KEYS = {"parameters", "prompt", "workflow", "sd-metadata", "invokeai_metadata"}


def sniff(data: bytes):
    if data[:3] == b"\xff\xd8\xff": return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n": return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP": return "image/webp"
    return None


def haversine(lat1, lon1, lat2, lon2):
    r = math.pi / 180
    a = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lon2 - lon1) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def dhash(img, size=8) -> int:
    g = img.convert("L").resize((size + 1, size))
    px, bits = g.tobytes(), 0
    for r in range(size):
        for c in range(size):
            bits = (bits << 1) | (px[r * (size + 1) + c] > px[r * (size + 1) + c + 1])
    return bits


def _deg(vals, ref):
    d, m, s = (float(x) for x in vals)
    v = d + m / 60 + s / 3600
    return -v if ref in ("S", "W") else v


class Sig(list):
    def add(self, code, label, level="info", weight=0):
        self.append({"code": code, "label": label, "level": level, "weight": weight})


def local_forensics(data: bytes, mime: str, lat, lon, sigs: Sig):
    from PIL import Image, ImageFilter, ImageStat
    Image.MAX_IMAGE_PIXELS = 60_000_000
    info = {"width": None, "height": None, "camera": None, "taken_at": None, "gps": None}
    try:
        img = Image.open(io.BytesIO(data)); img.load()
    except Image.DecompressionBombError:
        sigs.add("unreadable", "Image is unreasonably large", "fail"); return info, None
    except Exception:
        sigs.add("unreadable", "Image could not be decoded", "fail"); return info, None
    w, h = img.size
    info["width"], info["height"] = w, h

    # -- generator fingerprints in the raw bytes / PNG text chunks
    low = data.lower()
    for m in AI_MARKERS:
        if m in low:
            sigs.add("ai_metadata", "File metadata says it was made with an AI image tool", "fail"); break
    if mime == "image/png" and PNG_AI_KEYS & {str(k).lower() for k in img.info}:
        sigs.add("ai_metadata", "PNG contains AI-generator prompt data", "fail")

    # -- EXIF
    exif = img.getexif() if hasattr(img, "getexif") else {}
    make, model, soft = exif.get(271), exif.get(272), str(exif.get(305) or "")
    if make or model: info["camera"] = f"{make or ''} {model or ''}".strip()
    if soft and re.search(r"photoshop|gimp|canva|snapseed|picsart|lightroom|firefly", soft, re.I):
        sigs.add("edited", f"Edited with {soft[:40]}", "warn", 1)
    taken = None
    try:
        raw = (exif.get_ifd(0x8769).get(36867) if hasattr(exif, "get_ifd") else None) or exif.get(306)
        if raw: taken = datetime.strptime(str(raw)[:19], "%Y:%m:%d %H:%M:%S")
    except Exception:
        taken = None
    if taken:
        info["taken_at"] = taken.isoformat()
        age_h = (datetime.now() - taken).total_seconds() / 3600
        if age_h > 24 * 3: sigs.add("old_photo", f"Photo was taken {int(age_h // 24)} days ago", "fail")
        elif age_h > 24: sigs.add("old_photo", "Photo was taken more than a day ago", "warn", 2)
        elif age_h < -24: sigs.add("future_photo", "Photo timestamp is in the future", "warn", 1)
        else: sigs.add("fresh", "Camera timestamp is recent", "info")
    try:
        g = exif.get_ifd(0x8825) if hasattr(exif, "get_ifd") else {}
        if g and 2 in g and 4 in g:
            plat, plon = _deg(g[2], g.get(1, "N")), _deg(g[4], g.get(3, "E"))
            info["gps"] = [round(plat, 5), round(plon, 5)]
            if lat is not None and lon is not None:
                km = haversine(plat, plon, lat, lon)
                if km > 25: sigs.add("gps_far", f"Photo GPS is {km:.0f} km from the pinned location", "fail")
                elif km > 3: sigs.add("gps_off", f"Photo GPS is {km:.1f} km from the pinned location", "warn", 2)
                else: sigs.add("gps_ok", "Photo GPS matches the pinned location", "info")
    except Exception:
        pass
    if info["camera"]: sigs.add("camera", f"Camera data present ({info['camera']})", "info")
    else: sigs.add("no_camera", "No camera data (stripped by chat apps or a generator)", "warn", 1)

    # -- dimensions
    if min(w, h) < 320: sigs.add("low_res", "Very low resolution", "warn", 1)
    if (w, h) in AI_SIZES and not info["camera"]: sigs.add("ai_size", "Size typical of AI image generators", "warn", 1)
    if mime == "image/png" and (w, h) in SCREEN_SIZES and not exif:
        sigs.add("screenshot", "Looks like a phone or PC screenshot", "warn", 2)

    # -- content statistics on a small copy
    small = img.convert("RGB").resize((128, 128))
    cols = small.getcolors(maxcolors=16384)
    if cols is not None:
        n = len(cols)
        if n < 300: sigs.add("flat_graphic", "Flat graphic or cartoon (very few colours)", "fail")
        elif n < 1500: sigs.add("few_colours", "Unusually few colours for a photograph", "warn", 1)
    gray = small.convert("L")
    if gray.entropy() < 3.5: sigs.add("blank", "Almost no detail (blank or nearly one colour)", "fail")
    edges = ImageStat.Stat(gray.filter(ImageFilter.FIND_EDGES)).var[0]
    if edges < 4: sigs.add("blurry", "Extremely blurry or featureless", "warn", 1)
    return info, (hashlib.sha256(data).hexdigest(), f"{dhash(img):016x}")


def duplicate_check(c, hashes, email, report_id, sigs: Sig):
    if not hashes: return
    sha, dh = hashes
    allow = os.getenv("RESCUENET_ALLOW_DUPLICATE_IMAGES") == "1"
    lvl = ("warn", 2) if allow else ("fail", 0)
    rows = c.execute("SELECT sha256,dhash,email,report_id FROM image_hashes").fetchall()
    for r in rows:
        if report_id and r["report_id"] == report_id: continue
        same = r["sha256"] == sha
        near = bin(int(r["dhash"], 16) ^ int(dh, 16)).count("1") <= 5
        if same or near:
            who = "you" if r["email"] == email else "another user"
            sigs.add("duplicate", ("This exact photo" if same else "A near-identical photo")
                     + f" was already used in an earlier report by {who}", *lvl)
            break
    c.execute("INSERT INTO image_hashes VALUES (?,?,?,?,?)", (sha, dh, email, report_id, int(time.time())))


# ----------------------------------------------------------------------------- remote models
def _post(url, headers, body: bytes, timeout=25):
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def hf_ai_probability(preds):
    if not isinstance(preds, list): return None
    ai_w, hu_w = ("artificial", "fake", "generated", "synthetic", "ai", "deepfake"), ("human", "real", "authentic", "natural", "photo")
    best = None
    for p in preds:
        label, score = str(p.get("label", "")).lower(), float(p.get("score", 0))
        if any(w in label for w in ai_w) and not any(w in label for w in hu_w): best = max(best or 0, score)
        elif any(w in label for w in hu_w) and best is None and len(preds) == 2: best = max(0.0, 1 - score)
    return best


def hf_checks(data, mime, token):
    out, notes = {"ai_prob": None, "relevance": None, "scene": None}, []
    det = os.getenv("RESCUENET_AI_DETECTOR_MODEL", "umm-maybe/AI-image-detector").strip()
    scn = os.getenv("RESCUENET_SCENE_MODEL", "openai/clip-vit-base-patch32").strip()
    try:
        out["ai_prob"] = hf_ai_probability(_post(HF_ENDPOINT + det, {"Authorization": "Bearer " + token, "Content-Type": mime}, data))
    except Exception:
        notes.append("Hugging Face AI-image detector unavailable.")
    try:
        body = json.dumps({"inputs": base64.b64encode(data).decode(), "parameters": {"candidate_labels": SCENE_LABELS}}).encode()
        sc = _post(HF_ENDPOINT + scn, {"Authorization": "Bearer " + token, "Content-Type": "application/json"}, body)
        if isinstance(sc, list) and sc:
            sc = sorted(sc, key=lambda p: -float(p.get("score", 0)))
            out["scene"] = sc[0].get("label")
            out["relevance"] = round(sum(float(p["score"]) for p in sc if p.get("label") in EMERGENCY), 3)
    except Exception:
        notes.append("Hugging Face scene model unavailable.")
    return out, notes


VISION_PROMPT = (
    "You screen photos submitted with emergency reports. Judge ONLY visible evidence. Do not identify anyone.\n"
    "Return JSON only, no prose: {\"scene\": one of [\"accident\",\"injury\",\"fire\",\"medical\",\"none\","
    "\"screenshot_or_graphic\",\"portrait\"], \"emergency_relevance\": 0..1, \"ai_generated_likelihood\": 0..1, "
    "\"signs\": [up to 3 short strings about visible reasons], \"confidence\": 0..1}.\n"
    "ai_generated_likelihood should rise for: garbled text or plates, impossible geometry or physics, waxy or uncanny "
    "textures, inconsistent shadows, watermarks, stock-photo staging, or a photo of a screen.")


def claude_vision(data, mime, key):
    body = json.dumps({
        "model": os.getenv("RESCUENET_CLAUDE_MODEL", "claude-haiku-5-5"), "max_tokens": 300,
        "messages": [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": mime, "data": base64.b64encode(data).decode()}},
            {"type": "text", "text": VISION_PROMPT}]}]}).encode()
    j = _post("https://api.anthropic.com/v1/messages",
              {"x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}, body, timeout=30)
    txt = "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text")
    m = re.search(r"\{.*\}", txt, re.S)
    return json.loads(m.group(0)) if m else None


# ----------------------------------------------------------------------------- main entry
def verify(data: bytes, mime: str, c, email: str, report_id: str | None, lat, lon):
    sigs, engines, notes = Sig(), ["Local forensic checks"], []
    info, hashes = local_forensics(data, mime, lat, lon, sigs)
    duplicate_check(c, hashes, email, report_id, sigs)

    ai_prob = relevance = None
    scene = None
    akey, htok = os.getenv("ANTHROPIC_API_KEY", "").strip(), os.getenv("HF_TOKEN", "").strip()
    if akey and not any(s["level"] == "fail" for s in sigs):
        try:
            v = claude_vision(data, mime, akey)
            if v:
                engines.append("Claude vision")
                ai_prob = float(v.get("ai_generated_likelihood", 0)); relevance = float(v.get("emergency_relevance", 0))
                scene = v.get("scene")
                for s in (v.get("signs") or [])[:3]: sigs.add("vision", str(s)[:100], "info")
        except Exception:
            notes.append("Claude vision check unavailable.")
    if htok and not any(s["level"] == "fail" for s in sigs):
        r, n = hf_checks(data, mime, htok); notes += n
        if r["ai_prob"] is not None or r["relevance"] is not None: engines.append("Hugging Face models")
        if r["ai_prob"] is not None: ai_prob = max(ai_prob or 0, r["ai_prob"])
        if r["relevance"] is not None and relevance is None: relevance, scene = r["relevance"], r["scene"]

    if ai_prob is not None:
        if ai_prob >= 0.85: sigs.add("ai_model", f"AI models rate this {round(ai_prob * 100)}% likely to be AI-generated", "fail")
        elif ai_prob >= 0.6: sigs.add("ai_model", f"AI models rate this {round(ai_prob * 100)}% likely to be AI-generated", "warn", 2)
    if relevance is not None:
        if relevance < 0.15: sigs.add("off_topic", "Does not look like an emergency scene", "fail")
        elif relevance < 0.35: sigs.add("off_topic", "Only weakly looks like an emergency scene", "warn", 2)
        else: sigs.add("scene_ok", "Looks like an emergency scene", "info")
    if len(engines) == 1:
        notes.append("No AI model configured: scene content was not checked. Set ANTHROPIC_API_KEY or HF_TOKEN for deeper checks.")

    fails = sum(s["level"] == "fail" for s in sigs)
    warn_w = sum(s["weight"] for s in sigs if s["level"] == "warn")
    verdict = "rejected" if fails else "review" if warn_w >= 2 else "verified"
    trust = max(0, min(100, 100 - 60 * fails - 20 * warn_w))
    return {"status": "ok", "verdict": verdict, "trust": trust, "signals": list(sigs), "engines": engines,
            "ai_probability": None if ai_prob is None else round(ai_prob, 3),
            "scene_relevance": None if relevance is None else round(relevance, 3), "scene_label": scene,
            "local": info, "notes": notes + ["A risk estimate, not proof of authenticity. A human can always overrule it."]}
