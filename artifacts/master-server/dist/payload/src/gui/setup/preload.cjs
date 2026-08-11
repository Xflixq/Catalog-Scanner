const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setup', {
  defaults: () => ipcRenderer.invoke('setup:defaults'),
  pickInstallDir: (current) => ipcRenderer.invoke('setup:pickInstallDir', current),
  install: (opts) => ipcRenderer.invoke('setup:install', opts),
  launch: (path) => ipcRenderer.invoke('setup:launch', path),
  openPath: (path) => ipcRenderer.invoke('setup:openPath', path),
  onProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('setup:progress', listener);
    return () => ipcRenderer.removeListener('setup:progress', listener);
  },
});
