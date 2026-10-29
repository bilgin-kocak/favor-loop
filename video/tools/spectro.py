"""Writes a spectrogram PNG of a WAV (no matplotlib needed): python3 tools/spectro.py in.wav out.png"""
import sys, wave, zlib, struct
import numpy as np
w = wave.open(sys.argv[1]); sr = w.getframerate(); ch = w.getnchannels()
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, ch).mean(axis=1) / 32768
hop, win = 1024, 4096
frames = [np.abs(np.fft.rfft(x[i:i + win] * np.hanning(win))) for i in range(0, len(x) - win, hop)]
S = 20 * np.log10(np.array(frames).T + 1e-6)
f = np.fft.rfftfreq(win, 1 / sr)
# log-frequency rows from 30 Hz to 14 kHz
rows = np.geomspace(30, 14000, 300)
img = np.array([S[np.argmin(np.abs(f - r))] for r in rows])[::-1]
img = np.clip((img - (img.max() - 70)) / 70, 0, 1)
H, W = img.shape
# time ticks every 5 s
px = (np.stack([img * 255, img * 200, img * 80], axis=-1)).astype(np.uint8)
for s in range(0, int(len(x) / sr) + 1, 5):
    col = int(s * sr / hop)
    if col < W: px[:, col] = [90, 140, 255] if s % 10 else [255, 255, 255]
raw = b"".join(b"\x00" + px[y].tobytes() for y in range(H))
png = b"\x89PNG\r\n\x1a\n"
def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
open(sys.argv[2], "wb").write(png)
print(W, H)
