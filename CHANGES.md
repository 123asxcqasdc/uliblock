# CHANGES.md — Отличия UliBlock от upstream TurboWarp

Этот документ фиксирует все изменения, внесённые в **UliBlock** относительно upstream-версий:
- **`TurboWarp/desktop`**: `v1.17.1` (коммит `ab95d0363de5c8329d286a69e0c7ed1ccf06cf1b`)
- **`TurboWarp/scratch-gui`**: ветка `develop` (коммит `04f927e15076ed8cc38e449b356342e0258c5108`, вендоринг в `packages/scratch-gui`)

История коммитов разбита строго по фазам (`Phase 0` – `Phase 7`) для упрощения аудита и редкой синхронизации багфиксов/крупных обновлений из upstream.

---

## Phase 0 — Инициализация репозитория и брендинг UliBlock

- `src-main/brand.js`: переименован продукт в `UliBlock` (`APP_NAME = 'UliBlock'`, `PACKAGER_NAME = 'UliBlock Packager'`).
- `package.json`: `name: "uliblock"`, `version: "1.0.0"`, `appId: "ru.c6t.uli.uliblock"`, `productName: "UliBlock"`, ссылки `homepage`/`repository`/`bugs` на `https://github.com/123asxcqasdc/uliblock`.
- `art/icon.svg`, `art/icon.png`, `art/rich-presence-icon.png`, `build/512x512.png`, `build/icon.ico`, `build/installerSidebar.bmp`: фирменная зелёная иконка блока UliBlock с белой буквой «U».
- `linux-files/ru.c6t.uli.uliblock.{desktop,mime.xml,metainfo.xml}`: заменены upstream-файлы `org.turbowarp.TurboWarp.*`.
- `src-main/entrypoint.js`, `src-main/menu-bar.js`, `src-renderer/about/about.html`: обновлён бренд, добавлена ссылка на исходный код на GitHub, полная атрибуция upstream-проектов и предупреждение о политике безопасности расширений.

## Phase 1 — Политика безопасности расширений (без подтверждения, `unsandboxed`)

- `src-renderer-webpack/editor/gui/desktop-hoc.jsx`:
  - В `securityManager` переопределены:
    - `canLoadExtensionFromProject: async () => true` — отключает модальное подтверждение при загрузке любых внешних расширений;
    - `getSandboxMode: () => 'unsandboxed'` — запускает все пользовательские расширения без песочницы.
  - Ссылка на исходный код редактора обновлена на `https://github.com/123asxcqasdc/uliblock`.
  - Контракт `TWSecurityManagerComponent` проверен в `packages/scratch-gui/src/containers/tw-security-manager.jsx`.

## Phase 2 — Встроенная галерея расширений сообщества с офлайн-кэшем на диск

- `src-main/extension-cache.js` *(новый файл)*:
  - Управление каталогом `https://123asxcqasdc.github.io/turbowarp-extensions/extensions.json` (482 объединённых / 923 исходных расширения из 12 галерей) и кэшем на диске в `<userData>/uliblock-extensions-cache/` (`index.json`, `cache-manifest.json`, `scripts/<sha256>.js`, `images/<sha256>.<ext>`).
  - Функции кэширования одного расширения, фонового кэширования, массового предкэширования и очистки кэша, а также сопоставление `https://...` URL → локальный кэш.
- `src-main/protocols.js`: зарегистрирован внутренний протокол `uliblock-ext-cache://` для безопасной выдачи кэшированных скриптов расширений и их превью из `<userData>/uliblock-extensions-cache/`.
- `src-main/windows/project-running-window.js`, `src-main/windows/packager.js`:
  - В `onBeforeRequest` наряду с существующим редиректом `https://extensions.turbowarp.org/*` → `tw-extensions://` добавлен прозрачный редирект кэшированных расширений сообщества → `uliblock-ext-cache://`.
  - Внутри `.sb3` всегда сохраняются исходные `https://...` URL; офлайн-работа обеспечена автоматически как в редакторе, так и в Packager.
- `src-main/windows/editor.js`, `src-preload/editor.js`: добавлен IPC-мост `community-gallery:*` (`get-catalog`, `refresh-catalog`, `cache-extension`, `get-cached-urls`, `clear-cache`, `open-external`, и др.).
- `src-renderer-webpack/editor/gui/community-gallery-modal.{jsx,css}` *(новые файлы)* и `src-renderer-webpack/editor/gui/desktop-hoc.jsx`:
  - Полнофункциональное модальное окно галереи сообщества (поиск, 14 категорий, фильтр по 12 исходным галереям, фильтр по кэшированным, сортировка, режимы «Сетка / Компактный», выбор варианта расширения из нескольких галерей, загрузка по URL / из файла / из кода, статус онлайн/офлайн и управление кэшем).
  - **Обязательное отображение автора и исходной галереи** в каждой карточке, в списке вариантов и в подробном окне расширения.
  - Точки входа: пункт в верхнем меню «Расширения» и глобальный вызов `window.__ULIBLOCK_OPEN_COMMUNITY_GALLERY__` из встроенной библиотеки расширений.

## Phase 3 — Монорепозиторий `packages/scratch-gui` и кастомный экран загрузки

- `packages/scratch-gui/`: вендоринг `TurboWarp/scratch-gui` (`04f927e15076ed8cc38e449b356342e0258c5108`) внутрь репозитория (без `.git`, тестов и неиспользуемых медиафайлов туториалов).
- `package.json`, `webpack.config.cjs`:
  - `"scratch-gui": "file:./packages/scratch-gui"`;
  - добавлен `NODE_OPTIONS=--openssl-legacy-provider` в скрипты `webpack:*` для совместимости Webpack 4 с Node 22+;
  - `webpack.config.cjs` разрешает `scratch-gui`, `scratch-gui/src`, `scratch-render-fonts` и high-contrast медиа из `packages/scratch-gui`.
- `packages/scratch-gui/src/lib/brand.js`: `APP_NAME = 'UliBlock'`.
- `packages/scratch-gui/src/components/loader/{uliblock-logo.svg,loader.jsx,loader.css}` и `src-renderer-webpack/editor/gui/gui.html`: кастомная зелёная анимация запуска приложения и загрузки проектов в стиле UliBlock.
- `packages/scratch-gui/src/lib/libraries/extensions/index.jsx`, `packages/scratch-gui/src/containers/extension-library.jsx`: добавлена карточка `🐌 Галерея сообщества UliBlock` в начало библиотеки расширений (все встроенные Scratch и официальные TurboWarp расширения сохранены без изменений).

## Phase 4 — Удаление встроенной библиотеки ассетов

- `scripts/library-files.json`: очищен до `[]` (скрипт `scripts/download-library-files.mjs` создаёт пустую папку `dist-library-files/` — экономия ~50+ МБ и отсутствие сетевых загрузок ассетов при сборке).
- `packages/scratch-gui/src/lib/libraries/{sprites,costumes,backdrops,sounds}.json`: очищены до `[]`.
- `packages/scratch-gui/src/components/sprite-selector/sprite-selector.jsx`, `packages/scratch-gui/src/components/stage-selector/stage-selector.jsx`, `packages/scratch-gui/src/containers/{stage-selector,costume-tab,sound-tab,target-pane}.jsx`:
  - Убраны пункты «Выбрать из библиотеки» и «Сюрприз» из меню добавления спрайтов, костюмов, фонов и звуков.
  - Основная кнопка действия сразу открывает рисование (спрайт/костюм/фон) или запись (звук); в всплывающем меню оставлены только локальные действия («Нарисовать», «Загрузить», «Записать»).
  - Обработчики `handleSurprise*` защищены от пустых массивов библиотек.
  - Дефолтный проект и пустые ассеты используют только встроенный `cd21514d0531fdffb22204e0ec5ed84a.svg`.

## Phase 5 — Интеграция `PenguinMod-Paint` и расширенного набора шрифтов

- `packages/scratch-gui/package.json`: зависимость `"scratch-paint"` переключена на `"github:PenguinMod/PenguinMod-Paint#develop"` (ревизия `37f65d73e7641236011dadc5def14964d5f404ae`).
- `packages/scratch-gui/src/lib/tw-scratch-render-fonts/`:
  - Добавлены 7 дополнительных шрифтов из `PenguinMod/penguinmod-render-fonts` (`MopedLike`, `Archivo`, `Archivo Black`, `Bits and Bytes`, `Comic`, `Playful`, `Technological`) вместе со всеми файлами лицензий (`Archivo-License.txt`, `BadComic-License.txt`, `PressStart2P-License.txt`, `QTKooperLicense.txt`, `freecam-v2-info.txt`, `PENGUINMOD-FONTS-LICENSE.txt`).
  - В `index.js` зарегистрированы все 14 шрифтов (7 шрифтов TurboWarp + 7 шрифтов PenguinMod).
- `webpack.config.cjs`: расширено правило `file-loader` для поддержки `.ttf` и `.otf`.
- `packages/scratch-gui/src/generated/microbit-hex-url.cjs`, `packages/scratch-gui/src/lib/microbit-update.js`, `packages/scratch-gui/.gitignore`: добавлена лёгкая заглушка `null` для необязательного 1.8 МБ образа прошивки micro:bit, чтобы офлайн- и CI-сборки не зависели от внешнего `packagerdata.turbowarp.org`.

## Phase 6 — Сборка и CI/CD (только Windows NSIS и Linux AppImage / `.deb`)

- `package.json`, `release-automation/build.mjs`: оставлены только цели Windows (`nsis`, `x64`) и Linux (`deb`, `appimage`, `x64`/`arm64`).
- Удалены файлы неподдерживаемых платформ и магазинов: `build/appx/`, `build/entitlements.*.plist`, `build/icon.icns`, `release-automation/linux.sh`, `store-listings/`, `debian/`.
- `release-automation/patch-electron-builder.cjs`: исправлен путь к `linux-files/ru.c6t.uli.uliblock.mime.xml`.
- `src-main/update-checker.js`, `release-automation/build.mjs`: отключена проверка обновлений против `desktop.turbowarp.org/version.json`.
- `src-renderer-webpack/editor/error/error-container-hoc.jsx`, `scripts/generate-changelogs.mjs`: ссылки на баг-трекер и релизы переведены на `123asxcqasdc/uliblock`.
- `.github/workflows/{build-auto.yml,build.yml,release.yml}`: переписаны под Windows NSIS + Linux AppImage/`.deb` и автоматическую публикацию в GitHub Releases репозитория.
- `scripts/linux-deb-installer/{uliblock-deb-installer.py,build-deb-installer-appimage.sh}`: добавлена сборка единого лёгкого AppImage-установщика (`UliBlock-Installer-linux-*.AppImage`, ~1 МБ) с графическим мастером (GTK3 с фолбэком на `zenity`/CLI), который скачивает актуальный `.deb` пакет UliBlock с GitHub Releases и устанавливает его в систему через `pkexec apt-get install`.

- `src-main/settings.js`, `src-main/migrate.js`: добавлен маркер `appBrand: 'uliblock'` для предотвращения ложного предупреждения «Понижение не поддерживается» при переходе с профиля TurboWarp (`1.18.0`), ссылки в окне миграции переведены на `github.com/123asxcqasdc/uliblock/releases`.
- `packages/scratch-gui/src/lib/themes/{accent/green.js,index.js}`, `packages/scratch-gui/src/components/menu-bar/tw-theme-accent.jsx`: добавлена зелёная акцентная тема в цветах иконки (`#22a630` / `#177421`) и установлена по умолчанию (`ACCENT_DEFAULT = ACCENT_GREEN`).
- `packages/scratch-gui/src/addons/addons/{debugger,vol-slider,mouse-pos,remove-sprite-confirm,variable-manager,hide-new-variables,disable-stage-drag-select}/_manifest_entry.js`: включены по умолчанию 7 аддонов (Отладчик, Слайдер громкости проекта, Mouse position display, Подтверждение удаления спрайтов, Менеджер переменных, Скрывать новые переменные, Неперетаскиваемые спрайты в редакторе) с возможностью отключения в настройках.
- `src-renderer/packager/standalone.html`, `scripts/packager.json`, `scripts/download-packager.mjs`: встроен кастомный упаковщик `Uli Packager` (`uli-packager-standalone-3.13.0.html`).

## Phase 7 — Документация, лицензии и финальная проверка

- Обновлён `README.md` (описание UliBlock, предупреждение о безопасности, инструкции по сборке, таблица лицензий и атрибуции).
- Создан `CHANGES.md` с полной картой отличий от upstream.
- Подтверждена сохранность `LICENSE` (GPL-3.0) и лицензий сторонних компонентов.

## v1.1.1 — Обновление упаковщика, дефолтная улитка и сайт GitHub Pages

- `package.json`, `package-lock.json`: версия обновлена до `1.1.1`.
- `src-renderer/packager/standalone.html`, `scripts/packager.json`: обновлён встроенный упаковщик `Uli Packager`.
- `packages/scratch-gui/src/lib/default-project/{uli-snail.svg,index.js,project-data.js}`: дефолтный костюм спрайта в новом проекте заменён на улитку UliBlock (`e917772c290cfff2d8ee776e84de7985.svg`, центр вращения `62.00 : 53.84`).
- `docs/{index.html,screenshot.png,icon.svg,favicon.ico,snail.svg,.nojekyll}`, `.github/workflows/pages.yml`: создан сайт UliBlock для GitHub Pages (`https://123asxcqasdc.github.io/uliblock/`) с интерактивным подбором сборки (Windows / Linux с выбором архитектуры и дистрибутива; для Debian/Ubuntu выдаётся только лёгкий AppImage-установщик).

## v1.2.0 — Автообновление, редактор тем, координатная сетка и исправление установщика

- `package.json`, `package-lock.json`, `docs/index.html`: версия обновлена до `1.2.0`.
- `scripts/linux-deb-installer/uliblock-deb-installer.py`:
  - Исправлен цвет текста на зелёной кнопке `.uli-primary` в KDE/Breeze (`button.uli-primary label { color: #ffffff; }` с приоритетом `STYLE_PROVIDER_PRIORITY_USER`).
  - Добавлен запасной поиск последнего тега через редирект `/releases/latest` (без лимитов GitHub API).
  - Добавлен флаг `-autoupdate` (и `--wait-pid`): при запуске из автообновления ставит пакет без лишних подтверждений (оставляя только запрос пароля администратора) и автоматически запускает обновлённый UliBlock; при ручном запуске по-прежнему ждёт нажатия кнопки.
- `src-main/{update-checker.js,auto-updater.js,windows/update.js,protocols.js}`, `src-preload/update.js`, `src-renderer/update/update.html`:
  - Включена проверка обновлений при каждом входе в редактор через `https://github.com/123asxcqasdc/uliblock/releases/latest`.
  - При согласии на обновление UliBlock скачивает установщик, закрывает все свои окна/процессы и запускает его в автоматическом режиме (`-autoupdate` на Linux, `/S` на Windows).
- `packages/scratch-gui/src/{lib/themes/uli-custom-themes.js,lib/themes/guiHelpers.js,components/menu-bar/uli-theme-editor-menu-item.jsx,components/menu-bar/settings-menu.jsx,components/uli-theme-editor/*,containers/uli-theme-editor-modal.jsx,reducers/modals.js}`:
  - Добавлена кнопка **«Редактор тем»** рядом с выбором акцентного цвета: создание/переключение/импорт/экспорт тем, свой акцентный цвет и цвет шапки, фоновые обои редактора (яркость, размытие, режим заполнения), кастомные иконки элементов управления и пользовательский CSS поверх всех стилей.
- `packages/scratch-gui/src/lib/default-project/{xy-grid.png,index.js,project-data.js}`:
  - Добавлена координатная сетка `xy-grid` вторым фоном нового проекта по умолчанию (первый белый фон остаётся активным).

## v1.2.1 — Обновление Uli Packager и исправление флага `-autoupdate`

- `package.json`, `package-lock.json`, `docs/index.html`: версия обновлена до `1.2.1`.
- `src-renderer/packager/standalone.html`, `scripts/packager.json`: обновлён встроенный упаковщик `Uli Packager`.
- `scripts/linux-deb-installer/uliblock-deb-installer.py`: добавлена поддержка флага `-autoupdate` (в дополнение к `--auto` / `--auto-update`), передаваемого автообновителем UliBlock.

## v1.2.2 — Перекраска PenguinMod-Paint в цвета темы UliBlock

- `package.json`, `package-lock.json`, `docs/index.html`: версия обновлена до `1.2.2`.
- `scripts/patch-penguinmod-paint.cjs`, `webpack.config.cjs`:
  - Все фирменные голубые цвета PenguinMod (`#00c3ff`, `#007da3`, `hsla(194, 100%, 50%, ...)`) в `scratch-paint` (`src/css/colors.css`, `color-picker.css`, `confirmation.css` и 34 `.svg` иконках) автоматически переводятся на зелёный акцент UliBlock (`#22a630` / `#177421`) и CSS-переменные темы (`--paint-looks-secondary`, `--paint-looks-transparent`, `--looks-secondary-dark`).
  - Редактор костюмов теперь зелёный по умолчанию и поддерживает смену акцентного цвета в настройках и «Редакторе тем».

---

## Рекомендации по редкой синхронизации с upstream

1. **Обновление `TurboWarp/desktop`:** сравнить изменения в `src-main/`, `src-preload/`, `src-renderer/` и `package.json`, аккуратно перенести патчи, сохраняя `src-main/brand.js`, `src-main/extension-cache.js`, `src-main/update-checker.js`, редиректы `uliblock-ext-cache://` и `securityManager` в `desktop-hoc.jsx`.
2. **Обновление `TurboWarp/scratch-gui`:** обновить файлы в `packages/scratch-gui/`, сохраняя:
   - `packages/scratch-gui/package.json` (`scratch-paint` → `PenguinMod/PenguinMod-Paint`);
   - `src/lib/tw-scratch-render-fonts/` (14 шрифтов и лицензии);
   - `src/components/loader/` и `src/lib/brand.js`;
   - пустые JSON-библиотеки ассетов и правки меню в `sprite-selector`, `stage-selector`, `costume-tab`, `sound-tab`, `target-pane`;
   - карточку галереи сообщества в `src/lib/libraries/extensions/index.jsx` и `src/containers/extension-library.jsx`;
   - `src/generated/microbit-hex-url.cjs` и проверку `hexUrl` в `src/lib/microbit-update.js`.
