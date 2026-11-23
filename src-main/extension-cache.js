const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const {app} = require('electron');
const {writeFileAtomic} = require('./atomic-write-stream');
const {name: pkgName, version: pkgVersion} = require('../package.json');

const COMMUNITY_GALLERY_BASE_URL = 'https://123asxcqasdc.github.io/turbowarp-extensions/';
const COMMUNITY_CATALOG_URL = 'https://123asxcqasdc.github.io/turbowarp-extensions/extensions.json';

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_EXTENSION_BYTES = 16 * 1024 * 1024; // 16 MiB safety cap
const MAX_ICON_BYTES = 2 * 1024 * 1024; // 2 MiB safety cap

const CONTENT_TYPE_TO_EXT = {
  'image/svg+xml': '.svg',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico'
};

const EXT_TO_CONTENT_TYPE = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const hashUrl = (url) => crypto.createHash('sha256').update(String(url)).digest('hex');

const isHttpUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
};

/**
 * Fetch a URL over HTTP/HTTPS with redirect following and progress callbacks.
 * @param {string} url
 * @param {{onProgress?: (info: {received: number, total: number, percent: number}) => void, maxBytes?: number}} [options]
 * @param {number} [redirectsRemaining]
 * @returns {Promise<{buffer: Buffer, contentType: string, finalUrl: string}>}
 */
const fetchBuffer = (url, options = {}, redirectsRemaining = MAX_REDIRECTS) => new Promise((resolve, reject) => {
  if (!isHttpUrl(url)) {
    reject(new Error(`Unsupported URL protocol: ${url}`));
    return;
  }

  const parsedURL = new URL(url);
  const mod = parsedURL.protocol === 'http:' ? require('http') : require('https');
  const maxBytes = options.maxBytes || MAX_EXTENSION_BYTES;

  const request = mod.get(url, {
    headers: {
      'user-agent': `${pkgName}/${pkgVersion}`,
      'accept': '*/*'
    },
    timeout: REQUEST_TIMEOUT_MS
  });

  request.on('timeout', () => {
    request.destroy(new Error(`Request timed out for ${url}`));
  });

  request.on('response', (response) => {
    const status = response.statusCode || 0;

    if (status >= 300 && status < 400 && response.headers.location) {
      response.resume();
      if (redirectsRemaining <= 0) {
        reject(new Error(`Too many redirects while fetching ${url}`));
        return;
      }
      const nextUrl = new URL(response.headers.location, url).href;
      fetchBuffer(nextUrl, options, redirectsRemaining - 1).then(resolve, reject);
      return;
    }

    if (status !== 200) {
      response.resume();
      reject(new Error(`HTTP ${status} while fetching ${url}`));
      return;
    }

    const total = Number(response.headers['content-length']) || 0;
    const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const chunks = [];
    let received = 0;

    response.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        request.destroy(new Error(`Response exceeded maximum allowed size (${maxBytes} bytes)`));
        return;
      }
      chunks.push(chunk);
      if (options.onProgress) {
        const percent = total > 0
          ? Math.min(85, Math.round((received / total) * 85))
          : Math.min(75, Math.round(10 + (received / 300000) * 65));
        options.onProgress({received, total, percent});
      }
    });

    response.on('end', () => {
      resolve({
        buffer: Buffer.concat(chunks),
        contentType,
        finalUrl: url
      });
    });

    response.on('error', reject);
  });

  request.on('error', reject);
});

class ExtensionCache {
  constructor () {
    this._initialized = false;
    this._cacheRoot = null;
    this._filesDir = null;
    this._iconsDir = null;
    this._indexPath = null;
    this._catalogPath = null;
    this._catalogMetaPath = null;
    /** @type {{version: number, entries: Record<string, any>, icons: Record<string, any>}} */
    this._index = {
      version: 1,
      entries: {},
      icons: {}
    };
    this._indexWritePromise = Promise.resolve();
    this._inflightIcons = new Map();
  }

  _ensureInit () {
    if (this._initialized) {
      return;
    }
    this._cacheRoot = path.join(app.getPath('userData'), 'uliblock-extensions-cache');
    this._filesDir = path.join(this._cacheRoot, 'files');
    this._iconsDir = path.join(this._cacheRoot, 'icons');
    this._indexPath = path.join(this._cacheRoot, 'index.json');
    this._catalogPath = path.join(this._cacheRoot, 'catalog.json');
    this._catalogMetaPath = path.join(this._cacheRoot, 'catalog-meta.json');

    try {
      fs.mkdirSync(this._filesDir, {recursive: true});
      fs.mkdirSync(this._iconsDir, {recursive: true});
    } catch (e) {
      console.error('Failed to create extension cache directories:', e);
    }

    try {
      if (fs.existsSync(this._indexPath)) {
        const parsed = JSON.parse(fs.readFileSync(this._indexPath, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          this._index = {
            version: 1,
            entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
            icons: parsed.icons && typeof parsed.icons === 'object' ? parsed.icons : {}
          };
        }
      }
    } catch (e) {
      console.error('Failed to read extension cache index, starting fresh:', e);
    }

    this._initialized = true;
  }

  _persistIndex () {
    this._ensureInit();
    const snapshot = JSON.stringify(this._index, null, 2);
    this._indexWritePromise = this._indexWritePromise
      .then(() => writeFileAtomic(this._indexPath, snapshot))
      .catch((err) => {
        console.error('Failed to persist extension cache index:', err);
      });
    return this._indexWritePromise;
  }

  getCacheRoot () {
    this._ensureInit();
    return this._cacheRoot;
  }

  /**
   * Synchronous lookup used by webRequest.onBeforeRequest so cached community
   * extensions resolve transparently even completely offline.
   * @param {string} url
   * @returns {string|null} Redirect URL (`uliblock-ext-cache://./files/<hash>.js`) or null
   */
  getRedirectUrlForCachedExtension (url) {
    if (!url || !isHttpUrl(url)) {
      return null;
    }
    // Official TurboWarp extensions are already bundled in dist-extensions via tw-extensions://
    if (url.startsWith('https://extensions.turbowarp.org/')) {
      return null;
    }
    this._ensureInit();
    const entry = this._index.entries[url];
    if (!entry || !entry.filename) {
      return null;
    }
    const diskPath = path.join(this._filesDir, entry.filename);
    if (!fs.existsSync(diskPath)) {
      return null;
    }
    return `uliblock-ext-cache://./files/${entry.filename}`;
  }

  getCachedUrls () {
    this._ensureInit();
    const valid = [];
    for (const [url, entry] of Object.entries(this._index.entries)) {
      if (entry && entry.filename && fs.existsSync(path.join(this._filesDir, entry.filename))) {
        valid.push(url);
      }
    }
    return valid;
  }

  getCachedEntries () {
    this._ensureInit();
    const result = [];
    for (const [url, entry] of Object.entries(this._index.entries)) {
      if (entry && entry.filename && fs.existsSync(path.join(this._filesDir, entry.filename))) {
        result.push({...entry, url});
      }
    }
    result.sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0));
    return result;
  }

  async getCacheStats () {
    this._ensureInit();
    const entries = this.getCachedEntries();
    let totalBytes = 0;
    for (const entry of entries) {
      totalBytes += Number(entry.size) || 0;
    }
    let catalogUpdatedAt = null;
    try {
      const metaRaw = await fsPromises.readFile(this._catalogMetaPath, 'utf-8');
      const meta = JSON.parse(metaRaw);
      catalogUpdatedAt = meta.updatedAt || null;
    } catch (e) {
      // No cached catalog yet
    }
    return {
      count: entries.length,
      totalBytes,
      catalogUpdatedAt,
      cacheDir: this._cacheRoot,
      galleryUrl: COMMUNITY_GALLERY_BASE_URL
    };
  }

  /**
   * Fetch community extensions.json catalog from network and cache to disk,
   * falling back to disk cache when offline.
   * @param {{forceRefresh?: boolean}} [options]
   */
  async getCatalog (options = {}) {
    this._ensureInit();
    const forceRefresh = !!options.forceRefresh;

    let cachedCatalog = null;
    let cachedMeta = null;
    try {
      if (fs.existsSync(this._catalogPath)) {
        cachedCatalog = JSON.parse(await fsPromises.readFile(this._catalogPath, 'utf-8'));
      }
      if (fs.existsSync(this._catalogMetaPath)) {
        cachedMeta = JSON.parse(await fsPromises.readFile(this._catalogMetaPath, 'utf-8'));
      }
    } catch (e) {
      console.error('Failed to read cached catalog:', e);
    }

    const cachedUrls = this.getCachedUrls();

    // Try network first if forceRefresh or no cache, or refresh when cache is older than 10 minutes
    const cacheAgeMs = cachedMeta && cachedMeta.updatedAt
      ? Date.now() - cachedMeta.updatedAt
      : Infinity;
    const shouldFetch = forceRefresh || !cachedCatalog || cacheAgeMs > 10 * 60 * 1000;

    if (shouldFetch) {
      try {
        const {buffer} = await fetchBuffer(COMMUNITY_CATALOG_URL, {
          maxBytes: 10 * 1024 * 1024
        });
        const parsed = JSON.parse(buffer.toString('utf-8'));
        if (!parsed || !Array.isArray(parsed.extensions)) {
          throw new Error('Invalid community catalog format');
        }
        const meta = {
          updatedAt: Date.now(),
          url: COMMUNITY_CATALOG_URL,
          totalRaw: parsed.total_raw || 0,
          totalMerged: parsed.total_merged || parsed.extensions.length
        };
        await writeFileAtomic(this._catalogPath, buffer);
        await writeFileAtomic(this._catalogMetaPath, JSON.stringify(meta, null, 2));
        return {
          ok: true,
          catalog: parsed,
          fromCache: false,
          offline: false,
          updatedAt: meta.updatedAt,
          cachedUrls,
          galleryUrl: COMMUNITY_GALLERY_BASE_URL
        };
      } catch (networkError) {
        if (cachedCatalog) {
          return {
            ok: true,
            catalog: cachedCatalog,
            fromCache: true,
            offline: true,
            offlineError: String(networkError.message || networkError),
            updatedAt: cachedMeta ? cachedMeta.updatedAt : null,
            cachedUrls,
            galleryUrl: COMMUNITY_GALLERY_BASE_URL
          };
        }
        return {
          ok: false,
          error: String(networkError.message || networkError),
          offline: true,
          cachedUrls,
          galleryUrl: COMMUNITY_GALLERY_BASE_URL
        };
      }
    }

    return {
      ok: true,
      catalog: cachedCatalog,
      fromCache: true,
      offline: false,
      updatedAt: cachedMeta ? cachedMeta.updatedAt : null,
      cachedUrls,
      galleryUrl: COMMUNITY_GALLERY_BASE_URL
    };
  }

  /**
   * Ensure a community extension is downloaded and cached on disk.
   * For official TurboWarp extensions (already bundled offline in dist-extensions),
   * returns immediately without duplicating them into the community cache.
   * @param {object} params
   * @param {(progress: {received: number, total: number, percent: number}) => void} [onProgress]
   */
  async ensureExtensionCached (params, onProgress) {
    this._ensureInit();
    const {
      url,
      name = 'Extension',
      author = null,
      authorLink = null,
      source = 'custom',
      sourceLabel = 'Community',
      sourceEmoji = '🐌',
      documentation = null,
      image = null,
      forceRefresh = false
    } = params || {};

    if (!url || !isHttpUrl(url)) {
      throw new Error(`Invalid extension URL: ${url}`);
    }

    // Official TurboWarp extensions are already built into dist-extensions/ and work offline
    if (url.startsWith('https://extensions.turbowarp.org/')) {
      if (onProgress) {
        onProgress({received: 1, total: 1, percent: 85});
      }
      return {
        ok: true,
        url,
        bundledOfficial: true,
        fromCache: true
      };
    }

    const hash = hashUrl(url);
    const filename = `${hash}.js`;
    const diskPath = path.join(this._filesDir, filename);

    if (!forceRefresh && this._index.entries[url] && fs.existsSync(diskPath)) {
      // Update metadata if newer attribution fields were passed
      const prev = this._index.entries[url];
      this._index.entries[url] = {
        ...prev,
        name: name || prev.name,
        author: author || prev.author,
        authorLink: authorLink || prev.authorLink,
        source: source || prev.source,
        sourceLabel: sourceLabel || prev.sourceLabel,
        sourceEmoji: sourceEmoji || prev.sourceEmoji,
        documentation: documentation || prev.documentation,
        image: image || prev.image
      };
      await this._persistIndex();
      if (onProgress) {
        onProgress({received: prev.size || 1, total: prev.size || 1, percent: 85});
      }
      return {
        ok: true,
        url,
        cachedUrl: `uliblock-ext-cache://./files/${filename}`,
        fromCache: true,
        size: prev.size || 0
      };
    }

    // Download from network and write atomically to disk
    const {buffer} = await fetchBuffer(url, {
      maxBytes: MAX_EXTENSION_BYTES,
      onProgress
    });

    await writeFileAtomic(diskPath, buffer);

    this._index.entries[url] = {
      url,
      hash,
      filename,
      name,
      author,
      authorLink,
      source,
      sourceLabel,
      sourceEmoji,
      documentation,
      image,
      cachedAt: Date.now(),
      size: buffer.length
    };
    await this._persistIndex();

    // Also opportunistically cache the icon in the background so offline browsing keeps thumbnails
    if (image && isHttpUrl(image) && !image.startsWith('https://extensions.turbowarp.org/')) {
      this._cacheIcon(image).catch(() => {});
    }

    return {
      ok: true,
      url,
      cachedUrl: `uliblock-ext-cache://./files/${filename}`,
      fromCache: false,
      size: buffer.length
    };
  }

  /**
   * Read the JavaScript text of an extension (from cache or network, caching on download).
   * Used for the "скачать .js" feature from the gallery.
   */
  async getExtensionSource (params) {
    this._ensureInit();
    const {url} = params || {};
    if (!url || !isHttpUrl(url)) {
      throw new Error(`Invalid extension URL: ${url}`);
    }

    // If official TurboWarp extension, try bundled dist-extensions first
    if (url.startsWith('https://extensions.turbowarp.org/')) {
      try {
        const parsed = new URL(url);
        const root = path.join(path.resolve(__dirname, '../dist-extensions'), '/');
        const resolved = path.join(root, parsed.pathname);
        if (resolved.startsWith(root) && fs.existsSync(`${resolved}.br`)) {
          const zlib = require('zlib');
          const compressed = await fsPromises.readFile(`${resolved}.br`);
          const decompressed = await new Promise((resolve, reject) => {
            zlib.brotliDecompress(compressed, (err, res) => (err ? reject(err) : resolve(res)));
          });
          return {
            ok: true,
            source: decompressed.toString('utf-8'),
            fromCache: true
          };
        }
      } catch (e) {
        // Fall through to network
      }
      const {buffer} = await fetchBuffer(url, {maxBytes: MAX_EXTENSION_BYTES});
      return {
        ok: true,
        source: buffer.toString('utf-8'),
        fromCache: false
      };
    }

    const result = await this.ensureExtensionCached(params);
    const entry = this._index.entries[url];
    const diskPath = path.join(this._filesDir, entry.filename);
    const source = await fsPromises.readFile(diskPath, 'utf-8');
    return {
      ok: true,
      source,
      fromCache: result.fromCache
    };
  }

  async removeCachedExtension (url) {
    this._ensureInit();
    const entry = this._index.entries[url];
    if (entry && entry.filename) {
      const diskPath = path.join(this._filesDir, entry.filename);
      await fsPromises.rm(diskPath, {force: true});
    }
    delete this._index.entries[url];
    await this._persistIndex();
    return {ok: true};
  }

  async clearCache () {
    this._ensureInit();
    await fsPromises.rm(this._filesDir, {recursive: true, force: true});
    await fsPromises.rm(this._iconsDir, {recursive: true, force: true});
    await fsPromises.mkdir(this._filesDir, {recursive: true});
    await fsPromises.mkdir(this._iconsDir, {recursive: true});
    this._index = {
      version: 1,
      entries: {},
      icons: {}
    };
    await this._persistIndex();
    return {ok: true};
  }

  async _cacheIcon (iconUrl) {
    this._ensureInit();
    const existing = this._index.icons[iconUrl];
    if (existing && existing.filename) {
      const diskPath = path.join(this._iconsDir, existing.filename);
      if (fs.existsSync(diskPath)) {
        return {
          diskPath,
          contentType: existing.contentType || 'application/octet-stream'
        };
      }
    }

    if (this._inflightIcons.has(iconUrl)) {
      return this._inflightIcons.get(iconUrl);
    }

    const promise = (async () => {
      try {
        const {buffer, contentType} = await fetchBuffer(iconUrl, {
          maxBytes: MAX_ICON_BYTES
        });
        let ext = CONTENT_TYPE_TO_EXT[contentType];
        if (!ext) {
          const urlExt = path.extname(new URL(iconUrl).pathname).toLowerCase();
          ext = EXT_TO_CONTENT_TYPE[urlExt] ? urlExt : '.png';
        }
        const resolvedContentType = EXT_TO_CONTENT_TYPE[ext] || contentType || 'image/png';
        const filename = `${hashUrl(iconUrl)}${ext}`;
        const diskPath = path.join(this._iconsDir, filename);
        await writeFileAtomic(diskPath, buffer);
        this._index.icons[iconUrl] = {
          url: iconUrl,
          filename,
          contentType: resolvedContentType,
          cachedAt: Date.now()
        };
        await this._persistIndex();
        return {diskPath, contentType: resolvedContentType};
      } finally {
        this._inflightIcons.delete(iconUrl);
      }
    })();

    this._inflightIcons.set(iconUrl, promise);
    return promise;
  }

  /**
   * Protocol handler for `uliblock-ext-cache://`
   * - `uliblock-ext-cache://./files/<hash>.js` -> serves cached JS file
   * - `uliblock-ext-cache://./icon?url=<encoded>` -> serves cached icon (or fetches & caches it)
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async handleProtocolRequest (request) {
    this._ensureInit();
    const baseHeaders = {
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*'
    };

    try {
      const parsed = new URL(request.url);

      if (parsed.pathname === '/icon') {
        const remoteUrl = parsed.searchParams.get('url');
        if (!remoteUrl || !isHttpUrl(remoteUrl)) {
          return new Response('Invalid icon URL', {status: 400, headers: baseHeaders});
        }
        try {
          const {diskPath, contentType} = await this._cacheIcon(remoteUrl);
          const data = await fsPromises.readFile(diskPath);
          return new Response(data, {
            status: 200,
            headers: {
              ...baseHeaders,
              'content-type': contentType,
              'cache-control': 'public, max-age=86400'
            }
          });
        } catch (err) {
          return new Response('Icon unavailable', {status: 404, headers: baseHeaders});
        }
      }

      if (parsed.pathname.startsWith('/files/')) {
        const filename = path.basename(parsed.pathname);
        if (!/^[a-f0-9]{64}\.js$/i.test(filename)) {
          return new Response('Invalid cached filename', {status: 400, headers: baseHeaders});
        }
        const diskPath = path.join(this._filesDir, filename);
        const data = await fsPromises.readFile(diskPath);
        return new Response(data, {
          status: 200,
          headers: {
            ...baseHeaders,
            'content-type': 'text/javascript; charset=utf-8'
          }
        });
      }

      return new Response('Not found', {status: 404, headers: baseHeaders});
    } catch (error) {
      return new Response(String(error && error.message ? error.message : error), {
        status: 404,
        headers: baseHeaders
      });
    }
  }
}

const extensionCache = new ExtensionCache();

module.exports = {
  extensionCache,
  COMMUNITY_GALLERY_BASE_URL,
  COMMUNITY_CATALOG_URL
};
