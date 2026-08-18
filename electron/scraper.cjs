const MAX_HTML_BYTES = 512 * 1024; // 500 KB

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error && error.name === "AbortError") {
      throw new Error("A requisicao demorou muito. Verifique a URL e tente novamente.");
    }
    throw new Error("Falha de rede ao acessar a URL.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`A pagina retornou erro HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error("A URL nao aponta para uma pagina HTML.");
  }

  const buffer = await response.arrayBuffer();
  return new TextDecoder("utf-8", { fatal: false }).decode(
    buffer.byteLength > MAX_HTML_BYTES ? buffer.slice(0, MAX_HTML_BYTES) : buffer
  );
}

/**
 * Remove common site-name suffixes from page titles.
 * E.g. "Magic Academy's Genius Blinker | Asura Scans" → "Magic Academy's Genius Blinker"
 */
function cleanTitle(raw) {
  return raw
    .replace(/\s*[|\-—–]\s*[^|\-—–]{2,60}$/, "") // strip "| Site Name" or "- Site Name" at end
    .trim();
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .trim();
}

// BUG FIX: separate patterns for double-quoted and single-quoted attributes
// so apostrophes inside the title don't truncate the match.
function extractMetaProperty(html, property) {
  // property="X" content="..."  (double-quoted content)
  const dq1 = html.match(
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content="([^"]{1,400})"`, "i")
  );
  if (dq1) return decodeHtmlEntities(dq1[1]);

  // content="..."  property="X"
  const dq2 = html.match(
    new RegExp(`<meta[^>]+content="([^"]{1,400})"[^>]+property=["']${property}["']`, "i")
  );
  if (dq2) return decodeHtmlEntities(dq2[1]);

  // single-quoted content variants
  const sq1 = html.match(
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content='([^']{1,400})'`, "i")
  );
  if (sq1) return decodeHtmlEntities(sq1[1]);

  const sq2 = html.match(
    new RegExp(`<meta[^>]+content='([^']{1,400})'[^>]+property=["']${property}["']`, "i")
  );
  if (sq2) return decodeHtmlEntities(sq2[1]);

  return null;
}

function extractMetaName(html, name) {
  const dq1 = html.match(
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content="([^"]{1,400})"`, "i")
  );
  if (dq1) return decodeHtmlEntities(dq1[1]);

  const dq2 = html.match(
    new RegExp(`<meta[^>]+content="([^"]{1,400})"[^>]+name=["']${name}["']`, "i")
  );
  if (dq2) return decodeHtmlEntities(dq2[1]);

  const sq1 = html.match(
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content='([^']{1,400})'`, "i")
  );
  if (sq1) return decodeHtmlEntities(sq1[1]);

  const sq2 = html.match(
    new RegExp(`<meta[^>]+content='([^']{1,400})'[^>]+name=["']${name}["']`, "i")
  );
  if (sq2) return decodeHtmlEntities(sq2[1]);

  return null;
}

function extractPageTitle(html) {
  const m = html.match(/<title[^>]*>([^<]{1,400})<\/title>/i);
  return m ? decodeHtmlEntities(m[1]) : null;
}

function extractTitle(html) {
  const raw =
    extractMetaProperty(html, "og:title") ||
    extractMetaName(html, "title") ||
    extractPageTitle(html) ||
    null;
  return raw ? cleanTitle(raw) : null;
}

/**
 * Derive the manga "slug" from the page URL so we can filter chapter links
 * that belong only to this manga (avoiding chapter numbers from sidebars/ads).
 * E.g. "https://asura.gg/manga/magic-academy-genius-blinker-1234/" → "magic-academy-genius-blinker"
 */
function extractMangaSlug(url) {
  try {
    const { pathname } = new URL(url);
    // Remove trailing slash, split, pick the last meaningful segment
    const parts = pathname.replace(/\/$/, "").split("/").filter(Boolean);
    if (parts.length === 0) return null;
    const slug = parts[parts.length - 1];
    // Strip numeric suffix like "-1234" that some sites append
    return slug.replace(/-\d+$/, "").toLowerCase();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Madara theme (WordPress) — mugiwarasoficial.com, mangasbrasuka.com etc.
// The chapter list is rendered server-side inside `li.wp-manga-chapter` so
// it is accessible without JavaScript, making it highly reliable.
// ---------------------------------------------------------------------------

const PT_BR_MONTHS = {
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04",
  maio: "05", junho: "06", julho: "07", agosto: "08",
  setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

/** Convert "5 de abril de 2026" → "2026-04-05", or return null. */
function ptBrDateToIso(text) {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // strip accents

  const m = normalized.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
  if (!m) return null;

  const [, day, monthName, year] = m;
  const month = PT_BR_MONTHS[monthName];
  if (!month) return null;

  const iso = `${year}-${month}-${day.padStart(2, "0")}`;
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || t > Date.now() + 2 * 86400000 || t < Date.parse("2000-01-01")) {
    return null;
  }
  return iso;
}

/**
 * Madara-theme extractor.
 * Returns { latestChapter, latestChapterUrl, lastReleaseDate } or null.
 *
 * Primary source: the first `li.wp-manga-chapter` (the list is ordered newest-first).
 * Fallback chapter URL: the "Read Last" button (`id="btn-read-first"` in Madara's
 * confusingly-named HTML, whose anchor text says "Read Last").
 */
function extractFromMadaraTheme(html) {
  if (!html.includes("wp-manga-chapter")) return null;

  // Grab the first <li class="…wp-manga-chapter…"> block.
  const liPattern = /<li[^>]*class=["'][^"']*wp-manga-chapter[^"']*["'][^>]*>([\s\S]*?)<\/li>/i;
  const liMatch = html.match(liPattern);
  if (!liMatch) return null;

  const liContent = liMatch[1];

  // Chapter URL from the first <a href> in the li.
  const hrefMatch = liContent.match(/href=["']([^"']+)["']/i);
  let latestChapterUrl = hrefMatch ? hrefMatch[1].trim() : null;

  // Chapter number: try link text first.
  let latestChapter = null;
  const aTextMatch = liContent.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
  if (aTextMatch) {
    const text = aTextMatch[1].replace(/<[^>]+>/g, "").trim();
    const chMatch = text.match(/(?:cap[íi]tulo|chapter)\s+(\d+(?:[.,]\d+)?)/i);
    if (chMatch) {
      const val = parseFloat(chMatch[1].replace(",", "."));
      if (Number.isFinite(val) && val > 0) {
        latestChapter = val % 1 === 0 ? String(Math.floor(val)) : String(val);
      }
    }
  }

  // Fallback: extract chapter number from the URL.
  if (!latestChapter && latestChapterUrl) {
    const urlMatch = latestChapterUrl.match(
      /[/\-_](?:chapter|capitulo)[/\-_]?(\d+(?:[.,]\d+)?)/i
    );
    if (urlMatch) {
      const val = parseFloat(urlMatch[1].replace(",", "."));
      if (Number.isFinite(val) && val > 0) {
        latestChapter = val % 1 === 0 ? String(Math.floor(val)) : String(val);
      }
    }
  }

  // Release date: <span class="chapter-release-date"><i>…</i></span>
  let lastReleaseDate = null;
  // Try to match the date inside the <i> tag within chapter-release-date span
  const dateMatch = liContent.match(/class=["']?chapter-release-date["']?[^>]*>([\s\S]*?)<\/span>/i);
  if (dateMatch) {
    const dateContent = dateMatch[1];
    const iMatch = dateContent.match(/<i[^>]*>\s*([^<]+)\s*<\/i>/i);
    if (iMatch) {
      lastReleaseDate = ptBrDateToIso(iMatch[1].trim()) || null;
    }
  }

  if (!latestChapter && !latestChapterUrl) return null;

  console.log("[scraper][madara] result:", { latestChapter, latestChapterUrl, lastReleaseDate });
  return { latestChapter, latestChapterUrl, lastReleaseDate };
}

/**
 * Strategy 1 – chapter numbers found in <a href> links that contain the manga slug.
 * This is the most reliable approach because the chapter list only contains
 * links for the current manga.
 */
function chaptersFromMangaLinks(html, slug) {
  if (!slug || slug.length < 4) return [];

  const found = [];
  // Match href="...slug...chapter-XX..." or href="...slug.../XX/..."
  const hrefPattern = /href=["']([^"']{1,300})["']/gi;
  let match;
  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[1].toLowerCase();
    if (!href.includes(slug)) continue;

    // chapter-XX, chapter/XX, -chapter-XX
    const chMatch =
      href.match(/[_\-/]chapter[_\-/]?(\d{1,5}(?:[.,]\d{1,2})?)/) ||
      href.match(/[_\-/]cap(?:itulo)?[_\-/]?(\d{1,5}(?:[.,]\d{1,2})?)/);
    if (!chMatch) continue;

    const val = parseFloat(chMatch[1].replace(",", "."));
    if (Number.isFinite(val) && val > 0 && val <= 99999) {
      found.push(val);
    }
  }

  return found;
}

/**
 * Strategy 2 – og:description or meta description often says "Latest: Chapter 93".
 */
function chapterFromDescription(html) {
  const desc =
    extractMetaProperty(html, "og:description") ||
    extractMetaName(html, "description") ||
    null;

  if (!desc) return null;

  const m = desc.match(
    /(?:latest|ultimo|last)[^\d]{0,30}(?:cap[íi]tulo|chapter|ch\.?)[\s:#\-]*(\d{1,5}(?:[.,]\d{1,2})?)/i
  );
  if (m) return parseFloat(m[1].replace(",", "."));

  // simpler: any chapter mention in description
  const m2 = desc.match(
    /(?:cap[íi]tulo|chapter|ch\.?)[\s:#\-]*(\d{1,5}(?:[.,]\d{1,2})?)/i
  );
  if (m2) return parseFloat(m2[1].replace(",", "."));

  return null;
}

/**
 * Strategy 3 – JSON-LD or inline JSON with "chapter" keys.
 * Only look inside <script> tags to avoid false positives in the body text.
 */
function chaptersFromScriptJson(html) {
  const found = [];
  const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;

  while ((scriptMatch = scriptPattern.exec(html)) !== null) {
    const content = scriptMatch[1];
    if (!content.includes("chapter")) continue;

    const jsonPattern =
      /"(?:chapter|chapter_number|chapterNumber|num_chapter)"[\s:]+["']?(\d{1,5}(?:[.,]\d{1,2})?)["']?/gi;
    let jsonMatch;
    while ((jsonMatch = jsonPattern.exec(content)) !== null) {
      const val = parseFloat(jsonMatch[1].replace(",", "."));
      if (Number.isFinite(val) && val > 0 && val <= 99999) {
        found.push(val);
      }
    }
  }

  return found;
}

/**
 * Strategy 4 – generic text patterns, last resort.
 * Only used when all other strategies fail.
 */
function chaptersFromGenericText(html) {
  const found = [];
  const patterns = [
    /(?:cap[íi]tulo|cap\.?|chapter|ch\.?)\s*[#n\u00b0\u00ba]?\s*(\d{1,5}(?:[.,]\d{1,2})?)/gi,
    /\/(?:chapter|capitulo|cap)[\/\-_](\d{1,5}(?:[.,]\d{1,2})?)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0;
    let iterations = 0;
    while ((match = pattern.exec(html)) !== null && iterations < 300) {
      const val = parseFloat(match[1].replace(",", "."));
      if (Number.isFinite(val) && val > 0 && val <= 99999) {
        found.push(val);
      }
      iterations++;
    }
  }

  return found;
}

function pickLatest(numbers) {
  if (numbers.length === 0) return null;
  const max = Math.max(...numbers);
  return max % 1 === 0 ? String(Math.floor(max)) : String(max);
}

/**
 * Strategy 0 — JSON-LD structured data (highest reliability).
 * Sites like AsuraScans embed Schema.org ComicSeries with numberOfEpisodes = chapter count.
 * Also catches "numberOfEpisodes", "episodeCount" etc.
 */
function chapterFromJsonLd(html) {
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptPattern.exec(html)) !== null) {
    const content = match[1].trim();
    try {
      const obj = JSON.parse(content);
      const candidates = Array.isArray(obj) ? obj : [obj];
      for (const item of candidates) {
        // numberOfEpisodes is used by ComicSeries on sites like AsuraScans
        const episodes =
          item.numberOfEpisodes ??
          item.episodeCount ??
          item.chapterCount ??
          null;
        if (episodes !== null && episodes !== undefined) {
          const val = Number(episodes);
          if (Number.isFinite(val) && val > 0 && val <= 99999) {
            return val;
          }
        }
      }
    } catch {
      // Not valid JSON — skip
    }
  }

  return null;
}

function extractLatestChapter(html, pageUrl) {
  const slug = pageUrl ? extractMangaSlug(pageUrl) : null;

  // -1. Madara WordPress theme — server-side chapter list (highest reliability)
  const madara = extractFromMadaraTheme(html);
  if (madara?.latestChapter) {
    return madara.latestChapter;
  }

  // 0. JSON-LD structured data (most reliable on sites that publish it)
  const fromJsonLd = chapterFromJsonLd(html);
  if (fromJsonLd !== null) {
    console.log("[scraper] chapter from JSON-LD:", fromJsonLd);
    return String(fromJsonLd);
  }

  // 1. Chapter links that belong to this manga (filtered by URL slug)
  if (slug) {
    const fromLinks = chaptersFromMangaLinks(html, slug);
    if (fromLinks.length > 0) {
      console.log("[scraper] chapters from manga links:", fromLinks.slice(0, 10));
      return pickLatest(fromLinks);
    }
  }

  // 2. Description meta tag
  const fromDesc = chapterFromDescription(html);
  if (fromDesc !== null && Number.isFinite(fromDesc)) {
    console.log("[scraper] chapter from description:", fromDesc);
    return String(fromDesc % 1 === 0 ? Math.floor(fromDesc) : fromDesc);
  }

  // 3. Inline JSON in <script> tags
  const fromJson = chaptersFromScriptJson(html);
  if (fromJson.length > 0) {
    console.log("[scraper] chapters from script JSON:", fromJson.slice(0, 10));
    return pickLatest(fromJson);
  }

  // 4. Generic text fallback
  const fromText = chaptersFromGenericText(html);
  if (fromText.length > 0) {
    console.log("[scraper] chapters from generic text (fallback):", fromText.slice(0, 10));
    return pickLatest(fromText);
  }

  return null;
}

/**
 * Find the full URL for a specific chapter number from the manga page HTML.
 * Looks for <a href> links that contain both the manga slug and the chapter number.
 */
function findChapterHref(html, slug, chapterNumber, baseUrl) {
  const targetNum = parseFloat(String(chapterNumber).replace(",", "."));

  if (!Number.isFinite(targetNum)) return null;

  let origin = "";
  try {
    origin = new URL(baseUrl).origin;

  } catch {}

  const hrefPattern = /href=["']([^"']{1,300})["']/gi;

  let m;

  while ((m = hrefPattern.exec(html)) !== null) {
    const rawHref = m[1];

    const lowerHref = rawHref.toLowerCase();

    if (!lowerHref.includes(slug)) continue;

    const chMatch = lowerHref.match(/[/\-_](?:chapter|capitulo)[/\-_]?(\d+(?:[.,]\d+)?)\/?(?:[?&#]|$)/);

    if (!chMatch) continue;

    const foundNum = parseFloat(chMatch[1].replace(",", "."));
    if (Math.abs(foundNum - targetNum) < 0.01) {
      if (rawHref.startsWith("http")) return rawHref;
      if (rawHref.startsWith("/") && origin) return `${origin}${rawHref}`;
      return rawHref;
    }
  }

  return null;
}

/**
 * Extract the URL of the latest chapter given we already know the chapter number.
 */
function extractLatestChapterUrl(html, pageUrl, latestChapterNumber) {
  if (!latestChapterNumber || !pageUrl) return null;

  // Madara theme: the URL is already in the first wp-manga-chapter entry.
  const madara = extractFromMadaraTheme(html);
  if (madara?.latestChapterUrl) return madara.latestChapterUrl;

  const slug = extractMangaSlug(pageUrl);
  if (!slug) return null;
  return findChapterHref(html, slug, latestChapterNumber, pageUrl);
}

/**
 * Try to parse a date string and return its timestamp, or NaN if invalid/future.
 */
function safeParseDate(str) {
  const t = Date.parse(str);
  // Reject anything more than 2 days in the future or before year 2000
  if (!Number.isFinite(t) || t > Date.now() + 2 * 86400000 || t < Date.parse("2000-01-01")) {
    return NaN;
  }
  return t;
}

/**
 * Extract the release date of the latest chapter from the page.
 *
 * Tries multiple strategies, from most specific to most generic.
 * Deliberately does NOT use dateModified / article:modified_time because
 * those reflect the page's last edit time, not when the chapter was released.
 */
function extractLastReleaseDate(html) {
  const TWO_DAYS_MS = 2 * 86400000;
  const candidates = [];

  // --- Strategy 1: "published_at" key inside <script> tags ---
  // Covers Astro-based sites (e.g. AsuraScans) where chapter data is serialised as:
  //   "published_at":[0,"2026-04-14T12:29:13.488Z"]   (Astro island tuple)
  //   "published_at":"2026-04-14T12:29:13.488Z"        (plain JSON)
  {
    const scriptPat = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let sm;
    while ((sm = scriptPat.exec(html)) !== null) {
      const c = sm[1];
      if (!c.includes("published_at")) continue;

      // Astro tuple: "published_at":[N,"DATE"]
      const tuplePat = /"published_at"\s*:\s*\[\s*\d+\s*,\s*"([^"]{8,50})"/g;
      let tm;
      while ((tm = tuplePat.exec(c)) !== null) {
        const t = safeParseDate(tm[1]);
        if (!isNaN(t)) candidates.push({ iso: tm[1], t });
      }

      // Plain string: "published_at":"DATE"
      const plainPat = /"published_at"\s*:\s*"([^"]{8,50})"/g;
      let pm;
      while ((pm = plainPat.exec(c)) !== null) {
        const t = safeParseDate(pm[1]);
        if (!isNaN(t)) candidates.push({ iso: pm[1], t });
      }
    }
  }

  // --- Strategy 2: <time datetime="..."> elements ---
  // Standard HTML5 pattern used by many manga sites.
  {
    const timePat = /<time[^>]+datetime=["']([^"']{6,50})["']/gi;
    let m;
    while ((m = timePat.exec(html)) !== null) {
      const t = safeParseDate(m[1]);
      if (!isNaN(t)) candidates.push({ iso: m[1], t });
    }
  }

  // --- Strategy 3: ISO 8601 dates in <script> JSON data ---
  // Covers sites that embed chapter arrays with "date", "created_at" etc.
  // Deliberately skips the outer JSON-LD Article block to avoid dateModified.
  {
    const scriptPat = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let sm;
    while ((sm = scriptPat.exec(html)) !== null) {
      const c = sm[1];
      // Only bother if it looks like it has chapter/episode data
      if (!/chapter|episode|cap[íi]tulo/i.test(c)) continue;

      // Keys like "date", "created_at", "release_date", "updated_at" (but not "modified")
      const datePat =
        /"(?:date|created_at|release_date|upload_date|publishe?d?_?(?:at|date)|release_?date)"\s*:\s*"([^"]{8,50})"/gi;
      let dm;
      while ((dm = datePat.exec(c)) !== null) {
        const t = safeParseDate(dm[1]);
        if (!isNaN(t)) candidates.push({ iso: dm[1], t });
      }
    }
  }

  // --- Strategy 3b: Madara release date (<i>DD de mês de YYYY</i>) ---
  {
    const iTagPat = /<i>\s*([^<]{5,40})\s*<\/i>/gi;
    let m;
    while ((m = iTagPat.exec(html)) !== null) {
      const iso = ptBrDateToIso(m[1]);
      if (iso) {
        const t = safeParseDate(iso);
        if (!isNaN(t)) candidates.push({ iso, t });
      }
    }
  }

  // --- Strategy 4: DD/MM/YYYY text in HTML (Brazilian/Portuguese sites) ---
  // e.g. nexustoons.com renders chapter dates as plain text spans: "20/02/2026"
  {
    const ddmmPat = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
    let m;
    while ((m = ddmmPat.exec(html)) !== null) {
      const [, dd, mm, yyyy] = m;
      const isoStr = `${yyyy}-${mm}-${dd}`;
      const t = safeParseDate(isoStr);
      if (!isNaN(t)) candidates.push({ iso: isoStr, t });
    }
  }

  if (candidates.length === 0) return null;

  // Return the most recent date found across all strategies.
  candidates.sort((a, b) => b.t - a.t);
  return candidates[0].iso;
}

/**
 * Scrape a manga page and extract title, latest chapter, chapter URL, and release date.
 * Used for the "Buscar info" button in the add manga dialog.
 */
async function scrapeUrl(url) {
  try {
    const html = await fetchHtml(url);
    const title = extractTitle(html);
    const latestChapter = extractLatestChapter(html, url);
    const latestChapterUrl = latestChapter ? extractLatestChapterUrl(html, url, latestChapter) : null;
    const lastReleaseDate = extractLastReleaseDate(html);

    console.log("[scraper] result:", { url, title, latestChapter, latestChapterUrl, lastReleaseDate });

    const success = Boolean(title || latestChapter);
    return {
      success,
      title: title || null,
      latestChapter: latestChapter || null,
      latestChapterUrl: latestChapterUrl || null,
      lastReleaseDate: lastReleaseDate || null,
      error: success
        ? null
        : "Nao foi possivel extrair informacoes da pagina. O site pode exigir JavaScript ou ter protecao contra bots. Preencha as informacoes manualmente.",
    };
  } catch (error) {
    return {
      success: false,
      title: null,
      latestChapter: null,
      latestChapterUrl: null,
      lastReleaseDate: null,
      error: error instanceof Error ? error.message : "Falha ao acessar a pagina.",
    };
  }
}

/**
 * Full scrape of a manga page for recurring auto-sync.
 * Returns all data needed to update the manga record.
 */
async function scrapeManualMangaData(sourceUrl) {
  try {
    const html = await fetchHtml(sourceUrl);
    const latestChapter = extractLatestChapter(html, sourceUrl);
    const latestChapterUrl = latestChapter ? extractLatestChapterUrl(html, sourceUrl, latestChapter) : null;
    const lastReleaseDate = extractLastReleaseDate(html);
    return { latestChapter, latestChapterUrl, lastReleaseDate };
  } catch {
    return { latestChapter: null, latestChapterUrl: null, lastReleaseDate: null };
  }
}

/**
 * Construct possible chapter URLs for a manga and test which one exists.
 * Supports both patterns:
 *   - /manga/{slug}/capitulo-{number}/
 *   - /manga/{slug}/{slug}-capitulo-{number}/
 */
async function tryConstructChapterUrl(baseUrl, slug, chapterNumber) {
  if (!slug || !chapterNumber) return null;

  try {
    const origin = new URL(baseUrl).origin;
    const patterns = [
      `${origin}/manga/${slug}/capitulo-${chapterNumber}/`,
      `${origin}/manga/${slug}/${slug}-capitulo-${chapterNumber}/`,
    ];

    for (const url of patterns) {
      try {
        const response = await fetch(url, { method: "HEAD", timeout: 5000 });
        if (response.ok || response.status === 405) {
          // 405 (Method Not Allowed) means GET might work even if HEAD doesn't
          console.log("[scraper][constructed-url] found:", url);
          return url;
        }
      } catch {
        // Continue to next pattern
      }
    }
  } catch {
    // Invalid URL, skip
  }

  return null;
}

/**
 * Find the chapter URL for a specific chapter number by scraping the manga source page.
 * Used when the user sets their current chapter on a manual manga.
 * Tries HTML scraping first, then falls back to URL construction + verification.
 */
async function scrapeChapterUrl(sourceUrl, chapterNumber) {
  try {
    const html = await fetchHtml(sourceUrl);
    const slug = extractMangaSlug(sourceUrl);
    console.log('slug:', slug)
    if (!slug) return null;

    // Try to find link in HTML first (works if JavaScript didn't render)
    const htmlLink = findChapterHref(html, slug, String(chapterNumber), sourceUrl);
    if (htmlLink) return htmlLink;

    // Fallback: construct URL and verify it exists
    const constructedUrl = await tryConstructChapterUrl(sourceUrl, slug, chapterNumber);
    return constructedUrl;
  } catch {
    return null;
  }
}

module.exports = { scrapeUrl, scrapeManualMangaData, scrapeChapterUrl };
