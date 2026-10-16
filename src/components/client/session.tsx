"use client";

/**
 * Sesión del cliente: GET /api/me al cargar; si responde 401 se muestra la
 * tarjeta de ingreso (teléfono + nombre → POST /api/auth/client). La cookie la pone la
 * API; aquí solo guardamos `me` en memoria.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Aviso, Button, Field, Input, Notice, Pill, Spinner, Wordmark } from "@/components/ui";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import type { ClientSelf } from "@/lib/types";
import { apiErrorMessage, STORAGE_DRAFT, STORAGE_VEHICLE } from "./constants";

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
      <div className="pagina flex items-center justify-center">
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

/** Tarjeta "Crea tu cuenta / Entrar" del prototipo (sin código SMS en el MVP). */
function LoginScreen({ error, onRetry }: { error: string | null; onRetry: () => Promise<unknown> }) {
  return (
    <div className="pagina">
      <header className="barra">
        <div className="columna">
          <h1 className="leading-none">
            <Wordmark suffix="conductor" />
          </h1>
        </div>
      </header>
      <main className="columna">
        <section className="tarjeta">
          {error ? (
            <>
              <h2>No pudimos conectar</h2>
              <Notice tone="danger">{error}</Notice>
              <Button size="lg" fullWidth onClick={() => void onRetry()}>
                Reintentar
              </Button>
            </>
          ) : (
            <LoginForm />
          )}
        </section>
        <Aviso>Grúa en minutos con precio fijo; pagas en efectivo al gruero al terminar.</Aviso>
      </main>
      <p className="pie">GruaYa · Grúa por demanda en Guatemala</p>
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
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <h2>Crea tu cuenta o entra</h2>
      <p className="tenue">Regístrate antes de una emergencia: así pedir la grúa toma segundos.</p>
      <Field label="Celular" hint="8 dígitos, sin código de país">
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="5555 5555"
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
        Entrar
      </Button>
      <p className="tenue chico text-center">Te contactaremos por este número para coordinar tu grúa.</p>
    </form>
  );
}
