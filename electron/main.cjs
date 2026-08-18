const path = require("node:path");
const { app, BrowserWindow, ipcMain, Notification, shell, dialog, Tray, Menu, nativeImage } = require("electron");
const xlsx = require("xlsx");
const {
  initializeDatabase,
  listMangas,
  addManga,
  getMangaById,
  removeManga,
  toggleMangaStatus,
  updateMangaAfterSync,
  updateMangaProgress,
  exportBackupData,
  importBackupData,
} = require("./db.cjs");
const { syncMangaNow } = require("./sync.cjs");
const { scrapeUrl, scrapeChapterUrl } = require("./scraper.cjs");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;

let tray = null;
let forceQuit = false;

let autoSyncTimer = null;
let autoSyncInProgress = false;
let testNewChapterLoopTimer = null;
let testNewChapterLoopCounter = 123;
let autoSyncStatus = {
  intervalMinutes: 30,
  inProgress: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  checkedCount: 0,
  newChapterCount: 0,
  lastError: null,
};

// Gera um PNG 16x16 laranja sólido em memória para uso como ícone do tray.
function createTrayIconBuffer() {
  const zlib = require("zlib");

  function crc32(buf) {
    let crc = 0xffffffff;
    for (const byte of buf) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) {
        crc = crc & 1 ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1;
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function pngChunk(type, data) {
    const typeBytes = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length);
    const crcInput = Buffer.concat([typeBytes, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput));
    return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
  }

  const width = 16;
  const height = 16;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  // compression, filter, interlace = 0

  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter None
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = 255;     // R
      row[2 + x * 3] = 140;    // G
      row[3 + x * 3] = 0;       // B (laranja)
    }
    rows.push(row);
  }

  const compressed = zlib.deflateSync(Buffer.concat(rows));
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createTray(win) {
  const iconPath = path.join(__dirname, "..", "assets", "icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Manga Update");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Abrir",
      click: () => {
        win.show();
        win.focus();
      },
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        forceQuit = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Clique ou duplo-clique restaura a janela.
  tray.on("click", () => {
    win.show();
    win.focus();
  });
  tray.on("double-click", () => {
    win.show();
    win.focus();
  });
}

function isExternalHttpUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, "..", "assets", "icon.ico");
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  // Sempre que um link tentar abrir nova janela, redireciona para o navegador externo.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  // Bloqueia navegação da janela principal para fora do app e abre externamente.
  win.webContents.on("will-navigate", (event, url) => {
    const isInternalDev = isDev && url.startsWith(process.env.VITE_DEV_SERVER_URL);
    const isInternalFile = !isDev && url.startsWith("file:");

    if (isInternalDev || isInternalFile) {
      return;
    }

    if (isExternalHttpUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Botão de fechar mostra diálogo: Sair ou Minimizar para o tray.
  win.on("close", (event) => {
    if (forceQuit) {
      return;
    }

    event.preventDefault();

    dialog
      .showMessageBox(win, {
        type: "question",
        buttons: ["Minimizar para o tray", "Sair"],
        defaultId: 0,
        cancelId: 0,
        title: "Manga Update",
        message: "O que deseja fazer?",
        detail: "Minimizar mantém o app rodando em segundo plano e as sincronizações continuam.",
      })
      .then(({ response }) => {
        if (response === 1) {
          forceQuit = true;
          app.quit();
        } else {
          win.hide();
        }
      });
  });

  return win;
}

function notifySync(title, message) {
  const alertPayload = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    message,
    createdAt: new Date().toISOString(),
  };

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("manga:persistent-alert", alertPayload);
  }

  if (!Notification.isSupported()) {
    return;
  }

  new Notification({
    title,
    body: message,
    silent: false,
  }).show();
}

const SYNC_DELAY_BETWEEN_MANGAS_MS = 20 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAutoSyncCycle() {
  if (autoSyncInProgress) {
    return;
  }

  autoSyncInProgress = true;
  autoSyncStatus = {
    ...autoSyncStatus,
    inProgress: true,
    lastStartedAt: new Date().toISOString(),
    checkedCount: 0,
    newChapterCount: 0,
    lastError: null,
  };

  try {
    const mangas = listMangas().filter((manga) => manga.status === "active");
    const updatedMangas = [];

    for (let i = 0; i < mangas.length; i++) {
      const manga = mangas[i];

      try {
        const result = await syncMangaNow(manga.id);
        autoSyncStatus.checkedCount += 1;

        if (result.hasNewChapter) {
          autoSyncStatus.newChapterCount += 1;
          updatedMangas.push({
            title: result.displayTitle,
            chapter: result.lastChapter ?? "desconhecido",
          });
        }
      } catch (error) {
        console.error(`Falha no auto-sync para ID ${manga.id}:`, error);
        autoSyncStatus.lastError = error instanceof Error ? error.message : "Falha desconhecida.";
      }

      // Aguarda entre mangas para evitar rate limit, exceto após o último.
      if (i < mangas.length - 1) {
        await sleep(SYNC_DELAY_BETWEEN_MANGAS_MS);
      }
    }

    const novos = autoSyncStatus.newChapterCount;

    if (updatedMangas.length > 0) {
      const lista = updatedMangas.map((m) => `• ${m.title} — cap ${m.chapter}`).join("\n");
      const titulo = novos > 1
        ? `${novos} novos capitulos encontrados`
        : "Novo capitulo encontrado";
      notifySync(titulo, lista);
    }

    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("manga:refresh-list");
    }
  } finally {
    autoSyncInProgress = false;
    autoSyncStatus = {
      ...autoSyncStatus,
      inProgress: false,
      lastFinishedAt: new Date().toISOString(),
    };
  }
}

function startAutoSyncScheduler() {
  if (autoSyncTimer) {
    return;
  }

  void runAutoSyncCycle();

  autoSyncTimer = setInterval(() => {
    void runAutoSyncCycle();
  }, AUTO_SYNC_INTERVAL_MS);
}

function stopAutoSyncScheduler() {
  if (!autoSyncTimer) {
    return;
  }

  clearInterval(autoSyncTimer);
  autoSyncTimer = null;
}

function registerIpcHandlers() {
  const normalizeChapterValue = (value) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  ipcMain.handle("manga:list", () => {
    return listMangas();
  });

  ipcMain.handle("manga:add", async (_event, payload) => {
    const created = addManga(payload);

    const scrapedLastChapter = payload?.lastChapter?.trim() || null;
    const scrapedLatestChapterUrl = payload?.latestChapterUrl?.trim() || null;
    const scrapedLastReleaseDate = payload?.lastReleaseDate?.trim() || null;

    if (scrapedLastChapter || scrapedLatestChapterUrl || scrapedLastReleaseDate) {
      updateMangaAfterSync(created.id, {
        lastChapter: scrapedLastChapter,
        latestChapterUrl: scrapedLatestChapterUrl,
        lastReleaseDate: scrapedLastReleaseDate,
      });
    }

    const normalizedChapter = normalizeChapterValue(payload?.currentChapter);
    let currentChapterUrl = payload?.currentChapterUrl?.trim() || null;

    if (normalizedChapter && !currentChapterUrl && payload?.sourceUrl?.trim()) {
      try {
        currentChapterUrl = await scrapeChapterUrl(payload.sourceUrl.trim(), normalizedChapter);
      } catch {}
    }

    if (normalizedChapter) {
      const withProgress = updateMangaProgress(created.id, {
        currentChapter: normalizedChapter,
        currentChapterUrl,
      });
      return { ...withProgress, syncMessage: "Manga adicionado com sucesso." };
    }

    return { ...getMangaById(created.id), syncMessage: "Manga adicionado com sucesso." };
  });

  ipcMain.handle("manga:scrape-url", async (_event, url) => {
    if (typeof url !== "string" || !url.trim()) {
      return { success: false, title: null, latestChapter: null, error: "URL invalida." };
    }

    try {
      new URL(url);
    } catch {
      return { success: false, title: null, latestChapter: null, error: "URL invalida." };
    }

    return scrapeUrl(url);
  });

  ipcMain.handle("manga:remove", (_event, id) => {
    return removeManga(id);
  });

  ipcMain.handle("manga:toggle-status", (_event, id) => {
    return toggleMangaStatus(id);
  });

  ipcMain.handle("manga:sync-now", async (_event, id) => {
    return syncMangaNow(id);
  });

  ipcMain.handle("manga:update-progress", async (_event, id, chapterValue) => {
    const manga = getMangaById(id);

    if (!manga) {
      throw new Error("Manga nao encontrado.");
    }

    const normalizedChapter = normalizeChapterValue(chapterValue);
    let currentChapterUrl = null;

    if (normalizedChapter && manga.sourceUrl) {
      try {
        currentChapterUrl = await scrapeChapterUrl(manga.sourceUrl, normalizedChapter);
      } catch (error) {
        console.warn("[manga:update-progress][scrape-failed]", error instanceof Error ? error.message : error);
      }
    }

    const saved = updateMangaProgress(id, {
      currentChapter: normalizedChapter,
      currentChapterUrl,
    });

    const urlMissing = normalizedChapter && !currentChapterUrl && manga.sourceUrl;

    return {
      ...saved,
      syncMessage: urlMissing
        ? "Capitulo salvo. Nao foi possivel encontrar o link direto do capitulo na pagina da scan."
        : undefined,
    };
  });

  ipcMain.handle("manga:test-notification", () => {
    notifySync("Manga Update", "Teste de notificacao executado com sucesso.");
    return true;
  });

  ipcMain.handle("manga:test-new-chapter-notification", () => {
    notifySync("Manga Update", "Novo capitulo detectado: Capitulo 123 🔥");
    return true;
  });

  ipcMain.handle("manga:start-test-new-chapter-loop", () => {
    if (testNewChapterLoopTimer) {
      return { running: true };
    }

    testNewChapterLoopTimer = setInterval(() => {
      testNewChapterLoopCounter += 1;
      notifySync("Manga Update", `Novo capitulo detectado: Capitulo ${testNewChapterLoopCounter} 🔥`);
    }, 5000);

    return { running: true };
  });

  ipcMain.handle("manga:stop-test-new-chapter-loop", () => {
    if (testNewChapterLoopTimer) {
      clearInterval(testNewChapterLoopTimer);
      testNewChapterLoopTimer = null;
    }

    return { running: false };
  });

  ipcMain.handle("manga:open-url", async (_event, url) => {
    if (typeof url !== "string" || !url.trim()) {
      throw new Error("URL invalida.");
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("URL invalida.");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Somente links HTTP/HTTPS sao permitidos.");
    }

    await shell.openExternal(parsed.toString());
    return true;
  });

  ipcMain.handle("manga:auto-sync-status", () => {
    return {
      ...autoSyncStatus,
      inProgress: autoSyncInProgress,
    };
  });

  ipcMain.handle("manga:export-backup", async () => {
    const date = new Date().toISOString().slice(0, 10);
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "Exportar backup",
      defaultPath: `manga-backup-${date}.xlsx`,
      filters: [{ name: "Planilha Excel", extensions: ["xlsx"] }],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const mangas = exportBackupData();
    const rows = mangas.map((m) => ({
      Titulo: m.displayTitle,
      Titulo_Canonico: m.canonicalTitle || "",
      Fonte: m.source,
      URL_Fonte: m.sourceUrl || "",
      Capitulo_Atual: m.currentChapter || "",
      URL_Capitulo_Atual: m.currentChapterUrl || "",
      Ultimo_Capitulo: m.lastChapter || "",
      URL_Ultimo_Capitulo: m.latestChapterUrl || "",
      Data_Ultimo_Capitulo: m.lastReleaseDate || "",
      Status: m.status,
    }));

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Mangas");
    xlsx.writeFile(wb, filePath);

    return { success: true, count: rows.length, filePath };
  });

  ipcMain.handle("manga:import-backup", async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: "Importar backup",
      filters: [{ name: "Planilha Excel", extensions: ["xlsx"] }],
      properties: ["openFile"],
    });

    if (canceled || !filePaths.length) {
      return { success: false, canceled: true };
    }

    const wb = xlsx.readFile(filePaths[0]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json(ws);

    const rows = rawRows.map((r) => ({
      displayTitle: String(r["Titulo"] || "").trim(),
      canonicalTitle: String(r["Titulo_Canonico"] || "").trim() || null,
      source: r["Fonte"],
      sourceUrl: String(r["URL_Fonte"] || "").trim() || null,
      currentChapter: String(r["Capitulo_Atual"] || "").trim() || null,
      currentChapterUrl: String(r["URL_Capitulo_Atual"] || "").trim() || null,
      lastChapter: String(r["Ultimo_Capitulo"] || "").trim() || null,
      latestChapterUrl: String(r["URL_Ultimo_Capitulo"] || "").trim() || null,
      lastReleaseDate: String(r["Data_Ultimo_Capitulo"] || "").trim() || null,
      status: r["Status"],
    })).filter((r) => r.displayTitle);

    const count = importBackupData(rows);
    return { success: true, count };
  });
}

app.whenReady().then(() => {
  initializeDatabase(app.getPath("userData"));
  registerIpcHandlers();
  const win = createWindow();
  createTray(win);
  startAutoSyncScheduler();

  app.on("activate", () => {
    // macOS: restaura a janela se existir mas estiver oculta.
    const existing = BrowserWindow.getAllWindows()[0];
    if (existing) {
      existing.show();
      existing.focus();
    } else {
      const w = createWindow();
      createTray(w);
    }
  });
});

app.on("window-all-closed", () => {
  stopAutoSyncScheduler();

  if (testNewChapterLoopTimer) {
    clearInterval(testNewChapterLoopTimer);
    testNewChapterLoopTimer = null;
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
