#!/bin/bash
# Gera o startplay.apk (START PLAY TV) a partir de src/ (smali, apktool) + native/ (Java do vídeo nativo).
# Precisa: java/javac, apktool.jar, dx.jar (dex2jar), apksigner.jar e a chave original em keys/
# (a mesma chave do app instalado nas TVs; com outra chave o Android recusa a atualização).
#   APKTOOL=... DX=... SIGNER=... KEYS=... ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
APKTOOL="${APKTOOL:-/tmp/npmchk/_postar_apktool-node/package/lib/apktool.jar}"
DX="${DX:-$(ls /tmp/dx/dex-tools*/lib/dx-*.jar 2>/dev/null | head -1)}"
SIGNER="${SIGNER:-/home/claude/tv/tools/apksigner.jar}"
KEYS="${KEYS:-/home/claude/tv/keys/screenflow-tv.p12}"
OUT=out; rm -rf "$OUT" && mkdir -p "$OUT"
q() { grep -v '^Picked up' || true; }

echo "1) vídeo nativo (Java → dex)"
rm -rf native/build && mkdir -p native/build/stubs native/build/classes
javac -nowarn -source 8 -target 8 -d native/build/stubs $(find native/stubs -name "*.java") 2>&1 | q | grep -v "warning" || true
javac -nowarn -source 8 -target 8 -encoding UTF-8 -cp native/build/stubs -d native/build/classes $(find native/src -name "*.java") 2>&1 | q | grep -v "warning\|^Note" || true
java -cp "$DX" com.android.dx.command.Main --dex --min-sdk-version=21 --output="$OUT/classes2.dex" native/build/classes 2>&1 | q

echo "2) app (smali → apk)"
rm -rf src/build
java -jar "$APKTOOL" b src -o "$OUT/unsigned.apk" -p "$OUT/fw" 2>&1 | q
python3 - "$OUT/unsigned.apk" "$OUT/classes2.dex" <<'EOF'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1], "a", zipfile.ZIP_DEFLATED)
assert "classes2.dex" not in z.namelist()
z.write(sys.argv[2], "classes2.dex"); z.close()
EOF

echo "3) alinhar e assinar"
python3 zipalign.py "$OUT/unsigned.apk" "$OUT/aligned.apk"
java -jar "$SIGNER" sign --ks "$KEYS" --ks-pass pass:screenflowtv --ks-key-alias screenflow \
  --min-sdk-version 21 --out "$OUT/startplay.apk" "$OUT/aligned.apk" 2>&1 | q
java -jar "$SIGNER" verify --verbose --print-certs --min-sdk-version 21 "$OUT/startplay.apk" 2>&1 | q | grep -E "Verifies|v2 scheme|SHA-256" | head -4
ls -la "$OUT/startplay.apk"
