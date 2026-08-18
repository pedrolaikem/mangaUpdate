const { getMangaById, markChecked, updateMangaAfterSync } = require("./db.cjs");
const { scrapeManualMangaData } = require("./scraper.cjs");

async function syncMangaNow(id) {
  const manga = getMangaById(id);

  if (!manga) {
    throw new Error("Manga nao encontrado.");
  }

  if (!manga.sourceUrl) {
    const checked = markChecked(id);
    return {
      ...checked,
      hasNewChapter: false,
      syncMessage: "Manga sem URL de origem definida. Atualize as informacoes manualmente.",
    };
  }

  try {
    const { latestChapter, latestChapterUrl, lastReleaseDate } = await scrapeManualMangaData(manga.sourceUrl);

    if (!latestChapter) {
      const checked = markChecked(id);
      return {
        ...checked,
        hasNewChapter: false,
        syncMessage:
          "Nao foi possivel detectar o capitulo mais recente pela pagina. O site pode usar JavaScript ou ter protecao contra bots.",
      };
    }

    const hasNewChapter = isNewChapterAvailable({
      previousChapter: manga.lastChapter,
      previousReleaseDate: manga.lastReleaseDate,
      currentChapter: latestChapter,
      currentReleaseDate: lastReleaseDate || new Date().toISOString(),
    });

    const updated = updateMangaAfterSync(id, {
      lastChapter: latestChapter,
      latestChapterUrl: latestChapterUrl || null,
      lastReleaseDate: lastReleaseDate || (hasNewChapter ? new Date().toISOString() : null),
    });

    return {
      ...updated,
      hasNewChapter,
      syncMessage: hasNewChapter
        ? `Novo capitulo detectado: ${latestChapter}.`
        : `Sem novidades. Ultimo capitulo: ${latestChapter}.`,
    };
  } catch (error) {
    const checked = markChecked(id);
    return {
      ...checked,
      hasNewChapter: false,
      syncMessage: error instanceof Error ? error.message : "Falha ao sincronizar manga.",
    };
  }
}

function isNewChapterAvailable({
  previousChapter,
  previousReleaseDate,
  currentChapter,
  currentReleaseDate,
}) {
  if (!currentChapter) {
    return false;
  }

  if (!previousChapter) {
    return false;
  }

  const previousNumeric = Number.parseFloat(String(previousChapter));
  const currentNumeric = Number.parseFloat(String(currentChapter));

  if (Number.isFinite(previousNumeric) && Number.isFinite(currentNumeric)) {
    return currentNumeric > previousNumeric;
  }

  if (String(previousChapter).trim() !== String(currentChapter).trim()) {
    return true;
  }

  if (previousReleaseDate && currentReleaseDate) {
    const previousTime = Date.parse(previousReleaseDate);
    const currentTime = Date.parse(currentReleaseDate);

    if (Number.isFinite(previousTime) && Number.isFinite(currentTime)) {
      return currentTime > previousTime;
    }
  }

  return false;
}

module.exports = {
  syncMangaNow,
};
