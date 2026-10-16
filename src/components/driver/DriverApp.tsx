"use client";

/**
 * Árbol de la app del piloto (mapa completo + hoja inferior, aspecto GrúaYa). Todo lo dirige `ProviderSelf` (GET /api/provider/me
 * cada 2.5 s): oferta pendiente → tarjeta de oferta; servicio activo →
 * tarjeta de servicio; si no, la principal. Al recargar, el estado vuelve del
 * servidor; el resumen de un servicio recién terminado se recuerda en
 * localStorage hasta que el piloto toca "Listo".
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { useLocalStorage, usePolling } from "@/lib/hooks";
import type { ProviderSelf, RequestView } from "@/lib/types";
import ActiveJobScreen from "./ActiveJobScreen";
import { ConnectionBanner, FullScreen, FullScreenSpinner } from "./bits";
import CompletedScreen from "./CompletedScreen";
import HomeScreen from "./HomeScreen";
import LoginScreen from "./LoginScreen";
import OfferScreen from "./OfferScreen";
import { useLocationReporter } from "./useLocationReporter";

type Session = "checking" | "anon" | "authed" | "error";
const POLL_MS = 2500;
const LS_COMPLETED = "driver.completedJobId";

export default function DriverApp() {
  const params = useSearchParams();
  const token = params.get("token");
  const router = useRouter();

  const [session, setSession] = useState<Session>("checking");
  const [bootError, setBootError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [completed, setCompleted] = useState<{
    job: RequestView;
    clientName: string | null;
  } | null>(null);
  const [completedId, setCompletedId] = useLocalStorage<string | null>(LS_COMPLETED, null);

  const fetchSelf = useCallback(async () => {
    try {
      return await api.get<ProviderSelf>("/api/provider/me");
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) setSession("anon");
      throw e;
    }
  }, []);
  const { data: self, error: pollError, refresh, setData } = usePolling(fetchSelf, POLL_MS, { enabled: session === "authed" });

  // Arranque: token en la URL → ingreso automático; si no, ¿hay sesión?
  useEffect(() => {
    if (session !== "checking") return;
    let cancelled = false;
    (async () => {
      try {
        if (token) {
          const me = await api.post<ProviderSelf>("/api/provider/auth", {
            token,
          });
          if (cancelled) return;
          setData(me);
          setBootError(null);
          setSession("authed");
          router.replace("/driver");
        } else {
          const me = await api.get<ProviderSelf>("/api/provider/me");
          if (cancelled) return;
          setData(me);
          setSession("authed");
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiClientError && e.status === 401) {
          setBootError(token ? e.message : null);
          setSession("anon");
        } else {
          setBootError(errorMessage(e));
          setSession("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, token, router, setData]);

  // Resumen de servicio terminado tras recargar la página.
  useEffect(() => {
    if (session !== "authed" || !completedId || completed?.job.id === completedId) return;
    let cancelled = false;
    api
      .get<RequestView>(`/api/provider/jobs/${completedId}`)
      .then((job) => {
        if (cancelled) return;
        if (job.status === "COMPLETED") setCompleted({ job, clientName: job.client?.name ?? null });
        else setCompletedId(null);
      })
      .catch(() => {
        if (!cancelled) setCompletedId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session, completedId, completed?.job.id, setCompletedId]);

  // Avisos transitorios ("La oferta ya no está disponible").
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const reporting = !!self && session === "authed" && (self.status !== "OFFLINE" || self.activeJob != null);
  const loc = useLocationReporter(reporting);
  const shownPosition =
    loc.position ??
    (self?.location
      ? {
          lat: self.location.lat,
          lng: self.location.lng,
          heading: self.location.heading,
        }
      : null);

  // ---------- acciones ----------

  const toggleStatus = async (to: "ONLINE" | "OFFLINE") => {
    const me = await api.post<ProviderSelf>("/api/provider/status", {
      status: to,
    });
    setData(me);
  };

  const logout = async () => {
    try {
      await api.delete("/api/provider/auth");
    } finally {
      setData(null);
      setBootError(null);
      setSession("anon");
    }
  };

  const acceptOffer = async (offerId: string) => {
    try {
      const job = await api.post<RequestView>(`/api/provider/offers/${offerId}/accept`, {});
      setData((s) => (s ? { ...s, pendingOffer: null, activeJob: job, status: "BUSY" } : s));
      setCompleted(null);
    } catch (e) {
      if (e instanceof ApiClientError && (e.code === "OFFER_UNAVAILABLE" || e.code === "OFFER_NOT_FOUND")) {
        setNotice("La oferta ya no está disponible");
        setData((s) => (s ? { ...s, pendingOffer: null } : s));
        return;
      }
      throw e;
    } finally {
      void refresh();
    }
  };

  const rejectOffer = async (offerId: string) => {
    try {
      await api.post(`/api/provider/offers/${offerId}/reject`, {});
      setData((s) => (s ? { ...s, pendingOffer: null } : s));
    } finally {
      void refresh();
    }
  };

  const onJobUpdated = (view: RequestView) => {
    setData((s) => (s ? { ...s, activeJob: view } : s));
    void refresh();
  };

  const onJobCompleted = (view: RequestView) => {
    const clientName = self?.activeJob?.client?.name ?? view.client?.name ?? null;
    setCompleted({ job: view, clientName });
    setCompletedId(view.id);
    setData((s) => (s ? { ...s, activeJob: null } : s));
    void refresh();
  };

  const onJobCancelled = (requestStatus: string) => {
    setNotice(requestStatus === "ESCALATED" ? "Te bajaste del servicio. La central lo coordinará." : "Te bajaste del servicio. Se ofrecerá a otra grúa.");
    setData((s) => (s ? { ...s, activeJob: null } : s));
    void refresh();
  };

  const finishSummary = () => {
    setCompleted(null);
    setCompletedId(null);
    void refresh();
  };

  // ---------- pantallas ----------

  if (session === "checking") return <FullScreenSpinner label="Entrando…" />;

  if (session === "error") {
    return (
      <FullScreen>
        <h2 className="text-[22px]">No se pudo conectar</h2>
        <p className="tenue max-w-xs">{bootError ?? "Revisa tu internet e inténtalo de nuevo."}</p>
        <Button onClick={() => setSession("checking")}>Reintentar</Button>
      </FullScreen>
    );
  }

  if (session === "anon") {
    return (
      <LoginScreen
        initialError={bootError}
        onLoggedIn={(me) => {
          setData(me);
          setBootError(null);
          setSession("authed");
        }}
      />
    );
  }

  if (!self) {
    return pollError ? (
      <FullScreen>
        <h2 className="text-[22px]">No se pudo cargar tu estado</h2>
        <p className="tenue max-w-xs">{pollError.message}</p>
        <Button onClick={() => void refresh()}>Reintentar</Button>
      </FullScreen>
    ) : (
      <FullScreenSpinner />
    );
  }

  const banner = pollError ? <ConnectionBanner message={pollError.message} /> : null;

  if (self.pendingOffer) {
    const offer = self.pendingOffer;
    return (
      <>
        {banner}
        <OfferScreen
          key={offer.id}
          self={self}
          offer={offer}
          position={shownPosition}
          loc={loc}
          onAccept={() => acceptOffer(offer.id)}
          onReject={() => rejectOffer(offer.id)}
          onExpire={() => void refresh()}
        />
      </>
    );
  }

  if (self.activeJob) {
    return (
      <>
        {banner}
        <ActiveJobScreen
          self={self}
          job={self.activeJob}
          position={shownPosition}
          loc={loc}
          onUpdated={onJobUpdated}
          onCompleted={onJobCompleted}
          onCancelled={onJobCancelled}
          onRefresh={() => void refresh()}
        />
      </>
    );
  }

  if (completed) {
    return (
      <>
        {banner}
        <CompletedScreen self={self} job={completed.job} clientName={completed.clientName} position={shownPosition} onDone={finishSummary} />
      </>
    );
  }

  return (
    <>
      {banner}
      <HomeScreen self={self} loc={loc} notice={notice} onToggle={toggleStatus} onLogout={logout} />
    </>
  );
}
