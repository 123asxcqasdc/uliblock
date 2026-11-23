#!/usr/bin/env bash
set -euo pipefail

# Builds ONE lightweight (< 2 MB) AppImage installer that downloads and installs
# the official UliBlock .deb package from GitHub Releases into the user's system.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
TARGET_ARCH="${1:-x64}"
case "$TARGET_ARCH" in
  x64|x86_64|amd64) APPIMAGE_ARCH="x86_64"; OUT_ARCH="x64" ;;
  arm64|aarch64) APPIMAGE_ARCH="aarch64"; OUT_ARCH="arm64" ;;
  *)
    echo "Usage: $0 [x64|arm64]" >&2
    exit 1
    ;;
esac

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

APPDIR="${WORK_DIR}/UliBlock-Deb-Installer.AppDir"
mkdir -p \
  "${APPDIR}/usr/bin" \
  "${APPDIR}/usr/share/icons/hicolor/scalable/apps" \
  "${APPDIR}/usr/share/icons/hicolor/512x512/apps"

sed "s/__ULIBLOCK_VERSION__/${VERSION}/g" "${SCRIPT_DIR}/uliblock-deb-installer.py" > "${APPDIR}/usr/bin/uliblock-deb-installer"
chmod 0755 "${APPDIR}/usr/bin/uliblock-deb-installer"

cat > "${APPDIR}/AppRun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(dirname "$(readlink -f "${0}")")"
exec python3 "${HERE}/usr/bin/uliblock-deb-installer" "$@"
EOF
chmod 0755 "${APPDIR}/AppRun"

cat > "${APPDIR}/ru.c6t.uli.uliblock.installer.desktop" <<'EOF'
[Desktop Entry]
Name=UliBlock Installer
Name[ru]=Установщик UliBlock
Comment=Download and install UliBlock (.deb) from GitHub Releases
Comment[ru]=Загрузка и установка .deb пакета UliBlock с GitHub Releases
Exec=uliblock-deb-installer
Terminal=false
Type=Application
Icon=ru.c6t.uli.uliblock
Categories=System;Utility;
EOF

cp "${ROOT_DIR}/art/icon.svg" "${APPDIR}/ru.c6t.uli.uliblock.svg"
cp "${ROOT_DIR}/art/icon.svg" "${APPDIR}/usr/share/icons/hicolor/scalable/apps/ru.c6t.uli.uliblock.svg"
cp "${ROOT_DIR}/build/512x512.png" "${APPDIR}/ru.c6t.uli.uliblock.png"
cp "${ROOT_DIR}/build/512x512.png" "${APPDIR}/usr/share/icons/hicolor/512x512/apps/ru.c6t.uli.uliblock.png"
ln -s "ru.c6t.uli.uliblock.png" "${APPDIR}/.DirIcon"
cp "${ROOT_DIR}/LICENSE" "${APPDIR}/LICENSE"

TOOL_CACHE="${ROOT_DIR}/.cache-tools"
mkdir -p "$TOOL_CACHE"

APPIMAGETOOL="${APPIMAGETOOL:-}"
if [[ -z "$APPIMAGETOOL" ]]; then
  if command -v appimagetool >/dev/null 2>&1; then
    APPIMAGETOOL="$(command -v appimagetool)"
  else
    HOST_ARCH="$(uname -m)"
    APPIMAGETOOL="${TOOL_CACHE}/appimagetool-${HOST_ARCH}.AppImage"
    if [[ ! -x "$APPIMAGETOOL" ]]; then
      echo "Downloading appimagetool for ${HOST_ARCH}..."
      curl -fL "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${HOST_ARCH}.AppImage" -o "$APPIMAGETOOL"
      chmod +x "$APPIMAGETOOL"
    fi
  fi
fi

RUNTIME_FILE="${TOOL_CACHE}/runtime-${APPIMAGE_ARCH}"
if [[ ! -s "$RUNTIME_FILE" ]]; then
  echo "Downloading AppImage type2-runtime for ${APPIMAGE_ARCH}..."
  curl -fL "https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-${APPIMAGE_ARCH}" -o "$RUNTIME_FILE"
fi

mkdir -p "${ROOT_DIR}/dist"
OUT_FILE="${ROOT_DIR}/dist/UliBlock-Installer-linux-${OUT_ARCH}-${VERSION}.AppImage"

ARCH="${APPIMAGE_ARCH}" APPIMAGE_EXTRACT_AND_RUN=1 "${APPIMAGETOOL}" --no-appstream --runtime-file "${RUNTIME_FILE}" "${APPDIR}" "${OUT_FILE}"
chmod +x "${OUT_FILE}"

echo "Built UliBlock .deb Installer AppImage: ${OUT_FILE} ($(du -h "${OUT_FILE}" | awk '{print $1}'))"
