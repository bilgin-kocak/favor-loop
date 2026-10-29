"""Downloads every generation in a saved ElevenLabs flow-run status file, naming each by the first matching
prompt key: python3 fetch_el.py <status.json> <out_dir>. Keys map prompt prefixes to short names."""
import json, os, sys, urllib.request

KEYS = {
    "[intrigued] Three people": "vo01", "Priya reviews code": "vo02", "No two of them can trade": "vo03",
    "[warmly] All three of them": "vo04", "It's the trick kidney": "vo05", "Just tell your agent": "vo06",
    "It shows you exactly": "vo07", "Everyone says yes": "vo08", "Fifteen minutes": "vo09",
    "Swaps. Three-way loops": "vo10", "Kismet finds who": "vo11", "No two of us could trade": "vo12",
    "Magical golden chime": "sfx_ring", "Single soft glassy UI ping": "sfx_ping", "Short soft digital error buzz": "sfx_denied",
    "Soft bubbly positive UI pop": "sfx_pop", "Smooth airy cinematic whoosh": "sfx_whoosh", "Smartphone vibrating": "sfx_buzz",
    "Light quick laptop keyboard": "sfx_typing", "Warm deep bell hit": "sfx_sting", "Cinematic tension riser": "sfx_riser",
    "Pleasant three-note ascending": "sfx_success",
}
status, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
d = json.load(open(status))
for g in d["generations"]:
    if g.get("status") != "completed":
        print("not completed:", g.get("prompt", "")[:40]); continue
    name = next((v for k, v in KEYS.items() if g["prompt"].startswith(k)), None)
    if not name:
        print("unknown prompt:", g["prompt"][:50]); continue
    path = os.path.join(out, f"{name}_{g['id'][:6]}.mp3")
    if os.path.exists(path):
        continue
    urllib.request.urlretrieve(g["content_url"], path)
    print(f"{path} {g['duration_secs']}s")
