#!/bin/bash
# ViralCool — klik dua kali fail ni untuk mula. (macOS / Linux)
cd "$(dirname "$0")" || exit 1

echo "  ViralCool"
echo "  ---------"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node belum dipasang dalam komputer ni."
  echo "  Muat turun versi LTS di https://nodejs.org, pasang, lepas tu"
  echo "  klik dua kali fail ni semula."
  echo
  command -v open >/dev/null 2>&1 && open "https://nodejs.org/en/download"
  read -r -p "  Tekan Enter untuk tutup..." _
  exit 1
fi

VER=$(node -p "process.versions.node.split('.')[0]")
if [ "$VER" -lt 20 ]; then
  echo "  Node kau versi $VER — ViralCool perlu 20 ke atas."
  echo "  Pasang versi LTS terbaru di https://nodejs.org."
  read -r -p "  Tekan Enter untuk tutup..." _
  exit 1
fi

export TZ="${TZ:-Asia/Kuala_Lumpur}"
echo "  Sedang mula... jangan tutup tetingkap ni."
echo "  Nak berhenti: tekan Control + C, atau tutup tetingkap."
echo

node server.mjs &
PID=$!
sleep 2
URL="http://localhost:8787"
if command -v open >/dev/null 2>&1; then open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
else echo "  Buka $URL dalam browser kau."; fi
wait $PID
