#!/usr/bin/env bash
# Copies the generated agentvillage/ files into an Edge-City/agentvillage checkout (your branch) and runs
# the buildathon's local checks (docs/MINI-APPS-BUILDATHON.md section 6). Regenerate first:
#   bun run agentvillage -- --host https://<your-host>
# then:
#   scripts/pr-checks.sh <path to your agentvillage checkout> [https://<your-host>/mcp]
set -uo pipefail
AV="${1:?usage: scripts/pr-checks.sh <agentvillage checkout> [https://<host>/mcp]}"
SERVICE="${2:-}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/agentvillage"
TMP="${TMPDIR:-/tmp}"

mkdir -p "$AV/mini-apps/favorloop" "$AV/skills/favorloop" "$AV/scripts/tests/fixtures"
cp "$SRC/mini-apps/favorloop/manifest.json" "$SRC/mini-apps/favorloop/README.md" "$AV/mini-apps/favorloop/"
cp "$SRC/skills/favorloop/SKILL.md" "$AV/skills/favorloop/"
rm -rf "$AV/scripts/tests/fixtures/favorloop"
cp -R "$SRC/scripts/tests/fixtures/favorloop" "$AV/scripts/tests/fixtures/"
cd "$AV" || exit 2
[ -d node_modules ] || bun install >/dev/null

echo "== 1. skill pin (must equal skills[0].sha256)"
shasum -a 256 skills/favorloop/SKILL.md 2>/dev/null || sha256sum skills/favorloop/SKILL.md
grep '"sha256"' mini-apps/favorloop/manifest.json

echo "== 2. manifest validator"
node -e 'const v=require("./scripts/mini-apps-manifests.cjs");const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const r=v.validateManifest(m);console.log(JSON.stringify(r.ok?{ok:true}:r));process.exit(r.ok?0:1)' mini-apps/favorloop/manifest.json

echo "== 3. conformance (must print passed: true)"
bun run conformance -- mini-apps/favorloop/manifest.json --fixtures scripts/tests/fixtures/favorloop --base origin/main --out "$TMP/conformance.json"

if [ -n "$SERVICE" ]; then
  echo "== 3b. live check of $SERVICE (advisory; the token probe row reads FAIL because public reads need no token)"
  bun run conformance -- mini-apps/favorloop/manifest.json --fixtures scripts/tests/fixtures/favorloop --service "$SERVICE"
fi

echo "== 5. manifest test (red only with 'favorloop/: not in catalog.json' until the team lists the id)"
bun test scripts/tests/mini-app-manifests.test.ts 2>&1 | grep -E "not in catalog|^\(fail\)| pass$| fail$"

echo
echo "== 4. after you commit on your branch, run the review bot (needs full history: git fetch --unshallow):"
echo "   bun scripts/mini-apps-review.ts --base origin/main --head HEAD --author bilgin-kocak"
echo "   Expect NEEDS_HUMAN, never FAIL (new_app, catalog_unlisted, and core_path for the fixture files)."
echo "Never commit conformance.json."
