#!/usr/bin/env bash
set -euo pipefail

# Builds a lightweight (< 1 MB) Debian installer package (.deb) for UliBlock.
# Installs desktop integration, icons, MIME associations (.sb3/.sb2/.sb), and /usr/bin/uliblock,
# which downloads & caches the full UliBlock AppImage from GitHub Releases.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
ARCH="${1:-amd64}"
case "$ARCH" in
  x64|amd64) DEB_ARCH="amd64"; OUT_ARCH="x64" ;;
  arm64|aarch64) DEB_ARCH="arm64"; OUT_ARCH="arm64" ;;
  all) DEB_ARCH="all"; OUT_ARCH="all" ;;
  *)
    echo "Usage: $0 [amd64|arm64|all]" >&2
    exit 1
    ;;
esac

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

PKG_ROOT="${WORK_DIR}/pkg"
mkdir -p \
  "${PKG_ROOT}/DEBIAN" \
  "${PKG_ROOT}/usr/bin" \
  "${PKG_ROOT}/usr/share/applications" \
  "${PKG_ROOT}/usr/share/icons/hicolor/scalable/apps" \
  "${PKG_ROOT}/usr/share/icons/hicolor/512x512/apps" \
  "${PKG_ROOT}/usr/share/mime/packages" \
  "${PKG_ROOT}/usr/share/metainfo" \
  "${PKG_ROOT}/usr/share/doc/uliblock-installer"

# Launcher/downloader script with version stamped
sed "s/__ULIBLOCK_VERSION__/${VERSION}/g" "${SCRIPT_DIR}/uliblock-loader.sh" > "${PKG_ROOT}/usr/bin/uliblock"
chmod 0755 "${PKG_ROOT}/usr/bin/uliblock"

# Desktop entry (point Exec to /usr/bin/uliblock), MIME associations, AppStream metainfo, icons
sed 's|^Exec=.*|Exec=/usr/bin/uliblock %U|' "${ROOT_DIR}/linux-files/ru.c6t.uli.uliblock.desktop" > "${PKG_ROOT}/usr/share/applications/ru.c6t.uli.uliblock.desktop"
cp "${ROOT_DIR}/linux-files/ru.c6t.uli.uliblock.mime.xml" "${PKG_ROOT}/usr/share/mime/packages/ru.c6t.uli.uliblock.xml"
cp "${ROOT_DIR}/linux-files/ru.c6t.uli.uliblock.metainfo.xml" "${PKG_ROOT}/usr/share/metainfo/ru.c6t.uli.uliblock.metainfo.xml"
cp "${ROOT_DIR}/art/icon.svg" "${PKG_ROOT}/usr/share/icons/hicolor/scalable/apps/ru.c6t.uli.uliblock.svg"
cp "${ROOT_DIR}/build/512x512.png" "${PKG_ROOT}/usr/share/icons/hicolor/512x512/apps/ru.c6t.uli.uliblock.png"

# License & attribution
cp "${ROOT_DIR}/LICENSE" "${PKG_ROOT}/usr/share/doc/uliblock-installer/copyright"
cp "${ROOT_DIR}/README.md" "${PKG_ROOT}/usr/share/doc/uliblock-installer/README.md"

INSTALLED_SIZE="$(du -sk "${PKG_ROOT}/usr" | awk '{print $1}')"

cat > "${PKG_ROOT}/DEBIAN/control" <<EOF
Package: uliblock-installer
Version: ${VERSION}
Section: devel
Priority: optional
Architecture: ${DEB_ARCH}
Installed-Size: ${INSTALLED_SIZE}
Depends: bash, curl | wget, ca-certificates
Recommends: zenity | kdialog
Provides: uliblock
Conflicts: uliblock
Maintainer: UliBlock Contributors <https://github.com/123asxcqasdc/uliblock>
Homepage: https://github.com/123asxcqasdc/uliblock
Description: Lightweight installer and launcher for UliBlock
 UliBlock is a lightweight open-source Scratch/TurboWarp editor fork with an
 integrated community extensions gallery, offline disk cache, and PenguinMod-Paint.
 .
 This lightweight installer package sets up desktop integration, icons, and
 .sb3/.sb2/.sb MIME associations, and downloads the full UliBlock runtime from
 GitHub Releases into /opt/uliblock (or ~/.local/share/uliblock on first launch).
EOF

cat > "${PKG_ROOT}/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
if command -v update-mime-database >/dev/null 2>&1; then
  update-mime-database /usr/share/mime || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

if [ "$1" = "configure" ] && [ "${ULIBLOCK_SKIP_DOWNLOAD:-0}" != "1" ]; then
  echo "UliBlock: downloading runtime from GitHub Releases into /opt/uliblock..."
  if ! /usr/bin/uliblock --download-only /opt/uliblock; then
    echo "UliBlock: online download skipped (will download automatically on first launch)."
  fi
fi

exit 0
EOF
chmod 0755 "${PKG_ROOT}/DEBIAN/postinst"

cat > "${PKG_ROOT}/DEBIAN/postrm" <<'EOF'
#!/bin/sh
set -e

if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
  rm -rf /opt/uliblock
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
if command -v update-mime-database >/dev/null 2>&1; then
  update-mime-database /usr/share/mime || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

exit 0
EOF
chmod 0755 "${PKG_ROOT}/DEBIAN/postrm"

mkdir -p "${ROOT_DIR}/dist"
OUT_FILE="${ROOT_DIR}/dist/UliBlock-Installer-linux-${OUT_ARCH}-${VERSION}.deb"
dpkg-deb --root-owner-group --build "${PKG_ROOT}" "${OUT_FILE}"

echo "Built lightweight .deb installer: ${OUT_FILE} ($(du -h "${OUT_FILE}" | awk '{print $1}'))"
