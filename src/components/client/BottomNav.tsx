"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const ITEMS = [
  { href: "/", label: "Inicio", icon: "🏠" },
  { href: "/historial", label: "Historial", icon: "🕘" },
  { href: "/cuenta", label: "Cuenta", icon: "👤" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="safe-bottom sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur" aria-label="Secciones">
      <ul className="grid grid-cols-3">
        {ITEMS.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold", active ? "text-foreground" : "text-muted")}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {it.icon}
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
