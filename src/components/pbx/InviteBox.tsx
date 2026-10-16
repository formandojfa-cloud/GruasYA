"use client";

/** Enlace de acceso de un piloto + botón grande para mandárselo por WhatsApp. */
import { Box, CopyButton, LinkButton } from "./bits";

export default function InviteBox({ accessLink, whatsapp, title, name }: { accessLink: string; whatsapp: string; title?: string; name?: string }) {
  return (
    <Box tone="success" className="gap-2">
      <h3 className="text-[17px] font-semibold leading-tight">{title ?? "Enlace de acceso listo"}</h3>
      <p className="tenue chico">
        {name ? `${name} entra` : "El piloto entra"} con este enlace, sin instalar nada: ve el servicio, comparte su ubicación y marca cuando llega.
      </p>
      <div className="flex items-center gap-2 rounded-[10px] bg-surface px-2.5 py-1.5">
        <code className="flex-1 min-w-0 truncate text-xs text-foreground" title={accessLink}>
          {accessLink}
        </code>
        <CopyButton text={accessLink} label="Copiar" />
      </div>
      <LinkButton href={whatsapp} variant="success" size="md" className="w-full">
        Enviar por WhatsApp
      </LinkButton>
    </Box>
  );
}
