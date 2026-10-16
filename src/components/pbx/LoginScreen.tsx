"use client";

import { type FormEvent, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { OperatorSelf } from "@/lib/types";
import { ErrorText } from "./bits";

export default function LoginScreen({
  storedName,
  onLogin,
  notice,
}: {
  storedName: string;
  onLogin: (op: OperatorSelf, name: string) => void;
  notice?: string | null;
}) {
  // El nombre guardado llega tras montar (localStorage); mientras el operador no escriba, se usa ese.
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const name = nameEdit ?? storedName;
  const setName = (v: string) => setNameEdit(v);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Escribe tu nombre (mínimo 2 letras)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const op = await api.post<OperatorSelf>("/api/pbx/auth", { password, name: trimmed });
      onLogin(op, trimmed);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-4 safe-top safe-bottom">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-sm flex flex-col gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Asistencia Vial</p>
          <h1 className="text-2xl font-bold">Panel del PBX</h1>
          <p className="text-sm text-muted">Entra para atender alertas y coordinar grúas.</p>
        </div>
        {notice && <p className="rounded-lg bg-warning-soft text-warning text-sm px-3 py-2">{notice}</p>}
        <Field label="Tu nombre" hint="Queda registrado en cada alerta que atiendas">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Operador de turno" maxLength={60} required />
        </Field>
        <Field label="Contraseña">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••"
            required
            autoFocus={!!storedName}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" size="lg" fullWidth loading={busy}>
          Entrar
        </Button>
      </form>
    </main>
  );
}
