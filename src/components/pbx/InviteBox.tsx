"use client";

/** Enlace de acceso de un proveedor + botón grande para mandárselo por WhatsApp. */
import { Notice } from "@/components/ui";
import { CopyButton, LinkButton } from "./bits";

export default function InviteBox({ accessLink, whatsapp, title, name }: { accessLink: string; whatsapp: string; title?: string; name?: string }) {
  return (
    <Notice tone="success" className="flex flex-col gap-2">
      <p className="font-bold">{title ?? "Enlace de acceso listo"}</p>
      <p className="text-xs opacity-90">
        {name ? `${name} entra` : "El proveedor entra"} con este enlace, sin instalar nada: ve el servicio, comparte su ubicación y marca cuando llega.
      </p>
      <div className="flex items-center gap-2 rounded-lg bg-background/70 px-2 py-1.5">
        <code className="flex-1 min-w-0 truncate text-xs text-foreground" title={accessLink}>
          {accessLink}
        </code>
        <CopyButton text={accessLink} label="Copiar" />
      </div>
      <LinkButton href={whatsapp} variant="success" size="md" className="w-full">
        Enviar por WhatsApp
      </LinkButton>
    </Notice>
  );
}
