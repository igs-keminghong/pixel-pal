"""檢查 pets/ 裡的每個夥伴是否齊全。用法：python tools/check_pets.py"""
import json, os, re, struct, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pets")
POSES = ["idle", "happy", "sleep", "alert", "blink"]
LINES = ["tap", "noCalendar", "todayFree", "todayNext", "todayLast", "tonightThenTomorrow",
         "tonightThenFree", "tomorrow", "tomorrowFree"]
PUSH = ["hello", "remind", "free"]
TAPS = ["jump", "wiggle", "purr", "rub", "huff", "hop2", "dance"]

def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", head[16:24])

errors, warns = [], []
idx = json.load(open(os.path.join(ROOT, "index.json"), encoding="utf-8"))
keys = idx.get("pets", [])
if not keys:
    errors.append("index.json 的 pets 是空的")
for k in keys:
    d = os.path.join(ROOT, k)
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,23}", k):
        errors.append(f"{k}: 代號只能用小寫英文、數字、底線，而且英文字母開頭")
    if not os.path.isdir(d):
        errors.append(f"{k}: 找不到資料夾 pets/{k}")
        continue
    sizes = {}
    for a in POSES:
        p = os.path.join(d, a + ".png")
        if not os.path.exists(p):
            errors.append(f"{k}: 缺少 {a}.png")
            continue
        sizes[a] = png_size(p)
        if not sizes[a]:
            errors.append(f"{k}: {a}.png 不是 PNG")
    if sizes.get("idle") and sizes.get("blink") and sizes["idle"] != sizes["blink"]:
        errors.append(f"{k}: blink.png {sizes['blink']} 要和 idle.png {sizes['idle']} 同尺寸")
    for a, s in sizes.items():
        if s and max(s) > 400:
            warns.append(f"{k}: {a}.png 是 {s[0]}x{s[1]}，建議縮到 300 以下（其他夥伴約 200~280）")
    try:
        pj = json.load(open(os.path.join(d, "pet.json"), encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"{k}: 缺少 pet.json"); continue
    except json.JSONDecodeError as e:
        errors.append(f"{k}: pet.json 格式錯誤：{e}"); continue
    for f in ["label", "name"]:
        if not pj.get(f):
            errors.append(f"{k}: pet.json 缺少 {f}")
    if pj.get("tap", "jump") not in TAPS:
        errors.append(f"{k}: tap 只能是 {', '.join(TAPS)}")
    lines = pj.get("lines", {})
    for f in LINES:
        if f not in lines:
            warns.append(f"{k}: lines.{f} 沒填，會用通用台詞")
    if "tap" in lines and not (isinstance(lines["tap"], list) and lines["tap"]):
        errors.append(f"{k}: lines.tap 要是一個陣列，例如 [\"嘿嘿\", \"摸摸頭\"]")
    for f in PUSH:
        if f not in pj.get("push", {}):
            warns.append(f"{k}: push.{f} 沒填，推播會用通用台詞")
for d in sorted(os.listdir(ROOT)):
    if os.path.isdir(os.path.join(ROOT, d)) and not d.startswith("_") and d not in keys:
        warns.append(f"{d}: 有資料夾但沒列在 index.json，App 不會顯示")

for w in warns: print("提醒：" + w)
for e in errors: print("錯誤：" + e)
print(f"\n檢查了 {len(keys)} 個夥伴：{len(errors)} 個錯誤、{len(warns)} 個提醒")
sys.exit(1 if errors else 0)
