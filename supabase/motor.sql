-- GrúaYa · latido del despacho desde Supabase (igual que en la demo, pero contra la app).
--
-- Hace que Supabase llame a POST https://TU-APP/api/tick cada 10 segundos con el
-- TICK_SECRET. Así las ofertas vencen y pasan a la siguiente grúa aunque el servidor
-- esté dormido (plan gratuito de Render) o nadie tenga la app abierta.
--
-- Cómo usarlo (una sola vez):
--   1. En Supabase → Database → Extensions activa `pg_cron` y `pg_net`.
--   2. Reemplaza abajo TU-APP por el dominio real (p. ej. asistencia-vial.onrender.com)
--      y TU_TICK_SECRET por el mismo valor de TICK_SECRET que pusiste en Render.
--   3. Pega todo en SQL Editor → New query → Run. Se puede volver a correr sin romper nada.
--
-- Para apagarlo: select cron.unschedule('gruaya_tick');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- pg_cron solo acepta minutos como mínimo; por eso un job por minuto que dispara 6 llamadas (cada 10 s).
create or replace function public.gruaya_tick() returns void language plpgsql as $$
declare
  i int;
begin
  for i in 0..5 loop
    if i > 0 then perform pg_sleep(10); end if;
    perform net.http_post(
      url := 'https://TU-APP/api/tick',
      headers := jsonb_build_object('Authorization', 'Bearer TU_TICK_SECRET', 'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 8000
    );
  end loop;
end $$;

select cron.unschedule('gruaya_tick') where exists (select 1 from cron.job where jobname = 'gruaya_tick');
select cron.schedule('gruaya_tick', '* * * * *', $$select public.gruaya_tick()$$);

-- Ver las últimas llamadas y su resultado:
--   select created, status_code, content::text from net._http_response order by created desc limit 10;
