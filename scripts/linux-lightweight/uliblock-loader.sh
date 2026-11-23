#!/usr/bin/env bash
set -euo pipefail

# UliBlock Lightweight Loader / Downloader
# Downloads and caches the full UliBlock AppImage from GitHub Releases on first run,
# then launches UliBlock offline on all subsequent runs.

ULIBLOCK_REPO="${ULIBLOCK_REPO:-123asxcqasdc/uliblock}"
ULIBLOCK_VERSION="${ULIBLOCK_VERSION:-__ULIBLOCK_VERSION__}"
if [[ "$ULIBLOCK_VERSION" == "__ULIBLOCK_VERSION__" || -z "$ULIBLOCK_VERSION" ]]; then
  ULIBLOCK_VERSION="1.0.0"
fi
ULIBLOCK_TAG="v${ULIBLOCK_VERSION#v}"

SYSTEM_DIR="/opt/uliblock"
USER_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/uliblock"

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *)
      echo "Unsupported architecture: $(uname -m)" >&2
      return 1
      ;;
  esac
}

ARCH="$(detect_arch)"
ASSET_NAME="UliBlock-linux-${ARCH}-${ULIBLOCK_VERSION#v}.AppImage"
PRIMARY_URL="https://github.com/${ULIBLOCK_REPO}/releases/download/${ULIBLOCK_TAG}/${ASSET_NAME}"

has_gui() {
  [[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]]
}

gui_tool() {
  if ! has_gui; then
    echo "none"
    return
  fi
  if command -v zenity >/dev/null 2>&1; then
    echo "zenity"
  elif command -v kdialog >/dev/null 2>&1; then
    echo "kdialog"
  else
    echo "none"
  fi
}

show_error() {
  local msg="$1"
  echo "UliBlock Error: $msg" >&2
  case "$(gui_tool)" in
    zenity)
      zenity --error --title="UliBlock — Ошибка" --text="$msg" --width=420 2>/dev/null || true
      ;;
    kdialog)
      kdialog --title "UliBlock — Ошибка" --error "$msg" 2>/dev/null || true
      ;;
  esac
}

show_info() {
  local msg="$1"
  echo "$msg"
  case "$(gui_tool)" in
    zenity)
      zenity --info --title="UliBlock" --text="$msg" --width=420 2>/dev/null || true
      ;;
    kdialog)
      kdialog --title "UliBlock" --msgbox "$msg" 2>/dev/null || true
      ;;
  esac
}

resolve_download_url() {
  # Check if pinned release asset exists; otherwise fall back to latest GitHub release.
  if command -v curl >/dev/null 2>&1; then
    if curl -fsIL --connect-timeout 10 --max-time 20 "$PRIMARY_URL" >/dev/null 2>&1; then
      echo "$PRIMARY_URL"
      return 0
    fi
    local api_json url
    api_json="$(curl -fsSL --connect-timeout 10 --max-time 20 \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${ULIBLOCK_REPO}/releases/latest" 2>/dev/null || true)"
    if [[ -n "$api_json" ]]; then
      url="$(printf '%s' "$api_json" | grep -oE "https://github\.com/${ULIBLOCK_REPO}/releases/download/[^\"]+UliBlock-linux-${ARCH}-[0-9][^\"]*\.AppImage" | head -n 1 || true)"
      if [[ -n "$url" ]]; then
        echo "$url"
        return 0
      fi
    fi
  fi
  echo "$PRIMARY_URL"
}

download_file() {
  local url="$1"
  local dest="$2"
  local tmp="${dest}.part"
  rm -f "$tmp"
  mkdir -p "$(dirname "$dest")"

  local tool
  tool="$(gui_tool)"

  if [[ "$tool" == "zenity" ]] && command -v curl >/dev/null 2>&1; then
    # Stream curl progress percentage into zenity progress bar
    set +e
    (
      curl -fL --retry 3 --retry-delay 2 --connect-timeout 15 --progress-bar "$url" -o "$tmp" 2>&1 \
        | stdbuf -oL tr '\r' '\n' \
        | sed -un 's/.*[^0-9]\([0-9]\{1,3\}\)\.[0-9]%.*/\1/p'
      echo "100"
    ) | zenity --progress \
        --title="UliBlock — Загрузка" \
        --text="Загрузка UliBlock ${ULIBLOCK_TAG} (${ARCH}) с GitHub Releases...\nПодождите, после загрузки редактор будет работать офлайн." \
        --percentage=0 \
        --auto-close \
        --width=460 2>/dev/null
    local pipe_statuses=("${PIPESTATUS[@]}")
    set -e
    if [[ "${pipe_statuses[1]:-1}" -ne 0 ]] || [[ ! -s "$tmp" ]]; then
      rm -f "$tmp"
      return 1
    fi
  elif [[ "$tool" == "kdialog" ]] && command -v curl >/dev/null 2>&1; then
    local dbus_ref
    dbus_ref="$(kdialog --title "UliBlock — Загрузка" --progressbar "Загрузка UliBlock ${ULIBLOCK_TAG} (${ARCH}) с GitHub Releases..." 0 2>/dev/null || true)"
    if ! curl -fL --retry 3 --retry-delay 2 --connect-timeout 15 "$url" -o "$tmp"; then
      [[ -n "$dbus_ref" ]] && qdbus $dbus_ref close 2>/dev/null || true
      rm -f "$tmp"
      return 1
    fi
    [[ -n "$dbus_ref" ]] && qdbus $dbus_ref close 2>/dev/null || true
  else
    echo "Загрузка UliBlock ${ULIBLOCK_TAG} (${ARCH}): ${url}"
    if command -v curl >/dev/null 2>&1; then
      curl -fL --retry 3 --retry-delay 2 --connect-timeout 15 -# "$url" -o "$tmp" || { rm -f "$tmp"; return 1; }
    elif command -v wget >/dev/null 2>&1; then
      wget -O "$tmp" "$url" || { rm -f "$tmp"; return 1; }
    else
      show_error "Для загрузки UliBlock требуется curl или wget."
      return 1
    fi
  fi

  chmod +x "$tmp"
  mv -f "$tmp" "$dest"
  return 0
}

has_fuse2() {
  if command -v ldconfig >/dev/null 2>&1 && ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
    return 0
  fi
  for p in /lib/x86_64-linux-gnu/libfuse.so.2 /usr/lib/x86_64-linux-gnu/libfuse.so.2 /lib/aarch64-linux-gnu/libfuse.so.2 /usr/lib/libfuse.so.2 /usr/lib64/libfuse.so.2; do
    if [[ -e "$p" ]]; then
      return 0
    fi
  done
  return 1
}

launch_appimage() {
  local appimage="$1"
  shift || true
  local base_dir
  base_dir="$(dirname "$appimage")"
  local extracted_run="${base_dir}/squashfs-root/AppRun"

  if has_fuse2; then
    exec "$appimage" "$@"
  fi

  # Fallback when libfuse2 is missing (e.g., Ubuntu 22.04/24.04+):
  # extract once if writable for fast startup, otherwise use APPIMAGE_EXTRACT_AND_RUN=1.
  if [[ -x "$extracted_run" ]]; then
    exec "$extracted_run" "$@"
  fi

  if [[ -w "$base_dir" ]]; then
    (
      cd "$base_dir"
      rm -rf squashfs-root
      "$appimage" --appimage-extract >/dev/null 2>&1
    ) && [[ -x "$extracted_run" ]] && exec "$extracted_run" "$@"
  fi

  export APPIMAGE_EXTRACT_AND_RUN=1
  exec "$appimage" "$@"
}

find_installed_appimage() {
  if [[ -x "${USER_DIR}/UliBlock.AppImage" ]]; then
    echo "${USER_DIR}/UliBlock.AppImage"
    return 0
  fi
  if [[ -x "${SYSTEM_DIR}/UliBlock.AppImage" ]]; then
    echo "${SYSTEM_DIR}/UliBlock.AppImage"
    return 0
  fi
  return 1
}

install_or_update() {
  local target_dir="${1:-$USER_DIR}"
  local target_file="${target_dir}/UliBlock.AppImage"
  local url
  url="$(resolve_download_url)"

  if ! download_file "$url" "$target_file"; then
    show_error "Не удалось скачать UliBlock с GitHub Releases.\nПроверьте подключение к интернету и повторите попытку.\n\nURL: ${url}"
    exit 1
  fi

  rm -rf "${target_dir}/squashfs-root"
  printf '%s\n' "${ULIBLOCK_TAG}" > "${target_dir}/version.txt"
}

main() {
  case "${1:-}" in
    --loader-version)
      echo "UliBlock Loader ${ULIBLOCK_TAG} (${ARCH})"
      if installed="$(find_installed_appimage)"; then
        echo "Cached binary: ${installed}"
      else
        echo "Cached binary: not downloaded yet"
      fi
      exit 0
      ;;
    --update|--reinstall)
      install_or_update "$USER_DIR"
      show_info "UliBlock успешно загружен в ${USER_DIR}/UliBlock.AppImage"
      exit 0
      ;;
    --uninstall-cache)
      rm -rf "$USER_DIR"
      echo "Removed user cache at ${USER_DIR}"
      exit 0
      ;;
    --download-only)
      local dest_dir="${2:-$USER_DIR}"
      install_or_update "$dest_dir"
      exit 0
      ;;
  esac

  local appimage
  if appimage="$(find_installed_appimage)"; then
    launch_appimage "$appimage" "$@"
  fi

  install_or_update "$USER_DIR"
  launch_appimage "${USER_DIR}/UliBlock.AppImage" "$@"
}

main "$@"
