import React from 'react';
import PropTypes from 'prop-types';
import styles from './community-gallery-modal.css';

const SOURCE_ORDER = [
  'official',
  'sharkpool',
  'penguinmod',
  'mistwarp',
  'dinosaurmod',
  'dashblocks',
  'snail-ide',
  'dimka-10',
  'turbowarp-cn',
  'bluedome77',
  'scrandled',
  'crispstrobe',
  'electramod',
  'gaia'
];

const SOURCE_EMOJI = {
  official: '✅',
  sharkpool: '🦈',
  'dimka-10': '🔟',
  'turbowarp-cn': '🀄',
  bluedome77: '🩵',
  penguinmod: '🐧',
  mistwarp: '🌫️',
  dinosaurmod: '🦕',
  'snail-ide': '🐌',
  dashblocks: '🔥',
  scrandled: '🎲',
  crispstrobe: '🧱',
  electramod: '⚡',
  gaia: '🐈'
};

const SOURCE_LABELS = {
  official: 'Официальная галерея',
  sharkpool: 'SharkPool',
  'dimka-10': 'Dimka-10',
  'turbowarp-cn': 'turbowarp-cn',
  bluedome77: 'BlueDome77',
  penguinmod: 'PenguinMod',
  mistwarp: 'MistWarp',
  dinosaurmod: 'DinosaurMod',
  'snail-ide': 'Snail IDE',
  dashblocks: 'DashBlocks',
  scrandled: 'scrandled',
  crispstrobe: 'CrispStrobe',
  electramod: 'ElectraMod',
  gaia: 'Gaia’s Gallery'
};

const SOURCE_URLS = {
  official: 'https://extensions.turbowarp.org/',
  sharkpool: 'https://sharkpool-sp.github.io/SharkPools-Extensions/',
  penguinmod: 'https://extensions.penguinmod.com/',
  'dimka-10': 'https://dimka-10.github.io/Scratch-Extensions-Gallery.github.io/',
  'turbowarp-cn': 'https://github.com/turbowarp-cn/cn-extensions',
  bluedome77: 'https://github.com/BlueDome77/Turbowarp-Extension-List',
  mistwarp: 'https://extensions.mistium.com/',
  dinosaurmod: 'https://dinosaurmod.github.io/extensions/',
  dashblocks: 'https://dashblocks.org/extensions/',
  'snail-ide': 'https://snail-ide.js.org/community-extensions/',
  scrandled: 'https://scrandled.vercel.app/',
  crispstrobe: 'https://crispstrobe.github.io/extensions/',
  electramod: 'https://electramod-extensions-gallery.vercel.app/',
  gaia: 'https://github.com/gaiawindwave90/gaias-gallery'
};

const getSourceRank = (source) => {
  const idx = SOURCE_ORDER.indexOf(source);
  return idx === -1 ? 999 : idx;
};

const GALLERY_URL = 'https://123asxcqasdc.github.io/turbowarp-extensions/';

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '0 Б';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
};

const formatDate = (timestamp) => {
  if (!timestamp) return null;
  try {
    return new Date(timestamp).toLocaleString();
  } catch (e) {
    return null;
  }
};

const safeFileName = (name) => `${(name || 'extension').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_')}.js`;

const resolveIconSrc = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  if (imageUrl.startsWith('https://extensions.turbowarp.org/')) {
    return imageUrl;
  }
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return `uliblock-ext-cache://./icon?url=${encodeURIComponent(imageUrl)}`;
  }
  return null;
};

const getVariantAuthor = (variant, ext) => {
  if (variant && variant.author) {
    return {
      name: variant.author,
      link: variant.author_link || null
    };
  }
  if (ext && ext.author) {
    return {
      name: ext.author,
      link: (variant && variant.author_link) || null
    };
  }
  return {
    name: null,
    link: null
  };
};

const getExtensionAuthors = (ext) => {
  const seen = new Map();
  if (ext.author) {
    seen.set(ext.author, null);
  }
  for (const v of (ext.variants || [])) {
    if (v.author) {
      if (!seen.has(v.author) || (!seen.get(v.author) && v.author_link)) {
        seen.set(v.author, v.author_link || null);
      }
    }
  }
  return Array.from(seen.entries()).map(([name, link]) => ({name, link}));
};

class ExtensionIcon extends React.PureComponent {
  constructor (props) {
    super(props);
    this.state = {failed: false};
    this.handleError = this.handleError.bind(this);
  }
  componentDidUpdate (prevProps) {
    if (prevProps.src !== this.props.src && this.state.failed) {
      this.setState({failed: false});
    }
  }
  handleError () {
    this.setState({failed: true});
  }
  render () {
    const resolved = resolveIconSrc(this.props.src);
    if (!resolved || this.state.failed) {
      return <div className={styles.cardEmoji}>🐌</div>;
    }
    return (
      <img
        className={styles.cardIcon}
        loading="lazy"
        src={resolved}
        alt=""
        onError={this.handleError}
      />
    );
  }
}

ExtensionIcon.propTypes = {
  src: PropTypes.string
};

class CommunityGalleryModal extends React.Component {
  constructor (props) {
    super(props);
    this.state = {
      loading: true,
      refreshing: false,
      error: null,
      offline: false,
      offlineError: null,
      fromCache: false,
      updatedAt: null,
      extensions: [],
      cachedUrls: new Set(),
      cacheStats: null,
      search: '',
      activeCat: 'all',
      activeSource: 'all',
      pickerExt: null,
      progress: null,
      busyUrl: null
    };
    this.scrollRef = React.createRef();
    this.unsubscribeProgress = null;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.loadCatalog = this.loadCatalog.bind(this);
    this.refreshStats = this.refreshStats.bind(this);
    this.handleClearCache = this.handleClearCache.bind(this);
  }

  componentDidMount () {
    window.addEventListener('keydown', this.handleKeyDown);
    if (window.EditorPreload && window.EditorPreload.communityGallery) {
      this.unsubscribeProgress = window.EditorPreload.communityGallery.onProgress((data) => {
        if (this.state.progress && data && data.url === this.state.progress.url) {
          this.setState((prev) => (prev.progress ? {
            progress: {
              ...prev.progress,
              percent: data.percent,
              label: `Скачиваем и кешируем расширение... (${data.percent}%)`
            }
          } : null));
        }
      });
    }
    this.loadCatalog(false);
    this.refreshStats();
  }

  componentWillUnmount () {
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this.unsubscribeProgress) {
      this.unsubscribeProgress();
    }
  }

  handleKeyDown (ev) {
    if (ev.key !== 'Escape') return;
    if (this.state.progress) return;
    if (this.state.pickerExt) {
      this.setState({pickerExt: null});
      return;
    }
    this.props.onClose();
  }

  async refreshStats () {
    if (!window.EditorPreload || !window.EditorPreload.communityGallery) return;
    try {
      const stats = await window.EditorPreload.communityGallery.getStats();
      this.setState({cacheStats: stats});
    } catch (e) {
      console.error(e);
    }
  }

  async loadCatalog (forceRefresh) {
    if (!window.EditorPreload || !window.EditorPreload.communityGallery) {
      this.setState({
        loading: false,
        error: 'API галереи сообщества недоступен'
      });
      return;
    }
    this.setState(forceRefresh ? {refreshing: true, error: null} : {loading: true, error: null});
    try {
      const res = await window.EditorPreload.communityGallery.getCatalog({forceRefresh});
      if (!res || !res.ok || !res.catalog) {
        this.setState({
          loading: false,
          refreshing: false,
          offline: true,
          error: (res && res.error) || 'Не удалось загрузить каталог расширений'
        });
        return;
      }
      const sorted = (res.catalog.extensions || []).slice().sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'ru')
      );
      this.setState({
        loading: false,
        refreshing: false,
        error: null,
        offline: !!res.offline,
        offlineError: res.offlineError || null,
        fromCache: !!res.fromCache,
        updatedAt: res.updatedAt || null,
        extensions: sorted,
        cachedUrls: new Set(res.cachedUrls || [])
      });
      this.refreshStats();
    } catch (err) {
      this.setState({
        loading: false,
        refreshing: false,
        offline: true,
        error: String(err && err.message ? err.message : err)
      });
    }
  }

  isVariantAvailableOffline (variant) {
    if (!variant || !variant.url) return false;
    if (variant.source === 'official' || variant.url.startsWith('https://extensions.turbowarp.org/')) {
      return true;
    }
    return this.state.cachedUrls.has(variant.url);
  }

  isVariantInCommunityCache (variant) {
    if (!variant || !variant.url) return false;
    if (variant.url.startsWith('https://extensions.turbowarp.org/')) return false;
    return this.state.cachedUrls.has(variant.url);
  }

  communitySources (ext) {
    return new Set((ext.variants || []).filter((v) => v.source !== 'official').map((v) => v.source));
  }

  isExclusiveTo (ext, source) {
    const cs = this.communitySources(ext);
    return cs.size === 1 && cs.has(source);
  }

  matchesSource (ext) {
    const {activeSource} = this.state;
    const variants = ext.variants || [];
    if (activeSource === 'all') return variants.length > 0;
    if (activeSource === '__cached__') {
      return variants.some((v) => this.isVariantInCommunityCache(v));
    }
    if (activeSource === '__multi__') return this.communitySources(ext).size > 1;
    if (activeSource === 'official') return variants.some((v) => v.source === 'official');
    return this.isExclusiveTo(ext, activeSource);
  }

  variantsForActiveSource (ext) {
    const {activeSource} = this.state;
    const variants = ext.variants || [];
    if (
      activeSource === 'all' ||
      activeSource === 'official' ||
      activeSource === '__multi__' ||
      activeSource === '__cached__'
    ) {
      return variants;
    }
    const filtered = variants.filter((v) => v.source === activeSource);
    return filtered.length ? filtered : variants;
  }

  bestVariant (ext) {
    const vs = this.variantsForActiveSource(ext);
    return vs.find((v) => !v.deprecated) || vs[0] || {};
  }

  async importVariant (ext, variant) {
    if (!variant || !variant.url) return;
    const authorInfo = getVariantAuthor(variant, ext);
    const sourceLabel = variant.source_label || SOURCE_LABELS[variant.source] || variant.source || 'Сообщество';
    const sourceEmoji = variant.source_emoji || SOURCE_EMOJI[variant.source] || '🐌';

    this.setState({
      pickerExt: null,
      progress: {
        url: variant.url,
        name: ext.name || 'Расширение',
        meta: `${sourceEmoji} ${sourceLabel}${authorInfo.name ? ` · Автор: ${authorInfo.name}` : ''}`,
        percent: 10,
        label: this.isVariantAvailableOffline(variant)
          ? 'Загружаем из локального кеша...'
          : 'Скачиваем и кешируем расширение...'
      }
    });

    try {
      const cacheRes = await window.EditorPreload.communityGallery.ensureCached({
        url: variant.url,
        name: ext.name,
        author: authorInfo.name,
        authorLink: authorInfo.link,
        source: variant.source,
        sourceLabel,
        sourceEmoji,
        documentation: variant.documentation || null,
        image: variant.image || ext.image || null
      });

      if (!cacheRes || !cacheRes.ok) {
        throw new Error('Не удалось закешировать расширение');
      }

      if (!cacheRes.bundledOfficial) {
        this.setState((prev) => {
          const next = new Set(prev.cachedUrls);
          next.add(variant.url);
          return {cachedUrls: next};
        });
      }

      this.setState((prev) => (prev.progress ? {
        progress: {
          ...prev.progress,
          percent: 90,
          label: 'Добавляем расширение в проект...'
        }
      } : null));

      await this.props.vm.extensionManager.loadExtensionURL(variant.url);

      this.setState((prev) => (prev.progress ? {
        progress: {
          ...prev.progress,
          percent: 100,
          label: 'Готово!'
        }
      } : null));

      this.refreshStats();

      setTimeout(() => {
        this.setState({progress: null});
        this.props.onClose();
      }, 250);
    } catch (err) {
      console.error('Failed to import extension:', err);
      this.setState({progress: null});
      // eslint-disable-next-line no-alert
      alert(`Ошибка загрузки «${ext.name}»: ${err && err.message ? err.message : err}`);
    }
  }

  async downloadVariant (ext, variant) {
    if (!variant || !variant.url) return;
    const filename = safeFileName(ext.name);
    const authorInfo = getVariantAuthor(variant, ext);
    const sourceLabel = variant.source_label || SOURCE_LABELS[variant.source] || variant.source || 'Community';

    this.setState({busyUrl: variant.url});
    try {
      const res = await window.EditorPreload.communityGallery.getSource({
        url: variant.url,
        name: ext.name,
        author: authorInfo.name,
        authorLink: authorInfo.link,
        source: variant.source,
        sourceLabel,
        sourceEmoji: variant.source_emoji || SOURCE_EMOJI[variant.source] || '🐌',
        documentation: variant.documentation || null,
        image: variant.image || ext.image || null
      });

      if (!res || !res.ok || typeof res.source !== 'string') {
        throw new Error('Не удалось получить исходный код расширения');
      }

      if (!variant.url.startsWith('https://extensions.turbowarp.org/')) {
        this.setState((prev) => {
          const next = new Set(prev.cachedUrls);
          next.add(variant.url);
          return {cachedUrls: next};
        });
        this.refreshStats();
      }

      const header = [
        `/* ${filename}`,
        `   source: ${sourceLabel} (${variant.url})`,
        authorInfo.name ? `   author: ${authorInfo.name}` : null,
        '   WARNING: third-party code, may be malicious! */',
        ''
      ].filter((line) => line !== null).join('\n');

      const blob = new Blob([header + res.source], {type: 'application/javascript;charset=utf-8'});
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch (err) {
      console.error('Failed to download extension:', err);
      // eslint-disable-next-line no-alert
      alert(`Ошибка скачивания «${ext.name}»: ${err && err.message ? err.message : err}`);
    } finally {
      this.setState({busyUrl: null});
    }
  }

  async handleRemoveFromCache (url) {
    if (!window.EditorPreload || !window.EditorPreload.communityGallery) return;
    await window.EditorPreload.communityGallery.removeCached(url);
    this.setState((prev) => {
      const next = new Set(prev.cachedUrls);
      next.delete(url);
      return {cachedUrls: next};
    });
    this.refreshStats();
  }

  async handleClearCache () {
    if (!window.EditorPreload || !window.EditorPreload.communityGallery) return;
    // eslint-disable-next-line no-alert
    if (!confirm('Очистить локальный кеш расширений сообщества? (Официальные расширения Scratch/TurboWarp останутся встроенными.)')) {
      return;
    }
    await window.EditorPreload.communityGallery.clearCache();
    this.setState({cachedUrls: new Set()});
    this.refreshStats();
  }

  handleCardAction (ext, mode) {
    const variants = ext.variants || [];
    if (variants.length <= 1 && variants[0]) {
      if (mode === 'download') {
        this.downloadVariant(ext, variants[0]);
      } else {
        this.importVariant(ext, variants[0]);
      }
    } else if (variants.length > 1) {
      this.setState({pickerExt: ext});
    }
  }

  selectCategory (cat) {
    this.setState({activeCat: cat});
    if (this.scrollRef.current) {
      this.scrollRef.current.scrollTo({top: 0, behavior: 'smooth'});
    }
  }

  render () {
    const {
      loading,
      refreshing,
      error,
      offline,
      updatedAt,
      extensions,
      cachedUrls,
      cacheStats,
      search,
      activeCat,
      activeSource,
      pickerExt,
      progress,
      busyUrl
    } = this.state;

    // Category counts
    const catCounts = {};
    for (const ext of extensions) {
      for (const c of (ext.categories || [])) {
        catCounts[c] = (catCounts[c] || 0) + 1;
      }
    }
    const sortedCats = Object.keys(catCounts).sort((a, b) => catCounts[b] - catCounts[a]);

    // Source counts (matching 123asxcqasdc.github.io/turbowarp-extensions/index.html)
    const exclusiveCounts = {};
    for (const ext of extensions) {
      for (const s of this.communitySources(ext)) {
        if (this.isExclusiveTo(ext, s)) {
          exclusiveCounts[s] = (exclusiveCounts[s] || 0) + 1;
        }
      }
    }
    const multiCount = extensions.filter((e) => this.communitySources(e).size > 1).length;
    const officialCount = extensions.filter((e) => (e.variants || []).some((v) => v.source === 'official')).length;
    const cachedExtCount = extensions.filter((e) => (e.variants || []).some((v) => this.isVariantInCommunityCache(v))).length;

    const q = search.trim().toLowerCase();
    const filtered = extensions.filter((e) => {
      if (!this.matchesSource(e)) return false;
      if (activeCat !== 'all' && !(e.categories || []).includes(activeCat)) return false;
      if (!q) return true;
      return (
        (e.name || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.author || '').toLowerCase().includes(q) ||
        (e.categories || []).some((c) => c.toLowerCase().includes(q)) ||
        (e.variants || []).some((v) =>
          (v.author || '').toLowerCase().includes(q) ||
          (v.source_label || '').toLowerCase().includes(q) ||
          (v.source || '').toLowerCase().includes(q)
        )
      );
    });

    return (
      <div
        className={styles.overlay}
        onClick={(e) => {
          if (e.target === e.currentTarget && !progress) {
            this.props.onClose();
          }
        }}
      >
        <div className={styles.container}>
          <div className={styles.topBar}>
            <div className={styles.titleGroup}>
              <h2 className={styles.title}>🐌 Галерея расширений UliBlock</h2>
              <span className={styles.subtitle}>
                официальная (вшита офлайн) + сообщество (кешируется на диск)
              </span>
            </div>
            <div className={styles.topActions}>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={this.props.onClose}
                title="Закрыть (Esc)"
              >
                ✕
              </button>
            </div>
          </div>

          <div
            className={styles.scrollArea}
            ref={this.scrollRef}
          >
            <div className={styles.warning}>
              ⚠️ <b>ВНИМАНИЕ: расширения сообщества — сторонний код.</b>{' '}
              В UliBlock расширения выполняются без песочницы и <b>могут содержать вредоносный код</b>.
              Официальная галерея TurboWarp вшита в редактор и проверена вручную; сторонние галереи сообщества
              не проверяются. <b>Используйте на свой страх и риск</b> и обращайте внимание на автора и исходную галерею.
            </div>

            <div className={styles.statusRow}>
              <div className={styles.statusBadges}>
                <span className={`${styles.statusPill} ${offline ? styles.statusPillOffline : styles.statusPillOnline}`}>
                  {offline ? '📡 Офлайн (из кеша)' : '🌐 Онлайн'}
                </span>
                <span className={styles.statusPill}>
                  💾 В кеше: {cachedUrls.size} ({formatBytes(cacheStats ? cacheStats.totalBytes : 0)})
                </span>
                {updatedAt ? (
                  <span className={styles.statusPill}>
                    🕒 Каталог: {formatDate(updatedAt)}
                  </span>
                ) : null}
              </div>
              <div className={styles.statusButtons}>
                <button
                  type="button"
                  className={styles.smallBtn}
                  disabled={refreshing || loading}
                  onClick={() => this.loadCatalog(true)}
                >
                  {refreshing ? '⏳ Обновляем...' : '🔄 Обновить каталог'}
                </button>
                {cachedUrls.size > 0 ? (
                  <button
                    type="button"
                    className={`${styles.smallBtn} ${styles.smallBtnDanger}`}
                    onClick={this.handleClearCache}
                  >
                    🗑 Очистить кеш
                  </button>
                ) : null}
              </div>
            </div>

            <div className={styles.toolbar}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="🐌 поиск по названию, описанию, автору, галерее..."
                value={search}
                onChange={(e) => this.setState({search: e.target.value})}
              />
              <span className={styles.countBadge}>{filtered.length} 🐌</span>
            </div>

            <div className={styles.filtersLabel}>категории</div>
            <div className={styles.filters}>
              <button
                type="button"
                className={`${styles.chip} ${activeCat === 'all' ? styles.chipActive : ''}`}
                onClick={() => this.setState({activeCat: 'all'})}
              >
                все · {extensions.length}
              </button>
              {sortedCats.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`${styles.chip} ${activeCat === cat ? styles.chipActive : ''}`}
                  onClick={() => this.setState({activeCat: cat})}
                >
                  {cat} · {catCounts[cat]}
                </button>
              ))}
            </div>

            <div className={styles.filtersLabel}>источники (галереи)</div>
            <div className={styles.filters}>
              <button
                type="button"
                className={`${styles.chip} ${activeSource === 'all' ? styles.chipActive : ''}`}
                onClick={() => this.setState({activeSource: 'all'})}
              >
                все · {extensions.length}
              </button>
              <button
                type="button"
                className={`${styles.chip} ${activeSource === '__cached__' ? styles.chipActive : ''}`}
                onClick={() => this.setState({activeSource: '__cached__'})}
              >
                💾 в кеше (офлайн) · {cachedExtCount}
              </button>
              <button
                type="button"
                className={`${styles.chip} ${activeSource === 'official' ? styles.chipActive : ''}`}
                onClick={() => this.setState({activeSource: 'official'})}
              >
                ✅ официальная · {officialCount}
              </button>
              {SOURCE_ORDER.concat(Object.keys(exclusiveCounts).filter((s) => !SOURCE_ORDER.includes(s)))
                .filter((s) => s !== 'official' && exclusiveCounts[s])
                .map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`${styles.chip} ${activeSource === s ? styles.chipActive : ''}`}
                    onClick={() => this.setState({activeSource: s})}
                  >
                    {`${SOURCE_EMOJI[s] || '🐌'} ${SOURCE_LABELS[s] || s} · ${exclusiveCounts[s]}`}
                  </button>
                ))}
              {multiCount > 0 ? (
                <button
                  type="button"
                  className={`${styles.chip} ${activeSource === '__multi__' ? styles.chipActive : ''}`}
                  onClick={() => this.setState({activeSource: '__multi__'})}
                >
                  🔗 несколько источников · {multiCount}
                </button>
              ) : null}
            </div>

            <div className={styles.grid}>
              {loading ? (
                <div className={styles.empty}>загружаем каталог расширений... 🐌</div>
              ) : error ? (
                <div className={styles.empty}>
                  🐌🍂 не удалось загрузить каталог: {error}
                  <br />
                  <small>Подключитесь к интернету один раз, чтобы каталог и выбранные расширения закешировались на диск.</small>
                </div>
              ) : filtered.length === 0 ? (
                <div className={styles.empty}>ничего не нашлось 🐌🍂</div>
              ) : filtered.map((ext) => {
                const best = this.bestVariant(ext);
                const seenSources = [];
                for (const v of (ext.variants || [])) {
                  if (!seenSources.includes(v.source)) seenSources.push(v.source);
                }
                seenSources.sort((a, b) => getSourceRank(a) - getSourceRank(b));
                const authors = getExtensionAuthors(ext);
                const hasCachedCommunity = (ext.variants || []).some((v) => this.isVariantInCommunityCache(v));
                const hasOfficial = (ext.variants || []).some((v) => v.source === 'official');
                const singleVariant = (ext.variants || []).length === 1 ? ext.variants[0] : null;
                const isBusy = singleVariant && busyUrl === singleVariant.url;

                return (
                  <div
                    key={`${ext.name}-${best.url || ''}`}
                    className={styles.card}
                  >
                    <ExtensionIcon src={best.image || ext.image} />
                    <div className={styles.cardName}>{ext.name}</div>

                    <div className={styles.cardMetaBox}>
                      <div className={styles.cardMetaRow}>
                        <span className={styles.cardMetaLabel}>Галерея:</span>
                        <div className={styles.cardBadges}>
                          {seenSources.map((s) => (
                            <span
                              key={s}
                              className={styles.sourceBadge}
                              title={SOURCE_URLS[s] || SOURCE_LABELS[s] || s}
                            >
                              {`${SOURCE_EMOJI[s] || '🐌'} ${SOURCE_LABELS[s] || s}`}
                            </span>
                          ))}
                          {hasOfficial ? (
                            <span className={styles.cachedBadge} title="Вшито в редактор, работает без сети">
                              вшито офлайн
                            </span>
                          ) : null}
                          {hasCachedCommunity ? (
                            <span className={styles.cachedBadge} title="Сохранено в локальном кеше, работает без сети">
                              💾 в кеше
                            </span>
                          ) : null}
                          {ext.all_deprecated ? (
                            <span className={styles.deprecatedBadge}>устарело</span>
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.cardMetaRow}>
                        <span className={styles.cardMetaLabel}>Автор:</span>
                        {authors.length > 0 ? authors.map((a, idx) => (
                          <React.Fragment key={a.name}>
                            {idx > 0 ? ', ' : null}
                            {a.link ? (
                              <a
                                href={a.link}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.cardAuthorLink}
                              >
                                {a.name}
                              </a>
                            ) : (
                              <span className={styles.cardAuthorText}>{a.name}</span>
                            )}
                          </React.Fragment>
                        )) : (
                          <span className={styles.cardAuthorText}>
                            {`см. источник (${seenSources.map((s) => SOURCE_LABELS[s] || s).join(', ')})`}
                          </span>
                        )}
                      </div>
                    </div>

                    {ext.categories && ext.categories.length > 0 ? (
                      <div className={styles.cardCats}>
                        {ext.categories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            className={styles.cardCat}
                            onClick={() => this.selectCategory(cat)}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className={styles.cardDescription}>
                      {ext.description || 'без описания'}
                    </div>

                    <div className={styles.cardButtons}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        disabled={isBusy}
                        onClick={() => this.handleCardAction(ext, 'import')}
                      >
                        {(ext.variants || []).length > 1
                          ? `📥 Источники (${ext.variants.length})`
                          : '📥 Импортировать'}
                      </button>
                      {singleVariant ? (
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                          disabled={isBusy}
                          onClick={() => this.handleCardAction(ext, 'download')}
                        >
                          {isBusy ? '⏳...' : '⬇ .js'}
                        </button>
                      ) : null}
                      {singleVariant && singleVariant.documentation ? (
                        <a
                          href={singleVariant.documentation}
                          target="_blank"
                          rel="noreferrer"
                          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                        >
                          доки
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.footer}>
              <div>
                Каталог:{' '}
                <a href={GALLERY_URL} target="_blank" rel="noreferrer">
                  123asxcqasdc.github.io/turbowarp-extensions
                </a>
              </div>
              <div>
                Источники:{' '}
                {SOURCE_ORDER.map((s, idx) => (
                  <React.Fragment key={s}>
                    {idx > 0 ? ' · ' : null}
                    <a href={SOURCE_URLS[s]} target="_blank" rel="noreferrer">
                      {`${SOURCE_EMOJI[s]} ${SOURCE_LABELS[s]}`}
                    </a>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {pickerExt ? (
            <div
              className={styles.subModalOverlay}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  this.setState({pickerExt: null});
                }
              }}
            >
              <div className={styles.subModal}>
                <h3 className={styles.subModalTitle}>🐌 {pickerExt.name}</h3>
                <div className={styles.subModalSub}>
                  выберите источник — их {(pickerExt.variants || []).length}
                </div>
                {(pickerExt.variants || [])
                  .slice()
                  .sort((a, b) => getSourceRank(a.source) - getSourceRank(b.source))
                  .map((v, i) => {
                    const authorInfo = getVariantAuthor(v, pickerExt);
                    const sourceLabel = v.source_label || SOURCE_LABELS[v.source] || v.source;
                    const sourceEmoji = v.source_emoji || SOURCE_EMOJI[v.source] || '🐌';
                    const sourceHome = SOURCE_URLS[v.source];
                    const isOfficial = v.source === 'official' || (v.url || '').startsWith('https://extensions.turbowarp.org/');
                    const isCached = this.isVariantInCommunityCache(v);
                    const isBusy = busyUrl === v.url;

                    return (
                      <div key={`${v.source}-${v.url}-${i}`} className={styles.variantCard}>
                        <div className={styles.variantHead}>
                          {sourceHome ? (
                            <a
                              href={sourceHome}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.variantSource}
                            >
                              {`${sourceEmoji} ${sourceLabel}`}
                            </a>
                          ) : (
                            <span className={styles.variantSource}>
                              {`${sourceEmoji} ${sourceLabel}`}
                            </span>
                          )}
                          <div className={styles.cardBadges}>
                            {isOfficial ? (
                              <span className={styles.cachedBadge}>вшито офлайн</span>
                            ) : null}
                            {isCached ? (
                              <span className={styles.cachedBadge}>💾 в кеше</span>
                            ) : null}
                            {v.deprecated ? (
                              <span className={styles.deprecatedBadge}>устарело</span>
                            ) : null}
                          </div>
                        </div>

                        <div className={styles.variantAuthor}>
                          <b>Автор:</b>{' '}
                          {authorInfo.name ? (
                            authorInfo.link ? (
                              <a href={authorInfo.link} target="_blank" rel="noreferrer">
                                {authorInfo.name}
                              </a>
                            ) : authorInfo.name
                          ) : `не указан (галерея: ${sourceLabel})`}
                        </div>

                        {v.description ? (
                          <div className={styles.variantDesc}>{v.description}</div>
                        ) : null}

                        <div className={styles.variantActions}>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            disabled={isBusy}
                            onClick={() => this.importVariant(pickerExt, v)}
                          >
                            📥 Импортировать
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                            disabled={isBusy}
                            onClick={() => this.downloadVariant(pickerExt, v)}
                          >
                            {isBusy ? '⏳...' : '⬇ скачать .js'}
                          </button>
                          {v.documentation ? (
                            <a
                              href={v.documentation}
                              target="_blank"
                              rel="noreferrer"
                              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                            >
                              доки
                            </a>
                          ) : null}
                          {isCached ? (
                            <button
                              type="button"
                              className={`${styles.smallBtn} ${styles.smallBtnDanger}`}
                              onClick={() => this.handleRemoveFromCache(v.url)}
                            >
                              🗑 из кеша
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.subModalClose}`}
                  onClick={() => this.setState({pickerExt: null})}
                >
                  ← закрыть
                </button>
              </div>
            </div>
          ) : null}

          {progress ? (
            <div className={styles.progressOverlay}>
              <div className={styles.progressBox}>
                <div className={styles.progressTitle}>{progress.name}</div>
                <div className={styles.progressMeta}>{progress.meta}</div>
                <div className={styles.progressLabel}>{progress.label}</div>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{width: `${Math.max(0, Math.min(100, progress.percent || 0))}%`}}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
}

CommunityGalleryModal.propTypes = {
  vm: PropTypes.shape({
    extensionManager: PropTypes.shape({
      loadExtensionURL: PropTypes.func.isRequired
    }).isRequired
  }).isRequired,
  onClose: PropTypes.func.isRequired
};

export default CommunityGalleryModal;
