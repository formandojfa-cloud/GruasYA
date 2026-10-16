"use client";

import { type FormEvent, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { ProviderSelf } from "@/lib/types";
import { Button, Field, Input, Notice } from "@/components/ui";
import { DriverShell } from "./bits";
import { extractToken } from "./util";

/**
 * Sin sesión y sin token en la URL: el piloto pega aquí el enlace que le mandó
 * la central por WhatsApp (o solo el token).
 */
export default function LoginScreen({ initialError, onLoggedIn }: { initialError?: string | null; onLoggedIn: (me: ProviderSelf) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const token = extractToken(value);
    if (token.length < 8) {
      setError("Pega el enlace completo o el token que te mandó la central.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const me = await api.post<ProviderSelf>("/api/provider/auth", { token });
      onLoggedIn(me);
    } catch (err) {
      setError(errorMessage(err, "No se pudo iniciar sesión"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DriverShell footer="¿No tienes enlace o ya no funciona? Escribe a la central y te mandan uno nuevo.">
      <section className="tarjeta">
        <h2 className="text-[22px]">Entra con tu enlace</h2>
        <p className="tenue">La central de GruaYa te manda por WhatsApp un enlace personal. Ábrelo en este teléfono, o pega aquí el enlace o el token.</p>
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <Field label="Enlace o token" hint="Ejemplo: https://…/driver?token=abc123">
            <Input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="Pega aquí tu enlace"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
              autoFocus
            />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Entrar
          </Button>
        </form>
      </section>
    </DriverShell>
  );
}
