import json, sys
cols = sys.argv[1:] or ["dur", "lead", "peak", "rms", "centroid", "attack", "slope", "onsets", "gap"]
for line in sys.stdin:
    m = json.loads(line)
    print(f"{m['file']:<22}" + "  ".join(f"{c} {m[c]}" for c in cols))
