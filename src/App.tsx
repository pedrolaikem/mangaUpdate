import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ImageSearchRoundedIcon from "@mui/icons-material/ImageSearchRounded";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PauseCircleOutlineRoundedIcon from "@mui/icons-material/PauseCircleOutlineRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayCircleOutlineRoundedIcon from "@mui/icons-material/PlayCircleOutlineRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import type { AddMangaPayload, AutoSyncStatus, MangaItem, PersistentAlert, ScrapeResult } from "./types";

function formatDate(value: string | null): string {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const EMPTY_FORM: AddMangaPayload & { sourceUrl: string; currentChapterUrl: string } = {
  displayTitle: "",
  canonicalTitle: "",
  currentChapter: "",
  sourceUrl: "",
  currentChapterUrl: "",
};

function extractHostname(url: string | null): string {
  if (!url) return "-";
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return "-";
  }
}

function isRecentChapter(releaseDate: string | null): boolean {
  if (!releaseDate) return false;
  const release = new Date(releaseDate);
  if (Number.isNaN(release.getTime())) return false;

  const releaseDay = new Date(release);
  releaseDay.setHours(0, 0, 0, 0);
  const todayDay = new Date();
  todayDay.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((todayDay.getTime() - releaseDay.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 && diffDays <= 3;
}

type MangaRowProps = {
  manga: MangaItem;
  isHighlighted: boolean;
  isOpeningCurrent: boolean;
  onSync: (id: number) => void;
  onOpenCurrent: (manga: MangaItem) => void;
  onOpenLatest: (manga: MangaItem) => void;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
  onOpenProgress: (manga: MangaItem) => void;
};

const MangaRow = memo(function MangaRow({
  manga,
  isHighlighted,
  isOpeningCurrent,
  onSync,
  onOpenCurrent,
  onOpenLatest,
  onToggle,
  onRemove,
  onOpenProgress,
}: MangaRowProps) {
  return (
    <TableRow
      hover
      sx={isHighlighted ? { animation: "manga-highlight 3s ease-out forwards" } : undefined}
    >
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{manga.displayTitle}</Typography>
        {manga.canonicalTitle && (
          <Typography variant="caption" color="text.secondary">{manga.canonicalTitle}</Typography>
        )}
      </TableCell>
      <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
        <Typography variant="caption" sx={{ fontWeight: 500 }}>{extractHostname(manga.sourceUrl)}</Typography>
      </TableCell>
      <TableCell>
        <Chip
          label={manga.status === "active" ? "Ativo" : "Pausado"}
          size="small"
          color={manga.status === "active" ? "success" : "default"}
          variant={manga.status === "active" ? "filled" : "outlined"}
        />
      </TableCell>
      <TableCell>
        <Button
          size="small"
          variant="text"
          onClick={() => onOpenProgress(manga)}
          sx={{
            minWidth: 0, px: 0, textTransform: "none",
            fontWeight: 400, fontSize: "0.8rem",
            color: "#1a6fa0",
            borderRadius: 0.5,
            "&:hover": { backgroundColor: "transparent", textDecoration: "underline" },
          }}
        >
          {manga.currentChapter ?? "Definir"}
        </Button>
      </TableCell>
      <TableCell>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Typography variant="body2">{manga.lastChapter ?? "-"}</Typography>
          {isRecentChapter(manga.lastReleaseDate) && (
            <Chip
              label="🔥 Novo"
              size="small"
              color="warning"
              sx={{
                height: 20, fontSize: "0.68rem", fontWeight: 700,
                "& .MuiChip-label": { px: 0.75 },
              }}
            />
          )}
        </Stack>
      </TableCell>
      <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
        <Typography variant="body2" color="text.secondary">{formatDate(manga.lastReleaseDate)}</Typography>
      </TableCell>
      <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
        <Typography variant="body2" color="text.secondary">{formatDate(manga.lastCheckedAt)}</Typography>
      </TableCell>
      <TableCell
        align="right"
        sx={{
          position: "sticky", right: 0, zIndex: 2,
          backgroundColor: "background.paper",
          boxShadow: "-1px 0 0 rgba(0,0,0,0.05)",
        }}
      >
        <Stack direction="row" spacing={0.25} sx={{ justifyContent: "flex-end", alignItems: "center" }}>
          <Tooltip title="Sincronizar agora">
            <IconButton size="small" color="primary" onClick={() => onSync(manga.id)}>
              <SyncRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Abrir cap atual no navegador">
            <span>
              <IconButton
                size="small" color="primary"
                onClick={() => onOpenCurrent(manga)}
                disabled={isOpeningCurrent || !manga.currentChapterUrl}
              >
                {isOpeningCurrent
                  ? <CircularProgress size={16} />
                  : <MyLocationRoundedIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Abrir ultimo capitulo no navegador">
            <span>
              <IconButton
                size="small" color="primary"
                onClick={() => onOpenLatest(manga)}
                disabled={!manga.latestChapterUrl}
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={manga.status === "active" ? "Pausar" : "Ativar"}>
            <IconButton size="small" color="default" onClick={() => onToggle(manga.id)}>
              {manga.status === "active"
                ? <PauseCircleOutlineRoundedIcon fontSize="small" />
                : <PlayCircleOutlineRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Remover manga">
            <IconButton size="small" color="error" onClick={() => onRemove(manga.id)}>
              <DeleteOutlineRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </TableCell>
    </TableRow>
  );
});

export default function App() {
  const [mangas, setMangas] = useState<MangaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<AutoSyncStatus | null>(null);
  const [pendingAlerts, setPendingAlerts] = useState<PersistentAlert[]>([]);
  const [openingCurrentChapterId, setOpeningCurrentChapterId] = useState<number | null>(null);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [selectedProgressManga, setSelectedProgressManga] = useState<MangaItem | null>(null);
  const [progressValue, setProgressValue] = useState("");
  const [progressDialogError, setProgressDialogError] = useState<string | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);
  const [newlyAddedMangaId, setNewlyAddedMangaId] = useState<number | null>(null);

  const getApi = () => {
    if (!window.mangaApi) {
      setErrorMessage("Integracao Electron indisponivel. Rode o app com 'npm run dev' para carregar o preload.");
      return null;
    }
    return window.mangaApi;
  };

  const activeCount = useMemo(
    () => mangas.filter((manga) => manga.status === "active").length,
    [mangas]
  );
  const pausedCount = mangas.length - activeCount;

  const sortedMangas = useMemo(() => {
    const data = [...mangas];
    data.sort((a, b) => {
      const aDate = Date.parse(a.lastReleaseDate ?? "");
      const bDate = Date.parse(b.lastReleaseDate ?? "");
      const aDateValue = Number.isFinite(aDate) ? aDate : -1;
      const bDateValue = Number.isFinite(bDate) ? bDate : -1;
      if (aDateValue !== bDateValue) return bDateValue - aDateValue;
      return a.displayTitle.localeCompare(b.displayTitle, "pt-BR", { sensitivity: "base" });
    });
    return data;
  }, [mangas]);

  const normalizedTitles = useMemo(
    () => new Set(mangas.map((m) => m.displayTitle.trim().toLowerCase())),
    [mangas]
  );
  const duplicateTitle = useMemo(() => {
    const q = form.displayTitle.trim().toLowerCase();
    return q.length > 0 && normalizedTitles.has(q);
  }, [form.displayTitle, normalizedTitles]);

  const filteredMangas = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sortedMangas;
    return sortedMangas.filter(
      (m) =>
        m.displayTitle.toLowerCase().includes(q) ||
        (m.canonicalTitle?.toLowerCase().includes(q) ?? false)
    );
  }, [sortedMangas, filter]);

  const loadMangas = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const api = getApi();
      if (!api) return;
      const data = await api.listMangas();
      setMangas(data);
    } catch {
      setErrorMessage("Falha ao carregar mangas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMangas();
  }, [loadMangas]);

  const loadAutoSyncStatus = useCallback(async () => {
    const api = window.mangaApi;
    if (!api || typeof api.getAutoSyncStatus !== "function") return;
    try {
      const status = await api.getAutoSyncStatus();
      setAutoSyncStatus(status);
    } catch {
      // Mantem o app funcional mesmo se o preload estiver desatualizado.
    }
  }, []);

  useEffect(() => {
    void loadAutoSyncStatus();
    const timer = window.setInterval(() => void loadAutoSyncStatus(), 15000);
    return () => window.clearInterval(timer);
  }, [loadAutoSyncStatus]);

  useEffect(() => {
    if (newlyAddedMangaId === null) return;
    const timeout = window.setTimeout(() => {
      setNewlyAddedMangaId(null);
    }, 3300);
    return () => window.clearTimeout(timeout);
  }, [newlyAddedMangaId]);

  useEffect(() => {
    const api = window.mangaApi;
    if (!api || typeof api.onPersistentAlert !== "function") return;
    const unsubscribe = api.onPersistentAlert((payload) => {
      setPendingAlerts((current) => [...current, payload]);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const api = window.mangaApi;
    if (!api || typeof api.onRefreshList !== "function") return;
    const unsubscribe = api.onRefreshList(() => {
      void loadMangas();
    });
    return () => unsubscribe();
  }, [loadMangas]);

  const currentAlert = pendingAlerts[0] ?? null;

  const handleConfirmPersistentAlert = () => {
    setPendingAlerts((current) => current.slice(1));
  };

  const handleCloseDialog = () => {
    if (submitting) return;
    setDialogOpen(false);
    setForm({ ...EMPTY_FORM });
    setScrapeResult(null);
    setScraping(false);
  };

  const handleScrape = async () => {
    const api = getApi();
    if (!api || typeof api.scrapeManualUrl !== "function") return;

    const url = form.sourceUrl?.trim();
    if (!url) return;

    setScraping(true);
    setScrapeResult(null);

    try {
      const result = await api.scrapeManualUrl(url);
      setScrapeResult(result);
      if (result.title && !form.displayTitle.trim()) {
        setForm((f) => ({ ...f, displayTitle: result.title! }));
      }
    } catch {
      setScrapeResult({ success: false, title: null, latestChapter: null, latestChapterUrl: null, lastReleaseDate: null, error: "Falha ao tentar buscar as informacoes." });
    } finally {
      setScraping(false);
    }
  };

  const handleAddManga = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const api = getApi();
      if (!api) return;

      const payload: AddMangaPayload = {
        displayTitle: form.displayTitle,
        canonicalTitle: form.canonicalTitle,
        currentChapter: form.currentChapter,
        sourceUrl: form.sourceUrl || undefined,
        currentChapterUrl: form.currentChapterUrl || undefined,
        ...(scrapeResult?.success ? {
          lastChapter: scrapeResult.latestChapter || undefined,
          latestChapterUrl: scrapeResult.latestChapterUrl || undefined,
          lastReleaseDate: scrapeResult.lastReleaseDate || undefined,
        } : {}),
      };

      const created = await api.addManga(payload);
      handleCloseDialog();
      setToast(created.syncMessage ?? "Manga adicionado.");
      setNewlyAddedMangaId(created.id);
      await loadMangas();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel adicionar o manga.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = useCallback(async (id: number) => {
    try {
      if (!window.mangaApi) return;
      await window.mangaApi.removeManga(id);
      await loadMangas();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao remover manga.");
    }
  }, [loadMangas]);

  const handleToggle = useCallback(async (id: number) => {
    try {
      if (!window.mangaApi) return;
      await window.mangaApi.toggleMangaStatus(id);
      await loadMangas();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao alterar status.");
    }
  }, [loadMangas]);

  const handleSyncNow = useCallback(async (id: number) => {
    try {
      if (!window.mangaApi) return;
      const result = await window.mangaApi.syncMangaNow(id);
      setToast(result.syncMessage ?? "Sincronizacao executada.");
      await loadMangas();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao sincronizar manga.");
    }
  }, [loadMangas]);

  const openUrl = useCallback(async (targetUrl: string) => {
    try {
      const isElectron = typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);
      const api = window.mangaApi;
      if (api && typeof api.openUrl === "function") {
        await api.openUrl(targetUrl);
      } else if (isElectron) {
        setErrorMessage("Abertura externa indisponivel no momento. Reinicie o app (npm run dev) para recarregar o preload.");
      } else {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao abrir o link do capitulo.");
    }
  }, []);

  const handleOpenLatestChapter = useCallback(async (manga: MangaItem) => {
    const targetUrl = manga.latestChapterUrl;
    if (!targetUrl) return;
    await openUrl(targetUrl);
  }, [openUrl]);

  const handleOpenCurrentChapter = useCallback(async (manga: MangaItem) => {
    if (!manga.currentChapterUrl) {
      setErrorMessage("Defina um capitulo atual para abrir diretamente nele.");
      return;
    }
    try {
      setOpeningCurrentChapterId(manga.id);
      await openUrl(manga.currentChapterUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao abrir o capitulo atual.");
    } finally {
      setOpeningCurrentChapterId(null);
    }
  }, [openUrl]);

  const openProgressDialog = useCallback((manga: MangaItem) => {
    setSelectedProgressManga(manga);
    setProgressValue(manga.currentChapter ?? "");
    setProgressDialogError(null);
    setProgressDialogOpen(true);
  }, []);

  const closeProgressDialog = () => {
    if (savingProgress) return;
    setProgressDialogOpen(false);
    setSelectedProgressManga(null);
    setProgressValue("");
    setProgressDialogError(null);
  };

  const handleExportBackup = async () => {
    const api = getApi();
    if (!api || typeof api.exportBackup !== "function") return;
    try {
      const result = await api.exportBackup();
      if (result.canceled) return;
      if (result.success) {
        setToast(`Backup exportado: ${result.count} manga(s).`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao exportar backup.");
    }
  };

  const handleImportBackup = async () => {
    const api = getApi();
    if (!api || typeof api.importBackup !== "function") return;
    try {
      const result = await api.importBackup();
      if (result.canceled) return;
      if (result.success) {
        setToast(`Backup importado: ${result.count} manga(s) restaurado(s).`);
        await loadMangas();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao importar backup.");
    }
  };

  const saveProgressFromDialog = async () => {
    if (!selectedProgressManga) return;
    try {
      const api = getApi();
      if (!api || typeof api.updateMangaProgress !== "function") return;
      setSavingProgress(true);
      setProgressDialogError(null);
      const result = await api.updateMangaProgress(selectedProgressManga.id, progressValue);
      closeProgressDialog();
      setToast(result.syncMessage ?? "Capitulo atual atualizado.");
      await loadMangas();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar capitulo atual.";
      setProgressDialogError(message);
    } finally {
      setSavingProgress(false);
    }
  };

  return (
    <Box className="app-shell" sx={{ minHeight: "100vh", py: { xs: 2, md: 4 } }}>
      <Container maxWidth="lg">

        {/* Header */}
        <Paper
          elevation={0}
          sx={{ mb: 2, p: { xs: 2, md: 3 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            sx={{ alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between" }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 46, height: 46, borderRadius: 2, flexShrink: 0,
                  background: "linear-gradient(135deg, #0d4b70 0%, #1e6fa0 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(13, 75, 112, 0.3)",
                }}
              >
                <AutoStoriesRoundedIcon sx={{ color: "white", fontSize: 24 }} />
              </Box>
              <Stack spacing={0.25}>
                <Typography variant="h5">Manga Update</Typography>
                <Typography variant="body2" color="text.secondary">
                  Sincronização manual e automática em um painel único.
                </Typography>
              </Stack>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ width: { xs: "100%", md: "auto" } }}>
              <Button variant="contained" onClick={() => setDialogOpen(true)} sx={{ fontWeight: 700 }}>
                Adicionar manga
              </Button>
              <Button variant="outlined" onClick={() => void loadMangas()} disabled={loading}>
                Atualizar lista
              </Button>
              <Button variant="outlined" onClick={() => void handleExportBackup()}>
                Exportar backup
              </Button>
              <Button variant="outlined" onClick={() => void handleImportBackup()}>
                Importar backup
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {/* Stats cards */}
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 2 }}>
          {[
            { label: "Monitorados", value: mangas.length, icon: <LibraryBooksRoundedIcon sx={{ color: "primary.main", fontSize: 20 }} />, bg: "rgba(13,75,112,0.1)", color: undefined },
            { label: "Ativos", value: activeCount, icon: <CheckCircleRoundedIcon sx={{ color: "success.main", fontSize: 20 }} />, bg: "rgba(36,121,79,0.1)", color: "success.main" },
            { label: "Pausados", value: pausedCount, icon: <PauseRoundedIcon sx={{ color: "text.secondary", fontSize: 20 }} />, bg: "rgba(100,116,139,0.1)", color: undefined },
          ].map(({ label, value, icon, bg, color }) => (
            <Paper key={label} elevation={0} sx={{ flex: 1, p: 2, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <Box sx={{ width: 40, height: 40, borderRadius: 2, backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {icon}
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{label}</Typography>
                  <Typography variant="h5" color={color}>{value}</Typography>
                </Box>
              </Stack>
            </Paper>
          ))}
        </Stack>

        {/* Auto-sync panel */}
        {autoSyncStatus && (
          <Paper elevation={0} sx={{ mb: 2, p: { xs: 2, md: 2.5 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
              <AccessTimeRoundedIcon fontSize="small" color="primary" />
              <Typography variant="subtitle1">Sincronizacao automatica</Typography>
              <Box sx={{ ml: "auto !important" }}>
                <Box sx={{
                  display: "inline-flex", alignItems: "center", gap: 0.75,
                  px: 1.25, py: 0.35, borderRadius: 10,
                  backgroundColor: autoSyncStatus.inProgress ? "rgba(36,121,79,0.1)" : "rgba(100,116,139,0.1)",
                }}>
                  <Box
                    className={autoSyncStatus.inProgress ? "status-dot-active" : undefined}
                    sx={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      backgroundColor: autoSyncStatus.inProgress ? "success.main" : "text.disabled",
                    }}
                  />
                  <Typography variant="caption" sx={{ color: autoSyncStatus.inProgress ? "success.main" : "text.secondary" }}>
                    {autoSyncStatus.inProgress ? "Em execucao" : "Aguardando"}
                  </Typography>
                </Box>
              </Box>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              {[
                { label: "Intervalo", value: `${autoSyncStatus.intervalMinutes} minutos` },
                { label: "Verificados / Novos", value: `${autoSyncStatus.checkedCount} / ${autoSyncStatus.newChapterCount}` },
                { label: "Ultima execução", value: formatDate(autoSyncStatus.lastFinishedAt) },
              ].map(({ label, value }) => (
                <Box key={label} sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.25 }}>{label}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{value}</Typography>
                </Box>
              ))}
            </Stack>
            {autoSyncStatus.lastError && (
              <Alert severity="error" sx={{ mt: 1.5, borderRadius: 2 }}>
                Ultimo erro: {autoSyncStatus.lastError}
              </Alert>
            )}
          </Paper>
        )}

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {errorMessage}
          </Alert>
        )}

        {/* Manga table */}
        <Paper elevation={0} sx={{ overflow: "hidden", borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
          {loading && <LinearProgress />}
          <Box sx={{ px: { xs: 2, md: 2.5 }, pt: 2, pb: 1.5, borderBottom: "1px solid", borderColor: "divider", backgroundColor: "rgba(248,250,252,0.8)" }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
              <Box>
                <Typography variant="h6" sx={{ mb: 0.25 }}>Seus mangas</Typography>
                <Typography variant="body2" color="text.secondary">
                  Clique na coluna "Seu cap" para editar e use os icones para abrir cap atual ou ultimo cap.
                </Typography>
              </Box>
              <TextField
                size="small"
                placeholder="Filtrar por titulo..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                sx={{ minWidth: 220 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRoundedIcon fontSize="small" sx={{ color: "text.disabled" }} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Stack>
          </Box>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Tabela de mangas" sx={{ minWidth: 1040 }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: "rgba(240,244,248,0.6)" }}>
                  <TableCell>Titulo</TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Fonte</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Seu cap</TableCell>
                  <TableCell>Ultimo capitulo</TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Data do Ultimo Capitulo</TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Ultima verificacao</TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      position: "sticky", right: 0, zIndex: 3,
                      backgroundColor: "rgba(240,244,248,0.98)",
                      boxShadow: "-1px 0 0 rgba(0,0,0,0.06)",
                    }}
                  >
                    Acoes
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredMangas.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Stack spacing={1} sx={{ alignItems: "center", py: 5 }}>
                        <LibraryBooksRoundedIcon sx={{ fontSize: 40, color: "text.disabled" }} />
                        <Typography variant="body2" color="text.secondary">
                          {filter.trim()
                            ? `Nenhum manga encontrado para "${filter}".`
                            : "Nenhum manga cadastrado ainda."}
                        </Typography>
                        {!filter.trim() && (
                          <Button variant="contained" size="small" onClick={() => setDialogOpen(true)}>
                            Adicionar manga
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMangas.map((manga) => (
                    <MangaRow
                      key={manga.id}
                      manga={manga}
                      isHighlighted={newlyAddedMangaId === manga.id}
                      isOpeningCurrent={openingCurrentChapterId === manga.id}
                      onSync={handleSyncNow}
                      onOpenCurrent={handleOpenCurrentChapter}
                      onOpenLatest={handleOpenLatestChapter}
                      onToggle={handleToggle}
                      onRemove={handleRemove}
                      onOpenProgress={openProgressDialog}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>

      {/* Add manga dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 1 }}>Adicionar manga</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "flex-end" }}>
                <TextField
                  label="URL da pagina do manga na scan"
                  value={form.sourceUrl ?? ""}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, sourceUrl: e.target.value }));
                    setScrapeResult(null);
                  }}
                  placeholder="Ex: https://minha-scan.com/manga/titulo"
                  fullWidth
                  size="small"
                />
                <Button
                  variant="outlined"
                  size="small"
                  disabled={scraping || !form.sourceUrl?.trim()}
                  onClick={() => void handleScrape()}
                  startIcon={scraping ? <CircularProgress size={14} /> : <ImageSearchRoundedIcon fontSize="small" />}
                  sx={{ flexShrink: 0, height: 40, whiteSpace: "nowrap" }}
                >
                  {scraping ? "Buscando..." : "Buscar info"}
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                Informe a URL da scan que voce esta lendo. Tentaremos extrair o titulo e o capitulo mais recente automaticamente.
              </Typography>
              {scrapeResult && (
                <Alert
                  severity={scrapeResult.success ? "success" : "warning"}
                  sx={{ mt: 1, borderRadius: 2 }}
                >
                  {scrapeResult.success ? (
                    <>
                      {scrapeResult.title && <span>Titulo encontrado: <strong>{scrapeResult.title}</strong>. </span>}
                      {scrapeResult.latestChapter && <span>Ultimo capitulo detectado: <strong>{scrapeResult.latestChapter}</strong>. </span>}
                      {scrapeResult.title && "Campos preenchidos automaticamente."}
                    </>
                  ) : (
                    scrapeResult.error ?? "Nao foi possivel extrair informacoes. Preencha manualmente."
                  )}
                </Alert>
              )}
            </Box>

            <TextField
              label="Nome exibido"
              value={form.displayTitle}
              onChange={(e) => setForm((f) => ({ ...f, displayTitle: e.target.value }))}
              placeholder="Ex: One Piece"
              fullWidth
            />

            {duplicateTitle && (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                Voce ja possui um manga com esse titulo na lista. Pode salvar mesmo assim se quiser acompanhar em outra fonte.
              </Alert>
            )}

            <TextField
              label="Capitulo atual (opcional)"
              value={form.currentChapter ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, currentChapter: e.target.value }))}
              placeholder="Ex: 10"
              fullWidth
              helperText="Ao informar o capitulo, tentaremos pegar o link automaticamente. Se preferir, informe a URL no campo abaixo."
            />

            <TextField
              label="URL do capitulo atual (opcional)"
              value={form.currentChapterUrl ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, currentChapterUrl: e.target.value }))}
              placeholder="Ex: https://minha-scan.com/manga/titulo/capitulo-10"
              fullWidth
              helperText="Link direto para o capitulo em que voce esta lendo."
            />

            {!scrapeResult?.success && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Forneça a URL da scan para detectarmos novos capitulos automaticamente a cada sincronizacao.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={handleCloseDialog} disabled={submitting}>Cancelar</Button>
          <Button variant="contained" onClick={() => void handleAddManga()} disabled={submitting || !form.displayTitle.trim()} sx={{ color: "#fff" }}>
            {submitting ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : "Salvar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Progress dialog */}
      <Dialog open={progressDialogOpen} onClose={closeProgressDialog} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 1 }}>Atualizar capitulo atual</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              {selectedProgressManga?.displayTitle ?? ""}
            </Typography>
            <TextField
              autoFocus
              label="Seu capitulo atual"
              value={progressValue}
              onChange={(e) => setProgressValue(e.target.value)}
              placeholder="Ex: 10"
              fullWidth
              disabled={savingProgress}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveProgressFromDialog();
                }
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Deixe em branco para limpar o capitulo atual salvo.
            </Typography>
            {progressDialogError && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>{progressDialogError}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={closeProgressDialog} disabled={savingProgress}>Cancelar</Button>
          <Button variant="contained" onClick={() => void saveProgressFromDialog()} disabled={savingProgress}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Persistent alert dialog */}
      <Dialog
        open={Boolean(currentAlert)}
        onClose={(_event, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
        }}
        fullWidth maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 1 }}>Confirmar notificacao</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Typography variant="subtitle1">{currentAlert?.title}</Typography>
            <Typography variant="body1" sx={{ whiteSpace: "pre-line" }}>{currentAlert?.message}</Typography>
            <Typography variant="caption" color="text.secondary">
              Recebida em: {formatDate(currentAlert?.createdAt ?? null)}
            </Typography>
            {pendingAlerts.length > 1 && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Existem mais {pendingAlerts.length - 1} notificacoes aguardando confirmacao.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="contained" onClick={handleConfirmPersistentAlert}>Confirmar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        message={toast ?? ""}
        sx={{ "& .MuiSnackbarContent-root": { borderRadius: 2, fontWeight: 500 } }}
      />
    </Box>
  );
}
