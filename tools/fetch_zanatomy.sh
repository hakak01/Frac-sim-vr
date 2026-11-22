#!/usr/bin/env bash
# Downloads the Z-Anatomy Blender file (pinned version) into ./_source (not committed).
# Usage: bash tools/fetch_zanatomy.sh
set -euo pipefail
COMMIT=cf1967839387baf412c50b47fc6a63fff30618a3
DEST="${1:-_source}"
mkdir -p "$DEST/repo" "$DEST/blend"
cd "$DEST/repo"
[ -d .git ] || git init -q
git fetch -q --depth 1 https://github.com/Z-Anatomy/Models-of-human-anatomy "$COMMIT"
git checkout -q FETCH_HEAD
cd ../blend
unzip -q -o ../repo/Z-Anatomy.zip
echo "Blender file: $DEST/blend/Z-Anatomy/Startup.blend"
