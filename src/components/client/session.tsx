"use client";

/**
 * Sesión del cliente: GET /api/me al cargar; si responde 401 se muestra la hoja
 * de ingreso (teléfono + nombre → POST /api/auth/client). La cookie la pone la
 * API; aquí solo guardamos `me` en memoria.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import MapView from "@/components/map/Map";
import { Button, Field, Input, Notice, Pill, Sheet, Spinner } from "@/components/ui";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import type { ClientSelf } from "@/lib/types";
import { apiErrorMessage, GUATEMALA_CITY, STORAGE_DRAFT, STORAGE_VEHICLE } from "./constants";

type SessionState = {
  me: ClientSelf | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<ClientSelf | null>;
  login: (phone: string, name: string) => Promise<ClientSelf>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<ClientSelf | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): Promise<ClientSelf | null> => {
    return api.get<ClientSelf>("/api/me").then(
      (data) => {
        setMe(data);
        setError(null);
        setLoading(false);
        return data;
      },
      (e: unknown) => {
        if (e instanceof ApiClientError && e.status === 401) {
          setMe(null);
          setError(null);
        } else {
          setError(errorMessage(e));
        }
        setLoading(false);
        return null;
      },
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (phone: string, name: string) => {
    const data = await api.post<ClientSelf>("/api/auth/client", { phone, name });
    setMe(data);
    setError(null);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await api.delete<{ ok: boolean }>("/api/auth/client");
    try {
      // Que otro usuario en el mismo teléfono no herede el borrador ni el vehículo.
      window.sessionStorage.removeItem(STORAGE_DRAFT);
      window.localStorage.removeItem(STORAGE_VEHICLE);
    } catch {
      /* sin almacenamiento */
    }
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, loading, error, refresh, login, logout }), [me, loading, error, refresh, login, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}

/** Muestra cargando → ingreso → contenido según la sesión. */
export function SessionGate({ children }: { children: (me: ClientSelf) => ReactNode }) {
  const { me, loading, error, refresh } = useSession();
  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!me) return <LoginScreen error={error} onRetry={refresh} />;
  return <>{children(me)}</>;
}

export function MemberBadge({ isMember }: { isMember: boolean }) {
  if (!isMember) return null;
  return <Pill tone="success">Socio</Pill>;
}

function LoginScreen({ error, onRetry }: { error: string | null; onRetry: () => Promise<unknown> }) {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-surface">
      <div className="absolute inset-0">
        <MapView center={GUATEMALA_CITY} zoom={13} interactive={false} className="h-full w-full" />
      </div>
      <div className="safe-top absolute inset-x-0 top-0 z-20 p-4">
        <span className="rounded-full bg-background px-3 py-2 text-sm font-bold shadow-md">🚛 Asistencia Vial</span>
      </div>
      <Sheet open title={error ? "No pudimos conectar" : "Bienvenido"}>
        {error ? (
          <>
            <Notice tone="danger">{error}</Notice>
            <Button className="mt-3" size="lg" fullWidth onClick={() => void onRetry()}>
              Reintentar
            </Button>
          </>
        ) : (
          <LoginForm />
        )}
      </Sheet>
    </div>
  );
}

function LoginForm() {
  const { login } = useSession();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "").replace(/^502/, "");
    if (digits.length !== 8) {
      setErr("Escribe tu número de 8 dígitos");
      return;
    }
    if (name.trim().length < 2) {
      setErr("Escribe tu nombre");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await login(digits, name.trim());
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <p className="-mt-2 text-sm text-muted">Grúa y asistencia en carretera a un toque. Entra con tu número para pedir ayuda y seguir tu servicio en vivo.</p>
      <Field label="Teléfono" hint="8 dígitos, sin código de país">
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="5555-0001"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      </Field>
      <Field label="Nombre">
        <Input type="text" autoComplete="name" placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      {err && <Notice tone="danger">{err}</Notice>}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Continuar
      </Button>
      <p className="text-center text-xs text-muted">Te contactaremos por este número para coordinar tu servicio.</p>
    </form>
  );
}
