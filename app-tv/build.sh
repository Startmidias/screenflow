#!/bin/bash
# Gera o ScreenFlowTV.apk a partir de app/ (apktool + zipalign + apksigner)
set -euo pipefail
cd "$(dirname "$0")"
T=tools
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-}"
rm -rf app/build out && mkdir -p out
java -jar /tmp/npmchk/_postar_apktool-node/package/lib/apktool.jar b app -o out/unsigned.apk -p out/fw 2>&1 | grep -v '^Picked up' 
python3 zipalign.py out/unsigned.apk out/aligned.apk
if [ ! -f keys/screenflow-tv.p12 ]; then
  keytool -genkeypair -keystore keys/screenflow-tv.p12 -storetype PKCS12 -storepass screenflowtv -keypass screenflowtv \
    -alias screenflow -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=ScreenFlow TV, O=ScreenFlow, C=BR" 2>&1 | grep -v '^Picked up'
fi
java -jar $T/apksigner.jar sign --ks keys/screenflow-tv.p12 --ks-pass pass:screenflowtv --ks-key-alias screenflow \
  --min-sdk-version 21 --out out/ScreenFlowTV.apk out/aligned.apk 2>&1 | grep -v '^Picked up' || true
java -jar $T/apksigner.jar verify --verbose --min-sdk-version 21 out/ScreenFlowTV.apk 2>&1 | grep -v '^Picked up' | head -6
ls -la out/ScreenFlowTV.apk
