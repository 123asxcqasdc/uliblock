import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import JSZip from '@turbowarp/jszip';
import lottie from 'lottie-web';
import Modal from '../../containers/modal.jsx';
import {isValidLottieData} from '../../lib/themes/uli-custom-themes';
import styles from './theme-editor-modal.css';

const ICON_SLOTS = [
    {key: 'greenFlag', label: 'Зелёный флаг'},
    {key: 'stopAll', label: 'Кнопка «Стоп»'},
    {key: 'fullscreen', label: 'Полный экран'},
    {key: 'settings', label: 'Иконка настроек'},
    {key: 'logo', label: 'Логотип в шапке'}
];

const readFileAsDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
});

const readFileAsText = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file);
});

const compressWallpaperIfNeeded = dataUrl => new Promise(resolve => {
    if (!dataUrl || dataUrl.startsWith('data:image/svg') || dataUrl.startsWith('data:image/gif') || dataUrl.length < 900000) {
        resolve(dataUrl);
        return;
    }
    const img = new Image();
    img.onload = () => {
        const maxDim = 1920;
        let {width, height} = img;
        if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        try {
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (_e) {
            resolve(dataUrl);
        }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
});

const readFileAsArrayBuffer = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsArrayBuffer(file);
});

const parseLottieFile = async file => {
    const lower = (file.name || '').toLowerCase();
    if (lower.endsWith('.lottie')) {
        const buffer = await readFileAsArrayBuffer(file);
        const zip = await JSZip.loadAsync(buffer);
        let animPath = null;
        const manifestFile = zip.file('manifest.json');
        if (manifestFile) {
            try {
                const manifest = JSON.parse(await manifestFile.async('string'));
                if (manifest && Array.isArray(manifest.animations) && manifest.animations[0]) {
                    const first = manifest.animations[0];
                    const id = typeof first === 'string' ? first : first.id;
                    if (id) {
                        const candidates = [`animations/${id}.json`, `a/${id}.json`, `${id}.json`];
                        animPath = candidates.find(p => zip.file(p)) || null;
                    }
                }
            } catch (_e) {
                // fallback below
            }
        }
        if (!animPath) {
            const jsonNames = Object.keys(zip.files).filter(name => (
                !zip.files[name].dir &&
                name.toLowerCase().endsWith('.json') &&
                name.toLowerCase() !== 'manifest.json'
            ));
            animPath = jsonNames.find(n => n.startsWith('animations/')) || jsonNames[0] || null;
        }
        if (!animPath || !zip.file(animPath)) {
            throw new Error('В архиве .lottie не найден JSON-файл анимации');
        }
        const parsed = JSON.parse(await zip.file(animPath).async('string'));
        if (!isValidLottieData(parsed)) {
            throw new Error('Файл внутри .lottie не является корректной анимацией Lottie');
        }
        return parsed;
    }

    const text = await readFileAsText(file);
    const parsed = JSON.parse(text);
    if (!isValidLottieData(parsed)) {
        throw new Error('Выбранный JSON не является корректной анимацией Lottie');
    }
    return parsed;
};

class ThemeEditorModalComponent extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            tab: 'general',
            wallpaperError: ''
        };
        this.wallpaperInputRef = React.createRef();
        this.lottiePreviewRef = React.createRef();
        this.lottiePreviewInstance = null;
        this.lottiePreviewKey = '';
        this.cssInputRef = React.createRef();
        this.importJsonRef = React.createRef();
        this.iconInputRefs = {};
        ICON_SLOTS.forEach(slot => {
            this.iconInputRefs[slot.key] = React.createRef();
        });
    }

    componentDidMount () {
        this.syncLottiePreview();
    }

    componentDidUpdate () {
        this.syncLottiePreview();
    }

    componentWillUnmount () {
        this.destroyLottiePreview();
    }

    destroyLottiePreview = () => {
        if (this.lottiePreviewInstance) {
            try {
                this.lottiePreviewInstance.destroy();
            } catch (_e) {
                // ignore
            }
            this.lottiePreviewInstance = null;
        }
        this.lottiePreviewKey = '';
    };

    syncLottiePreview = () => {
        const {draft} = this.props;
        const {tab} = this.state;
        const container = this.lottiePreviewRef.current;
        const lottieData = draft && isValidLottieData(draft.wallpaperLottieData) ? draft.wallpaperLottieData : null;

        if (tab !== 'wallpaper' || !container || !lottieData) {
            this.destroyLottiePreview();
            return;
        }

        const size = draft.wallpaperSize || 'cover';
        const preserveAspectRatio = size === 'contain' ?
            'xMidYMid meet' :
            (size === 'repeat' ? 'none' : 'xMidYMid slice');
        const nextKey = `${draft.id}:${draft.wallpaperLottieName}:${size}:${lottieData.layers.length}:${lottieData.op || ''}`;

        if (this.lottiePreviewKey !== nextKey || !this.lottiePreviewInstance) {
            this.destroyLottiePreview();
            container.innerHTML = '';
            try {
                this.lottiePreviewInstance = lottie.loadAnimation({
                    container,
                    renderer: 'svg',
                    loop: true,
                    autoplay: true,
                    animationData: JSON.parse(JSON.stringify(lottieData)),
                    rendererSettings: {preserveAspectRatio}
                });
                this.lottiePreviewKey = nextKey;
            } catch (_e) {
                this.lottiePreviewInstance = null;
            }
        }

        if (this.lottiePreviewInstance && typeof this.lottiePreviewInstance.setSpeed === 'function') {
            try {
                this.lottiePreviewInstance.setSpeed(draft.wallpaperLottieSpeed || 1);
            } catch (_e) {
                // ignore
            }
        }
    };

    handleWallpaperFile = async e => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const lower = (file.name || '').toLowerCase();
        const isLottieFile = lower.endsWith('.json') || lower.endsWith('.lottie') || file.type === 'application/json';

        if (isLottieFile) {
            try {
                const animationData = await parseLottieFile(file);
                this.setState({wallpaperError: ''});
                this.props.onUpdateDraft({
                    wallpaperDataUrl: '',
                    wallpaperLottieData: animationData,
                    wallpaperLottieName: file.name || 'animation.json'
                });
            } catch (err) {
                this.setState({
                    wallpaperError: err && err.message ? err.message : 'Не удалось загрузить Lottie-анимацию'
                });
            }
            return;
        }

        this.setState({wallpaperError: ''});
        const raw = await readFileAsDataUrl(file);
        const compressed = await compressWallpaperIfNeeded(raw);
        this.props.onUpdateDraft({
            wallpaperDataUrl: compressed,
            wallpaperLottieData: null,
            wallpaperLottieName: ''
        });
    };

    handleIconFile = slotKey => async e => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const dataUrl = await readFileAsDataUrl(file);
        const nextIcons = Object.assign({}, this.props.draft.icons, {[slotKey]: dataUrl});
        this.props.onUpdateDraft({icons: nextIcons});
    };

    handleCssFile = async e => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const text = await readFileAsText(file);
        this.props.onUpdateDraft({customCss: text});
    };

    handleImportJson = async e => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const text = await readFileAsText(file);
        this.props.onImportThemeJson(text);
    };

    render () {
        const {
            themes,
            activeThemeId,
            selectedThemeId,
            draft,
            statusMessage,
            errorMessage,
            onClose,
            onSelectTheme,
            onCreateTheme,
            onDuplicateTheme,
            onDeleteTheme,
            onUpdateDraft,
            onApplyTheme,
            onResetDefaultTheme,
            onExportTheme
        } = this.props;
        const {tab} = this.state;

        return (
            <Modal
                className={styles.modalContent}
                contentLabel="Редактор тем UliBlock"
                id="uliThemeEditorModal"
                onRequestClose={onClose}
            >
                <div className={styles.body}>
                    <div className={styles.layout}>
                        <div className={styles.sidebar}>
                            <div className={styles.sidebarTitle}>Ваши темы ({themes.length})</div>

                            <div className={styles.themeList}>
                                <button
                                    type="button"
                                    className={classNames(styles.themeItem, {
                                        [styles.themeItemSelected]: !activeThemeId && !selectedThemeId
                                    })}
                                    onClick={onResetDefaultTheme}
                                >
                                    <span
                                        className={styles.themeDot}
                                        style={{backgroundColor: '#22a630'}}
                                    />
                                    <span className={styles.themeItemName}>Стандартная UliBlock</span>
                                    {!activeThemeId && <span className={styles.activeBadge}>Активна</span>}
                                </button>

                                {themes.map(item => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={classNames(styles.themeItem, {
                                            [styles.themeItemSelected]: selectedThemeId === item.id
                                        })}
                                        onClick={() => onSelectTheme(item.id)}
                                    >
                                        <span
                                            className={styles.themeDot}
                                            style={{backgroundColor: item.accentColor || '#22a630'}}
                                        />
                                        <span className={styles.themeItemName}>{item.name}</span>
                                        {activeThemeId === item.id && (
                                            <span className={styles.activeBadge}>Активна</span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className={styles.sidebarActions}>
                                <button
                                    type="button"
                                    className={classNames(styles.btn, styles.btnPrimary)}
                                    onClick={onCreateTheme}
                                >
                                    + Создать тему
                                </button>
                                <button
                                    type="button"
                                    className={styles.btn}
                                    onClick={() => this.importJsonRef.current && this.importJsonRef.current.click()}
                                >
                                    Импорт .json
                                </button>
                                <input
                                    ref={this.importJsonRef}
                                    type="file"
                                    accept=".json,.ulitheme.json"
                                    style={{display: 'none'}}
                                    onChange={this.handleImportJson}
                                />
                            </div>
                        </div>

                        <div className={styles.editorPane}>
                            {!draft ? (
                                <div className={styles.emptyState}>
                                    <div>
                                        Сейчас используется стандартная тема UliBlock.
                                        <br />
                                        Создайте свою тему, чтобы настроить цвет акцента, обои редактора, иконки и собственный CSS!
                                    </div>
                                    <button
                                        type="button"
                                        className={classNames(styles.btn, styles.btnPrimary)}
                                        onClick={onCreateTheme}
                                    >
                                        + Создать первую тему
                                    </button>
                                </div>
                            ) : (
                                <React.Fragment>
                                    <div className={styles.fieldRow}>
                                        <span className={styles.fieldLabel}>Название темы:</span>
                                        <input
                                            type="text"
                                            className={styles.textInput}
                                            value={draft.name}
                                            onChange={e => onUpdateDraft({name: e.target.value})}
                                            placeholder="Например: Неоновая улитка"
                                        />
                                    </div>

                                    <div className={styles.tabs}>
                                        <button
                                            type="button"
                                            className={classNames(styles.tabBtn, {[styles.tabBtnActive]: tab === 'general'})}
                                            onClick={() => this.setState({tab: 'general'})}
                                        >
                                            Цвета и вид
                                        </button>
                                        <button
                                            type="button"
                                            className={classNames(styles.tabBtn, {[styles.tabBtnActive]: tab === 'wallpaper'})}
                                            onClick={() => this.setState({tab: 'wallpaper'})}
                                        >
                                            Обои редактора
                                        </button>
                                        <button
                                            type="button"
                                            className={classNames(styles.tabBtn, {[styles.tabBtnActive]: tab === 'icons'})}
                                            onClick={() => this.setState({tab: 'icons'})}
                                        >
                                            Иконки управления
                                        </button>
                                        <button
                                            type="button"
                                            className={classNames(styles.tabBtn, {[styles.tabBtnActive]: tab === 'css'})}
                                            onClick={() => this.setState({tab: 'css'})}
                                        >
                                            Свой CSS
                                        </button>
                                    </div>

                                    {tab === 'general' && (
                                        <div className={styles.section}>
                                            <label className={styles.fieldRow}>
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(draft.useCustomAccent)}
                                                    onChange={e => onUpdateDraft({useCustomAccent: e.target.checked})}
                                                />
                                                <span style={{fontSize: '13px', fontWeight: 600}}>
                                                    Использовать свой акцентный цвет
                                                </span>
                                            </label>

                                            {draft.useCustomAccent && (
                                                <React.Fragment>
                                                    <div className={styles.fieldRow}>
                                                        <span className={styles.fieldLabel}>Акцентный цвет:</span>
                                                        <input
                                                            type="color"
                                                            className={styles.colorInput}
                                                            value={draft.accentColor || '#22a630'}
                                                            onChange={e => onUpdateDraft({accentColor: e.target.value})}
                                                        />
                                                        <input
                                                            type="text"
                                                            className={styles.textInput}
                                                            value={draft.accentColor || '#22a630'}
                                                            onChange={e => onUpdateDraft({accentColor: e.target.value})}
                                                            style={{maxWidth: '120px'}}
                                                        />
                                                    </div>

                                                    <div className={styles.fieldRow}>
                                                        <span className={styles.fieldLabel}>Цвет верхней панели:</span>
                                                        <input
                                                            type="color"
                                                            className={styles.colorInput}
                                                            value={draft.menuBarColor || draft.accentColor || '#22a630'}
                                                            onChange={e => onUpdateDraft({menuBarColor: e.target.value})}
                                                        />
                                                        <button
                                                            type="button"
                                                            className={classNames(styles.btn, styles.btnSmall)}
                                                            onClick={() => onUpdateDraft({menuBarColor: ''})}
                                                        >
                                                            Как акцент
                                                        </button>
                                                    </div>
                                                </React.Fragment>
                                            )}

                                            <div className={styles.fieldRow}>
                                                <span className={styles.fieldLabel}>
                                                    Скругление элементов: {draft.uiRoundness === '' ? 'по умолчанию' : `${draft.uiRoundness}px`}
                                                </span>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="18"
                                                    step="1"
                                                    value={draft.uiRoundness === '' ? 6 : draft.uiRoundness}
                                                    onChange={e => onUpdateDraft({uiRoundness: Number(e.target.value)})}
                                                />
                                                <button
                                                    type="button"
                                                    className={classNames(styles.btn, styles.btnSmall)}
                                                    onClick={() => onUpdateDraft({uiRoundness: ''})}
                                                >
                                                    Сбросить
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {tab === 'wallpaper' && (
                                        <div className={styles.section}>
                                            <p className={styles.hint}>
                                                Фоновое изображение или живая анимация Lottie (.json / .lottie) отображается на рабочей области блоков, как обои в Telegram.
                                            </p>

                                            <div
                                                className={styles.wallpaperPreview}
                                                style={!draft.wallpaperLottieData && draft.wallpaperDataUrl ? {
                                                    backgroundImage: `url("${draft.wallpaperDataUrl}")`,
                                                    backgroundSize: draft.wallpaperSize === 'repeat' ? 'auto' : draft.wallpaperSize,
                                                    backgroundRepeat: draft.wallpaperSize === 'repeat' ? 'repeat' : 'no-repeat'
                                                } : undefined}
                                            >
                                                {draft.wallpaperLottieData ? (
                                                    <React.Fragment>
                                                        <div
                                                            ref={this.lottiePreviewRef}
                                                            className={styles.lottiePreviewCanvas}
                                                            style={{
                                                                opacity: draft.wallpaperOpacity || 0.35,
                                                                filter: draft.wallpaperBlur ? `blur(${draft.wallpaperBlur}px)` : undefined
                                                            }}
                                                        />
                                                        <span className={styles.wallpaperBadge}>
                                                            🎬 Живые обои Lottie{draft.wallpaperLottieName ? ` · ${draft.wallpaperLottieName}` : ''}
                                                        </span>
                                                    </React.Fragment>
                                                ) : (
                                                    !draft.wallpaperDataUrl && 'Обои не выбраны'
                                                )}
                                            </div>

                                            {this.state.wallpaperError && (
                                                <div className={styles.errorNote}>{this.state.wallpaperError}</div>
                                            )}

                                            <div className={styles.fieldRow}>
                                                <button
                                                    type="button"
                                                    className={classNames(styles.btn, styles.btnPrimary)}
                                                    onClick={() => this.wallpaperInputRef.current && this.wallpaperInputRef.current.click()}
                                                >
                                                    Выбрать картинку или Lottie...
                                                </button>
                                                {(draft.wallpaperDataUrl || draft.wallpaperLottieData) && (
                                                    <button
                                                        type="button"
                                                        className={classNames(styles.btn, styles.btnDanger)}
                                                        onClick={() => {
                                                            this.setState({wallpaperError: ''});
                                                            onUpdateDraft({
                                                                wallpaperDataUrl: '',
                                                                wallpaperLottieData: null,
                                                                wallpaperLottieName: ''
                                                            });
                                                        }}
                                                    >
                                                        Убрать обои
                                                    </button>
                                                )}
                                                <input
                                                    ref={this.wallpaperInputRef}
                                                    type="file"
                                                    accept="image/*,.json,.lottie,application/json"
                                                    style={{display: 'none'}}
                                                    onChange={this.handleWallpaperFile}
                                                />
                                            </div>

                                            <div className={styles.fieldRow}>
                                                <span className={styles.fieldLabel}>
                                                    Яркость обоев: {Math.round((draft.wallpaperOpacity || 0.35) * 100)}%
                                                </span>
                                                <input
                                                    type="range"
                                                    min="0.05"
                                                    max="0.95"
                                                    step="0.05"
                                                    value={draft.wallpaperOpacity || 0.35}
                                                    onChange={e => onUpdateDraft({wallpaperOpacity: Number(e.target.value)})}
                                                />
                                            </div>

                                            <div className={styles.fieldRow}>
                                                <span className={styles.fieldLabel}>
                                                    Размытие: {draft.wallpaperBlur || 0}px
                                                </span>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="20"
                                                    step="1"
                                                    value={draft.wallpaperBlur || 0}
                                                    onChange={e => onUpdateDraft({wallpaperBlur: Number(e.target.value)})}
                                                />
                                            </div>

                                            {draft.wallpaperLottieData && (
                                                <div className={styles.fieldRow}>
                                                    <span className={styles.fieldLabel}>
                                                        Скорость Lottie: {(draft.wallpaperLottieSpeed || 1).toFixed(2)}x
                                                    </span>
                                                    <input
                                                        type="range"
                                                        min="0.25"
                                                        max="2.5"
                                                        step="0.25"
                                                        value={draft.wallpaperLottieSpeed || 1}
                                                        onChange={e => onUpdateDraft({wallpaperLottieSpeed: Number(e.target.value)})}
                                                    />
                                                </div>
                                            )}

                                            <div className={styles.fieldRow}>
                                                <span className={styles.fieldLabel}>Режим заполнения:</span>
                                                <select
                                                    className={styles.selectInput}
                                                    value={draft.wallpaperSize || 'cover'}
                                                    onChange={e => onUpdateDraft({wallpaperSize: e.target.value})}
                                                >
                                                    <option value="cover">Заполнить экран (cover)</option>
                                                    <option value="contain">Вписать целиком (contain)</option>
                                                    <option value="repeat">Плитка / паттерн (repeat)</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {tab === 'icons' && (
                                        <div className={styles.section}>
                                            <p className={styles.hint}>
                                                Задайте собственные PNG / SVG / GIF иконки для кнопок управления редактора.
                                            </p>
                                            <div className={styles.iconGrid}>
                                                {ICON_SLOTS.map(slot => {
                                                    const currentSrc = draft.icons && draft.icons[slot.key];
                                                    return (
                                                        <div key={slot.key} className={styles.iconCard}>
                                                            <div className={styles.iconThumb}>
                                                                {currentSrc ? (
                                                                    <img src={currentSrc} alt={slot.label} />
                                                                ) : (
                                                                    <span style={{fontSize: '11px', opacity: 0.6}}>Авто</span>
                                                                )}
                                                            </div>
                                                            <div className={styles.iconInfo}>
                                                                <span className={styles.iconName}>{slot.label}</span>
                                                                <div className={styles.iconBtns}>
                                                                    <button
                                                                        type="button"
                                                                        className={classNames(styles.btn, styles.btnSmall)}
                                                                        onClick={() => this.iconInputRefs[slot.key].current && this.iconInputRefs[slot.key].current.click()}
                                                                    >
                                                                        Выбрать
                                                                    </button>
                                                                    {currentSrc && (
                                                                        <button
                                                                            type="button"
                                                                            className={classNames(styles.btn, styles.btnSmall, styles.btnDanger)}
                                                                            onClick={() => {
                                                                                const next = Object.assign({}, draft.icons, {[slot.key]: ''});
                                                                                onUpdateDraft({icons: next});
                                                                            }}
                                                                        >
                                                                            Сброс
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <input
                                                                    ref={this.iconInputRefs[slot.key]}
                                                                    type="file"
                                                                    accept="image/*"
                                                                    style={{display: 'none'}}
                                                                    onChange={this.handleIconFile(slot.key)}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {tab === 'css' && (
                                        <div className={styles.section}>
                                            <p className={styles.hint}>
                                                Этот CSS подключается в самом конце &lt;head&gt; и применяется поверх всех стилей редактора.
                                            </p>
                                            <div className={styles.fieldRow}>
                                                <button
                                                    type="button"
                                                    className={classNames(styles.btn, styles.btnPrimary)}
                                                    onClick={() => this.cssInputRef.current && this.cssInputRef.current.click()}
                                                >
                                                    Загрузить .css файл...
                                                </button>
                                                {draft.customCss && (
                                                    <button
                                                        type="button"
                                                        className={classNames(styles.btn, styles.btnDanger)}
                                                        onClick={() => onUpdateDraft({customCss: ''})}
                                                    >
                                                        Очистить CSS
                                                    </button>
                                                )}
                                                <input
                                                    ref={this.cssInputRef}
                                                    type="file"
                                                    accept=".css,text/css"
                                                    style={{display: 'none'}}
                                                    onChange={this.handleCssFile}
                                                />
                                            </div>
                                            <textarea
                                                className={styles.cssTextarea}
                                                value={draft.customCss || ''}
                                                onChange={e => onUpdateDraft({customCss: e.target.value})}
                                                placeholder={'/* Например:\n[class*="menu-bar_menu-bar_"] {\n  background: linear-gradient(90deg, #1b8c27, #0b5a8a) !important;\n}\n*/'}
                                                spellCheck={false}
                                            />
                                        </div>
                                    )}

                                    <div className={styles.footerBar}>
                                        <div className={styles.footerGroup}>
                                            <button
                                                type="button"
                                                className={styles.btn}
                                                onClick={onDuplicateTheme}
                                            >
                                                Дублировать
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.btn}
                                                onClick={onExportTheme}
                                            >
                                                Экспорт .json
                                            </button>
                                            <button
                                                type="button"
                                                className={classNames(styles.btn, styles.btnDanger)}
                                                onClick={onDeleteTheme}
                                            >
                                                Удалить
                                            </button>
                                        </div>

                                        <div className={styles.footerGroup}>
                                            <button
                                                type="button"
                                                className={classNames(styles.btn, styles.btnPrimary)}
                                                onClick={onApplyTheme}
                                            >
                                                Сохранить и применить
                                            </button>
                                        </div>
                                    </div>
                                </React.Fragment>
                            )}

                            {statusMessage && <div className={styles.statusNote}>{statusMessage}</div>}
                            {errorMessage && <div className={styles.errorNote}>{errorMessage}</div>}
                        </div>
                    </div>
                </div>
            </Modal>
        );
    }
}

ThemeEditorModalComponent.propTypes = {
    themes: PropTypes.arrayOf(PropTypes.object).isRequired,
    activeThemeId: PropTypes.string,
    selectedThemeId: PropTypes.string,
    draft: PropTypes.object,
    statusMessage: PropTypes.string,
    errorMessage: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onSelectTheme: PropTypes.func.isRequired,
    onCreateTheme: PropTypes.func.isRequired,
    onDuplicateTheme: PropTypes.func.isRequired,
    onDeleteTheme: PropTypes.func.isRequired,
    onUpdateDraft: PropTypes.func.isRequired,
    onApplyTheme: PropTypes.func.isRequired,
    onResetDefaultTheme: PropTypes.func.isRequired,
    onExportTheme: PropTypes.func.isRequired,
    onImportThemeJson: PropTypes.func.isRequired
};

export default ThemeEditorModalComponent;
