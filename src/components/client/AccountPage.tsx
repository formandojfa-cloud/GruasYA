"use client";

/** /cuenta: datos del cliente, membresía, vehículos y cerrar sesión. */
import { useState } from "react";
import { Button, Card, Notice, Pill, Row, TopBar } from "@/components/ui";
import { formatPhone, VEHICLE_LABELS } from "@/lib/format";
import type { ClientSelf } from "@/lib/types";
import { BottomNav } from "./BottomNav";
import { apiErrorMessage, VEHICLE_ICONS } from "./constants";
import { MemberBadge, SessionGate, SessionProvider, useSession } from "./session";

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
    <div className="flex min-h-dvh flex-col bg-background">
      <TopBar title="Cuenta" right={<MemberBadge isMember={me.isMember} />} />
      <main className="flex-1 space-y-4 p-4">
        <Card className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground" aria-hidden>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{me.name}</p>
            <p className="text-sm text-muted">{formatPhone(me.phone)}</p>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Membresía</h2>
            {me.isMember ? <Pill tone="success">Socio activo</Pill> : <Pill tone="neutral">Sin membresía</Pill>}
          </div>
          {me.isMember ? (
            <>
              {expires && <Row label="Vence" value={expires} />}
              <p className="mt-1 text-sm text-muted">Asistencias ligeras incluidas (llanta, batería, combustible, cerrajería) y grúa sin recargo.</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Hazte socio: asistencias ligeras incluidas y ahorras Q50 en cada grúa. Pronto podrás activarla desde aquí; mientras, pídela por WhatsApp a nuestro equipo.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="font-bold">Vehículos</h2>
          {me.vehicles.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Sin vehículos guardados. Puedes indicarlo al pedir un servicio.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {me.vehicles.map((v) => (
                <li key={v.id} className="flex items-center gap-3 py-2">
                  <span className="text-2xl leading-none" aria-hidden>
                    {VEHICLE_ICONS[v.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{v.label}</p>
                    <p className="text-xs text-muted">
                      {VEHICLE_LABELS[v.kind]} · Placa {v.plate}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {err && <Notice tone="danger">{err}</Notice>}
        <Button variant="secondary" fullWidth className="text-danger" loading={busy} onClick={signOut}>
          Cerrar sesión
        </Button>
      </main>
      <BottomNav />
    </div>
  );
}
