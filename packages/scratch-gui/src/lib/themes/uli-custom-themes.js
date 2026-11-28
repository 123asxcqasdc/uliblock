import lottie from 'lottie-web';
import AddonHooks from '../../addons/hooks';

const STORAGE_KEY = 'uliblock:custom-themes:v1';
const STYLE_BASE_ID = 'uliblock-custom-theme-style';
const STYLE_CSS_ID = 'uliblock-custom-theme-css';
const LOTTIE_CONTAINER_ID = 'uliblock-lottie-wallpaper';

const ICON_SELECTORS = {
    greenFlag: 'img[data-uli-icon="green-flag"]',
    stopAll: 'img[data-uli-icon="stop-all"]',
    fullscreen: 'img[data-uli-icon="fullscreen"]',
    settings: 'img[data-uli-icon="settings"]',
    logo: '#logo_img'
};

let domObserver = null;
let currentAppliedIcons = null;
let currentLottieConfig = null;
let lottieInstance = null;
let lottieMountedContainer = null;
let lottieMountedSignature = '';

const isValidLottieData = data => Boolean(
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray(data.layers) &&
    data.layers.length > 0 &&
    (typeof data.fr === 'number' || typeof data.op === 'number' || typeof data.v === 'string')
);

/**
 * Converts #rrggbb hex to {r, g, b}.
 * @param {string} hex
 * @returns {{r: number, g: number, b: number} | null}
 */
const hexToRgb = hex => {
    if (typeof hex !== 'string') return null;
    const clean = hex.trim().replace(/^#/, '');
    if (clean.length === 3) {
        const r = parseInt(clean[0] + clean[0], 16);
        const g = parseInt(clean[1] + clean[1], 16);
        const b = parseInt(clean[2] + clean[2], 16);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
        return {r, g, b};
    }
    if (clean.length === 6) {
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
        return {r, g, b};
    }
    return null;
};

/**
 * Darkens or lightens an RGB color by factor (-1..1).
 * @param {{r: number, g: number, b: number}} rgb
 * @param {number} factor
 * @returns {string}
 */
const shadeHex = (rgb, factor) => {
    const adjust = c => {
        const next = factor < 0 ? c * (1 + factor) : c + ((255 - c) * factor);
        return Math.max(0, Math.min(255, Math.round(next)));
    };
    const r = adjust(rgb.r);
    const g = adjust(rgb.g);
    const b = adjust(rgb.b);
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
};

const createEmptyTheme = (name = 'Новая тема') => ({
    id: `uli-theme-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    accentColor: '#22a630',
    useCustomAccent: true,
    menuBarColor: '',
    wallpaperDataUrl: '',
    wallpaperLottieData: null,
    wallpaperLottieName: '',
    wallpaperLottieSpeed: 1,
    wallpaperOpacity: 0.35,
    wallpaperBlur: 0,
    wallpaperSize: 'cover',
    uiRoundness: '',
    icons: {
        greenFlag: '',
        stopAll: '',
        fullscreen: '',
        settings: '',
        logo: ''
    },
    customCss: ''
});

const sanitizeTheme = raw => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const base = createEmptyTheme(typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Моя тема');
    if (typeof r.id === 'string' && r.id.trim()) {
        base.id = r.id.trim();
    }
    if (typeof r.accentColor === 'string' && hexToRgb(r.accentColor)) {
        base.accentColor = r.accentColor;
    }
    if (typeof r.useCustomAccent === 'boolean') {
        base.useCustomAccent = r.useCustomAccent;
    }
    if (typeof r.menuBarColor === 'string' && (!r.menuBarColor || hexToRgb(r.menuBarColor))) {
        base.menuBarColor = r.menuBarColor;
    }
    if (typeof r.wallpaperDataUrl === 'string') {
        base.wallpaperDataUrl = r.wallpaperDataUrl;
    }
    if (isValidLottieData(r.wallpaperLottieData)) {
        base.wallpaperLottieData = r.wallpaperLottieData;
    }
    if (typeof r.wallpaperLottieName === 'string') {
        base.wallpaperLottieName = r.wallpaperLottieName;
    }
    if (typeof r.wallpaperLottieSpeed === 'number' && !Number.isNaN(r.wallpaperLottieSpeed)) {
        base.wallpaperLottieSpeed = Math.max(0.25, Math.min(2.5, r.wallpaperLottieSpeed));
    }
    if (typeof r.wallpaperOpacity === 'number' && !Number.isNaN(r.wallpaperOpacity)) {
        base.wallpaperOpacity = Math.max(0.05, Math.min(1, r.wallpaperOpacity));
    }
    if (typeof r.wallpaperBlur === 'number' && !Number.isNaN(r.wallpaperBlur)) {
        base.wallpaperBlur = Math.max(0, Math.min(24, r.wallpaperBlur));
    }
    if (['cover', 'contain', 'repeat'].includes(r.wallpaperSize)) {
        base.wallpaperSize = r.wallpaperSize;
    }
    if (r.uiRoundness === '' || (typeof r.uiRoundness === 'number' && r.uiRoundness >= 0 && r.uiRoundness <= 20)) {
        base.uiRoundness = r.uiRoundness;
    }
    if (r.icons && typeof r.icons === 'object') {
        for (const key of Object.keys(base.icons)) {
            if (typeof r.icons[key] === 'string') {
                base.icons[key] = r.icons[key];
            }
        }
    }
    if (typeof r.customCss === 'string') {
        base.customCss = r.customCss;
    }
    return base;
};

const loadCustomThemeStore = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {themes: [], activeThemeId: null};
        }
        const parsed = JSON.parse(raw);
        const themes = Array.isArray(parsed.themes) ? parsed.themes.map(sanitizeTheme) : [];
        const activeThemeId = typeof parsed.activeThemeId === 'string' &&
            themes.some(t => t.id === parsed.activeThemeId) ?
            parsed.activeThemeId :
            null;
        return {themes, activeThemeId};
    } catch (_e) {
        return {themes: [], activeThemeId: null};
    }
};

const saveCustomThemeStore = store => {
    const payload = {
        themes: (store.themes || []).map(sanitizeTheme),
        activeThemeId: store.activeThemeId || null
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
};

const syncIconsToDom = icons => {
    if (typeof document === 'undefined') return;
    for (const [key, selector] of Object.entries(ICON_SELECTORS)) {
        const customSrc = icons && icons[key] ? icons[key] : '';
        const elements = document.querySelectorAll(selector);
        elements.forEach(img => {
            if (!img || img.tagName !== 'IMG') return;
            if (customSrc) {
                if (!img.dataset.uliOrigSrc) {
                    img.dataset.uliOrigSrc = img.getAttribute('src') || '';
                }
                if (img.getAttribute('src') !== customSrc) {
                    img.setAttribute('src', customSrc);
                }
            } else if (img.dataset.uliOrigSrc !== undefined) {
                img.setAttribute('src', img.dataset.uliOrigSrc);
                delete img.dataset.uliOrigSrc;
            }
        });
    }
};

const destroyLottieInstance = () => {
    if (lottieInstance) {
        try {
            lottieInstance.destroy();
        } catch (_e) {
            // ignore
        }
        lottieInstance = null;
    }
    if (lottieMountedContainer && lottieMountedContainer.parentNode) {
        lottieMountedContainer.parentNode.removeChild(lottieMountedContainer);
    }
    lottieMountedContainer = null;
    lottieMountedSignature = '';
};

const syncLottieWallpaper = config => {
    if (typeof document === 'undefined') return;
    if (!config || !config.data) {
        destroyLottieInstance();
        return;
    }

    const blocksEl = document.querySelector('[class*="blocks_blocks_"]');
    if (!blocksEl) {
        if (lottieInstance) {
            destroyLottieInstance();
        }
        return;
    }

    let container = blocksEl.querySelector(`#${LOTTIE_CONTAINER_ID}`);
    if (!container) {
        container = document.createElement('div');
        container.id = LOTTIE_CONTAINER_ID;
        blocksEl.insertBefore(container, blocksEl.firstChild);
    }

    container.style.position = 'absolute';
    container.style.inset = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '0';
    container.style.overflow = 'hidden';
    container.style.opacity = String(config.opacity);
    container.style.filter = config.blur > 0 ? `blur(${config.blur}px)` : '';
    container.style.transform = config.blur > 0 ? 'scale(1.04)' : '';

    const preserveAspectRatio = config.size === 'contain' ?
        'xMidYMid meet' :
        (config.size === 'repeat' ? 'none' : 'xMidYMid slice');

    if (lottieMountedContainer !== container || lottieMountedSignature !== config.signature) {
        if (lottieInstance) {
            try {
                lottieInstance.destroy();
            } catch (_e) {
                // ignore
            }
            lottieInstance = null;
        }
        container.innerHTML = '';
        try {
            const clonedData = JSON.parse(JSON.stringify(config.data));
            lottieInstance = lottie.loadAnimation({
                container,
                renderer: 'svg',
                loop: true,
                autoplay: true,
                animationData: clonedData,
                rendererSettings: {
                    preserveAspectRatio
                }
            });
            lottieMountedContainer = container;
            lottieMountedSignature = config.signature;
        } catch (_e) {
            lottieInstance = null;
            lottieMountedContainer = null;
            lottieMountedSignature = '';
        }
    }

    if (lottieInstance && typeof lottieInstance.setSpeed === 'function') {
        try {
            lottieInstance.setSpeed(config.speed || 1);
        } catch (_e) {
            // ignore
        }
    }
};

const ensureDomSync = (icons, lottieConfig) => {
    const hasAnyIcon = Boolean(icons && Object.values(icons).some(Boolean));
    currentAppliedIcons = hasAnyIcon ? icons : null;
    currentLottieConfig = lottieConfig || null;

    syncIconsToDom(currentAppliedIcons);
    syncLottieWallpaper(currentLottieConfig);

    if (hasAnyIcon || currentLottieConfig) {
        if (!domObserver && typeof MutationObserver !== 'undefined' && document.body) {
            domObserver = new MutationObserver(() => {
                if (currentAppliedIcons) {
                    syncIconsToDom(currentAppliedIcons);
                }
                if (currentLottieConfig) {
                    syncLottieWallpaper(currentLottieConfig);
                }
            });
            domObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    } else if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }
};

const getOrCreateStyleEl = id => {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('style');
        el.id = id;
        document.head.appendChild(el);
    } else if (el.parentNode === document.head && document.head.lastElementChild !== el) {
        // Keep at end of <head> so it cleanly overrides editor styles
        document.head.appendChild(el);
    }
    return el;
};

const removeStyleEl = id => {
    const el = document.getElementById(id);
    if (el && el.parentNode) {
        el.parentNode.removeChild(el);
    }
};

/**
 * Applies a custom theme object (or clears custom theme if null).
 * @param {object | null} theme
 */
const applyCustomTheme = theme => {
    if (typeof document === 'undefined') return;

    if (!theme) {
        removeStyleEl(STYLE_BASE_ID);
        removeStyleEl(STYLE_CSS_ID);
        ensureDomSync(null, null);
        document.documentElement.removeAttribute('data-uli-custom-theme');
        return;
    }

    const t = sanitizeTheme(theme);
    const rules = [];
    const rootVars = [];

    if (t.useCustomAccent && t.accentColor) {
        const rgb = hexToRgb(t.accentColor);
        if (rgb) {
            const dark = shadeHex(rgb, -0.24);
            const drop = shadeHex(rgb, 0.35);
            const barHex = t.menuBarColor && hexToRgb(t.menuBarColor) ? t.menuBarColor : t.accentColor;

            rootVars.push(`--motion-primary: ${t.accentColor} !important;`);
            rootVars.push(`--motion-primary-transparent: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9) !important;`);
            rootVars.push(`--looks-secondary: ${t.accentColor} !important;`);
            rootVars.push(`--looks-transparent: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35) !important;`);
            rootVars.push(`--looks-light-transparent: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15) !important;`);
            rootVars.push(`--looks-secondary-dark: ${dark} !important;`);
            rootVars.push(`--extensions-primary: ${t.accentColor} !important;`);
            rootVars.push(`--extensions-tertiary: ${dark} !important;`);
            rootVars.push(`--extensions-transparent: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35) !important;`);
            rootVars.push(`--extensions-light: ${drop} !important;`);
            rootVars.push(`--drop-highlight: ${drop} !important;`);
            rootVars.push(`--menu-bar-background: ${barHex} !important;`);
            rootVars.push('--menu-bar-background-image: none !important;');

            const metaThemeColor = document.head.querySelector('meta[name=theme-color]');
            if (metaThemeColor) {
                metaThemeColor.setAttribute('content', barHex);
            }
            window.Recolor = {
                primary: t.accentColor
            };
            AddonHooks.recolorCallbacks.forEach(cb => {
                try {
                    cb();
                } catch (_e) {
                    // ignore
                }
            });
        }
    }

    if (rootVars.length) {
        rules.push(`:root {\n  ${rootVars.join('\n  ')}\n}`);
    }

    const hasLottieWallpaper = isValidLottieData(t.wallpaperLottieData);
    const hasImageWallpaper = !hasLottieWallpaper && Boolean(t.wallpaperDataUrl);

    if (hasImageWallpaper || hasLottieWallpaper) {
        const workspaceFillOpacity = Math.max(0.12, Math.min(0.95, 1 - t.wallpaperOpacity)).toFixed(2);

        rules.push(`
[class*="gui_body-wrapper_"] {
  position: relative;
  overflow: hidden;
}
[class*="blocks_blocks_"] {
  position: relative;
  overflow: hidden;
}
[class*="blocks_blocks_"] .injectionDiv {
  background: transparent !important;
  position: relative;
  z-index: 1;
}
[class*="blocks_blocks_"] .blocklySvg {
  background-color: transparent !important;
}
[class*="blocks_blocks_"] .blocklyMainBackground {
  fill-opacity: ${workspaceFillOpacity} !important;
}
`);
    }

    if (hasImageWallpaper) {
        const safeUrl = t.wallpaperDataUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const bgSize = t.wallpaperSize === 'repeat' ? 'auto' : t.wallpaperSize;
        const bgRepeat = t.wallpaperSize === 'repeat' ? 'repeat' : 'no-repeat';
        const blurRule = t.wallpaperBlur > 0 ? `filter: blur(${t.wallpaperBlur}px); transform: scale(1.04);` : '';

        rules.push(`
[class*="blocks_blocks_"]::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("${safeUrl}");
  background-size: ${bgSize};
  background-repeat: ${bgRepeat};
  background-position: center center;
  opacity: ${t.wallpaperOpacity};
  ${blurRule}
  pointer-events: none;
  z-index: 0;
}
`);
    }

    if (hasLottieWallpaper) {
        rules.push(`
#${LOTTIE_CONTAINER_ID} > svg {
  width: 100% !important;
  height: 100% !important;
  display: block;
}
`);
    }

    if (t.uiRoundness !== '' && typeof t.uiRoundness === 'number') {
        const r = `${t.uiRoundness}px`;
        rules.push(`
[class*="stage-header_stage-button_"],
[class*="sprite-selector-item_sprite-selector-item_"],
[class*="menu-bar_menu-bar-item_"],
[class*="modal_modal-content_"],
[class*="react-tabs_react-tabs__tab_"] {
  border-radius: ${r} !important;
}
`);
    }

    if (rules.length) {
        getOrCreateStyleEl(STYLE_BASE_ID).textContent = rules.join('\n');
    } else {
        removeStyleEl(STYLE_BASE_ID);
    }

    if (t.customCss && t.customCss.trim()) {
        getOrCreateStyleEl(STYLE_CSS_ID).textContent = t.customCss;
    } else {
        removeStyleEl(STYLE_CSS_ID);
    }

    const lottieConfig = hasLottieWallpaper ? {
        data: t.wallpaperLottieData,
        signature: `${t.id}:${t.wallpaperLottieName}:${t.wallpaperSize}:${t.wallpaperLottieData.layers.length}:${t.wallpaperLottieData.op || ''}:${t.wallpaperLottieData.w || ''}x${t.wallpaperLottieData.h || ''}`,
        opacity: t.wallpaperOpacity,
        blur: t.wallpaperBlur,
        size: t.wallpaperSize,
        speed: t.wallpaperLottieSpeed || 1
    } : null;

    ensureDomSync(t.icons, lottieConfig);
    document.documentElement.setAttribute('data-uli-custom-theme', t.id);
};

const applyActiveCustomTheme = () => {
    const store = loadCustomThemeStore();
    if (!store.activeThemeId) {
        applyCustomTheme(null);
        return null;
    }
    const active = store.themes.find(t => t.id === store.activeThemeId) || null;
    applyCustomTheme(active);
    return active;
};

const disableActiveCustomAccent = () => {
    const store = loadCustomThemeStore();
    if (!store.activeThemeId) return;
    let changed = false;
    const nextThemes = store.themes.map(t => {
        if (t.id === store.activeThemeId && t.useCustomAccent) {
            changed = true;
            return Object.assign({}, t, {useCustomAccent: false});
        }
        return t;
    });
    if (changed) {
        try {
            saveCustomThemeStore({themes: nextThemes, activeThemeId: store.activeThemeId});
        } catch (_e) {
            // ignore
        }
    }
};

export {
    STORAGE_KEY,
    isValidLottieData,
    createEmptyTheme,
    sanitizeTheme,
    loadCustomThemeStore,
    saveCustomThemeStore,
    applyCustomTheme,
    applyActiveCustomTheme,
    disableActiveCustomAccent
};
