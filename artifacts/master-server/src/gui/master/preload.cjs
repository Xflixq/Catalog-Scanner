const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('master', {
  status: () => ipcRenderer.invoke('master:status'),
  tether: () => ipcRenderer.invoke('master:tether'),
  codes: () => ipcRenderer.invoke('master:codes'),
  createCode: (opts) => ipcRenderer.invoke('master:createCode', opts),
  catalog: () => ipcRenderer.invoke('master:catalog'),
  saveConfig: (partial) => ipcRenderer.invoke('master:saveConfig', partial),
  pickDbPath: () => ipcRenderer.invoke('master:pickDbPath'),
  openExternal: (url) => ipcRenderer.invoke('master:openExternal', url),
});

contextBridge.exposeInMainWorld('winControls', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
});
