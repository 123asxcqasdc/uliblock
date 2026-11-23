# UliBlock Release Automation

UliBlock supports **Windows (NSIS installer, x64)** and **Linux (AppImage + `.deb`, x64/arm64)**.
macOS, legacy Windows 7/8/8.1, Microsoft Store (`appx`), Snap, Flatpak, and Linux tarballs are intentionally excluded.

## Local Build Prerequisites

```bash
npm ci
npm run fetch
npm run webpack:prod
```

## Packaging Commands

### Linux (`.deb` and `.AppImage`)

```bash
node release-automation/build.mjs --debian --appimage --x64
# Optional ARM64:
node release-automation/build.mjs --debian --appimage --arm64
```

### Windows (NSIS installer)

Run on Windows:

```powershell
node release-automation/build.mjs --windows --x64
```

## GitHub Actions Workflows

- `.github/workflows/build-auto.yml` — Runs on every push and PR (`ubuntu-latest`): builds production bundles and verifies unpacked Electron packaging.
- `.github/workflows/build.yml` — Manual workflow (`workflow_dispatch`): builds Linux (`.deb`, `.AppImage`) and Windows (`UliBlock-Setup-*.exe`) artifacts.
- `.github/workflows/release.yml` — Triggered on `v*` git tags: creates a GitHub Release and uploads Windows NSIS and Linux AppImage/`.deb` packages.
