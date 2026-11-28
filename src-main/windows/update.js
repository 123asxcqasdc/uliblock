const AbstractWindow = require('./abstract');
const {getLocale, getStrings} = require('../l10n');
const {APP_NAME} = require('../brand');
const openExternal = require('../open-external');
const {startSelfUpdate, scheduleUpdateAfterWork} = require('../auto-updater');

let openUpdateWindow = null;

class UpdateWindow extends AbstractWindow {
  constructor ({currentVersion, latestVersion, tag, releaseUrl, releaseNotes}) {
    super();

    openUpdateWindow = this;
    this.isUpdating = false;
    this.isDeferred = false;

    this.window.setTitle(`Обновление ${APP_NAME}`);

    this.ipc.on('get-strings', (event) => {
      event.returnValue = {
        appName: APP_NAME,
        locale: getLocale(),
        strings: getStrings()
      };
    });

    this.ipc.on('get-info', (event) => {
      event.returnValue = {
        currentVersion,
        latestVersion,
        tag: tag || `v${latestVersion}`,
        releaseUrl: releaseUrl || `https://github.com/123asxcqasdc/uliblock/releases/tag/v${latestVersion}`,
        releaseNotes: releaseNotes || '',
        platform: process.platform
      };
    });

    const sendProgress = (payload) => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send('update-progress', payload);
      }
    };

    this.ipc.handle('start-update', async () => {
      if (this.isUpdating) {
        return {ok: true};
      }
      this.isUpdating = true;

      try {
        await startSelfUpdate({
          version: latestVersion,
          tag: tag || `v${latestVersion}`,
          onStatus: (status) => {
            sendProgress({status});
          },
          onProgress: (progress) => {
            sendProgress(progress);
          }
        });
        return {ok: true};
      } catch (err) {
        this.isUpdating = false;
        const message = err && err.message ? err.message : String(err);
        sendProgress({error: message});
        return {ok: false, error: message};
      }
    });

    this.ipc.handle('schedule-update-after-work', async () => {
      if (this.isUpdating || this.isDeferred) {
        return {ok: true};
      }
      this.isDeferred = true;

      try {
        await scheduleUpdateAfterWork({
          version: latestVersion,
          tag: tag || `v${latestVersion}`,
          onStatus: (status) => {
            sendProgress({status});
          },
          onProgress: (progress) => {
            sendProgress(progress);
          }
        });
        sendProgress({
          status: 'Установщик скачан! Он запустится автоматически, когда вы закроете все окна UliBlock.',
          percent: 100,
          deferredReady: true
        });
        return {ok: true};
      } catch (err) {
        this.isDeferred = false;
        const message = err && err.message ? err.message : String(err);
        sendProgress({error: message});
        return {ok: false, error: message};
      }
    });

    this.ipc.handle('open-release-page', () => {
      openExternal(releaseUrl || `https://github.com/123asxcqasdc/uliblock/releases/tag/v${latestVersion}`);
    });

    const ignore = (permanently) => {
      if (!permanently) {
        // User clicked "Later" or closed the window: check again on next launch.
        return;
      }
      // 3000 ought to be enough years into the future...
      const until = new Date(3000, 0, 0);
      const {ignoreUpdate} = require('../update-checker');
      ignoreUpdate(latestVersion, until);
    };

    this.ipc.handle('ignore', (event, permanently) => {
      if (this.isUpdating) {
        return;
      }
      if (!this.isDeferred) {
        ignore(Boolean(permanently));
      }
      this.window.destroy();
    });

    this.window.on('closed', () => {
      if (openUpdateWindow === this) {
        openUpdateWindow = null;
      }
    });

    this.window.webContents.on('did-finish-load', () => {
      this.show();
    });

    this.loadURL('tw-update://./update.html');
  }

  getDimensions () {
    return {
      width: 640,
      height: 500
    };
  }

  getPreload () {
    return 'update';
  }

  isPopup () {
    return true;
  }

  static isOpen () {
    return Boolean(openUpdateWindow && !openUpdateWindow.window.isDestroyed());
  }

  static closeIfOpen () {
    if (openUpdateWindow && !openUpdateWindow.window.isDestroyed()) {
      openUpdateWindow.window.destroy();
    }
  }

  static updateAvailable (details) {
    if (UpdateWindow.isOpen()) {
      openUpdateWindow.window.focus();
      return;
    }
    new UpdateWindow(details);
  }
}

module.exports = UpdateWindow;
