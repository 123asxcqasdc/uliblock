# UliBlock

<p align="center">
  <img src="art/icon.svg" alt="UliBlock Logo" width="128" height="128" />
</p>

**UliBlock** — облегчённый открытый форк [TurboWarp Desktop](https://github.com/TurboWarp/desktop) с интегрированной галереей расширений сообщества и офлайн-кэшированием на диск, расширенным графическим редактором PenguinMod-Paint, кастомным экраном загрузки и минимальным весом сборки.

- **Сайт:** https://123asxcqasdc.github.io/uliblock/
- **Репозиторий:** https://github.com/123asxcqasdc/uliblock
- **App ID:** `ru.c6t.uli.uliblock`
- **Поддерживаемые платформы:** Windows (установщик NSIS `x64`) и Linux (`AppImage` и `.deb`, `x64`/`arm64`)
- **Лицензия:** GNU General Public License v3.0 ([`LICENSE`](LICENSE))

---

## Основные отличия от TurboWarp Desktop

Подробный технический список всех изменений и затронутых файлов см. в [`CHANGES.md`](CHANGES.md).

1. **Брендинг UliBlock (`ru.c6t.uli.uliblock`)** — фирменная зелёная иконка блока с буквой «U», собственные метаданные Linux (`.desktop`, `.mime.xml`, `.metainfo.xml`), окно «О программе» со ссылкой на исходный код, и кастомная анимация запуска и загрузки проектов.
2. **Встроенная галерея расширений сообщества с офлайн-кэшем** — поверх всех встроенных расширений Scratch и официальных расширений TurboWarp (которые по-прежнему идут в комплекте офлайн) добавлена галерея [`123asxcqasdc/turbowarp-extensions`](https://123asxcqasdc.github.io/turbowarp-extensions/):
   - поиск, 14 категорий, фильтр по 12 исходным галереям, сортировка, режимы «Сетка / Компактный», выбор варианта (официальная / форк-версия), загрузка и экспорт собственных расширений;
   - **обязательное отображение автора и исходной галереи** в карточке каждого расширения и при выборе вариантов;
   - автоматическое кэширование каталога, JS-кода расширений и превью в `<userData>/uliblock-extensions-cache/` с прозрачной подменой через протокол `uliblock-ext-cache://` (в `.sb3` сохраняются оригинальные `https://...` URL для полной совместимости с другими редакторами).
3. **Загрузка расширений без диалогов и без песочницы** — расширения из любых URL загружаются без модального окна подтверждения и работают в режиме `unsandboxed`.
4. **Облегчённый дистрибутив без встроенной библиотеки ассетов** — полностью удалены встроенные библиотеки спрайтов, костюмов, фонов и звуков (создание через «Нарисовать», «Загрузить», «Записать»).
5. **Графический редактор `PenguinMod-Paint` + расширенный набор шрифтов** — интегрирован [`PenguinMod/PenguinMod-Paint`](https://github.com/PenguinMod/PenguinMod-Paint) вместе с 7 дополнительными шрифтами (`MopedLike`, `Archivo`, `Archivo Black`, `Bits and Bytes`, `Comic`, `Playful`, `Technological`).
6. **Монорепозиторий с локальным `packages/scratch-gui`** — модифицированный `TurboWarp/scratch-gui` хранится прямо в `packages/scratch-gui` для упрощения поддержки и редких синхронизаций с upstream.
7. **Только Windows (NSIS) и Linux (`AppImage` / `.deb`)** — удалены цели сборки macOS, legacy Windows 7/8/8.1, Microsoft Store (`appx`), Snap, Flatpak и лишние тарболы.

---

## ⚠️ Предупреждение о безопасности

В UliBlock по умолчанию отключено подтверждение загрузки расширений и включён режим **`unsandboxed`** для всех URL. Это означает, что подключённые пользовательские расширения выполняются с полным доступом к среде редактора без изоляции в песочнице.

**Открывайте проекты `.sb3` и подключайте расширения только от авторов и галерей, которым вы доверяете.**

---

## Сборка из исходного кода

Требуется **Node.js 22+**.

```bash
# 1. Установка зависимостей
npm ci

# 2. Загрузка офлайн-ресурсов (официальные расширения TurboWarp и packager)
npm run fetch

# 3. Сборка production-бандлов редактора и аддонов
npm run webpack:prod

# 4. Запуск в режиме разработки
npm run electron:start
```

### Упаковка установщиков

**Linux — полные офлайн-пакеты (`.deb` и `.AppImage`):**
```bash
node release-automation/build.mjs --debian --appimage --x64
```

**Linux — лёгкий AppImage-установщик `.deb` пакета (< 2 МБ, графический мастер на GTK3/zenity, который сам скачивает официальный `.deb` UliBlock с GitHub Releases и устанавливает его в систему через `pkexec apt-get install`):**
```bash
bash scripts/linux-deb-installer/build-deb-installer-appimage.sh x64
```

**Windows (NSIS `.exe`, запускать на Windows):**
```powershell
node release-automation/build.mjs --windows --x64
```

CI/CD настроено в `.github/workflows/`:
- `build-auto.yml` — автоматическая проверка сборки на каждый `push` и Pull Request;
- `build.yml` — ручная сборка Linux (`.deb`, `.AppImage`) и Windows (`UliBlock-Setup-*.exe`);
- `release.yml` — автоматическая публикация релизов при создании тега `v*`.

---

## Лицензии и атрибуция

UliBlock распространяется под лицензией **GNU General Public License v3.0** ([`LICENSE`](LICENSE)).

В основе UliBlock лежат следующие открытые проекты (все исходные лицензии и уведомления об авторстве сохранены):

| Компонент | Проект / Источник | Лицензия |
| --- | --- | --- |
| Оболочка приложения | [TurboWarp Desktop](https://github.com/TurboWarp/desktop) (Thomas Weber и участники) | GPL-3.0 |
| Интерфейс редактора | [TurboWarp/scratch-gui](https://github.com/TurboWarp/scratch-gui) | GPL-3.0 |
| Движок и базовые компоненты | [Scratch](https://scratch.mit.edu/) (Scratch Foundation / MIT) | BSD-3-Clause / MIT / AGPL-3.0 |
| Графический редактор | [PenguinMod-Paint](https://github.com/PenguinMod/PenguinMod-Paint) | GPL-3.0 |
| Дополнительные шрифты | [penguinmod-render-fonts](https://github.com/PenguinMod/penguinmod-render-fonts) (см. файлы лицензий в `packages/scratch-gui/src/lib/tw-scratch-render-fonts/`) | OFL / Apache-2.0 / MIT / BSD |
| Галерея расширений сообщества | [123asxcqasdc/turbowarp-extensions](https://123asxcqasdc.github.io/turbowarp-extensions/) и авторы расширений из 12 исходных галерей | По лицензии каждого конкретного расширения |

UliBlock не аффилирован с Scratch, TurboWarp или PenguinMod.
