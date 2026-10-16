"use client";

/** /cuenta: datos del conductor, membresía, vehículos y cerrar sesión, en tarjetas. */
import { useState } from "react";
import { Button, Notice, Pill, Row } from "@/components/ui";
import { formatPhone, VEHICLE_LABELS } from "@/lib/format";
import type { ClientSelf } from "@/lib/types";
import { ClientShell } from "./ClientShell";
import { apiErrorMessage, VEHICLE_ICONS } from "./constants";
import { SessionGate, SessionProvider, useSession } from "./session";

export function AccountPage() {
  return (
    <SessionProvider>
      <SessionGate>{(me) => <Account me={me} />}</SessionGate>
    </SessionProvider>
  );
}

function Account({ me }: { me: ClientSelf }) {
  const { logout } = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const initials = me.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const expires = me.membershipExpiresAt
    ? new Date(me.membershipExpiresAt).toLocaleDateString("es-GT", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  async function signOut() {
    setBusy(true);
    setErr(null);
    try {
      await logout();
    } catch (e) {
      setErr(apiErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <ClientShell section="cuenta" hasActive={!!me.activeRequest}>
      <section className="tarjeta">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-tinta text-xl font-bold text-sobre-tinta" aria-hidden>
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="titulo-hoja truncate">{me.name}</h2>
            <p className="tenue">{formatPhone(me.phone)}</p>
          </div>
        </div>
      </section>

      <section className="tarjeta">
        <div className="flex items-center justify-between gap-2">
          <h3>Membresía</h3>
          {me.isMember ? <Pill tone="success">Socio activo</Pill> : <Pill tone="neutral">Sin membresía</Pill>}
        </div>
        {me.isMember ? (
          <>
            {expires && <Row label="Vence" value={expires} />}
            <p className="tenue">Asistencias ligeras incluidas (llanta, batería, combustible, cerrajería) y grúa sin recargo.</p>
          </>
        ) : (
          <p className="tenue">Hazte socio: asistencias ligeras incluidas y ahorras Q50 en cada grúa. Pronto podrás activarla desde aquí; mientras, pídela por WhatsApp a nuestro equipo.</p>
        )}
      </section>

      <section className="tarjeta">
        <h3>Vehículos</h3>
        {me.vehicles.length === 0 ? (
          <p className="tenue">Sin vehículos guardados. Puedes indicarlo al pedir un servicio.</p>
        ) : (
          <ul className="divide-y divide-border">
            {me.vehicles.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-2">
                <span className="text-2xl leading-none" aria-hidden>
                  {VEHICLE_ICONS[v.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{v.label}</p>
                  <p className="text-sm text-muted">
                    {VEHICLE_LABELS[v.kind]} · Placa {v.plate}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {err && <Notice tone="danger">{err}</Notice>}
      <Button variant="danger" size="lg" fullWidth loading={busy} onClick={signOut}>
        Cerrar sesión
      </Button>
    </ClientShell>
  );
}
