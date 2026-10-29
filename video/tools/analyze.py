"""Measures audio files so takes can be picked without listening: trimmed duration, peak, RMS, spectral
centroid (brightness), attack time, energy slope (risers rise) and onset count."""
import json, subprocess, sys
import numpy as np

SR = 44100

def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

def measure(path):
    x = load(path)
    env = np.sqrt(np.convolve(x * x, np.ones(441) / 441, mode="same") + 1e-12)  # 10 ms RMS
    db = 20 * np.log10(env + 1e-9)
    loud = np.where(db > db.max() - 40)[0]
    start, end = (loud[0], loud[-1]) if len(loud) else (0, len(x))
    seg = x[start:end + 1]
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) if len(seg) > 64 else np.zeros(2)
    freqs = np.fft.rfftfreq(len(seg), 1 / SR) if len(seg) > 64 else np.zeros(2)
    centroid = float((spec * freqs).sum() / (spec.sum() + 1e-9))
    e = env[start:end + 1]
    peak_at = int(np.argmax(e))
    halves = np.array_split(e, 4) if len(e) >= 4 else [e]
    slope = float(np.mean(halves[-1]) / (np.mean(halves[0]) + 1e-9))
    d = np.diff(e[::441]) if len(e) > 882 else np.zeros(1)
    onsets = int(np.sum((d[1:] > 0.02) & (d[:-1] <= 0.02)))
    # longest internal silence (below -45 dB relative) inside the loud span, in seconds
    quiet = db[start:end + 1] < db.max() - 45
    longest, run = 0, 0
    for q in quiet:
        run = run + 1 if q else 0
        longest = max(longest, run)
    return {"file": path.split("/")[-1], "dur": round((end - start) / SR, 2), "lead": round(start / SR, 2),
            "peak": round(float(np.abs(x).max()), 3), "rms": round(float(np.sqrt(np.mean(seg ** 2))), 4),
            "centroid": int(centroid), "attack": round(peak_at / SR, 3), "slope": round(slope, 2),
            "onsets": onsets, "gap": round(longest / SR, 2)}

if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(json.dumps(measure(p)))
