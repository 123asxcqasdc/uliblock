import JSZip from '@turbowarp/jszip';
import downloadBlob from './download-blob';

const textEncoder = new TextEncoder();

const MIME_BY_EXT = {
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    json: 'application/json',
    js: 'application/javascript',
    txt: 'text/plain',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    sprite3: 'application/x.scratch.sprite3'
};

const sanitizeName = (raw, fallback = 'item') => {
    const str = typeof raw === 'string' ? raw.trim() : '';
    const cleaned = str.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+$/, '');
    return cleaned || fallback;
};

const uniqueFileName = (usedSet, baseName, ext) => {
    const cleanBase = sanitizeName(baseName, 'asset');
    const cleanExt = ext ? `.${ext.replace(/^\./, '')}` : '';
    let candidate = `${cleanBase}${cleanExt}`;
    let idx = 2;
    while (usedSet.has(candidate.toLowerCase())) {
        candidate = `${cleanBase} (${idx})${cleanExt}`;
        idx++;
    }
    usedSet.add(candidate.toLowerCase());
    return candidate;
};

const uniqueDirName = (usedSet, baseName) => {
    const cleanBase = sanitizeName(baseName, 'sprite');
    let candidate = cleanBase;
    let idx = 2;
    while (usedSet.has(candidate.toLowerCase())) {
        candidate = `${cleanBase} (${idx})`;
        idx++;
    }
    usedSet.add(candidate.toLowerCase());
    return candidate;
};

const formatBytes = bytes => {
    if (!bytes || bytes <= 0) return '0 Б';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
};

const toUint8Array = data => {
    if (!data) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof data === 'string') return textEncoder.encode(data);
    if (data.buffer instanceof ArrayBuffer) {
        return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength || data.length || 0);
    }
    return new Uint8Array(0);
};

const decodeDataUri = uri => {
    const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri);
    if (!match) return null;
    const isBase64 = Boolean(match[2]);
    const body = match[3] || '';
    if (isBase64) {
        const bin = atob(body);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
            out[i] = bin.charCodeAt(i);
        }
        return out;
    }
    return textEncoder.encode(decodeURIComponent(body));
};

const fetchExtensionBytes = async node => {
    if (node.bytes && node.bytes.length > 0) {
        return {bytes: node.bytes, fallbackName: null};
    }
    const url = node.extensionUrl;
    if (!url) {
        return {
            bytes: textEncoder.encode(JSON.stringify({
                id: node.extensionId,
                builtin: true
            }, null, 2)),
            fallbackName: `${node.extensionId}.json`
        };
    }
    if (url.startsWith('data:')) {
        const decoded = decodeDataUri(url);
        if (decoded) {
            return {bytes: decoded, fallbackName: null};
        }
    }
    try {
        const res = await fetch(url);
        if (res.ok) {
            const buf = await res.arrayBuffer();
            return {bytes: new Uint8Array(buf), fallbackName: null};
        }
    } catch (_e) {
        // Offline or unreachable; fall back to URL stub
    }
    return {
        bytes: textEncoder.encode(`// ${node.extensionId}\n// Source URL: ${url}\n`),
        fallbackName: `${node.extensionId}.url.txt`
    };
};

/**
 * Builds an Explorer-style virtual filesystem snapshot of the current VM project.
 * @param {object} vm
 * @param {string} projectTitle
 */
const buildSb3ExplorerSnapshot = (vm, projectTitle = 'UliBlock Project') => {
    const projectJsonStr = vm.toJSON();
    let projectJson = {};
    try {
        projectJson = JSON.parse(projectJsonStr);
    } catch (_e) {
        projectJson = {};
    }

    const formattedProjectJson = JSON.stringify(projectJson, null, 2);
    const projectJsonBytes = textEncoder.encode(formattedProjectJson);

    const nodesByPath = {};
    const allFileNodes = [];
    const costumeNodes = [];
    const soundNodes = [];
    const extensionNodes = [];
    const spriteEntries = [];

    const ensureDir = (dirPath, name, parentPath, meta = {}) => {
        if (!nodesByPath[dirPath]) {
            const node = Object.assign({
                path: dirPath,
                parentPath,
                name,
                type: 'dir',
                children: []
            }, meta);
            nodesByPath[dirPath] = node;
            if (parentPath !== null && nodesByPath[parentPath]) {
                nodesByPath[parentPath].children.push(node);
            }
        }
        return nodesByPath[dirPath];
    };

    const addFile = (filePath, parentPath, name, fileProps) => {
        const node = Object.assign({
            path: filePath,
            parentPath,
            name,
            type: 'file'
        }, fileProps);
        nodesByPath[filePath] = node;
        if (nodesByPath[parentPath]) {
            nodesByPath[parentPath].children.push(node);
        }
        allFileNodes.push(node);
        return node;
    };

    ensureDir('/', sanitizeName(projectTitle, 'project'), null, {isRoot: true});

    addFile('/project.json', '/', 'project.json', {
        kind: 'json',
        ext: 'json',
        mime: MIME_BY_EXT.json,
        bytes: projectJsonBytes,
        text: formattedProjectJson,
        size: projectJsonBytes.length,
        description: 'Корневой JSON проекта Scratch 3.0'
    });

    const usedTopDirs = new Set(['extensions', 'fonts', 'project.json']);
    const targets = (vm.runtime && Array.isArray(vm.runtime.targets)) ?
        vm.runtime.targets.filter(t => t && t.isOriginal) :
        [];
    const jsonTargets = Array.isArray(projectJson.targets) ? projectJson.targets : [];

    targets.forEach((target, idx) => {
        const rawName = target.isStage ? 'Stage' : (target.sprite && target.sprite.name ? target.sprite.name : `Sprite${idx}`);
        const dirName = uniqueDirName(usedTopDirs, rawName);
        const targetDir = `/${dirName}`;
        const resDir = `${targetDir}/res`;
        const costumeFolderName = target.isStage ? 'backdrops' : 'costumes';
        const costumesDir = `${resDir}/${costumeFolderName}`;
        const soundsDir = `${resDir}/sounds`;

        ensureDir(targetDir, dirName, '/', {
            isTargetDir: true,
            isStage: Boolean(target.isStage),
            targetId: target.id,
            displayName: rawName
        });
        ensureDir(resDir, 'res', targetDir);
        ensureDir(costumesDir, costumeFolderName, resDir);
        ensureDir(soundsDir, 'sounds', resDir);

        const costumes = (target.sprite && Array.isArray(target.sprite.costumes)) ? target.sprite.costumes : [];
        const usedCostumeNames = new Set();
        costumes.forEach(costume => {
            const ext = (costume.dataFormat || 'svg').toLowerCase();
            const fileName = uniqueFileName(usedCostumeNames, costume.name || 'costume', ext);
            const bytes = toUint8Array(costume.asset && costume.asset.data);
            const node = addFile(`${costumesDir}/${fileName}`, costumesDir, fileName, {
                kind: 'costume',
                isBackdrop: Boolean(target.isStage),
                spriteName: rawName,
                originalName: costume.name || fileName,
                ext,
                mime: MIME_BY_EXT[ext] || 'application/octet-stream',
                bytes,
                size: bytes.length,
                md5: costume.md5 || '',
                assetId: costume.assetId || '',
                rotationCenterX: costume.rotationCenterX,
                rotationCenterY: costume.rotationCenterY,
                bitmapResolution: costume.bitmapResolution || 1
            });
            costumeNodes.push(node);
        });

        const sounds = (target.sprite && Array.isArray(target.sprite.sounds)) ? target.sprite.sounds : [];
        const usedSoundNames = new Set();
        sounds.forEach(sound => {
            const ext = (sound.dataFormat || 'wav').toLowerCase();
            const fileName = uniqueFileName(usedSoundNames, sound.name || 'sound', ext);
            const bytes = toUint8Array(sound.asset && sound.asset.data);
            const node = addFile(`${soundsDir}/${fileName}`, soundsDir, fileName, {
                kind: 'sound',
                spriteName: rawName,
                originalName: sound.name || fileName,
                ext,
                mime: MIME_BY_EXT[ext] || 'application/octet-stream',
                bytes,
                size: bytes.length,
                md5: sound.md5 || '',
                rate: sound.rate,
                sampleCount: sound.sampleCount
            });
            soundNodes.push(node);
        });

        // Target sprite.json
        const matchedJson = jsonTargets.find(jt => jt && jt.isStage === target.isStage && jt.name === target.sprite.name) ||
            jsonTargets[idx] ||
            {};
        const spriteJsonText = JSON.stringify(matchedJson, null, 2);
        const spriteJsonBytes = textEncoder.encode(spriteJsonText);
        addFile(`${targetDir}/sprite.json`, targetDir, 'sprite.json', {
            kind: 'json',
            ext: 'json',
            mime: MIME_BY_EXT.json,
            bytes: spriteJsonBytes,
            text: spriteJsonText,
            size: spriteJsonBytes.length,
            description: target.isStage ? 'JSON-данные сцены' : `JSON-данные спрайта «${rawName}»`
        });

        // Virtual .sprite3 file for non-stage sprites (and stage too if desired, labeled clearly)
        if (!target.isStage) {
            const sprite3Name = `${dirName}.sprite3`;
            addFile(`${targetDir}/${sprite3Name}`, targetDir, sprite3Name, {
                kind: 'sprite3',
                ext: 'sprite3',
                mime: MIME_BY_EXT.sprite3,
                targetId: target.id,
                spriteName: rawName,
                size: 0,
                description: `Пакет спрайта .sprite3 («${rawName}»)`
            });
        }

        spriteEntries.push({
            id: target.id,
            name: rawName,
            dirName,
            dirPath: targetDir,
            isStage: Boolean(target.isStage),
            costumeCount: costumes.length,
            soundCount: sounds.length,
            blockCount: target.blocks && target.blocks._blocks ? Object.keys(target.blocks._blocks).length : 0,
            variableCount: target.variables ? Object.keys(target.variables).length : 0
        });
    });

    // Extensions folder
    ensureDir('/extensions', 'extensions', '/');
    const extManager = vm.extensionManager;
    const managerURLs = extManager && typeof extManager.getExtensionURLs === 'function' ?
        extManager.getExtensionURLs() :
        {};
    const projectExtURLs = projectJson.extensionURLs && typeof projectJson.extensionURLs === 'object' ?
        projectJson.extensionURLs :
        {};
    const allExtIds = new Set();
    if (Array.isArray(projectJson.extensions)) {
        projectJson.extensions.forEach(id => allExtIds.add(id));
    }
    if (extManager && extManager._loadedExtensions && typeof extManager._loadedExtensions.keys === 'function') {
        for (const id of extManager._loadedExtensions.keys()) {
            allExtIds.add(id);
        }
    }
    Object.keys(managerURLs).forEach(id => allExtIds.add(id));
    Object.keys(projectExtURLs).forEach(id => allExtIds.add(id));

    const extensionsSummary = [];
    const usedExtNames = new Set(['extensions.json']);
    for (const extId of allExtIds) {
        const extUrl = managerURLs[extId] || projectExtURLs[extId] || '';
        const isBuiltin = !extUrl && !(
            extManager &&
            extManager.builtinExtensions &&
            !Object.prototype.hasOwnProperty.call(extManager.builtinExtensions, extId)
        );
        extensionsSummary.push({
            id: extId,
            type: extUrl ? 'custom' : 'builtin',
            url: extUrl || null
        });

        if (extUrl) {
            const fileName = uniqueFileName(usedExtNames, extId, 'js');
            const preDecoded = extUrl.startsWith('data:') ? decodeDataUri(extUrl) : null;
            const node = addFile(`/extensions/${fileName}`, '/extensions', fileName, {
                kind: 'extension-js',
                ext: 'js',
                mime: MIME_BY_EXT.js,
                extensionId: extId,
                extensionUrl: extUrl,
                bytes: preDecoded,
                size: preDecoded ? preDecoded.length : 0,
                description: `Пользовательское расширение ${extId}`
            });
            extensionNodes.push(node);
        } else {
            const fileName = uniqueFileName(usedExtNames, extId, 'json');
            const metaText = JSON.stringify({
                id: extId,
                type: isBuiltin ? 'builtin' : 'internal',
                note: 'Встроенное расширение Scratch/TurboWarp'
            }, null, 2);
            const metaBytes = textEncoder.encode(metaText);
            const node = addFile(`/extensions/${fileName}`, '/extensions', fileName, {
                kind: 'extension-builtin',
                ext: 'json',
                mime: MIME_BY_EXT.json,
                extensionId: extId,
                extensionUrl: '',
                bytes: metaBytes,
                text: metaText,
                size: metaBytes.length,
                description: `Встроенное расширение ${extId}`
            });
            extensionNodes.push(node);
        }
    }

    const extSummaryText = JSON.stringify(extensionsSummary, null, 2);
    const extSummaryBytes = textEncoder.encode(extSummaryText);
    addFile('/extensions/extensions.json', '/extensions', 'extensions.json', {
        kind: 'json',
        ext: 'json',
        mime: MIME_BY_EXT.json,
        bytes: extSummaryBytes,
        text: extSummaryText,
        size: extSummaryBytes.length,
        description: 'Список всех расширений проекта'
    });

    // Custom fonts folder (if any)
    let fontCount = 0;
    if (vm.runtime && vm.runtime.fontManager && typeof vm.runtime.fontManager.serializeAssets === 'function') {
        const fontAssets = vm.runtime.fontManager.serializeAssets() || [];
        if (fontAssets.length > 0) {
            ensureDir('/fonts', 'fonts', '/');
            const usedFontNames = new Set();
            fontAssets.forEach((asset, idx) => {
                const ext = (asset.dataFormat || 'ttf').toLowerCase();
                const base = asset.assetId || `font-${idx + 1}`;
                const fileName = uniqueFileName(usedFontNames, base, ext);
                const bytes = toUint8Array(asset.data);
                addFile(`/fonts/${fileName}`, '/fonts', fileName, {
                    kind: 'font',
                    ext,
                    mime: MIME_BY_EXT[ext] || 'application/octet-stream',
                    bytes,
                    size: bytes.length,
                    description: 'Встроенный шрифт проекта'
                });
                fontCount++;
            });
        }
    }

    const totalBytes = allFileNodes.reduce((acc, n) => acc + (n.size || 0), 0);

    return {
        rootPath: '/',
        nodesByPath,
        allFileNodes,
        costumeNodes,
        soundNodes,
        extensionNodes,
        spriteEntries,
        stats: {
            spriteCount: spriteEntries.filter(s => !s.isStage).length,
            costumeCount: costumeNodes.length,
            soundCount: soundNodes.length,
            extensionCount: extensionsSummary.length,
            fontCount,
            totalBytes
        }
    };
};

const collectFilesUnderPath = (nodesByPath, path) => {
    const node = nodesByPath[path];
    if (!node) return [];
    if (node.type === 'file') return [node];
    let result = [];
    for (const child of node.children || []) {
        result = result.concat(collectFilesUnderPath(nodesByPath, child.path));
    }
    return result;
};

const exportSingleNode = async (vm, node) => {
    if (!node || node.type !== 'file') return;
    if (node.kind === 'sprite3') {
        const blob = await vm.exportSprite(node.targetId, 'blob');
        downloadBlob(node.name, blob);
        return;
    }
    if (node.kind === 'extension-js') {
        const {bytes, fallbackName} = await fetchExtensionBytes(node);
        const name = fallbackName || node.name;
        downloadBlob(name, new Blob([bytes], {type: 'application/javascript'}));
        return;
    }
    const bytes = node.bytes || textEncoder.encode(node.text || '');
    downloadBlob(node.name, new Blob([bytes], {type: node.mime || 'application/octet-stream'}));
};

const exportNodesAsZip = async (vm, fileNodes, zipFilename, onProgress) => {
    const zip = new JSZip();
    const total = fileNodes.length;
    for (let i = 0; i < total; i++) {
        const node = fileNodes[i];
        if (onProgress) {
            onProgress(i + 1, total, node.name);
        }
        const relPath = node.path.replace(/^\/+/, '');
        if (node.kind === 'sprite3') {
            const buf = await vm.exportSprite(node.targetId, 'uint8array');
            zip.file(relPath, buf);
        } else if (node.kind === 'extension-js') {
            const {bytes, fallbackName} = await fetchExtensionBytes(node);
            const targetPath = fallbackName ?
                relPath.replace(/[^/]+$/, fallbackName) :
                relPath;
            zip.file(targetPath, bytes);
        } else {
            const bytes = node.bytes || textEncoder.encode(node.text || '');
            zip.file(relPath, bytes);
        }
    }
    const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {level: 6}
    });
    downloadBlob(zipFilename, blob);
};

const exportSpritesAsSprite3 = async (vm, spriteEntries, asZip, zipFilename, onProgress) => {
    const filtered = spriteEntries.filter(s => !s.isStage);
    if (filtered.length === 0) {
        throw new Error('В проекте нет спрайтов для экспорта (только Сцена).');
    }
    if (asZip && filtered.length > 1) {
        const zip = new JSZip();
        const used = new Set();
        for (let i = 0; i < filtered.length; i++) {
            const entry = filtered[i];
            if (onProgress) onProgress(i + 1, filtered.length, entry.name);
            const buf = await vm.exportSprite(entry.id, 'uint8array');
            const fileName = uniqueFileName(used, entry.name, 'sprite3');
            zip.file(fileName, buf);
        }
        const blob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {level: 6}
        });
        downloadBlob(zipFilename, blob);
        return;
    }

    const used = new Set();
    for (let i = 0; i < filtered.length; i++) {
        const entry = filtered[i];
        if (onProgress) onProgress(i + 1, filtered.length, entry.name);
        const blob = await vm.exportSprite(entry.id, 'blob');
        const fileName = uniqueFileName(used, entry.name, 'sprite3');
        downloadBlob(fileName, blob);
        if (i < filtered.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 180));
        }
    }
};

export {
    formatBytes,
    sanitizeName,
    fetchExtensionBytes,
    buildSb3ExplorerSnapshot,
    collectFilesUnderPath,
    exportSingleNode,
    exportNodesAsZip,
    exportSpritesAsSprite3
};
