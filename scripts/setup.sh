#!/usr/bin/env bash
# Downloads cloudflared into bin/ and checks it against the release's published SHA-256.
set -euo pipefail
cd "$(dirname "$0")/.."

ASSET=cloudflared-linux-amd64
mkdir -p bin
RELEASE="$(curl -fsSL https://api.github.com/repos/cloudflare/cloudflared/releases/latest)"
TAG="$(printf '%s' "$RELEASE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).tag_name))')"
EXPECTED="$(printf '%s' "$RELEASE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).body.match(/cloudflared-linux-amd64:\s*([0-9a-f]{64})/);console.log(m?m[1]:"")})')"
if [ -z "$EXPECTED" ]; then
  echo "这个版本的发布说明里没有 SHA-256，已停止。" >&2
  exit 1
fi
curl -fsSL -o bin/cloudflared.download "https://github.com/cloudflare/cloudflared/releases/download/$TAG/$ASSET"
echo "$EXPECTED  bin/cloudflared.download" | sha256sum -c -
chmod +x bin/cloudflared.download
mv bin/cloudflared.download bin/cloudflared
bin/cloudflared --version
