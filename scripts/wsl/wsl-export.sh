#!/bin/bash
set -e
cd "$HOME/site/.open-next"
rm -f assets/final_worker.js assets/temp_worker.js
echo "internal worker files left in assets: $(ls assets | grep -c '_worker.js')"
DEST=/mnt/e/tatakai/anime-website/.open-next
rm -rf "$DEST"
cp -rL "$HOME/site/.open-next" "$DEST"
echo "copied: $(find "$DEST" -type f | wc -l) files, $(du -sh "$DEST" | cut -f1)"
ls "$DEST/worker.js" && echo "worker.js present"
