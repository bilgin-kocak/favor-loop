"""Speech segments (start, end) of each chosen voiceover file, split at pauses of at least 0.16 s."""
import json, sys
sys.path.insert(0, __file__.rsplit("/", 1)[0])
import numpy as np
from analyze import load, SR

out = {}
for path in sys.argv[1:]:
    x = load(path)
    env = np.sqrt(np.convolve(x * x, np.ones(441) / 441, mode="same") + 1e-12)
    db = 20 * np.log10(env + 1e-9)
    voiced = db > db.max() - 32
    segs, start, quiet = [], None, 0
    for i in range(0, len(voiced), 441):
        v = voiced[i:i + 441].any()
        if v:
            if start is None: start = i
            quiet = 0; last = i + 441
        elif start is not None:
            quiet += 441
            if quiet >= int(0.16 * SR):
                segs.append((round(start / SR, 2), round(last / SR, 2))); start = None
    if start is not None: segs.append((round(start / SR, 2), round(last / SR, 2)))
    out[path.split("/")[-1].replace(".mp3", "")] = {"duration": round(len(x) / SR, 3), "segments": segs}
print(json.dumps(out))
