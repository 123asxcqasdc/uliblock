const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const {spawn} = require('child_process');
const {app} = require('electron');
const AbstractWindow = require('./windows/abstract');
const {name: pkgName, version: pkgVersion} = require('../package.json');

const REPO = '123asxcqasdc/uliblock';
const MAX_REDIRECTS = 10;

/**
 * Downloads a URL to a local file while following redirects and reporting progress.
 * @param {string} url
 * @param {string} destPath
 * @param {(progress: {received: number, total: number, percent: number | null}) => void} [onProgress]
 * @param {number} [redirectsLeft]
 * @returns {Promise<string>}
 */
const downloadFileWithProgress = (url, destPath, onProgress, redirectsLeft = MAX_REDIRECTS) => new Promise((resolve, reject) => {
  if (redirectsLeft < 0) {
    reject(new Error('Too many redirects while downloading update'));
    return;
  }

  let parsedURL;
  try {
    parsedURL = new URL(url);
  } catch (err) {
    reject(err);
    return;
  }

  const mod = parsedURL.protocol === 'http:' ? http : https;
  const req = mod.get(url, {
    headers: {
      'user-agent': `${pkgName}/${pkgVersion}`
    }
  }, (res) => {
    const status = res.statusCode || 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      const nextUrl = new URL(res.headers.location, url).toString();
      downloadFileWithProgress(nextUrl, destPath, onProgress, redirectsLeft - 1)
        .then(resolve, reject);
      return;
    }

    if (status !== 200) {
      res.resume();
      reject(new Error(`HTTP ${status} while downloading ${url}`));
      return;
    }

    const total = Number(res.headers['content-length']) || 0;
    let received = 0;
    const tmpPath = `${destPath}.part`;
    const fileStream = fs.createWriteStream(tmpPath);

    res.on('data', (chunk) => {
      received += chunk.length;
      if (onProgress) {
        onProgress({
          received,
          total,
          percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null
        });
      }
    });

    res.on('error', (err) => {
      fileStream.destroy();
      try {
        fs.unlinkSync(tmpPath);
      } catch (_e) {
        // ignore
      }
      reject(err);
    });

    fileStream.on('error', (err) => {
      res.destroy();
      try {
        fs.unlinkSync(tmpPath);
      } catch (_e) {
        // ignore
      }
      reject(err);
    });

    fileStream.on('finish', () => {
      fileStream.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        try {
          fs.renameSync(tmpPath, destPath);
          resolve(destPath);
        } catch (renameErr) {
          reject(renameErr);
        }
      });
    });

    res.pipe(fileStream);
  });

  req.on('error', reject);
});

const getCleanEnvForSpawn = () => {
  const env = Object.assign({}, process.env);
  // Strip AppImage variables so a spawned installer AppImage initializes cleanly
  delete env.APPIMAGE;
  delete env.APPDIR;
  delete env.ARGV0;
  delete env.OWD;
  return env;
};

/**
 * Forcefully closes all UliBlock windows and exits all processes so the installer
 * can replace/upgrade files cleanly without blocking on unsaved-changes prompts.
 */
const closeAllWindowsAndExit = () => {
  try {
    for (const win of AbstractWindow.getAllWindows()) {
      try {
        win.window.destroy();
      } catch (_e) {
        // ignore
      }
    }
  } catch (_e) {
    // ignore
  }
  setTimeout(() => {
    app.exit(0);
  }, 150);
};

/**
 * Checks whether a path's parent directory (or file itself) is writable.
 * @param {string} targetPath
 * @returns {boolean}
 */
const isWritablePath = (targetPath) => {
  try {
    fs.accessSync(targetPath, fs.constants.W_OK);
    fs.accessSync(path.dirname(targetPath), fs.constants.W_OK);
    return true;
  } catch (_e) {
    return false;
  }
};

/**
 * Downloads the appropriate installer for the current OS/arch, launches it in
 * unattended auto-update mode (-autoupdate on Linux, /S on Windows), and closes
 * all UliBlock processes.
 *
 * @param {{
 *   version: string,
 *   tag: string,
 *   onStatus?: (msg: string) => void,
 *   onProgress?: (progress: {received: number, total: number, percent: number | null}) => void
 * }} options
 */
const startSelfUpdate = async ({version, tag, onStatus, onProgress}) => {
  const cleanVersion = version.replace(/^v/i, '');
  const releaseTag = tag || `v${cleanVersion}`;
  const baseUrl = `https://github.com/${REPO}/releases/download/${releaseTag}`;
  const updateDir = path.join(os.tmpdir(), 'uliblock-autoupdate');
  fs.mkdirSync(updateDir, {recursive: true});

  if (process.platform === 'linux') {
    const isArm64 = process.arch === 'arm64';
    const currentAppImage = process.env.APPIMAGE;

    // If running as a portable writable AppImage, replace it in-place cleanly.
    if (currentAppImage && isWritablePath(currentAppImage)) {
      const appImageArch = isArm64 ? 'arm64' : 'x86_64';
      const assetName = `UliBlock-linux-${appImageArch}-${cleanVersion}.AppImage`;
      const downloadUrl = `${baseUrl}/${assetName}`;
      const newAppImagePath = path.join(updateDir, assetName);

      if (onStatus) onStatus(`Загрузка ${assetName}...`);
      await downloadFileWithProgress(downloadUrl, newAppImagePath, onProgress);
      fs.chmodSync(newAppImagePath, 0o755);

      if (onStatus) onStatus('Запуск обновления и перезапуск UliBlock...');
      const scriptPath = path.join(updateDir, 'apply-appimage-update.sh');
      const script = [
        '#!/bin/sh',
        'PID="$1"',
        'NEW_IMG="$2"',
        'TARGET_IMG="$3"',
        'i=0',
        'while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 40 ]; do',
        '  sleep 0.25',
        '  i=$((i + 1))',
        'done',
        'mv -f "$NEW_IMG" "$TARGET_IMG" && chmod +x "$TARGET_IMG"',
        'exec "$TARGET_IMG" >/dev/null 2>&1 &'
      ].join('\n') + '\n';
      fs.writeFileSync(scriptPath, script, {mode: 0o755});

      const child = spawn('/bin/sh', [scriptPath, String(process.pid), newAppImagePath, currentAppImage], {
        detached: true,
        stdio: 'ignore',
        env: getCleanEnvForSpawn()
      });
      child.unref();
      closeAllWindowsAndExit();
      return;
    }

    // Standard Linux (.deb) install: download lightweight AppImage installer and launch with -autoupdate
    const installerArch = isArm64 ? 'arm64' : 'x64';
    const installerName = `UliBlock-Installer-linux-${installerArch}-${cleanVersion}.AppImage`;
    const installerUrl = `${baseUrl}/${installerName}`;
    const installerPath = path.join(updateDir, installerName);

    if (onStatus) onStatus(`Загрузка установщика ${installerName}...`);
    await downloadFileWithProgress(installerUrl, installerPath, onProgress);
    fs.chmodSync(installerPath, 0o755);

    if (onStatus) onStatus('Запуск установщика в режиме автообновления...');
    const child = spawn(
      installerPath,
      ['-autoupdate', '--tag', releaseTag, '--wait-pid', String(process.pid)],
      {
        detached: true,
        stdio: 'ignore',
        env: getCleanEnvForSpawn()
      }
    );
    child.unref();
    closeAllWindowsAndExit();
    return;
  }

  if (process.platform === 'win32') {
    const installerName = `UliBlock-Setup-${cleanVersion}-x64.msi`;
    const installerUrl = `${baseUrl}/${installerName}`;
    const installerPath = path.join(updateDir, installerName);

    if (onStatus) onStatus(`Загрузка установщика ${installerName}...`);
    await downloadFileWithProgress(installerUrl, installerPath, onProgress);

    if (onStatus) onStatus('Запуск MSI-установщика...');
    // Helper cmd script waits for Electron PID to exit, runs MSI installer with standard
    // progress bar only (/passive, ALLUSERS=1 per-machine), and relaunches UliBlock.
    const helperCmd = path.join(updateDir, 'run-autoupdate.cmd');
    const exePath = process.execPath;
    const batLines = [
      '@echo off',
      `set "PID=${process.pid}"`,
      ':waitloop',
      'tasklist /FI "PID eq %PID%" 2>NUL | find /I "%PID%" >NUL',
      'if not errorlevel 1 (',
      '  timeout /t 1 /nobreak >NUL',
      '  goto waitloop',
      ')',
      `start "" /wait msiexec.exe /i "${installerPath}" /passive`,
      'if exist "%ProgramFiles%\\UliBlock\\UliBlock.exe" (',
      '  start "" "%ProgramFiles%\\UliBlock\\UliBlock.exe"',
      `) else if exist "${exePath}" (`,
      `  start "" "${exePath}"`,
      ')',
      'del /f /q "%~f0" >NUL 2>&1'
    ].join('\r\n') + '\r\n';
    fs.writeFileSync(helperCmd, batLines, 'utf-8');

    const child = spawn('cmd.exe', ['/c', helperCmd], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    closeAllWindowsAndExit();
    return;
  }

  throw new Error(`Автообновление не поддерживается на платформе ${process.platform}.`);
};

module.exports = {
  downloadFileWithProgress,
  startSelfUpdate
};
