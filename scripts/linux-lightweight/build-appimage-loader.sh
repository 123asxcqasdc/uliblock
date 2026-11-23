#!/usr/bin/env bash
set -euo pipefail

# Builds a lightweight (< 2 MB) AppImage Type 2 loader for UliBlock.
# On first launch it downloads & caches the full UliBlock AppImage from GitHub Releases
# with a native GUI progress bar (zenity/kdialog) and then launches UliBlock offline.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
TARGET_ARCH="${1:-x64}"
case "$TARGET_ARCH" in
  x64|x86_64) APPIMAGE_ARCH="x86_64"; OUT_ARCH="x64" ;;
  arm64|aarch64) APPIMAGE_ARCH="aarch64"; OUT_ARCH="arm64" ;;
  *)
    echo "Usage: $0 [x64|arm64]" >&2
    exit 1
    ;;
esac

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

APPDIR="${WORK_DIR}/UliBlock-Loader.AppDir"
mkdir -p "${APPDIR}/usr/bin" "${APPDIR}/usr/share/icons/hicolor/scalable/apps"

sed "s/__ULIBLOCK_VERSION__/${VERSION}/g" "${SCRIPT_DIR}/uliblock-loader.sh" > "${APPDIR}/usr/bin/uliblock-loader"
chmod 0755 "${APPDIR}/usr/bin/uliblock-loader"

cat > "${APPDIR}/AppRun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(dirname "$(readlink -f "${0}")")"
exec "${HERE}/usr/bin/uliblock-loader" "$@"
EOF
chmod 0755 "${APPDIR}/AppRun"

cat > "${APPDIR}/ru.c6t.uli.uliblock.desktop" <<'EOF'
[Desktop Entry]
Name=UliBlock
Comment=UliBlock — lightweight Scratch/TurboWarp editor (Online Loader)
Exec=uliblock-loader %U
Terminal=false
Type=Application
Icon=ru.c6t.uli.uliblock
StartupWMClass=uliblock
Categories=Development;Education;
MimeType=application/x.scratch.sb3;application/x.scratch.sb2;application/x.scratch.sb;
EOF

cp "${ROOT_DIR}/art/icon.svg" "${APPDIR}/ru.c6t.uli.uliblock.svg"
cp "${ROOT_DIR}/art/icon.svg" "${APPDIR}/usr/share/icons/hicolor/scalable/apps/ru.c6t.uli.uliblock.svg"
cp "${ROOT_DIR}/build/512x512.png" "${APPDIR}/ru.c6t.uli.uliblock.png"
ln -s "ru.c6t.uli.uliblock.png" "${APPDIR}/.DirIcon"
cp "${ROOT_DIR}/LICENSE" "${APPDIR}/LICENSE"

APPIMAGETOOL="${APPIMAGETOOL:-}"
if [[ -z "$APPIMAGETOOL" ]]; then
  if command -v appimagetool >/dev/null 2>&1; then
    APPIMAGETOOL="$(command -v appimagetool)"
  else
    TOOL_CACHE="${ROOT_DIR}/.cache-tools"
    mkdir -p "$TOOL_CACHE"
    HOST_ARCH="$(uname -m)"
    APPIMAGETOOL="${TOOL_CACHE}/appimagetool-${HOST_ARCH}.AppImage"
    if [[ ! -x "$APPIMAGETOOL" ]]; then
      echo "Downloading appimagetool for ${HOST_ARCH}..."
      curl -fL "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${HOST_ARCH}.AppImage" -o "$APPIMAGETOOL"
      chmod +x "$APPIMAGETOOL"
    fi
  fi
fi

mkdir -p "${ROOT_DIR}/dist"
OUT_FILE="${ROOT_DIR}/dist/UliBlock-Loader-linux-${OUT_ARCH}-${VERSION}.AppImage"

# Always pass APPIMAGE_EXTRACT_AND_RUN=1 so appimagetool works in containers without FUSE
ARCH="${APPIMAGE_ARCH}" APPIMAGE_EXTRACT_AND_RUN=1 "${APPIMAGETOOL}" --no-appstream "${APPDIR}" "${OUT_FILE}"
chmod +x "${OUT_FILE}"

echo "Built lightweight AppImage loader: ${OUT_FILE} ($(du -h "${OUT_FILE}" | awk '{print $1}'))"
