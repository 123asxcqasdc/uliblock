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
 * Downloads the appropriate installer for the current OS/arch and returns a descriptor
 * ready to be launched immediately or after all UliBlock windows close.
 *
 * @param {{
 *   version: string,
 *   tag: string,
 *   onStatus?: (msg: string) => void,
 *   onProgress?: (progress: {received: number, total: number, percent: number | null}) => void
 * }} options
 */
const prepareSelfUpdate = async ({version, tag, onStatus, onProgress}) => {
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

      return {
        platform: 'linux',
        kind: 'appimage-inplace',
        updateDir,
        releaseTag,
        installerPath: newAppImagePath,
        targetAppImage: currentAppImage
      };
    }

    // Standard Linux (.deb / .rpm) install: download lightweight AppImage installer
    const installerArch = isArm64 ? 'arm64' : 'x64';
    const installerName = `UliBlock-Installer-linux-${installerArch}-${cleanVersion}.AppImage`;
    const installerUrl = `${baseUrl}/${installerName}`;
    const installerPath = path.join(updateDir, installerName);

    if (onStatus) onStatus(`Загрузка установщика ${installerName}...`);
    await downloadFileWithProgress(installerUrl, installerPath, onProgress);
    fs.chmodSync(installerPath, 0o755);

    return {
      platform: 'linux',
      kind: 'linux-installer',
      updateDir,
      releaseTag,
      installerPath
    };
  }

  if (process.platform === 'win32') {
    const installerName = `UliBlock-Setup-${cleanVersion}-x64.msi`;
    const installerUrl = `${baseUrl}/${installerName}`;
    const installerPath = path.join(updateDir, installerName);

    if (onStatus) onStatus(`Загрузка установщика ${installerName}...`);
    await downloadFileWithProgress(installerUrl, installerPath, onProgress);

    return {
      platform: 'win32',
      kind: 'win32-msi',
      updateDir,
      releaseTag,
      installerPath
    };
  }

  throw new Error(`Автообновление не поддерживается на платформе ${process.platform}.`);
};

/**
 * Spawns the prepared installer in detached mode waiting for the current process PID to exit.
 * @param {Awaited<ReturnType<typeof prepareSelfUpdate>>} prepared
 * @param {{relaunch?: boolean}} [opts]
 */
const launchPreparedUpdate = (prepared, {relaunch = true} = {}) => {
  if (!prepared) return;

  if (prepared.kind === 'appimage-inplace') {
    const scriptPath = path.join(prepared.updateDir, 'apply-appimage-update.sh');
    const lines = [
      '#!/bin/sh',
      'PID="$1"',
      'NEW_IMG="$2"',
      'TARGET_IMG="$3"',
      'i=0',
      'while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 80 ]; do',
      '  sleep 0.25',
      '  i=$((i + 1))',
      'done',
      'mv -f "$NEW_IMG" "$TARGET_IMG" && chmod +x "$TARGET_IMG"'
    ];
    if (relaunch) {
      lines.push('exec "$TARGET_IMG" >/dev/null 2>&1 &');
    }
    fs.writeFileSync(scriptPath, lines.join('\n') + '\n', {mode: 0o755});

    const child = spawn('/bin/sh', [scriptPath, String(process.pid), prepared.installerPath, prepared.targetAppImage], {
      detached: true,
      stdio: 'ignore',
      env: getCleanEnvForSpawn()
    });
    child.unref();
    return;
  }

  if (prepared.kind === 'linux-installer') {
    const args = ['-autoupdate', '--tag', prepared.releaseTag, '--wait-pid', String(process.pid)];
    if (!relaunch) {
      args.push('--no-relaunch');
    }
    const child = spawn(prepared.installerPath, args, {
      detached: true,
      stdio: 'ignore',
      env: getCleanEnvForSpawn()
    });
    child.unref();
    return;
  }

  if (prepared.kind === 'win32-msi') {
    const writeUtf16LeWithBom = (filePath, text) => {
      const bom = Buffer.from([0xFF, 0xFE]);
      const body = Buffer.from(text, 'utf16le');
      fs.writeFileSync(filePath, Buffer.concat([bom, body]));
    };

    const pathTxtFile = path.join(prepared.updateDir, 'update-path.txt');
    const helperVbs = path.join(prepared.updateDir, 'run-autoupdate.vbs');
    const exePath = process.execPath;
    const escVbs = (s) => String(s).replace(/"/g, '""');

    writeUtf16LeWithBom(pathTxtFile, prepared.installerPath);

    const vbsLines = [
      'Option Explicit',
      'On Error Resume Next',
      'Dim fso, sh, wmi, col, i, pathFile, msiPath, progFiles, targetExe, fallbackExe',
      'Set fso = CreateObject("Scripting.FileSystemObject")',
      'Set sh = CreateObject("WScript.Shell")',
      `Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")`,
      'For i = 1 To 80',
      `  Set col = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId = ${process.pid}")`,
      '  If Err.Number <> 0 Then',
      '    Err.Clear',
      '    WScript.Sleep 600',
      '    Exit For',
      '  End If',
      '  If col.Count = 0 Then Exit For',
      '  WScript.Sleep 250',
      'Next',
      `pathFile = "${escVbs(pathTxtFile)}"`,
      'If fso.FileExists(pathFile) Then',
      '  msiPath = fso.OpenTextFile(pathFile, 1, False, -1).ReadAll',
      '  msiPath = Replace(Replace(Trim(msiPath), vbCr, ""), vbLf, "")',
      'Else',
      `  msiPath = "${escVbs(prepared.installerPath)}"`,
      'End If',
      'If msiPath <> "" And fso.FileExists(msiPath) Then',
      '  sh.Run "msiexec.exe /i """ & msiPath & """ /passive", 1, True',
      'End If'
    ];
    if (relaunch) {
      vbsLines.push(
        'progFiles = sh.ExpandEnvironmentStrings("%ProgramFiles%")',
        'targetExe = progFiles & "\\UliBlock\\UliBlock.exe"',
        `fallbackExe = "${escVbs(exePath)}"`,
        'If fso.FileExists(targetExe) Then',
        '  sh.Run """" & targetExe & """", 1, False',
        'ElseIf fso.FileExists(fallbackExe) Then',
        '  sh.Run """" & fallbackExe & """", 1, False',
        'End If'
      );
    }
    vbsLines.push(
      'If fso.FileExists(pathFile) Then fso.DeleteFile pathFile, True',
      'fso.DeleteFile WScript.ScriptFullName, True'
    );
    writeUtf16LeWithBom(helperVbs, vbsLines.join('\r\n') + '\r\n');

    const child = spawn('wscript.exe', ['//B', '//Nologo', helperVbs], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.on('error', () => {
      try {
        const fallback = spawn('msiexec.exe', ['/i', prepared.installerPath, '/passive'], {
          detached: true,
          stdio: 'ignore'
        });
        fallback.unref();
      } catch (_e) {
        // ignore
      }
    });
    child.unref();
  }
};

/**
 * Downloads the appropriate installer for the current OS/arch, launches it in
 * unattended auto-update mode, and closes all UliBlock processes.
 */
const startSelfUpdate = async ({version, tag, onStatus, onProgress}) => {
  const prepared = await prepareSelfUpdate({version, tag, onStatus, onProgress});
  if (onStatus) {
    onStatus(prepared.kind === 'win32-msi' ?
      'Запуск MSI-установщика...' :
      (prepared.kind === 'appimage-inplace' ?
        'Запуск обновления и перезапуск UliBlock...' :
        'Запуск установщика в режиме автообновления...'));
  }
  launchPreparedUpdate(prepared, {relaunch: true});
  closeAllWindowsAndExit();
};

/**
 * @type {{
 *   status: 'downloading' | 'ready' | 'launched' | 'error',
 *   promise: Promise<any>,
 *   prepared: any,
 *   error: Error | null
 * } | null}
 */
let deferredUpdateState = null;

/**
 * Downloads the installer in the background and marks it to launch once all
 * UliBlock windows have been closed.
 */
const scheduleUpdateAfterWork = ({version, tag, onStatus, onProgress}) => {
  if (deferredUpdateState && (deferredUpdateState.status === 'downloading' || deferredUpdateState.status === 'ready')) {
    return deferredUpdateState.promise;
  }

  const state = {
    status: 'downloading',
    promise: null,
    prepared: null,
    error: null
  };
  deferredUpdateState = state;

  state.promise = prepareSelfUpdate({version, tag, onStatus, onProgress})
    .then((prepared) => {
      state.prepared = prepared;
      if (state.status !== 'launched') {
        state.status = 'ready';
      }
      if (onStatus) {
        onStatus('Установщик скачан! Установка запустится после закрытия всех окон UliBlock.');
      }
      return prepared;
    })
    .catch((err) => {
      state.error = err;
      state.status = 'error';
      throw err;
    });

  return state.promise;
};

const hasPendingDeferredUpdate = () => Boolean(
  deferredUpdateState &&
  (deferredUpdateState.status === 'downloading' || deferredUpdateState.status === 'ready')
);

const getDeferredUpdatePreparedSync = () => (
  deferredUpdateState && deferredUpdateState.status === 'ready' ? deferredUpdateState.prepared : null
);

const launchDeferredUpdateBeforeQuit = async () => {
  if (!deferredUpdateState || deferredUpdateState.status === 'launched' || deferredUpdateState.status === 'error') {
    return false;
  }
  if (deferredUpdateState.status === 'downloading') {
    try {
      await deferredUpdateState.promise;
    } catch (_e) {
      return false;
    }
  }
  if (deferredUpdateState.status === 'ready' && deferredUpdateState.prepared) {
    deferredUpdateState.status = 'launched';
    launchPreparedUpdate(deferredUpdateState.prepared, {relaunch: false});
    return true;
  }
  return false;
};

module.exports = {
  downloadFileWithProgress,
  prepareSelfUpdate,
  launchPreparedUpdate,
  startSelfUpdate,
  scheduleUpdateAfterWork,
  hasPendingDeferredUpdate,
  getDeferredUpdatePreparedSync,
  launchDeferredUpdateBeforeQuit
};
