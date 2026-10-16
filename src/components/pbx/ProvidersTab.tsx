"use client";

/**
 * Pestaña de proveedores: tabla densa de la red (grúas y motoristas) con
 * acciones por fila y alta de proveedor nuevo con su enlace de acceso.
 */
import { type FormEvent, useMemo, useState } from "react";
import { Button, cn, Field, Input, Pill, Select, Sheet } from "@/components/ui";
import { api } from "@/lib/api";
import { formatPhone, PROVIDER_KIND_LABELS, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ProviderAdminView, ProviderKind } from "@/lib/types";
import { describeError } from "./AssignPanel";
import { ConfirmButton, CopyButton, ErrorText, LinkButton, ProviderStatusPill, SectionTitle } from "./bits";
import InviteBox from "./InviteBox";
import { glyphFor, shortId } from "./util";

type Props = {
  providers: ProviderAdminView[];
  onChanged: () => Promise<void> | void;
  onOpenRequest: (id: string) => void;
};

const STATUS_ORDER: Record<string, number> = { ONLINE: 0, BUSY: 1, OFFLINE: 2 };

export default function ProvidersTab({ providers, onChanged, onOpenRequest }: Props) {
  const now = useNow(5000);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rotated, setRotated] = useState<Record<string, { accessLink: string; whatsapp: string }>>({});

  const counts = useMemo(() => {
    const c = { online: 0, busy: 0, offline: 0, stale: 0 };
    for (const p of providers) {
      if (p.status === "ONLINE") c.online++;
      else if (p.status === "BUSY") c.busy++;
      else c.offline++;
      if (p.status !== "OFFLINE" && p.isStale) c.stale++;
    }
    return c;
  }, [providers]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return providers
      .filter((p) => !needle || [p.name, p.phone, p.plate ?? "", p.vehicleLabel ?? ""].some((s) => s.toLowerCase().includes(needle)))
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name));
  }, [providers, q]);

  async function patch(p: ProviderAdminView, body: Record<string, unknown>, key: string) {
    const k = `${p.id}:${key}`;
    setBusy(k);
    setErrors((e) => ({ ...e, [p.id]: "" }));
    try {
      const updated = await api.patch<ProviderAdminView>(`/api/pbx/providers/${p.id}`, body);
      if (body.rotateToken) setRotated((r) => ({ ...r, [p.id]: { accessLink: updated.accessLink, whatsapp: updated.whatsappInvite } }));
      await onChanged();
    } catch (err) {
      setErrors((e) => ({ ...e, [p.id]: describeError(err) }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm">
          <span className="font-bold">{providers.length}</span> proveedores ·{" "}
          <span className="text-success font-semibold">{counts.online} disponibles</span> · <span className="text-info font-semibold">{counts.busy} en servicio</span> ·{" "}
          <span className="text-muted">{counts.offline} desconectados</span>
          {counts.stale > 0 && <span className="text-warning font-semibold"> · {counts.stale} sin señal</span>}
        </div>
        <div className="ml-auto flex items-center gap-2 w-full sm:w-auto">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, teléfono o placa" className="h-10 sm:w-72" aria-label="Buscar proveedor" />
          <Button size="md" className="h-10 whitespace-nowrap" onClick={() => setAdding(true)}>
            + Agregar
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
          {providers.length === 0 ? "Aún no hay proveedores. Agrega la primera grúa para empezar." : "Nadie coincide con la búsqueda."}
        </div>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="hidden md:block rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="text-left font-semibold px-2 py-2">Proveedor</th>
                  <th className="text-left font-semibold px-2 py-2 hidden xl:table-cell">Tipo</th>
                  <th className="text-left font-semibold px-2 py-2">Estado</th>
                  <th className="text-left font-semibold px-2 py-2">Teléfono</th>
                  <th className="text-left font-semibold px-2 py-2">Vehículo</th>
                  <th className="text-left font-semibold px-2 py-2">Última señal</th>
                  <th className="text-left font-semibold px-2 py-2 hidden xl:table-cell">Calif.</th>
                  <th className="text-left font-semibold px-2 py-2">Servicio</th>
                  <th className="text-right font-semibold px-2 py-2 w-[280px]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <ProviderTableRow
                    key={p.id}
                    p={p}
                    now={now}
                    busy={busy}
                    error={errors[p.id]}
                    rotated={rotated[p.id]}
                    onPatch={(body, key) => patch(p, body, key)}
                    onOpenRequest={onOpenRequest}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {/* Teléfono: tarjetas */}
          <ul className="md:hidden flex flex-col gap-2">
            {rows.map((p) => (
              <li key={p.id}>
                <ProviderCard p={p} now={now} busy={busy} error={errors[p.id]} rotated={rotated[p.id]} onPatch={(body, key) => patch(p, body, key)} onOpenRequest={onOpenRequest} />
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Agregar proveedor">
        <AddProviderForm
          onDone={() => {
            setAdding(false);
            void onChanged();
          }}
          onCreated={() => void onChanged()}
        />
      </Sheet>
    </div>
  );
}

// ---------- Fila / tarjeta ----------

type RowProps = {
  p: ProviderAdminView;
  now: number;
  busy: string | null;
  error?: string;
  rotated?: { accessLink: string; whatsapp: string };
  onPatch: (body: Record<string, unknown>, key: string) => void;
  onOpenRequest: (id: string) => void;
};

function Actions({ p, busy, onPatch }: Pick<RowProps, "p" | "busy" | "onPatch">) {
  const is = (k: string) => busy === `${p.id}:${k}`;
  const anyBusy = busy?.startsWith(`${p.id}:`) ?? false;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <CopyButton text={p.accessLink} label="Copiar enlace" />
      <LinkButton href={p.whatsappInvite} variant="success" size="sm" title="Mandar el enlace por WhatsApp">
        WhatsApp
      </LinkButton>
      {p.status !== "OFFLINE" && (
        <ConfirmButton onConfirm={() => onPatch({ status: "OFFLINE" }, "offline")} loading={is("offline")} disabled={anyBusy && !is("offline")} confirmLabel="¿Desconectar?">
          Desconectar
        </ConfirmButton>
      )}
      <ConfirmButton onConfirm={() => onPatch({ rotateToken: true }, "rotate")} loading={is("rotate")} disabled={anyBusy && !is("rotate")} confirmLabel="¿Invalidar el anterior?">
        Nuevo enlace
      </ConfirmButton>
      <ConfirmButton
        onConfirm={() => onPatch({ isExternal: !p.isExternal }, "external")}
        loading={is("external")}
        disabled={anyBusy && !is("external")}
        confirmLabel={p.isExternal ? "¿Pasar a la red?" : "¿Marcar externo?"}
      >
        {p.isExternal ? "Pasar a la red" : "Marcar externo"}
      </ConfirmButton>
    </div>
  );
}

function Rating({ p }: { p: ProviderAdminView }) {
  return p.rating != null ? (
    <span className="tabular-nums">
      ★ {p.rating.toFixed(1)} <span className="text-muted text-xs">({p.ratingCount})</span>
    </span>
  ) : (
    <span className="text-muted text-xs">—</span>
  );
}

function ProviderTableRow({ p, now, busy, error, rotated, onPatch, onOpenRequest }: RowProps) {
  return (
    <>
      <tr className={cn("align-top", p.status === "OFFLINE" && "text-muted")}>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1.5">
            <span aria-hidden>{glyphFor(p.kind)}</span>
            <span className="font-semibold text-foreground">{p.name}</span>
            {p.isExternal ? <Pill tone="neutral">externo</Pill> : <Pill tone="success">red</Pill>}
          </div>
          <div className="text-[11px] text-muted font-mono">#{shortId(p.id)}</div>
        </td>
        <td className="px-2 py-2 whitespace-nowrap hidden xl:table-cell">{PROVIDER_KIND_LABELS[p.kind]}</td>
        <td className="px-2 py-2 whitespace-nowrap">
          <ProviderStatusPill status={p.status} stale={p.isStale} />
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <a href={`tel:+502${p.phone}`} className="underline-offset-2 hover:underline text-foreground">
            {formatPhone(p.phone)}
          </a>
        </td>
        <td className="px-2 py-2">
          <div className="font-mono text-xs text-foreground">{p.plate ?? "—"}</div>
          <div className="text-xs text-muted max-w-[150px] truncate" title={p.vehicleLabel ?? undefined}>
            {p.vehicleLabel ?? ""}
          </div>
        </td>
        <td className="px-2 py-2 whitespace-nowrap text-xs">{p.location ? relativeTime(p.location.updatedAt, now) : <span className="text-muted">nunca</span>}</td>
        <td className="px-2 py-2 whitespace-nowrap hidden xl:table-cell">
          <Rating p={p} />
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          {p.activeRequestId ? (
            <button type="button" onClick={() => onOpenRequest(p.activeRequestId!)} className="text-info font-semibold underline-offset-2 hover:underline text-xs">
              Ver #{shortId(p.activeRequestId)}
            </button>
          ) : (
            <span className="text-muted text-xs">—</span>
          )}
        </td>
        <td className="px-2 py-2">
          <Actions p={p} busy={busy} onPatch={onPatch} />
        </td>
      </tr>
      {(error || rotated) && (
        <tr>
          <td colSpan={9} className="px-3 pb-2">
            {error && <ErrorText>{error}</ErrorText>}
            {rotated && <InviteBox accessLink={rotated.accessLink} whatsapp={rotated.whatsapp} name={p.name} title={`Nuevo enlace de ${p.name} (el anterior ya no sirve)`} />}
          </td>
        </tr>
      )}
    </>
  );
}

function ProviderCard({ p, now, busy, error, rotated, onPatch, onOpenRequest }: RowProps) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span aria-hidden>{glyphFor(p.kind)}</span>
            <span className="font-semibold truncate">{p.name}</span>
            {p.isExternal ? <Pill tone="neutral">externo</Pill> : <Pill tone="success">red</Pill>}
          </div>
          <p className="text-xs text-muted">
            {PROVIDER_KIND_LABELS[p.kind]} · {p.plate ?? "sin placa"}
            {p.vehicleLabel ? ` · ${p.vehicleLabel}` : ""}
          </p>
        </div>
        <ProviderStatusPill status={p.status} stale={p.isStale} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <a href={`tel:+502${p.phone}`} className="text-foreground font-semibold">
          📞 {formatPhone(p.phone)}
        </a>
        <span>señal {p.location ? relativeTime(p.location.updatedAt, now) : "nunca"}</span>
        <Rating p={p} />
        {p.activeRequestId && (
          <button type="button" onClick={() => onOpenRequest(p.activeRequestId!)} className="text-info font-semibold">
            Ver servicio #{shortId(p.activeRequestId)}
          </button>
        )}
      </div>
      <Actions p={p} busy={busy} onPatch={onPatch} />
      {error && <ErrorText>{error}</ErrorText>}
      {rotated && <InviteBox accessLink={rotated.accessLink} whatsapp={rotated.whatsapp} name={p.name} title="Nuevo enlace (el anterior ya no sirve)" />}
    </div>
  );
}

// ---------- Alta ----------

function AddProviderForm({ onDone, onCreated }: { onDone: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<ProviderKind>("TOW");
  const [plate, setPlate] = useState("");
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ProviderAdminView | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await api.post<ProviderAdminView>("/api/pbx/providers", {
        name: name.trim(),
        phone: phone.trim(),
        kind,
        plate: plate.trim() || undefined,
        vehicleLabel: vehicleLabel.trim() || undefined,
      });
      setCreated(p);
      onCreated();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <b>{created.name}</b> quedó registrado como {PROVIDER_KIND_LABELS[created.kind].toLowerCase()} externo. Puedes pasarlo a la red desde la tabla.
        </p>
        <InviteBox accessLink={created.accessLink} whatsapp={created.whatsappInvite} name={created.name} />
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setCreated(null);
              setName("");
              setPhone("");
              setPlate("");
              setVehicleLabel("");
            }}
          >
            Agregar otro
          </Button>
          <Button className="flex-1" onClick={onDone}>
            Listo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <SectionTitle>Datos del proveedor</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grúas Don Chepe" required minLength={2} maxLength={60} autoFocus />
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
      <ErrorText>{error}</ErrorText>
      <Button type="submit" loading={busy} fullWidth size="lg">
        Crear y generar enlace
      </Button>
    </form>
  );
}
