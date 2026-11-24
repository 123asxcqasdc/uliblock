#!/usr/bin/env python3
"""
UliBlock .deb Online Installer (packaged as a lightweight AppImage).

Downloads the official UliBlock .deb package from GitHub Releases and installs it
via pkexec apt-get install (with dpkg + apt-get -f fallback), displaying a native
GTK3 graphical installer wizard (falling back to zenity / kdialog / terminal).
"""

import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

REPO = os.environ.get("ULIBLOCK_REPO", "123asxcqasdc/uliblock")
DEFAULT_VERSION = "__ULIBLOCK_VERSION__"
if DEFAULT_VERSION == "__ULIBLOCK_VERSION__" or not DEFAULT_VERSION:
    DEFAULT_VERSION = "1.0.0"

HERE = os.path.dirname(os.path.abspath(__file__))
ICON_CANDIDATES = [
    os.path.join(HERE, "..", "..", "ru.c6t.uli.uliblock.png"),
    os.path.join(HERE, "..", "..", "ru.c6t.uli.uliblock.svg"),
    os.path.join(HERE, "..", "share", "icons", "hicolor", "512x512", "apps", "ru.c6t.uli.uliblock.png"),
]


def find_icon_path():
    for path in ICON_CANDIDATES:
        real = os.path.realpath(path)
        if os.path.isfile(real):
            return real
    return None


def detect_arch():
    machine = platform.machine().lower()
    if machine in ("x86_64", "amd64"):
        return "amd64", ("amd64", "x64")
    if machine in ("aarch64", "arm64"):
        return "arm64", ("arm64", "aarch64")
    raise RuntimeError(f"Неподдерживаемая архитектура процессора: {machine}")


def get_installed_version():
    try:
        out = subprocess.check_output(
            ["dpkg-query", "-W", "-f=${Status}\t${Version}", "uliblock"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        if "install ok installed" in out:
            parts = out.split("\t")
            return parts[1] if len(parts) > 1 else "установлен"
    except Exception:
        pass
    return None


def fetch_json(url, timeout=20):
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": f"UliBlock-Deb-Installer/{DEFAULT_VERSION}",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def resolve_deb_release(preferred_tag=None):
    """
    Returns dict: {tag, name, url, size, release_url}.
    Queries GitHub Releases API (latest first, or preferred tag if specified).
    """
    deb_arch, arch_aliases = detect_arch()
    arch_regex = "|".join(re.escape(a) for a in arch_aliases)
    pattern = re.compile(rf"UliBlock.*(?:{arch_regex}).*\.deb$", re.IGNORECASE)

    endpoints = []
    if preferred_tag:
        tag = preferred_tag if preferred_tag.startswith("v") else f"v{preferred_tag}"
        endpoints.append(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}")
    endpoints.append(f"https://api.github.com/repos/{REPO}/releases/latest")
    endpoints.append(f"https://api.github.com/repos/{REPO}/releases?per_page=10")

    last_err = None
    for url in endpoints:
        try:
            data = fetch_json(url)
            releases = data if isinstance(data, list) else [data]
            for rel in releases:
                assets = rel.get("assets") or []
                for asset in assets:
                    name = asset.get("name", "")
                    if pattern.search(name):
                        return {
                            "tag": rel.get("tag_name") or f"v{DEFAULT_VERSION}",
                            "name": name,
                            "url": asset["browser_download_url"],
                            "size": int(asset.get("size") or 0),
                            "release_url": rel.get("html_url") or f"https://github.com/{REPO}/releases",
                        }
        except Exception as exc:
            last_err = exc

    # Direct URL fallback via /releases/latest redirect (zero GitHub API rate limit!)
    candidate_tags = []
    if preferred_tag:
        candidate_tags.append(preferred_tag if preferred_tag.startswith("v") else f"v{preferred_tag}")
    else:
        try:
            req = urllib.request.Request(
                f"https://github.com/{REPO}/releases/latest",
                method="HEAD",
                headers={"User-Agent": f"UliBlock-Deb-Installer/{DEFAULT_VERSION}"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                final_url = resp.geturl()
                m = re.search(r"/releases/tag/([^/?#]+)", final_url)
                if m:
                    candidate_tags.append(m.group(1))
        except Exception as exc:
            last_err = exc
    default_tag = f"v{DEFAULT_VERSION.lstrip('v')}"
    if default_tag not in candidate_tags:
        candidate_tags.append(default_tag)

    for tag in candidate_tags:
        ver = tag.lstrip("v")
        for alias in arch_aliases:
            candidate_name = f"UliBlock-linux-{alias}-{ver}.deb"
            candidate_url = f"https://github.com/{REPO}/releases/download/{tag}/{candidate_name}"
            try:
                req = urllib.request.Request(
                    candidate_url,
                    method="HEAD",
                    headers={"User-Agent": f"UliBlock-Deb-Installer/{ver}"},
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    size = int(resp.headers.get("Content-Length") or 0)
                    return {
                        "tag": tag,
                        "name": candidate_name,
                        "url": candidate_url,
                        "size": size,
                        "release_url": f"https://github.com/{REPO}/releases/tag/{tag}",
                    }
            except Exception as exc:
                last_err = exc

    raise RuntimeError(
        f"Не удалось найти .deb пакет UliBlock для архитектуры {deb_arch} в репозитории {REPO}.\n"
        f"Проверьте подключение к интернету и наличие релиза на GitHub.\n"
        f"Детали: {last_err}"
    )


def download_deb(url, dest_path, expected_size=0, progress_cb=None, cancel_event=None):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": f"UliBlock-Deb-Installer/{DEFAULT_VERSION}"},
    )
    tmp_path = dest_path + ".part"
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    start_ts = time.monotonic()
    downloaded = 0
    chunk_size = 128 * 1024

    with urllib.request.urlopen(req, timeout=30) as resp:
        total = int(resp.headers.get("Content-Length") or expected_size or 0)
        with open(tmp_path, "wb") as fp:
            while True:
                if cancel_event and cancel_event.is_set():
                    fp.close()
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
                    raise InterruptedError("Загрузка отменена пользователем.")
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                fp.write(chunk)
                downloaded += len(chunk)
                if progress_cb:
                    elapsed = max(time.monotonic() - start_ts, 0.05)
                    speed = downloaded / elapsed
                    progress_cb(downloaded, total, speed)

    if not os.path.isfile(tmp_path) or os.path.getsize(tmp_path) < 1024:
        raise RuntimeError("Скачанный .deb файл пуст или повреждён.")

    # Verify it is a real Debian archive (ar magic header)
    with open(tmp_path, "rb") as fp:
        magic = fp.read(8)
    if magic != b"!<arch>\n":
        os.remove(tmp_path)
        raise RuntimeError("Скачанный файл не является корректным .deb пакетом.")

    os.replace(tmp_path, dest_path)


def install_deb_package(deb_path, log_cb=None):
    """
    Installs the downloaded .deb package with root privileges using pkexec (polkit GUI)
    or sudo if running in a terminal without polkit.
    Uses `apt-get install -y <deb_path>` so dependencies are automatically resolved.
    """
    os.chmod(deb_path, 0o644)
    parent_dir = os.path.dirname(deb_path)
    try:
        os.chmod(parent_dir, 0o755)
    except OSError:
        pass

    install_script = (
        'set -e; '
        'export DEBIAN_FRONTEND=noninteractive; '
        'if command -v apt-get >/dev/null 2>&1; then '
        '  apt-get install -y --allow-downgrades "$1" || (dpkg -i "$1" && apt-get install -f -y); '
        'else '
        '  dpkg -i "$1"; '
        'fi'
    )

    if os.geteuid() == 0:
        cmd = ["sh", "-c", install_script, "_", deb_path]
    elif shutil.which("pkexec"):
        cmd = ["pkexec", "sh", "-c", install_script, "_", deb_path]
    elif shutil.which("sudo"):
        cmd = ["sudo", "sh", "-c", install_script, "_", deb_path]
    else:
        raise RuntimeError(
            "Не найден pkexec или sudo для установки .deb пакета.\n"
            f"Вы можете установить скачанный пакет вручную:\nsudo apt install {deb_path}"
        )

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    output_lines = []
    assert proc.stdout is not None
    for line in proc.stdout:
        clean = line.rstrip()
        if clean:
            output_lines.append(clean)
            if log_cb:
                log_cb(clean)

    code = proc.wait()
    if code == 126 or code == 127:
        raise InterruptedError("Установка отменена (отказано в правах администратора).")
    if code != 0:
        tail = "\n".join(output_lines[-12:])
        raise RuntimeError(f"Ошибка установки пакета (код {code}):\n{tail}")


def launch_uliblock():
    candidates = [
        shutil.which("uliblock"),
        "/opt/UliBlock/uliblock",
        "/usr/bin/uliblock",
    ]
    for path in candidates:
        if path and os.access(path, os.X_OK):
            subprocess.Popen(
                [path],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return True
    return False


def format_mb(num_bytes):
    return f"{num_bytes / (1024 * 1024):.1f} МБ"


def wait_for_pid_exit(pid, timeout=6.0):
    """Waits briefly for a parent UliBlock process to exit before installing."""
    if not pid or pid <= 0:
        return
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        except PermissionError:
            return
        except Exception:
            return
        time.sleep(0.2)


def run_gtk_gui(preferred_tag=None, auto_install=False, wait_pid=None):
    import gi

    gi.require_version("Gtk", "3.0")
    from gi.repository import Gdk, GdkPixbuf, GLib, Gtk

    css = b"""
    window {
        background-color: #f6faf6;
    }
    .uli-header {
        background-color: #1f9d2e;
        color: #ffffff;
        padding: 18px 20px;
    }
    .uli-title {
        font-size: 20px;
        font-weight: 800;
        color: #ffffff;
    }
    .uli-subtitle {
        font-size: 13px;
        color: #e4fbe6;
    }
    .uli-card {
        background-color: #ffffff;
        border: 1px solid #d4e8d6;
        border-radius: 10px;
        padding: 14px 16px;
    }
    button.uli-primary,
    .uli-primary {
        background-image: none;
        background-color: #22a630;
        border: 1px solid #177421;
        color: #ffffff;
        font-weight: 700;
        padding: 8px 18px;
        border-radius: 8px;
        text-shadow: none;
        box-shadow: none;
    }
    button.uli-primary label,
    .uli-primary label,
    button.uli-primary:hover label,
    button.uli-primary:active label,
    button.uli-primary:focus label {
        color: #ffffff;
        text-shadow: none;
    }
    button.uli-primary:hover,
    .uli-primary:hover {
        background-image: none;
        background-color: #1b8c27;
        border-color: #14631c;
        color: #ffffff;
    }
    button.uli-primary:active,
    .uli-primary:active {
        background-image: none;
        background-color: #177421;
        color: #ffffff;
    }
    button.uli-primary:disabled,
    .uli-primary:disabled {
        background-image: none;
        background-color: #7cc984;
        border-color: #6ab972;
        color: #f3fff4;
    }
    button.uli-primary:disabled label,
    .uli-primary:disabled label {
        color: #f3fff4;
    }
    .uli-log {
        font-family: monospace;
        font-size: 11px;
    }
    """
    provider = Gtk.CssProvider()
    provider.load_from_data(css)
    Gtk.StyleContext.add_provider_for_screen(
        Gdk.Screen.get_default(),
        provider,
        Gtk.STYLE_PROVIDER_PRIORITY_USER,
    )

    class InstallerWindow(Gtk.Window):
        def __init__(self):
            super().__init__(title="Установщик UliBlock (.deb)")
            self.set_default_size(520, 420)
            self.set_position(Gtk.WindowPosition.CENTER)
            self.set_resizable(False)

            icon_path = find_icon_path()
            if icon_path:
                try:
                    self.set_icon_from_file(icon_path)
                except Exception:
                    pass

            self.release_info = None
            self.cancel_event = threading.Event()
            self.busy = False
            self.installed_ok = False
            self.temp_dir = tempfile.mkdtemp(prefix="uliblock-installer-")

            root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
            self.add(root)

            # Header banner
            header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=14)
            header.get_style_context().add_class("uli-header")
            if icon_path:
                try:
                    pix = GdkPixbuf.Pixbuf.new_from_file_at_scale(icon_path, 52, 52, True)
                    img = Gtk.Image.new_from_pixbuf(pix)
                    header.pack_start(img, False, False, 0)
                except Exception:
                    pass

            title_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=3)
            title_lbl = Gtk.Label(label="Установщик UliBlock")
            title_lbl.set_halign(Gtk.Align.START)
            title_lbl.get_style_context().add_class("uli-title")
            sub_lbl = Gtk.Label(label="Загрузка и установка официального .deb пакета в систему")
            sub_lbl.set_halign(Gtk.Align.START)
            sub_lbl.get_style_context().add_class("uli-subtitle")
            title_box.pack_start(title_lbl, False, False, 0)
            title_box.pack_start(sub_lbl, False, False, 0)
            header.pack_start(title_box, True, True, 0)
            root.pack_start(header, False, False, 0)

            # Body
            body = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
            body.set_margin_top(16)
            body.set_margin_bottom(16)
            body.set_margin_start(18)
            body.set_margin_end(18)
            root.pack_start(body, True, True, 0)

            info_card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
            info_card.get_style_context().add_class("uli-card")
            self.info_label = Gtk.Label(label="Поиск последнего релиза UliBlock на GitHub...")
            self.info_label.set_halign(Gtk.Align.START)
            self.info_label.set_line_wrap(True)
            self.info_label.set_xalign(0.0)
            info_card.pack_start(self.info_label, False, False, 0)
            body.pack_start(info_card, False, False, 0)

            self.status_label = Gtk.Label(label="Подготовка...")
            self.status_label.set_halign(Gtk.Align.START)
            self.status_label.set_line_wrap(True)
            self.status_label.set_xalign(0.0)
            body.pack_start(self.status_label, False, False, 0)

            self.progress = Gtk.ProgressBar()
            self.progress.set_show_text(True)
            self.progress.set_text("Ожидание...")
            body.pack_start(self.progress, False, False, 0)

            # Expandable log area
            self.expander = Gtk.Expander(label="Подробности установки")
            scroll = Gtk.ScrolledWindow()
            scroll.set_min_content_height(110)
            scroll.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
            self.log_view = Gtk.TextView()
            self.log_view.set_editable(False)
            self.log_view.set_wrap_mode(Gtk.WrapMode.WORD_CHAR)
            self.log_view.get_style_context().add_class("uli-log")
            self.log_buf = self.log_view.get_buffer()
            scroll.add(self.log_view)
            self.expander.add(scroll)
            body.pack_start(self.expander, True, True, 0)

            # Action buttons
            btn_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
            btn_box.set_halign(Gtk.Align.END)

            self.cancel_btn = Gtk.Button(label="Закрыть")
            self.cancel_btn.connect("clicked", self.on_cancel_clicked)
            btn_box.pack_start(self.cancel_btn, False, False, 0)

            self.action_btn = Gtk.Button(label="Установить UliBlock")
            self.action_btn.get_style_context().add_class("uli-primary")
            self.action_btn.set_sensitive(False)
            self.action_btn.connect("clicked", self.on_action_clicked)
            btn_box.pack_start(self.action_btn, False, False, 0)

            body.pack_end(btn_box, False, False, 0)

            self.connect("destroy", self.on_destroy)
            threading.Thread(target=self.load_release_info, daemon=True).start()

        def append_log(self, text):
            def _do():
                end_iter = self.log_buf.get_end_iter()
                self.log_buf.insert(end_iter, text + "\n")
                mark = self.log_buf.create_mark(None, self.log_buf.get_end_iter(), False)
                self.log_view.scroll_to_mark(mark, 0.0, True, 0.0, 1.0)
                return False

            GLib.idle_add(_do)

        def load_release_info(self):
            try:
                deb_arch, _ = detect_arch()
                installed = get_installed_version()
                info = resolve_deb_release(preferred_tag)
                self.release_info = info

                size_text = format_mb(info["size"]) if info["size"] else "размер уточняется"
                lines = [
                    f"<b>Версия для установки:</b> UliBlock {info['tag']} ({deb_arch})",
                    f"<b>Пакет:</b> {info['name']} ({size_text})",
                    f"<b>Источник:</b> GitHub Releases ({REPO})",
                ]
                if installed:
                    lines.append(f"<b>Установлено сейчас:</b> {installed}")

                def _ready():
                    self.info_label.set_markup("\n".join(lines))
                    target_ver = info["tag"].lstrip("v")
                    if installed and installed != target_ver:
                        btn_text = f"Обновить до {info['tag']}"
                    elif installed:
                        btn_text = f"Переустановить {info['tag']}"
                    else:
                        btn_text = "Установить UliBlock"
                    self.action_btn.set_label(btn_text)
                    if auto_install:
                        self.status_label.set_text(
                            f"Автообновление до UliBlock {info['tag']} — начинается загрузка..."
                        )
                        self.progress.set_text("Запуск автообновления...")
                        self.start_install()
                    else:
                        self.status_label.set_text(
                            "Нажмите кнопку ниже, чтобы скачать .deb пакет и установить UliBlock в систему."
                        )
                        self.progress.set_text("Готово к установке")
                        self.action_btn.set_sensitive(True)
                    return False

                GLib.idle_add(_ready)
            except Exception as exc:
                def _err():
                    self.info_label.set_markup(
                        f"<b>Ошибка получения информации о релизе:</b>\n{GLib.markup_escape_text(str(exc))}"
                    )
                    self.status_label.set_text("Проверьте подключение к интернету и повторите попытку.")
                    self.progress.set_text("Ошибка")
                    self.action_btn.set_label("Повторить")
                    self.action_btn.set_sensitive(True)
                    return False

                GLib.idle_add(_err)

        def start_install(self):
            if self.busy or self.release_info is None:
                return
            self.busy = True
            self.cancel_event.clear()
            self.action_btn.set_sensitive(False)
            self.cancel_btn.set_label("Отмена")
            threading.Thread(target=self.run_install_worker, daemon=True).start()

        def on_action_clicked(self, _button):
            if self.installed_ok:
                launch_uliblock()
                self.close()
                return
            if self.release_info is None:
                self.action_btn.set_sensitive(False)
                self.status_label.set_text("Повторный поиск релиза...")
                threading.Thread(target=self.load_release_info, daemon=True).start()
                return
            self.start_install()

        def run_install_worker(self):
            info = self.release_info
            deb_path = os.path.join(self.temp_dir, info["name"])
            pulse_id = None

            def stop_pulse():
                nonlocal pulse_id
                if pulse_id is not None:
                    GLib.source_remove(pulse_id)
                    pulse_id = None

            try:
                GLib.idle_add(self.status_label.set_text, f"Шаг 1/2: Загрузка {info['name']}...")
                self.append_log(f"Загрузка: {info['url']}")

                def on_progress(done, total, speed):
                    if total > 0:
                        frac = min(max(done / total, 0.0), 1.0)
                        txt = f"{int(frac * 100)}% — {format_mb(done)} / {format_mb(total)} ({format_mb(speed)}/с)"
                        GLib.idle_add(self.progress.set_fraction, frac)
                        GLib.idle_add(self.progress.set_text, txt)
                    else:
                        GLib.idle_add(self.progress.pulse)
                        GLib.idle_add(self.progress.set_text, f"Загружено {format_mb(done)}")

                download_deb(
                    info["url"],
                    deb_path,
                    expected_size=info["size"],
                    progress_cb=on_progress,
                    cancel_event=self.cancel_event,
                )

                self.append_log(f"Пакет загружен: {deb_path}")

                if wait_pid:
                    wait_for_pid_exit(wait_pid)

                def _start_install_ui():
                    nonlocal pulse_id
                    self.status_label.set_text(
                        "Шаг 2/2: Установка .deb пакета (введите пароль администратора в системном окне)..."
                    )
                    self.progress.set_text("Установка пакета в систему...")
                    self.expander.set_expanded(True)
                    self.cancel_btn.set_sensitive(False)
                    pulse_id = GLib.timeout_add(120, lambda: (self.progress.pulse(), True)[1])
                    return False

                GLib.idle_add(_start_install_ui)

                install_deb_package(deb_path, log_cb=self.append_log)

                def _done():
                    stop_pulse()
                    self.busy = False
                    self.installed_ok = True
                    self.progress.set_fraction(1.0)
                    self.progress.set_text("Установка завершена!")
                    self.status_label.set_markup(
                        f"<b>UliBlock {GLib.markup_escape_text(info['tag'])} успешно установлен!</b>\n"
                        "Ярлык добавлен в меню приложений, ассоциации .sb3/.sb2/.sb настроены."
                    )
                    self.action_btn.set_label("Запустить UliBlock")
                    self.action_btn.set_sensitive(True)
                    self.cancel_btn.set_label("Закрыть")
                    self.cancel_btn.set_sensitive(True)
                    if auto_install:
                        self.status_label.set_markup(
                            f"<b>UliBlock {GLib.markup_escape_text(info['tag'])} успешно обновлён!</b>\n"
                            "Запуск обновлённого редактора..."
                        )
                        def _auto_launch():
                            launch_uliblock()
                            self.close()
                            return False
                        GLib.timeout_add(900, _auto_launch)
                    return False

                GLib.idle_add(_done)
            except InterruptedError as exc:
                def _cancelled():
                    stop_pulse()
                    self.busy = False
                    self.progress.set_fraction(0.0)
                    self.progress.set_text("Отменено")
                    self.status_label.set_text(str(exc))
                    self.action_btn.set_sensitive(True)
                    self.cancel_btn.set_label("Закрыть")
                    self.cancel_btn.set_sensitive(True)
                    return False

                GLib.idle_add(_cancelled)
            except Exception as exc:
                self.append_log(f"ОШИБКА: {exc}")

                def _failed():
                    stop_pulse()
                    self.busy = False
                    self.progress.set_fraction(0.0)
                    self.progress.set_text("Ошибка установки")
                    self.status_label.set_markup(
                        f"<b>Ошибка:</b> {GLib.markup_escape_text(str(exc))}"
                    )
                    self.expander.set_expanded(True)
                    self.action_btn.set_label("Повторить установку")
                    self.action_btn.set_sensitive(True)
                    self.cancel_btn.set_label("Закрыть")
                    self.cancel_btn.set_sensitive(True)
                    return False

                GLib.idle_add(_failed)

        def on_cancel_clicked(self, _button):
            if self.busy:
                self.cancel_event.set()
            else:
                self.close()

        def on_destroy(self, _widget):
            self.cancel_event.set()
            shutil.rmtree(self.temp_dir, ignore_errors=True)
            Gtk.main_quit()

    win = InstallerWindow()
    win.show_all()
    Gtk.main()


def run_cli_or_zenity(preferred_tag=None, auto_install=False, wait_pid=None):
    has_gui = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
    use_zenity = has_gui and bool(shutil.which("zenity"))

    def notify_error(msg):
        print(f"Ошибка: {msg}", file=sys.stderr)
        if use_zenity:
            subprocess.run(
                ["zenity", "--error", "--title=Установщик UliBlock", f"--text={msg}", "--width=440"],
                stderr=subprocess.DEVNULL,
            )

    try:
        info = resolve_deb_release(preferred_tag)
    except Exception as exc:
        notify_error(str(exc))
        sys.exit(1)

    if use_zenity and not auto_install:
        ans = subprocess.run(
            [
                "zenity",
                "--question",
                "--title=Установщик UliBlock",
                f"--text=Загрузить и установить {info['name']} ({format_mb(info['size']) if info['size'] else ''}) в систему?",
                "--ok-label=Установить",
                "--cancel-label=Отмена",
                "--width=440",
            ],
            stderr=subprocess.DEVNULL,
        )
        if ans.returncode != 0:
            sys.exit(0)

    temp_dir = tempfile.mkdtemp(prefix="uliblock-installer-")
    try:
        deb_path = os.path.join(temp_dir, info["name"])
        print(f"Загрузка {info['name']} ({info['url']})...")

        if use_zenity:
            zproc = subprocess.Popen(
                [
                    "zenity",
                    "--progress",
                    "--title=Установщик UliBlock",
                    f"--text=Загрузка {info['name']}...",
                    "--percentage=0",
                    "--auto-close",
                    "--width=440",
                ],
                stdin=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
            )
            cancel_ev = threading.Event()

            def zprog(done, total, speed):
                if zproc.poll() is not None:
                    cancel_ev.set()
                    return
                if total > 0:
                    pct = int(done * 100 / total)
                    try:
                        zproc.stdin.write(f"{pct}\n# Загрузка {info['name']}: {format_mb(done)} / {format_mb(total)} ({format_mb(speed)}/с)\n")
                        zproc.stdin.flush()
                    except Exception:
                        pass

            download_deb(info["url"], deb_path, info["size"], progress_cb=zprog, cancel_event=cancel_ev)
            try:
                zproc.stdin.write("100\n")
                zproc.stdin.close()
            except Exception:
                pass
            zproc.wait()
        else:
            def cprog(done, total, speed):
                if total > 0:
                    pct = done * 100.0 / total
                    sys.stdout.write(f"\rЗагрузка: {pct:5.1f}% ({format_mb(done)} / {format_mb(total)}, {format_mb(speed)}/с)")
                else:
                    sys.stdout.write(f"\rЗагружено: {format_mb(done)}")
                sys.stdout.flush()

            download_deb(info["url"], deb_path, info["size"], progress_cb=cprog)
            print()

        if wait_pid:
            wait_for_pid_exit(wait_pid)

        print("Установка .deb пакета (может потребоваться пароль администратора)...")
        install_deb_package(deb_path, log_cb=print)

        msg = f"UliBlock {info['tag']} успешно установлен!"
        print(msg)
        if auto_install:
            launch_uliblock()
        elif use_zenity:
            res = subprocess.run(
                [
                    "zenity",
                    "--question",
                    "--title=Установщик UliBlock",
                    f"--text={msg}\nЗапустить UliBlock сейчас?",
                    "--ok-label=Запустить",
                    "--cancel-label=Закрыть",
                    "--width=420",
                ],
                stderr=subprocess.DEVNULL,
            )
            if res.returncode == 0:
                launch_uliblock()
    except Exception as exc:
        notify_error(str(exc))
        sys.exit(1)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def main():
    args = sys.argv[1:]
    preferred_tag = None
    force_cli = False
    auto_install = False
    wait_pid = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg in ("--version", "-v"):
            deb_arch, _ = detect_arch()
            print(f"UliBlock .deb Installer v{DEFAULT_VERSION} ({deb_arch})")
            return
        if arg == "--cli":
            force_cli = True
        elif arg in ("--auto", "--auto-update"):
            auto_install = True
        elif arg == "--tag" and i + 1 < len(args):
            i += 1
            preferred_tag = args[i]
        elif arg == "--wait-pid" and i + 1 < len(args):
            i += 1
            try:
                wait_pid = int(args[i])
            except ValueError:
                wait_pid = None
        i += 1

    has_display = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
    if has_display and not force_cli:
        try:
            run_gtk_gui(preferred_tag=preferred_tag, auto_install=auto_install, wait_pid=wait_pid)
            return
        except Exception as exc:
            print(f"GTK3 недоступен ({exc}), переключение на zenity/CLI...", file=sys.stderr)

    run_cli_or_zenity(preferred_tag=preferred_tag, auto_install=auto_install, wait_pid=wait_pid)


if __name__ == "__main__":
    main()
