const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("studio", {
  bootstrap: () => ipcRenderer.invoke("studio:bootstrap"),
  inspect: (settings) => ipcRenderer.invoke("studio:inspect", settings),
  autoDetect: () => ipcRenderer.invoke("studio:auto-detect"),
  maintenance: (request) => ipcRenderer.invoke("studio:maintenance", request),
  cancelMaintenance: () => ipcRenderer.invoke("studio:cancel-maintenance"),
  removeCustom: (id) => ipcRenderer.invoke("studio:remove-custom", id),
  copyText: (text) => ipcRenderer.invoke("studio:copy", text),
  submit: (spec) => ipcRenderer.invoke("studio:submit", spec),
  cancel: (id) => ipcRenderer.invoke("studio:cancel", id),
  read: (id, name) => ipcRenderer.invoke("studio:read", { id, name }),
  openFolder: (id) => ipcRenderer.invoke("studio:open-folder", id),
  exportCSV: () => ipcRenderer.invoke("studio:export"),
  help: (topic) => ipcRenderer.invoke("studio:help", topic),
  onJobs: (callback) => {
    const listener = (_, jobs) => callback(jobs);
    ipcRenderer.on("studio:jobs", listener);
    return () => ipcRenderer.removeListener("studio:jobs", listener);
  },
  onLog: (callback) => {
    const listener = (_, event) => callback(event);
    ipcRenderer.on("studio:log", listener);
    return () => ipcRenderer.removeListener("studio:log", listener);
  },
  onMaintenance: (callback) => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on("studio:maintenance", listener);
    return () => ipcRenderer.removeListener("studio:maintenance", listener);
  },
});
