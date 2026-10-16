"use client";

/**
 * Asignación manual desde el detalle: un proveedor de la red (ordenados por
 * distancia al punto de recogida) o un gruero externo coordinado por teléfono.
 */
import { type FormEvent, useMemo, useState } from "react";
import { Button, cn, Field, Input, Pill, Select } from "@/components/ui";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { formatKm, formatPhone, PROVIDER_KIND_LABELS, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ProviderAdminView, ProviderKind, RequestView } from "@/lib/types";
import { ConfirmButton, ErrorText, ProviderStatusPill } from "./bits";
import { glyphFor, haversineKm, providerKindFor, str } from "./util";

export type AssignResult = { request: RequestView; invite: { accessLink: string; whatsapp: string } | null };

type Props = {
  request: RequestView;
  providers: ProviderAdminView[];
  onAssigned: (res: AssignResult) => void;
};

/** Mensaje de error con los detalles de validación de la API, si vienen. */
export function describeError(err: unknown): string {
  const base = errorMessage(err);
  if (err instanceof ApiClientError && Array.isArray(err.details)) {
    const parts = (err.details as unknown[])
      .map((d) => {
        if (!d || typeof d !== "object") return null;
        const o = d as Record<string, unknown>;
        const path = Array.isArray(o.path) ? o.path.join(".") : str(o.path);
        const msg = str(o.message);
        return msg ? (path ? `${path}: ${msg}` : msg) : null;
      })
      .filter(Boolean);
    if (parts.length) return `${base} — ${parts.join("; ")}`;
  }
  return base;
}

export default function AssignPanel({ request, providers, onAssigned }: Props) {
  const [mode, setMode] = useState<"network" | "external">("network");
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "network"}
          onClick={() => setMode("network")}
          className={cn("h-10 rounded-lg text-sm font-semibold transition", mode === "network" ? "bg-background shadow-sm" : "text-muted hover:text-foreground")}
        >
          Asignar de la red
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "external"}
          onClick={() => setMode("external")}
          className={cn("h-10 rounded-lg text-sm font-semibold transition", mode === "external" ? "bg-background shadow-sm" : "text-muted hover:text-foreground")}
        >
          Gruero externo
        </button>
      </div>
      {mode === "network" ? <NetworkList request={request} providers={providers} onAssigned={onAssigned} /> : <ExternalForm request={request} onAssigned={onAssigned} />}
    </div>
  );
}

// ---------- De la red ----------

function NetworkList({ request, providers, onAssigned }: Props) {
  const now = useNow(5000);
  const [onlyConnected, setOnlyConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = providerKindFor(request.kind);

  const rejectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of request.events) {
      if ((e.type === "OFFER_REJECTED" || e.type === "OFFER_EXPIRED" || e.type === "PROVIDER_CANCELLED") && e.data) {
        const pid = str(e.data.providerId);
        if (pid) s.add(pid);
      }
    }
    return s;
  }, [request.events]);
  const pendingOfferProviderId = request.search.currentOffer?.providerId ?? null;

  const rows = useMemo(() => {
    return providers
      .filter((p) => p.kind === kind)
      .filter((p) => !onlyConnected || (p.status !== "OFFLINE" && !p.isStale))
      .map((p) => ({ p, km: p.location ? haversineKm(p.location, request.pickup) : null }))
      .sort((a, b) => (a.km ?? Number.POSITIVE_INFINITY) - (b.km ?? Number.POSITIVE_INFINITY) || a.p.name.localeCompare(b.p.name));
  }, [providers, kind, onlyConnected, request.pickup]);

  async function assign(providerId: string) {
    setBusy(providerId);
    setError(null);
    try {
      const res = await api.post<AssignResult>(`/api/pbx/requests/${request.id}/assign`, { providerId });
      onAssigned(res);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  const label = kind === "TOW" ? "grúas" : "motoristas";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          {rows.length} {label} · por distancia al punto de recogida
        </span>
        <label className="inline-flex items-center gap-1 cursor-pointer select-none">
          <input type="checkbox" checked={onlyConnected} onChange={(e) => setOnlyConnected(e.target.checked)} />
          Solo con señal
        </label>
      </div>
      <ErrorText>{error}</ErrorText>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
          {onlyConnected ? `Ninguna de las ${label} tiene señal ahora. Quita el filtro o asigna un gruero externo.` : `No hay ${label} registradas. Agrega una en Proveedores o asigna un gruero externo.`}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map(({ p, km }) => {
            const isBusy = p.status === "BUSY";
            const rejected = rejectedIds.has(p.id);
            const hasOffer = pendingOfferProviderId === p.id;
            return (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                <span className="text-xl shrink-0" aria-hidden>
                  {glyphFor(p.kind)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">{p.name}</span>
                    {p.isExternal && <Pill tone="neutral">externo</Pill>}
                    {hasOffer && <Pill tone="info">oferta en curso</Pill>}
                    {rejected && <Pill tone="warning">ya rechazó</Pill>}
                  </div>
                  <div className="text-xs text-muted truncate">
                    <span className={cn("font-semibold tabular-nums", km != null && "text-foreground")}>{km != null ? formatKm(km) : "sin ubicación"}</span>
                    {" · "}
                    {p.plate ?? p.vehicleLabel ?? formatPhone(p.phone)}
                    {p.location && <> · señal {relativeTime(p.location.updatedAt, now)}</>}
                  </div>
                  <div className="mt-0.5">
                    <ProviderStatusPill status={p.status} stale={p.isStale} />
                  </div>
                </div>
                <ConfirmButton
                  variant="primary"
                  onConfirm={() => assign(p.id)}
                  loading={busy === p.id}
                  disabled={isBusy || (busy !== null && busy !== p.id)}
                  confirmLabel="¿Asignar?"
                  className="shrink-0 min-w-[84px]"
                >
                  {isBusy ? "Ocupado" : "Asignar"}
                </ConfirmButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- Externo ----------

function ExternalForm({ request, onAssigned }: Omit<Props, "providers">) {
  const defaultKind = providerKindFor(request.kind);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<ProviderKind>(defaultKind);
  const [plate, setPlate] = useState("");
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<AssignResult>(`/api/pbx/requests/${request.id}/assign`, {
        external: {
          name: name.trim(),
          phone: phone.trim(),
          kind,
          plate: plate.trim() || undefined,
          vehicleLabel: vehicleLabel.trim() || undefined,
        },
      });
      onAssigned(res);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Para un gruero que coordinas por teléfono. Se crea como proveedor externo (o se reutiliza si el teléfono ya existe) y te damos su enlace para mandárselo por WhatsApp.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grúas Don Chepe" required minLength={2} maxLength={60} />
        </Field>
        <Field label="Teléfono" hint="8 dígitos de Guatemala">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5555-1234" inputMode="tel" required />
        </Field>
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ProviderKind)}>
            <option value="TOW">{PROVIDER_KIND_LABELS.TOW}</option>
            <option value="MOTO">{PROVIDER_KIND_LABELS.MOTO}</option>
          </Select>
        </Field>
        <Field label="Placa (opcional)">
          <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="C123ABC" maxLength={12} />
        </Field>
        <Field label="Vehículo (opcional)">
          <Input value={vehicleLabel} onChange={(e) => setVehicleLabel(e.target.value)} placeholder="Grúa de plataforma blanca" maxLength={80} />
        </Field>
      </div>
      {kind !== defaultKind && <p className="text-xs text-warning">Este servicio necesita {defaultKind === "TOW" ? "una grúa" : "un motorista"}; la API rechazará otro tipo.</p>}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" loading={busy} fullWidth>
        Asignar y generar enlace
      </Button>
    </form>
  );
}
