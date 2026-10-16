"use client";

import { type FormEvent, useState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { OperatorSelf } from "@/lib/types";
import { CentralBar, ErrorText } from "./bits";

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
    <div className="pagina">
      <CentralBar />
      <main className="columna">
        <section className="tarjeta">
          <h2 className="text-[22px]">Central</h2>
          <p className="tenue">Entra para atender alertas y coordinar grúas.</p>
          {notice && <Notice tone="warning">{notice}</Notice>}
          <form onSubmit={submit} className="flex flex-col gap-3">
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
        </section>
      </main>
      <p className="pie">Central GrúaYa · solo para el equipo que coordina las grúas</p>
    </div>
  );
}
