# GrúaYa en tu VPS (Hostinger)

La app corre en Docker en el VPS, siempre despierta, con HTTPS automático (Caddy + Let's Encrypt). Los datos viven en Supabase. Un VPS pequeño (1 vCPU, 2 GB) alcanza; la compilación necesita ~1.5 GB libres de RAM la primera vez.

## 1. Preparar

- **VPS**: Ubuntu 22.04/24.04 (en Hostinger, plantilla "Ubuntu" o "Docker"). Anota la IP.
- **Dominio** (recomendado): un registro `A` (p. ej. `gruaya.tudominio.com`) apuntando a la IP del VPS. Sin dominio, usa `TU.IP.DEL.VPS.sslip.io` como `DOMINIO`: funciona con HTTPS igual.
- **Supabase**: Project Settings → Database → Connection string → **Session pooler** (URI). Pon tu contraseña.
- **Firewall de Hostinger**: abre los puertos 80 y 443 (y deja 22 para SSH).

## 2. Instalar (una sola vez, como root por SSH)

```bash
curl -fsSL https://raw.githubusercontent.com/formandojfa-cloud/GruasYA/claude/roadside-assistance-app-ch0lrd/deploy/instalar.sh | bash
nano /opt/gruaya/.env        # DOMINIO, DATABASE_URL, PBX_PASSWORD (y MAPBOX_TOKEN, NEXT_PUBLIC_CENTRAL_PHONE si los tienes)
cd /opt/gruaya && bash deploy/actualizar.sh
```

La primera compilación tarda 5–10 minutos. Al terminar abre `https://TU-DOMINIO`: `/` conductor, `/driver?token=tow-zona10` piloto, `/pbx` central.

## 3. Operar

| Qué | Comando (en `/opt/gruaya`) |
|---|---|
| Actualizar a la última versión | `bash deploy/actualizar.sh` |
| Ver logs | `docker compose logs -f app` |
| Reiniciar | `docker compose restart app` |
| Limpiar solicitudes de prueba | `docker compose exec app npx tsx scripts/clear-activity.ts` |
| Parar todo | `docker compose down` |

Cuando empiecen los datos reales, pon `SEED_DEMO=0` en `.env` y `docker compose up -d` para que no vuelva a cargar los clientes y grúas de prueba.

## Notas

- El despacho (ofertas que vencen, escalado a la central) corre dentro del proceso; en un VPS no hace falta el latido desde Supabase (`supabase/motor.sql`), aunque puede convivir.
- Las migraciones se aplican solas en cada arranque (`deploy/start.sh`).
- Si cambias `MAPBOX_TOKEN` o `NEXT_PUBLIC_CENTRAL_PHONE`, hay que reconstruir (`bash deploy/actualizar.sh`): se incrustan en el navegador al compilar.
