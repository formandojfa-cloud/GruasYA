"use client";

/**
 * Árbol de la Central. Una sola fuente de datos (GET /api/pbx/overview cada
 * 3 s) alimenta el tablero de servicios, la pestaña de pilotos y el detalle de
 * una solicitud (/pbx?request=<id>). Sin sesión (401) muestra el ingreso.
 */
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, cn, Notice } from "@/components/ui";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useLocalStorage, useNow, usePolling } from "@/lib/hooks";
import type { OperatorSelf, PbxOverview } from "@/lib/types";
import { BootSpinner, Centered, CentralShell, type PbxSection } from "./bits";
import Dashboard from "./Dashboard";
import LoginScreen from "./LoginScreen";
import ProvidersTab from "./ProvidersTab";
import RequestDetail from "./RequestDetail";
import { useAlertSignals } from "./useAlertSignals";

type Session = "checking" | "anon" | "authed";
type Tab = PbxSection;
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
        <CentralShell>
          <Centered>
            <p className="text-sm text-rojo">{errorMessage(error)}</p>
            <Button variant="secondary" onClick={() => void refresh()}>
              Reintentar
            </Button>
          </Centered>
        </CentralShell>
      );
    }
    return (
      <CentralShell>
        <BootSpinner />
      </CentralShell>
    );
  }

  const unackCount = overview?.alerts.filter((a) => !a.acknowledgedAt).length ?? 0;
  const pollError = error ? errorMessage(error) : null;

  return (
    <CentralShell
      section={tab}
      unackCount={unackCount}
      hasUnseen={unseen.size > 0}
      right={<OperatorStatus operatorName={overview?.operator.name ?? storedName} serverTime={overview?.serverTime ?? null} pollError={pollError} onLogout={logout} />}
    >
      {pollError && (
        <div role="status">
          <Notice tone="danger">
            No se pudo actualizar: {pollError}. Reintentando cada {POLL_MS / 1000} s…
          </Notice>
        </div>
      )}

      {!overview ? (
        error ? (
          <Centered>
            <p className="text-sm text-rojo">{errorMessage(error)}</p>
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
    </CentralShell>
  );
}

// ---------- Operador y estado de la conexión (píldoras del lado derecho de la barra) ----------

function OperatorStatus({ operatorName, serverTime, pollError, onLogout }: { operatorName: string; serverTime: string | null; pollError: string | null; onLogout: () => void }) {
  const now = useNow(1000);
  return (
    <>
      <span className="pildora hidden md:inline-flex max-w-[320px] text-muted" title={serverTime ? `Última actualización ${relativeTime(serverTime, now)}` : undefined}>
        <span className="truncate text-foreground">{operatorName}</span>
        {serverTime && (
          <>
            <span className={cn("estado-punto !h-2 !w-2", !pollError && "en-linea")} aria-hidden />
            <span className="whitespace-nowrap">{pollError ? "sin conexión" : `al día ${relativeTime(serverTime, now)}`}</span>
          </>
        )}
      </span>
      <button type="button" onClick={onLogout} className="pildora cursor-pointer hover:bg-surface-2 transition">
        Salir
      </button>
    </>
  );
}
