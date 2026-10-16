"use client";

/**
 * Árbol del panel del operador. Una sola fuente de datos (GET /api/pbx/overview
 * cada 3 s) alimenta el tablero, la pestaña de proveedores y el detalle de una
 * solicitud (/pbx?request=<id>). Sin sesión (401) muestra el ingreso.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, cn } from "@/components/ui";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useLocalStorage, useNow, usePolling } from "@/lib/hooks";
import type { OperatorSelf, PbxOverview } from "@/lib/types";
import { BootSpinner, Centered } from "./bits";
import Dashboard from "./Dashboard";
import LoginScreen from "./LoginScreen";
import ProvidersTab from "./ProvidersTab";
import RequestDetail from "./RequestDetail";
import { useAlertSignals } from "./useAlertSignals";

type Session = "checking" | "anon" | "authed";
type Tab = "panel" | "providers";
const POLL_MS = 3000;
const LS_NAME = "pbx.operatorName";
const CACHE_TTL_MS = 30_000;

/** Último panel recibido: al cambiar entre /pbx y /pbx/proveedores el árbol se remonta y así no parpadea. */
let cache: { overview: PbxOverview; at: number } | null = null;

export default function PbxApp({ tab }: { tab: Tab }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("request");

  const [session, setSession] = useState<Session>(() => (cache && Date.now() - cache.at < CACHE_TTL_MS ? "authed" : "checking"));
  const [hadSession, setHadSession] = useState(false);
  const [storedName, setStoredName] = useLocalStorage<string>(LS_NAME, "");

  const fetchOverview = useCallback(async () => {
    try {
      const o = await api.get<PbxOverview>("/api/pbx/overview");
      setSession("authed");
      setHadSession(true);
      return o;
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) setSession("anon");
      throw e;
    }
  }, []);
  const { data, error, refresh, setData } = usePolling(fetchOverview, POLL_MS, { enabled: session !== "anon" });
  useEffect(() => {
    if (data) cache = { overview: data, at: Date.now() };
  }, [data]);
  // Semilla para el primer render tras remontar; en cuanto llega el sondeo, manda `data`.
  const [seed] = useState<PbxOverview | null>(() => (cache && Date.now() - cache.at < CACHE_TTL_MS ? cache.overview : null));
  const overview = session === "authed" ? (data ?? seed) : null;

  const { unseen, markSeen } = useAlertSignals(overview?.alerts);

  // ---- navegación del detalle (URL enlazable sin recargar) ----
  const openRequest = useCallback(
    (id: string, alertId?: string) => {
      if (alertId) markSeen(alertId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("request", id);
      window.history.pushState(null, "", `${pathname}?${params.toString()}`);
    },
    [pathname, searchParams, markSeen],
  );
  const closeRequest = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("request");
    const qs = params.toString();
    window.history.pushState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, searchParams]);

  // Abrir una alerta desde el detalle o la columna la marca como vista.
  useEffect(() => {
    if (!selectedId || !overview) return;
    const a = overview.alerts.find((x) => x.requestId === selectedId);
    if (a) markSeen(a.id);
  }, [selectedId, overview, markSeen]);

  const ack = useCallback(
    async (alertId: string) => {
      await api.post(`/api/pbx/alerts/${alertId}/ack`);
      markSeen(alertId);
      await refresh();
    },
    [markSeen, refresh],
  );

  function onLogin(op: OperatorSelf, name: string) {
    setStoredName(name || op.name);
    setSession("authed");
  }

  async function logout() {
    try {
      await api.delete("/api/pbx/auth");
    } catch {
      /* igual cerramos localmente */
    }
    cache = null;
    setData(null);
    setHadSession(false);
    setSession("anon");
  }

  if (session === "anon") {
    return <LoginScreen storedName={storedName} onLogin={onLogin} notice={hadSession ? "Tu sesión terminó. Vuelve a entrar." : null} />;
  }
  if (session === "checking" && !data) {
    if (error) {
      return (
        <Centered>
          <p className="text-sm text-danger">{errorMessage(error)}</p>
          <Button variant="secondary" onClick={() => void refresh()}>
            Reintentar
          </Button>
        </Centered>
      );
    }
    return <BootSpinner />;
  }

  const unackCount = overview?.alerts.filter((a) => !a.acknowledgedAt).length ?? 0;

  return (
    <div className="flex-1 flex flex-col min-h-dvh bg-background">
      <TopBar tab={tab} operatorName={overview?.operator.name ?? storedName} serverTime={overview?.serverTime ?? null} pollError={error ? errorMessage(error) : null} unackCount={unackCount} hasUnseen={unseen.size > 0} onLogout={logout} />

      {!overview ? (
        error ? (
          <Centered>
            <p className="text-sm text-danger">{errorMessage(error)}</p>
            <Button variant="secondary" onClick={() => void refresh()}>
              Reintentar
            </Button>
          </Centered>
        ) : (
          <BootSpinner />
        )
      ) : tab === "providers" ? (
        <ProvidersTab providers={overview.providers} onChanged={refresh} onOpenRequest={(id) => openRequest(id)} />
      ) : (
        <Dashboard overview={overview} unseen={unseen} onOpen={openRequest} onAck={ack} />
      )}

      {selectedId && <RequestDetail id={selectedId} overview={overview} onClose={closeRequest} onChanged={refresh} onAck={ack} />}
    </div>
  );
}

// ---------- Barra superior ----------

function TopBar({
  tab,
  operatorName,
  serverTime,
  pollError,
  unackCount,
  hasUnseen,
  onLogout,
}: {
  tab: Tab;
  operatorName: string;
  serverTime: string | null;
  pollError: string | null;
  unackCount: number;
  hasUnseen: boolean;
  onLogout: () => void;
}) {
  const now = useNow(1000);
  const tabCls = (active: boolean) =>
    cn("relative h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold transition", active ? "bg-primary text-primary-foreground" : "text-muted hover:bg-surface hover:text-foreground");
  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border safe-top">
      <div className="h-14 flex items-center gap-2 px-3 lg:px-4">
        <Link href="/pbx" className="font-bold text-base leading-none shrink-0">
          PBX <span className="hidden sm:inline text-muted font-normal text-sm">· Asistencia Vial</span>
        </Link>
        <nav className="flex items-center gap-1 ml-2" aria-label="Secciones">
          <Link href="/pbx" className={tabCls(tab === "panel")} aria-current={tab === "panel" ? "page" : undefined}>
            Panel
            {unackCount > 0 && (
              <span className={cn("inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-danger text-white text-[11px] font-bold tabular-nums", hasUnseen && "animate-pulse")} aria-label={`${unackCount} alertas sin atender`}>
                {unackCount}
              </span>
            )}
          </Link>
          <Link href="/pbx/proveedores" className={tabCls(tab === "providers")} aria-current={tab === "providers" ? "page" : undefined}>
            Proveedores
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 min-w-0">
          <span className="hidden md:inline text-xs text-muted truncate" title={serverTime ? `Última actualización ${relativeTime(serverTime, now)}` : undefined}>
            {operatorName}
            {serverTime && (
              <>
                {" · "}
                <span className={cn("inline-block h-2 w-2 rounded-full align-middle mr-1", pollError ? "bg-danger" : "bg-success")} />
                {pollError ? "sin conexión" : `al día ${relativeTime(serverTime, now)}`}
              </>
            )}
          </span>
          <Button size="sm" variant="ghost" onClick={onLogout} className="text-muted">
            Salir
          </Button>
        </div>
      </div>
      {pollError && (
        <div role="status" className="bg-danger-soft text-danger text-xs px-3 py-1.5 text-center">
          No se pudo actualizar: {pollError}. Reintentando cada {POLL_MS / 1000} s…
        </div>
      )}
    </header>
  );
}
