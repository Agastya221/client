#!/bin/bash
set -e
export PATH="$HOME/node/bin:/usr/local/bin:/usr/bin:/bin"
SRC=/mnt/e/tatakai/anime-website
cd "$HOME/site"
# refresh any source changed since the first copy, keeping the Linux node_modules
tar -C "$SRC" --exclude=./node_modules --exclude=./.next --exclude=./.open-next --exclude=./.git \
    --exclude=./dev.db --exclude=./artifacts --exclude='./scratch_*' -cf - . | tar -xf - -C "$HOME/site"
cp "$SRC/.env" "$HOME/site/.env" 2>/dev/null || true
cp "$SRC/.env.local" "$HOME/site/.env.local"
SITE="https://tatakai-anime-website.tatakai-anime.workers.dev"
cat > .env.production.local <<ENVEOF
NEXT_PUBLIC_SITE_URL=$SITE
NEXT_PUBLIC_ANIVEXA_WORKER_URL=https://tatakai-anivexa-api.onrender.com
ANILIST_REDIRECT_URI=$SITE/api/auth/callback/anilist
ENVEOF
rm -rf .next .open-next
echo "=== building ($(date +%T)) ==="
npx prisma generate 2>&1 | tail -2
node scripts/patch-opennext.mjs && npx opennextjs-cloudflare build 2>&1 | tail -40
node scripts/patch-prisma-wasm.mjs
echo "=== build done ($(date +%T)) ==="
