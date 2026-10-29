"""Evens out the voiceover: every spoken phrase is brought towards the same loudness (within limits), the gain changing only
in the pauses between phrases. Reads public/audio/use/voNN.mp3, writes public/audio/voice/voNN.mp3."""
import json, os, subprocess
import numpy as np

SR = 44100
TARGET, LOWEST, HIGHEST = -21.5, -4.0, 8.0  # dB RMS per phrase; the most a phrase is cut or raised
T = json.load(open("src/timeline.json"))


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


os.makedirs("public/audio/voice", exist_ok=True)
for name, vo in T["vo"].items():
    x = load(f"public/audio/use/{name}.mp3")
    knots, gains = [], []
    for p in vo["phrases"]:
        a, b = p["start"] - vo["start"], p["end"] - vo["start"]
        seg = x[int(a * SR):int(b * SR)]
        g = float(np.clip(TARGET - 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-12), LOWEST, HIGHEST))
        knots += [a, b]
        gains += [g, g]
    env = np.interp(np.arange(len(x)) / SR, knots, gains)
    y = (x * 10 ** (env / 20)).astype(np.float32)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-af", "alimiter=limit=0.891:level=0",
                    "-c:a", "libmp3lame", "-b:a", "192k", f"public/audio/voice/{name}.mp3"], input=y.tobytes(), check=True)
    print(name, " ".join(f"{g:+.1f}" for g in gains[::2]))
