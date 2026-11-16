#!/usr/bin/env bash
# Downloads the BodyParts3D 3.0 bone files that a region needs (pinned version)
# into ./_source/bodyparts3d/stl (not committed).
# Usage: bash tools/fetch_bodyparts3d.sh regions/leg_right.json
# Files come from the GitHub mirror of BodyParts3D 3.0 ("95%" polygon set, as STL).
set -euo pipefail
REGION="${1:?give a region file, e.g. regions/leg_right.json}"
DEST="${2:-_source/bodyparts3d}"
COMMIT=2c83c698788cff57f6317bddcf712e7acfbea7d8
IDS=$(python3 -c "import json,sys; r=json.load(open(sys.argv[1])); print(' '.join(v for L in r['layers'].values() for v in L.get('bodyparts3d',{}).values()))" "$REGION")
mkdir -p "$DEST/repo" "$DEST/stl"
cd "$DEST/repo"
[ -d .git ] || git init -q
git config gc.auto 0
git fetch -q --depth 1 --filter=blob:none https://github.com/Kevin-Mattheus-Moerman/BodyParts3D "$COMMIT"
for id in $IDS; do
  git show "FETCH_HEAD:assets/BodyParts3D_data/stl/$id.stl" > "../stl/$id.stl"
  echo "got $id.stl"
done
