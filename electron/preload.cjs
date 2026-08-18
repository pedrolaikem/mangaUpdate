const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mangaApi", {
  listMangas: () => ipcRenderer.invoke("manga:list"),
  addManga: (payload) => ipcRenderer.invoke("manga:add", payload),
  removeManga: (id) => ipcRenderer.invoke("manga:remove", id),
  toggleMangaStatus: (id) => ipcRenderer.invoke("manga:toggle-status", id),
  syncMangaNow: (id) => ipcRenderer.invoke("manga:sync-now", id),
  updateMangaProgress: (id, currentChapter) => ipcRenderer.invoke("manga:update-progress", id, currentChapter),
  testNotification: () => ipcRenderer.invoke("manga:test-notification"),
  testNewChapterNotification: () => ipcRenderer.invoke("manga:test-new-chapter-notification"),
  startTestNewChapterLoop: () => ipcRenderer.invoke("manga:start-test-new-chapter-loop"),
  stopTestNewChapterLoop: () => ipcRenderer.invoke("manga:stop-test-new-chapter-loop"),
  onRefreshList: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("manga:refresh-list", handler);
    return () => {
      ipcRenderer.removeListener("manga:refresh-list", handler);
    };
  },
  onPersistentAlert: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("manga:persistent-alert", handler);

    return () => {
      ipcRenderer.removeListener("manga:persistent-alert", handler);
    };
  },
  openUrl: (url) => ipcRenderer.invoke("manga:open-url", url),
  getAutoSyncStatus: () => ipcRenderer.invoke("manga:auto-sync-status"),
  scrapeManualUrl: (url) => ipcRenderer.invoke("manga:scrape-url", url),
  exportBackup: () => ipcRenderer.invoke("manga:export-backup"),
  importBackup: () => ipcRenderer.invoke("manga:import-backup"),
});
