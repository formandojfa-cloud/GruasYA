"use client";

/**
 * Primitivas de interfaz compartidas con el aspecto GrúaYa final (docs/GRUAYA.md §1):
 * superficies blancas sin borde sobre página gris, botón principal NEGRO con texto
 * blanco (blanco con texto negro en modo oscuro), píldoras flotantes con sombra
 * suave, segmentos en píldora con el activo negro, hoja inferior con asa, chips,
 * filas de opción y bloque origen/destino. Pensadas para teléfono con una mano
 * (botones de 48–52 px).
 */
import Link from "next/link";
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect } from "react";
import { useNow } from "@/lib/hooks";
import { secondsUntil, STATUS_LABELS, STATUS_SHORT, STATUS_TONE, type Tone } from "@/lib/format";
import type { RequestStatus } from "@/lib/types";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------- Botón ----------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "md" | "lg" | "sm";
  loading?: boolean;
  fullWidth?: boolean;
};

/** principal = negro con texto blanco; secundario = blanco con borde de 1 px; peligro = texto rojo. */
const VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-primary text-primary-foreground border-primary hover:opacity-90 active:opacity-80",
  secondary: "bg-background text-foreground border-border hover:bg-surface-2 active:bg-surface-2",
  ghost: "bg-transparent text-foreground border-transparent hover:bg-surface-2",
  danger: "bg-background text-rojo border-border hover:bg-danger-soft",
  success: "bg-verde text-white border-verde hover:brightness-95",
};

const SIZE: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3 text-sm rounded-[10px]",
  md: "h-12 px-4 text-base rounded-[14px]",
  lg: "h-[52px] px-5 text-[17px] rounded-[14px]",
};

export function Button({ variant = "primary", size = "md", loading, fullWidth, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 border font-bold transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 select-none",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full",
        className,
      )}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

// ---------- Tarjeta ----------

/** Tarjeta blanca redondeada (16 px), sin borde. */
export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn("rounded-2xl bg-background p-4", onClick && "cursor-pointer hover:bg-surface-2", className)}>
      {children}
    </div>
  );
}

// ---------- Píldora de estado ----------

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-foreground",
  success: "bg-success-soft text-verde",
  warning: "bg-amarillo-suave text-foreground",
  danger: "bg-danger-soft text-rojo",
  info: "bg-info-soft text-azul",
};

/** Etiqueta redondeada pequeña con color según el tono. `flotante` = píldora blanca con sombra (.pildora). */
export function Pill({ tone = "neutral", children, className, flotante }: { tone?: Tone; children: ReactNode; className?: string; flotante?: boolean }) {
  if (flotante) return <span className={cn("pildora", className)}>{children}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", TONE[tone], className)}>{children}</span>
  );
}

export function StatusPill({ status }: { status: RequestStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_SHORT[status]}</Pill>;
}

// ---------- Spinner ----------

export function Spinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const px = size === "sm" ? "h-4 w-4 border-2" : size === "lg" ? "h-10 w-10 border-4" : "h-6 w-6 border-2";
  return <span aria-label="Cargando" className={cn("inline-block rounded-full border-current border-r-transparent animate-spin", px, className)} />;
}

// ---------- Barra de progreso ----------

/** Barra fina indeterminada (negra sobre gris), como "Buscando solicitudes cerca de ti". */
export function ProgressBar({ className, label = "Buscando" }: { className?: string; label?: string }) {
  return <div className={cn("barra-progreso", className)} role="progressbar" aria-label={label} aria-busy="true" />;
}

// ---------- Cuenta regresiva (oferta) ----------

/** Anillo de tinta que se vacía; el número va en rojo (.contador). */
export function Countdown({ until, totalSeconds, onExpire, className }: { until: string; totalSeconds: number; onExpire?: () => void; className?: string }) {
  const now = useNow(250);
  const left = secondsUntil(until, now);
  const fraction = Math.max(0, Math.min(1, left / totalSeconds));
  useEffect(() => {
    if (left === 0) onExpire?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0]);
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative h-16 w-16", className)} role="timer" aria-live="polite" aria-label={`${left} segundos`}>
      <svg viewBox="0 0 60 60" className="h-16 w-16 -rotate-90">
        <circle cx="30" cy="30" r={r} fill="none" stroke="var(--campo)" strokeWidth="5" />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke={left <= 10 ? "var(--rojo)" : "var(--tinta)"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span className="contador absolute inset-0 flex items-center justify-center">{left}</span>
    </div>
  );
}

// ---------- Hoja inferior ----------

/** Hoja modal (con fondo oscuro detrás): blanca, esquinas de 24 px, asa y sombra. */
export function Sheet({ open, onClose, title, children, className }: { open: boolean; onClose?: () => void; title?: string; children: ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={cn("hoja alta !relative !z-10 !max-h-[88vh] w-full", className)}>
        <div className="hoja-cuerpo">
          {title && <h2 className="titulo-hoja">{title}</h2>}
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Hoja fija abajo sobre el mapa (sin fondo oscuro): el aspecto .hoja del prototipo.
 * `footer` queda siempre a la vista (.hoja-pie); el cuerpo se desplaza.
 * `height`: "normal" (64 %), "alta" (86 %) o "corta" (52 %).
 */
export function BottomPanel({
  children,
  footer,
  className,
  height = "normal",
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  height?: "normal" | "alta" | "corta";
}) {
  return (
    <div className={cn("hoja", height !== "normal" && height, className)}>
      <div className="hoja-cuerpo">{children}</div>
      {footer && <div className="hoja-pie">{footer}</div>}
    </div>
  );
}

// ---------- Acciones redondas sobre el mapa (tipo Uber) ----------

/** Columna de botones redondos blancos al borde derecho del mapa (.acciones-mapa). `credit`: crédito de teselas pequeño (solo teléfono). */
export function MapActions({ children, credit, className }: { children?: ReactNode; credit?: string; className?: string }) {
  return (
    <div className={cn("acciones-mapa", className)}>
      {children}
      {credit && <span className="credito-mapa">{credit}</span>}
    </div>
  );
}

/** Botón redondo de 44 px con ícono (emoji o SVG). `label` es solo para accesibilidad. `badge`: puntito/número amarillo. */
export function MapAction({
  icon,
  label,
  onClick,
  href,
  external,
  badge,
  disabled,
  className,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  badge?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const inner = (
    <>
      {icon}
      {badge != null && badge !== false && <span className="insignia">{badge}</span>}
    </>
  );
  if (href && !disabled) {
    return (
      <a href={href} aria-label={label} title={label} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className={cn("accion-mapa", className)}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={cn("accion-mapa", className)}>
      {inner}
    </button>
  );
}

export type ActionSheetItem = {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  danger?: boolean;
};

/** Hoja modal con filas tocables (ícono · texto · pista), para Soporte, Navegar, etc. */
export function ActionSheet({
  open,
  onClose,
  title,
  items,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  items: ActionSheetItem[];
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="filas-accion" role="list">
        {items.map((it, i) => {
          const body = (
            <>
              {it.icon && <span className="fila-accion-icono">{it.icon}</span>}
              <span className="fila-accion-texto">
                <strong>{it.label}</strong>
                {it.hint && <span>{it.hint}</span>}
              </span>
              <span className="fila-accion-flecha" aria-hidden>
                ›
              </span>
            </>
          );
          const cls = cn("fila-accion", it.danger && "fila-accion-peligro");
          if (it.href) {
            return (
              <a key={i} role="listitem" href={it.href} target={it.external ? "_blank" : undefined} rel={it.external ? "noopener noreferrer" : undefined} className={cls} onClick={it.onClick}>
                {body}
              </a>
            );
          }
          return (
            <button key={i} role="listitem" type="button" className={cls} onClick={it.onClick}>
              {body}
            </button>
          );
        })}
      </div>
      {children}
      <Button variant="secondary" fullWidth className="mt-3" onClick={onClose}>
        Cerrar
      </Button>
    </Sheet>
  );
}

// ---------- Íconos de línea (22 px, trazo de tinta) ----------

const ICON = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

/** Mira (centrar en mi ubicación). */
export const IconCrosshair = () => (
  <svg {...ICON}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);
/** Salvavidas (soporte). */
export const IconLifebuoy = () => (
  <svg {...ICON}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
  </svg>
);
/** Compartir. */
export const IconShare = () => (
  <svg {...ICON}>
    <path d="M12 3v12" />
    <path d="M8 7l4-4 4 4" />
    <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
  </svg>
);
/** Escudo (seguridad). */
export const IconShield = () => (
  <svg {...ICON}>
    <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
/** Flecha de navegación (Waze / Google Maps). */
export const IconNavigate = () => (
  <svg {...ICON}>
    <path d="M21 3L3 10.5l8 2.5 2.5 8z" />
  </svg>
);
/** Audífonos (Central). */
export const IconHeadset = () => (
  <svg {...ICON}>
    <path d="M4 13a8 8 0 0 1 16 0" />
    <rect x="3" y="13" width="4" height="6" rx="1.5" />
    <rect x="17" y="13" width="4" height="6" rx="1.5" />
    <path d="M19 19v1a2 2 0 0 1-2 2h-4" />
  </svg>
);

// ---------- Campos ----------

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rojo">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/** Campo gris claro sin borde; al enfocar, borde de tinta de 2 px. */
const CONTROL =
  "min-h-12 w-full rounded-[12px] border-2 border-transparent bg-surface-2 px-3 text-base text-foreground placeholder:text-muted focus:outline-none focus:border-ring disabled:opacity-50";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(CONTROL, className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(CONTROL, className)}>
      {children}
    </select>
  );
}

// ---------- Estrellas ----------

export function Stars({ value, onChange, size = "md" }: { value: number | null; onChange?: (v: number) => void; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "text-4xl" : size === "sm" ? "text-base" : "text-2xl";
  return (
    <div className={cn("inline-flex gap-1", cls)} role={onChange ? "radiogroup" : undefined} aria-label="Calificación">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} estrellas`}
          className={cn("leading-none transition", (value ?? 0) >= n ? "text-amarillo" : "text-border", onChange && "hover:scale-110")}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ---------- Marca y segmentos ----------

/**
 * "Grúa" en tinta + "Ya" en amarillo dentro de una píldora blanca con sombra (.marca).
 * `suffix`: texto pequeño gris opcional (p. ej. "piloto"). `plana`: sin píldora, grande (pantallas de inicio de sesión).
 */
export function Wordmark({ suffix, className, plana }: { suffix?: ReactNode; className?: string; plana?: boolean }) {
  return (
    <span className={cn("marca", plana && "marca-plana", className)}>
      Grúa<span className="ya">Ya</span>
      {suffix && <small>{suffix}</small>}
    </span>
  );
}

/**
 * Selector en píldora blanca con sombra; el activo es una píldora negra (como el
 * selector de rol del prototipo). `variant="pestanas"`: pestañas del Admin, sin
 * fondo, la activa blanca con sombra.
 */
export function Segments<K extends string>({
  items,
  value,
  onChange,
  className,
  label,
  variant = "pildora",
}: {
  items: Array<{ key: K; label: ReactNode; disabled?: boolean }>;
  value: K;
  onChange: (key: K) => void;
  className?: string;
  label?: string;
  variant?: "pildora" | "pestanas";
}) {
  return (
    <div className={cn("segmentos", variant === "pestanas" && "segmentos-pestanas", className)} role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          disabled={it.disabled}
          aria-pressed={it.key === value}
          className={it.key === value ? "activo" : undefined}
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Chips, opciones y origen/destino ----------

/** Chip redondeado (Qué pasó); activo = negro con texto blanco. */
export function Chip({
  active,
  children,
  onClick,
  disabled,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick} className={cn("chip", active && "chip-activo", className)}>
      {children}
    </button>
  );
}

/** Fila de opción de servicio: ícono, título, subtítulo y precio a la derecha; seleccionada = borde negro. */
export function OptionRow({
  icon,
  title,
  subtitle,
  price,
  active,
  onClick,
  disabled,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  price?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick} className={cn("opcion", active && "opcion-activa", className)}>
      {icon && <span className="opcion-icono">{icon}</span>}
      <span className="opcion-texto">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </span>
      {price != null && <span className="opcion-precio">{price}</span>}
    </button>
  );
}

export type RouteField = {
  /** Etiqueta pequeña gris ("Recogida · toca el mapa"). */
  label: ReactNode;
  /** Valor grande ("Tu ubicación actual"). */
  value: ReactNode;
  /** Botón píldora a la derecha (p. ej. "📍 Mi ubicación"). */
  action?: ReactNode;
  /** Toque en la fila. */
  onClick?: () => void;
  /** Fila resaltada con borde negro. */
  active?: boolean;
};

/** Bloque origen/destino con conector vertical (● línea ■). Solo presentación. */
export function RouteFields({ origin, destination, className }: { origin: RouteField; destination: RouteField; className?: string }) {
  const row = (f: RouteField, marker: string, key: string) => {
    const Tag = f.onClick ? "button" : "div";
    return (
      <Tag
        key={key}
        type={f.onClick ? "button" : undefined}
        onClick={f.onClick}
        aria-pressed={f.onClick ? f.active : undefined}
        className={cn("campo-ruta-fila", f.active && "activo")}
      >
        <span className={marker} aria-hidden />
        <span className="campo-ruta-texto">
          <small>{f.label}</small>
          <span>{f.value}</span>
        </span>
        {f.action}
      </Tag>
    );
  };
  return (
    <div className={cn("campo-ruta", className)}>
      {row(origin, "marca-origen", "origen")}
      {row(destination, "marca-destino", "destino")}
    </div>
  );
}

// ---------- Tarjeta de estado ----------

/** Estado de la solicitud → clase del prototipo (color del borde izquierdo). */
export const STATUS_CLASS: Record<RequestStatus, string> = {
  SEARCHING: "estado-buscando",
  ESCALATED: "estado-sin_grua",
  EN_ROUTE: "estado-asignado",
  ARRIVED: "estado-en_sitio",
  IN_PROGRESS: "estado-en_ruta",
  COMPLETED: "estado-pagado",
  CANCELLED: "estado-cancelado",
};

export function statusClass(status: RequestStatus): string {
  return `estado ${STATUS_CLASS[status]}`;
}

/** Tarjeta con borde izquierdo de color según el estado; sin `title` usa el texto largo del estado. */
export function StatusCard({ status, title, children, className }: { status: RequestStatus; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cn("tarjeta", statusClass(status), className)}>
      <h2 className="text-[22px] font-bold leading-tight">{title ?? STATUS_LABELS[status]}</h2>
      {children}
    </section>
  );
}

/** Aviso en amarillo suave. */
export function Aviso({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("aviso", className)}>{children}</div>;
}

// ---------- Barra superior ----------

/**
 * Barra flotante transparente sobre el mapa: marca en píldora a la izquierda y lo
 * que venga en `right` (normalmente <Segments>) a la derecha. `title` va como
 * sufijo pequeño de la marca; `back` añade una píldora "‹" antes de la marca.
 */
export function TopBar({ title, back, right, subtitle }: { title?: string; back?: string; right?: ReactNode; subtitle?: string }) {
  return (
    <header className="barra-flotante">
      <div className="flex min-w-0 items-center gap-2">
        {back && (
          <Link href={back} aria-label="Volver" className="pildora !px-3 text-xl leading-none">
            ‹
          </Link>
        )}
        <h1 className="min-w-0 leading-none">
          <Wordmark suffix={title} />
        </h1>
        {subtitle && <span className="pildora truncate text-muted">{subtitle}</span>}
      </div>
      {right}
    </header>
  );
}

// ---------- Estado vacío / mensajes ----------

export function EmptyState({ icon, title, body, action }: { icon?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon && <div className="text-4xl">{icon}</div>}
      <h3 className="text-[17px] font-semibold">{title}</h3>
      {body && <p className="max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const NOTICE_TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-foreground",
  info: "bg-surface-2 text-foreground",
  warning: "bg-amarillo-suave text-foreground",
  success: "bg-success-soft text-verde",
  danger: "bg-danger-soft text-rojo",
};

export function Notice({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[12px] px-3 py-2.5 text-sm", NOTICE_TONE[tone], className)}>{children}</div>;
}

export function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[17px]">{label}</span>
      <span className={cn("text-right text-[17px] font-bold tabular-nums", strong && "text-xl")}>{value}</span>
    </div>
  );
}
