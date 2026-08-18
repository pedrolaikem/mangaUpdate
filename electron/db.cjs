const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

let db;

function dropLegacyUniqueConstraint() {
  const indexes = db.prepare("PRAGMA index_list('mangas')").all();
  const hasLegacyUnique = indexes.some((idx) => {
    if (!idx.unique) return false;
    const cols = db.prepare(`PRAGMA index_info('${idx.name}')`).all().map((c) => c.name);
    return cols.length === 2 && cols.includes("display_title") && cols.includes("source");
  });

  if (!hasLegacyUnique) return;

  db.exec(`
    BEGIN TRANSACTION;
    CREATE TABLE mangas_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_title TEXT NOT NULL,
      canonical_title TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      source_url TEXT,
      latest_chapter_url TEXT,
      current_chapter TEXT,
      current_chapter_url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_chapter TEXT,
      last_release_date TEXT,
      last_checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO mangas_new (id, display_title, canonical_title, source, source_url, latest_chapter_url, current_chapter, current_chapter_url, status, last_chapter, last_release_date, last_checked_at, created_at)
      SELECT id, display_title, canonical_title, source, source_url, latest_chapter_url, current_chapter, current_chapter_url, status, last_chapter, last_release_date, last_checked_at, created_at FROM mangas;
    DROP TABLE mangas;
    ALTER TABLE mangas_new RENAME TO mangas;
    COMMIT;
  `);
}

function ensureColumn(tableName, columnName, typeDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName});`).all();
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${typeDefinition};`);
  }
}

function initializeDatabase(userDataPath) {
  const dbDir = path.join(userDataPath, "data");
  fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, "manga-update.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS mangas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_title TEXT NOT NULL,
      canonical_title TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      source_url TEXT,
      latest_chapter_url TEXT,
      current_chapter TEXT,
      current_chapter_url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_chapter TEXT,
      last_release_date TEXT,
      last_checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn("mangas", "source_url", "TEXT");
  ensureColumn("mangas", "latest_chapter_url", "TEXT");
  ensureColumn("mangas", "current_chapter", "TEXT");
  ensureColumn("mangas", "current_chapter_url", "TEXT");

  dropLegacyUniqueConstraint();

  return dbPath;
}

function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized");
  }

  return db;
}

function listMangas() {
  const stmt = getDatabase().prepare(`
    SELECT
      id,
      display_title AS displayTitle,
      canonical_title AS canonicalTitle,
      source,
      source_url AS sourceUrl,
      latest_chapter_url AS latestChapterUrl,
      current_chapter AS currentChapter,
      current_chapter_url AS currentChapterUrl,
      status,
      last_chapter AS lastChapter,
      last_release_date AS lastReleaseDate,
      last_checked_at AS lastCheckedAt,
      created_at AS createdAt
    FROM mangas
    ORDER BY created_at DESC;
  `);

  return stmt.all();
}

function addManga(input) {
  const title = input.displayTitle?.trim();

  if (!title) {
    throw new Error("Digite um titulo de manga valido.");
  }

  const canonicalTitle = input.canonicalTitle?.trim() || null;
  const source = "manual";
  const sourceUrl = input.sourceUrl?.trim() || null;
  const currentChapter = input.currentChapter?.trim() || null;
  const currentChapterUrl = input.currentChapterUrl?.trim() || null;

  const stmt = getDatabase().prepare(`
    INSERT INTO mangas (display_title, canonical_title, source, source_url, current_chapter, current_chapter_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(title, canonicalTitle, source, sourceUrl, currentChapter, currentChapterUrl);
  return getMangaById(result.lastInsertRowid);
}

function getMangaById(id) {
  const stmt = getDatabase().prepare(`
    SELECT
      id,
      display_title AS displayTitle,
      canonical_title AS canonicalTitle,
      source,
      source_url AS sourceUrl,
      latest_chapter_url AS latestChapterUrl,
      current_chapter AS currentChapter,
      current_chapter_url AS currentChapterUrl,
      status,
      last_chapter AS lastChapter,
      last_release_date AS lastReleaseDate,
      last_checked_at AS lastCheckedAt,
      created_at AS createdAt
    FROM mangas
    WHERE id = ?;
  `);

  return stmt.get(id);
}

function removeManga(id) {
  const stmt = getDatabase().prepare("DELETE FROM mangas WHERE id = ?");
  return stmt.run(id).changes > 0;
}

function toggleMangaStatus(id) {
  const current = getDatabase().prepare("SELECT status FROM mangas WHERE id = ?").get(id);
  if (!current) {
    throw new Error("Manga nao encontrado.");
  }

  const nextStatus = current.status === "active" ? "paused" : "active";
  getDatabase().prepare("UPDATE mangas SET status = ? WHERE id = ?").run(nextStatus, id);

  return getMangaById(id);
}

function markChecked(id) {
  const now = new Date().toISOString();
  getDatabase().prepare("UPDATE mangas SET last_checked_at = ? WHERE id = ?").run(now, id);
  return getMangaById(id);
}

function updateMangaAfterSync(id, payload) {
  const now = new Date().toISOString();
  const stmt = getDatabase().prepare(`
    UPDATE mangas
    SET
      source = COALESCE(?, source),
      canonical_title = COALESCE(?, canonical_title),
      source_url = COALESCE(?, source_url),
      latest_chapter_url = COALESCE(?, latest_chapter_url),
      current_chapter_url = COALESCE(?, current_chapter_url),
      last_chapter = COALESCE(?, last_chapter),
      last_release_date = COALESCE(?, last_release_date),
      last_checked_at = ?
    WHERE id = ?
  `);

  stmt.run(
    payload.source ?? null,
    payload.canonicalTitle ?? null,
    payload.sourceUrl ?? null,
    payload.latestChapterUrl ?? null,
    payload.currentChapterUrl ?? null,
    payload.lastChapter ?? null,
    payload.lastReleaseDate ?? null,
    now,
    id
  );

  return getMangaById(id);
}

function updateMangaProgress(id, payload) {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `
        UPDATE mangas
        SET
          current_chapter = ?,
          current_chapter_url = ?,
          last_checked_at = ?
        WHERE id = ?
      `
    )
    .run(payload.currentChapter ?? null, payload.currentChapterUrl ?? null, now, id);

  return getMangaById(id);
}

function exportBackupData() {
  return listMangas();
}

function importBackupData(rows) {
  const insert = getDatabase().prepare(`
    INSERT INTO mangas (
      display_title, canonical_title, source, source_url,
      current_chapter, current_chapter_url,
      last_chapter, latest_chapter_url, last_release_date, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const importMany = getDatabase().transaction((items) => {
    let count = 0;
    for (const row of items) {
      const title = String(row.displayTitle || "").trim();
      if (!title) continue;
      insert.run(
        title,
        row.canonicalTitle || null,
        "manual",
        row.sourceUrl || null,
        row.currentChapter || null,
        row.currentChapterUrl || null,
        row.lastChapter || null,
        row.latestChapterUrl || null,
        row.lastReleaseDate || null,
        row.status === "paused" ? "paused" : "active"
      );
      count++;
    }
    return count;
  });

  return importMany(rows);
}

module.exports = {
  initializeDatabase,
  listMangas,
  addManga,
  getMangaById,
  removeManga,
  toggleMangaStatus,
  markChecked,
  updateMangaAfterSync,
  updateMangaProgress,
  exportBackupData,
  importBackupData,
};
