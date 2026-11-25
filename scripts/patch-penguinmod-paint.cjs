const fs = require('fs');
const path = require('path');

const ULIBLOCK_GREEN = '#22a630';
const ULIBLOCK_GREEN_DARK = '#177421';

const walkFiles = (dir, out = []) => {
    if (!fs.existsSync(dir)) return out;
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkFiles(fullPath, out);
        } else {
            out.push(fullPath);
        }
    }
    return out;
};

const replaceAndWrite = (filePath, replacer) => {
    if (!fs.existsSync(filePath)) return false;
    const before = fs.readFileSync(filePath, 'utf8');
    const after = replacer(before);
    if (after !== before) {
        fs.writeFileSync(filePath, after, 'utf8');
        return true;
    }
    return false;
};

const findScratchPaintDirs = (rootDir) => {
    const candidates = new Set();
    const directPaths = [
        path.join(rootDir, 'node_modules', 'scratch-paint'),
        path.join(rootDir, 'packages', 'scratch-gui', 'node_modules', 'scratch-paint')
    ];
    for (const p of directPaths) {
        if (fs.existsSync(path.join(p, 'src'))) {
            candidates.add(fs.realpathSync(p));
        }
    }
    try {
        const resolved = require.resolve('scratch-paint/package.json', {
            paths: [rootDir, path.join(rootDir, 'packages', 'scratch-gui')]
        });
        const pkgDir = path.dirname(resolved);
        if (fs.existsSync(path.join(pkgDir, 'src'))) {
            candidates.add(fs.realpathSync(pkgDir));
        }
    } catch (_e) {
        // scratch-paint might not be installed yet
    }
    return Array.from(candidates);
};

const patchScratchPaintDir = (paintDir) => {
    const srcDir = path.join(paintDir, 'src');
    if (!fs.existsSync(srcDir)) return 0;

    let changedCount = 0;

    // 1. Patch src/css/colors.css to follow UliBlock theme CSS variables (defaulting to UliBlock green)
    if (replaceAndWrite(path.join(srcDir, 'css', 'colors.css'), css => css
        .replace(
            /\$motion-primary:\s*hsla\(\s*194\s*,\s*100%\s*,\s*50%\s*\)\s*;/gi,
            `$motion-primary: var(--paint-looks-secondary, ${ULIBLOCK_GREEN});`
        )
        .replace(
            /\$motion-tertiary:\s*#007da3\s*;/gi,
            `$motion-tertiary: var(--looks-secondary-dark, ${ULIBLOCK_GREEN_DARK});`
        )
        .replace(
            /\$motion-transparent:\s*hsla\(\s*194\s*,\s*100%\s*,\s*50%\s*,\s*0\.35\s*\)\s*;/gi,
            '$motion-transparent: var(--paint-looks-transparent, rgba(34, 166, 48, 0.35));'
        )
    )) {
        changedCount++;
    }

    // 2. Patch color-picker active swatch border/glow
    if (replaceAndWrite(path.join(srcDir, 'components', 'color-picker', 'color-picker.css'), css => css
        .replace(/#00c3ff/gi, `var(--paint-looks-secondary, ${ULIBLOCK_GREEN})`)
        .replace(/hsla\(\s*194\s*,\s*100%\s*,\s*50%\s*,\s*0\.2\s*\)/gi, 'var(--looks-light-transparent, rgba(34, 166, 48, 0.2))')
    )) {
        changedCount++;
    }

    // 3. Patch confirmation modal colors
    if (replaceAndWrite(path.join(srcDir, 'containers', 'confirmation.css'), css => css
        .replace(/hsla\(\s*194\s*,\s*100%\s*,\s*50%\s*,\s*0\.5\s*\)/gi, 'var(--motion-primary-transparent, rgba(34, 166, 48, 0.5))')
        .replace(/hsla\(\s*194\s*,\s*100%\s*,\s*50%\s*,\s*1\s*\)/gi, `var(--paint-looks-secondary, ${ULIBLOCK_GREEN})`)
        .replace(/hsla\(\s*194\s*,\s*100%\s*,\s*50%\s*,\s*0\.35\s*\)/gi, 'var(--paint-looks-transparent, rgba(34, 166, 48, 0.35))')
    )) {
        changedCount++;
    }

    // 4. Patch all SVG (and test HTML) icon files replacing PenguinMod cyan with UliBlock green
    for (const filePath of walkFiles(srcDir)) {
        if (filePath.endsWith('.svg') || filePath.endsWith('.html')) {
            if (replaceAndWrite(filePath, content => content
                .replace(/#00c3ff/gi, ULIBLOCK_GREEN)
                .replace(/#007da3/gi, ULIBLOCK_GREEN_DARK)
            )) {
                changedCount++;
            }
        }
    }

    return changedCount;
};

const patchPenguinModPaint = (rootDir = path.resolve(__dirname, '..')) => {
    const dirs = findScratchPaintDirs(rootDir);
    let totalChanged = 0;
    for (const dir of dirs) {
        totalChanged += patchScratchPaintDir(dir);
    }
    if (dirs.length > 0) {
        console.log(`[UliBlock] PenguinMod-Paint theme check (${dirs.length} package(s), ${totalChanged} file(s) updated).`);
    }
    return totalChanged;
};

if (require.main === module) {
    patchPenguinModPaint();
}

module.exports = {
    patchPenguinModPaint,
    patchScratchPaintDir
};
