export type MangaStatus = "active" | "paused";

export type MangaItem = {
  id: number;
  displayTitle: string;
  canonicalTitle: string | null;
  source: string;
  sourceUrl: string | null;
  latestChapterUrl: string | null;
  currentChapter: string | null;
  currentChapterUrl: string | null;
  status: MangaStatus;
  lastChapter: string | null;
  lastReleaseDate: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  syncMessage?: string;
};

export type AddMangaPayload = {
  displayTitle: string;
  canonicalTitle?: string;
  sourceUrl?: string;
  currentChapter?: string;
  currentChapterUrl?: string;
  // Pre-scraped data passed along for manual entries
  lastChapter?: string;
  latestChapterUrl?: string;
  lastReleaseDate?: string;
};

export type ScrapeResult = {
  success: boolean;
  title: string | null;
  latestChapter: string | null;
  latestChapterUrl: string | null;
  lastReleaseDate: string | null;
  error: string | null;
};

export type AutoSyncStatus = {
  intervalMinutes: number;
  inProgress: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  checkedCount: number;
  newChapterCount: number;
  lastError: string | null;
};

export type PersistentAlert = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
};

declare global {
  interface Window {
    mangaApi?: {
      listMangas: () => Promise<MangaItem[]>;
      addManga: (payload: AddMangaPayload) => Promise<MangaItem>;
      removeManga: (id: number) => Promise<boolean>;
      toggleMangaStatus: (id: number) => Promise<MangaItem>;
      syncMangaNow: (id: number) => Promise<MangaItem>;
      updateMangaProgress: (id: number, currentChapter: string) => Promise<MangaItem>;
      testNotification: () => Promise<boolean>;
      testNewChapterNotification: () => Promise<boolean>;
      startTestNewChapterLoop: () => Promise<{ running: boolean }>;
      stopTestNewChapterLoop: () => Promise<{ running: boolean }>;
      onPersistentAlert: (listener: (payload: PersistentAlert) => void) => () => void;
      onRefreshList: (listener: () => void) => () => void;
      openUrl: (url: string) => Promise<boolean>;
      getAutoSyncStatus: () => Promise<AutoSyncStatus>;
      scrapeManualUrl: (url: string) => Promise<ScrapeResult>;
      exportBackup: () => Promise<{ success: boolean; canceled?: boolean; count?: number; filePath?: string }>;
      importBackup: () => Promise<{ success: boolean; canceled?: boolean; count?: number }>;
    };
  }
}
