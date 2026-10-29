"""The Favor Loop soundtrack, synthesized from src/timeline.json so every hit lands on the video's beat grid.
D minor, 104 BPM: pads and hang-drum plucks under the puzzle, a riser into a silent gap, the drop on the ring
snap, a house groove, an arpeggio peak under the scale montage, a breakdown, a build and the final hit.

    python3 tools/music.py  ->  public/audio/music.wav (44.1 kHz stereo)
"""
import json, wave
import numpy as np

SR = 44100
T = json.load(open("src/timeline.json"))
DUR = T["duration"]
N = int(DUR * SR)
BEAT = 60 / T["bpm"]
BAR = 4 * BEAT
DROP = T["drop"]
B = T["beats"]
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)
SEND = np.zeros(N)  # mono reverb send


def put(sig, start, gain=1.0, pan=0.0, send=0.0):
    """Mixes a mono signal in at `start` seconds; pan -1 (left) .. 1 (right)."""
    i = int(round(start * SR))
    if i >= N or i + len(sig) <= 0:
        return
    a, b = max(i, 0), min(N, i + len(sig))
    part = sig[a - i:b - i] * gain
    L[a:b] += part * np.cos((pan + 1) * np.pi / 4)
    R[a:b] += part * np.sin((pan + 1) * np.pi / 4)
    if send:
        SEND[a:b] += part * send


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(seconds):
    return np.arange(int(seconds * SR)) / SR


def adsr(n, a, d, s, r):
    """Envelope of n samples: attack a, decay d to level s, release r at the end (seconds)."""
    e = np.full(n, s, dtype=float)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na, endpoint=False) if na else e[:na]
    nd = min(nd, n - na)
    if nd > 0:
        e[na:na + nd] = np.linspace(1, s, nd, endpoint=False)
    if nr > 0 and nr < n:
        e[n - nr:] *= np.linspace(1, 0, nr)
    return e


def fft_filter(sig, lo=None, hi=None):
    """Band-limits a short signal by zeroing FFT bins outside [lo, hi] Hz, with soft edges."""
    spec = np.fft.rfft(sig)
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    gain = np.ones_like(f)
    if lo:
        gain *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        gain *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(spec * gain, len(sig))


# ------------------------------------------------------------------------------------------- instruments
def pad_voice(m, seconds, detune=0.0):
    t = tt(seconds)
    f = midi(m) * 2 ** (detune / 1200)
    sig = sum((1 / k ** 1.8) * np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6.28)) for k in range(1, 7))
    return sig


def pad(chord, start, seconds, gain):
    for m in chord:
        for det, pan in ((-7, -0.6), (0, 0.0), (7, 0.6)):
            v = pad_voice(m, seconds, det) * adsr(int(seconds * SR), 0.5, 0.4, 0.8, 0.6)
            put(v, start, gain * 0.05, pan, send=0.5)


def pluck(m, start, gain=1.0, pan=0.0):
    t = tt(1.6)
    f = midi(m)
    sig = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9)
           + 0.45 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.35)
           + 0.18 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t / 0.18))
    sig *= np.minimum(1, t / 0.004)
    knock = fft_filter(rng.standard_normal(len(t)) * np.exp(-t / 0.006), hi=2500) * 0.25
    put((sig + knock) * 0.16, start, gain, pan, send=0.55)


def kick(start, gain=1.0):
    t = tt(0.45)
    f = 46 + 120 * np.exp(-t / 0.028)
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2)
    sig[:90] += rng.standard_normal(90) * 0.3 * np.linspace(1, 0, 90)
    put(sig * 0.6, start, gain)


def clap(start, gain=1.0):
    n = int(0.25 * SR)
    sig = np.zeros(n)
    for off in (0.0, 0.011, 0.022):
        i = int(off * SR)
        burst = rng.standard_normal(n - i) * np.exp(-np.arange(n - i) / SR / (0.012 if off < 0.02 else 0.09))
        sig[i:] += burst
    sig = fft_filter(sig, lo=900, hi=4200)
    put(sig * 0.16, start, gain, 0.05, send=0.35)


def hat(start, gain=1.0, open_=False, pan=0.25):
    seconds = 0.32 if open_ else 0.05
    t = tt(seconds)
    sig = fft_filter(rng.standard_normal(len(t)), lo=7000) * np.exp(-t / (0.09 if open_ else 0.014))
    put(sig * 0.07, start, gain, pan)


def shaker(start, gain=1.0):
    t = tt(0.07)
    sig = fft_filter(rng.standard_normal(len(t)), lo=4500, hi=10000) * np.sin(np.pi * t / 0.07) ** 2
    put(sig * 0.035, start, gain, -0.35)


def bass(m, start, seconds, gain=1.0):
    t = tt(seconds)
    f = midi(m)
    sig = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    put(sig * adsr(len(t), 0.006, 0.08, 0.7, 0.05) * 0.22, start, gain)


def arp(m, start, gain=1.0, pan=0.0):
    t = tt(0.2)
    f = midi(m)
    sig = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(6 * np.pi * f * t) + 0.12 * np.sin(10 * np.pi * f * t))
    sig *= np.exp(-t / 0.07) * np.minimum(1, t / 0.003)
    put(sig * 0.05, start, gain, pan, send=0.6)


def tom(start, f0=190, gain=1.0):
    t = tt(0.35)
    f = f0 * (0.62 + 0.38 * np.exp(-t / 0.05))
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)
    put(sig * 0.28, start, gain, rng.uniform(-0.3, 0.3), send=0.2)


def crash(start, gain=1.0):
    t = tt(2.6)
    sig = fft_filter(rng.standard_normal(len(t)), lo=3500) * np.exp(-t / 0.75) * 0.11
    boom = np.sin(2 * np.pi * 52 * t) * np.exp(-t / 0.7) * 0.5
    put(sig, start, gain, -0.2, send=0.4)
    put(sig, start + 0.007, gain, 0.2)
    put(boom, start, gain)


def riser(start, end, gain=1.0):
    seconds = end - start
    t = tt(seconds)
    noise = rng.standard_normal(len(t))
    # an STFT-style sweep: each 2048-sample frame band-passed a little higher, crossfaded
    out = np.zeros(len(t))
    hop = 1024
    win = np.hanning(2048)
    for i in range(0, len(t) - 2048, hop):
        frac = i / len(t)
        centre = 400 * (12000 / 400) ** frac
        out[i:i + 2048] += fft_filter(noise[i:i + 2048] * win, lo=centre * 0.6, hi=centre * 1.6)
    sweep = np.sin(2 * np.pi * np.cumsum(220 * (6 ** (t / seconds))) / SR) * 0.25
    env = (t / seconds) ** 2.2
    put((out * 0.18 + sweep) * env, start, gain, 0.0, send=0.3)


# ------------------------------------------------------------------------------------------- the score
CHORDS = [  # (pad voicing, bass note)
    ([50, 53, 57, 60, 64], 38),  # Dm9
    ([46, 50, 53, 57, 60], 34),  # Bbmaj9
    ([53, 57, 60, 64], 41),      # Fmaj7
    ([48, 52, 55, 62], 36),      # Cadd9
]
MOTIF = [  # per chord: (eighth-note slot, midi)
    [(0, 69), (2, 74), (4, 76), (6, 74), (7, 69)],
    [(0, 74), (2, 72), (4, 69), (6, 65)],
    [(0, 72), (2, 69), (4, 76), (6, 72), (7, 69)],
    [(0, 67), (2, 72), (4, 74), (6, 76)],
]
ARP = [[62, 65, 69, 72, 74, 72, 69, 65], [58, 62, 65, 69, 72, 69, 65, 62], [65, 69, 72, 76, 77, 76, 72, 69], [60, 64, 67, 74, 76, 74, 67, 64]]

GAP = (DROP - 0.2, DROP)          # the held breath before the snap
PEAK = (B["peakStart"], B["peakEnd"])
BREAK = (B["peakEnd"], B["buildStart"])
FINAL = B["finalHit"]
in_ = lambda t, span: span[0] <= t < span[1]

first_bar = int(np.floor((0 - DROP) / BAR)) - 1
last_bar = int(np.ceil((DUR - DROP) / BAR))
for b in range(first_bar, last_bar):
    t0 = DROP + b * BAR
    chord, root = CHORDS[b % 4]
    motif = MOTIF[b % 4]
    before_drop = t0 < DROP
    # pads everywhere, louder in the intro and the breakdown, cut for the held breath
    pad_gain = 0.85 if before_drop else 1.0 if in_(t0, BREAK) else 0.75 if t0 >= FINAL else 0.6
    seconds = min(BAR + 0.6, GAP[0] - t0 + 0.05) if before_drop and t0 + BAR > GAP[0] else BAR + 0.6
    if seconds > 0.1:
        pad(chord, t0, seconds, pad_gain)
    # plucks: sparse in the intro, the motif from the drop, the motif and its echo at the end
    for slot, m in motif:
        st = t0 + slot * BEAT / 2
        if st < 1.2 or in_(st, (GAP[0] - 0.4, DROP)):
            continue
        if before_drop and slot not in (0, 4):
            continue
        g = 0.55 if before_drop else 0.8
        pluck(m, st, g, pan=(slot / 7 - 0.5) * 0.8)
        if not before_drop and (in_(st, BREAK) or st >= FINAL):
            pluck(m + 12, st + BEAT * 0.75, 0.25, pan=0.6)

    if before_drop:
        continue
    for beat in range(4):
        tb = t0 + beat * BEAT
        drums = tb < BREAK[0] or in_(tb, (B["buildStart"], FINAL))
        if tb >= FINAL:
            drums = False
        if drums:
            kick(tb, 0.75 if tb >= B["buildStart"] else 1.0)
            if beat in (1, 3) and tb < BREAK[0]:
                clap(tb)
            if tb < BREAK[0]:
                hat(tb + BEAT / 2, 1.0)
                if in_(tb, PEAK) and beat == 3:
                    hat(tb + BEAT / 2, 0.8, open_=True)
        if tb < BREAK[0] or in_(tb, BREAK):
            for s16, v in enumerate((0.6, 0.3, 0.45, 0.3)):
                shaker(tb + s16 * BEAT / 4, v * (0.5 if in_(tb, BREAK) else 1.0))
        if drums and tb < BREAK[0] or in_(tb, (B["buildStart"], FINAL)):
            bass(root + (12 if beat == 3 and b % 2 else 0), tb + BEAT / 2, BEAT * 0.42)
        if in_(tb, PEAK):
            for s16 in range(4):
                note = ARP[b % 4][(beat * 4 + s16) % 8] + 12
                arp(note, tb + s16 * BEAT / 4, 0.9, pan=0.5 if s16 % 2 else -0.5)

# fills and events
for i, off in enumerate((-0.75, -0.5, -0.25)):
    tom(DROP + off * BEAT * 2, 200 - i * 30, 0.7)
riser(DROP - 2.0, GAP[0])
crash(DROP, 1.0)
crash(FINAL, 1.2)
for i in range(16):  # snare roll into the final hit, accelerating
    st = B["rollStart"] + (1 - (1 - i / 16) ** 1.6) * (FINAL - B["rollStart"] - 0.05)
    clap(st, 0.35 + 0.6 * i / 16)
riser(B["rollStart"] + BEAT * 2, FINAL - 0.03, 0.6)
for i in range(3):  # the drums fall away into the breakdown
    tom(BREAK[0] - BEAT + i * BEAT / 3, 180 - i * 25, 0.6)

# ------------------------------------------------------------------------------------------- mix
ir_t = tt(2.4)
ir = fft_filter(rng.standard_normal(len(ir_t)), lo=200, hi=6500) * np.exp(-ir_t / 0.55)
ir /= np.sqrt((ir ** 2).sum())
size = 1 << int(np.ceil(np.log2(N + len(ir))))
wet = np.fft.irfft(np.fft.rfft(SEND, size) * np.fft.rfft(ir, size), size)[:N]
L += wet * 0.55
R += np.roll(wet, int(0.011 * SR)) * 0.55

mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 0.89 / np.abs(mix).max()
# fade the last 0.6 s toward the intro's level so the loop seam is soft
fade = int(0.6 * SR)
mix[-fade:] *= np.linspace(1, 0.55, fade)[:, None]
pcm = (mix * 32767).astype(np.int16)
with wave.open("public/audio/music.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"music.wav {DUR}s, peak {np.abs(mix).max():.2f}, rms {np.sqrt((mix ** 2).mean()):.3f}")
