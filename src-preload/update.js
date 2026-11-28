const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('UpdatePreload', {
  getStrings: () => ipcRenderer.sendSync('get-strings'),
  getInfo: () => ipcRenderer.sendSync('get-info'),
  startUpdate: () => ipcRenderer.invoke('start-update'),
  scheduleUpdateAfterWork: () => ipcRenderer.invoke('schedule-update-after-work'),
  openReleasePage: () => ipcRenderer.invoke('open-release-page'),
  ignore: (permanently) => ipcRenderer.invoke('ignore', permanently),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update-progress', listener);
    return () => ipcRenderer.removeListener('update-progress', listener);
  }
});
