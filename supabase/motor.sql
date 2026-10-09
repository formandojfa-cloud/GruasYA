-- Reparto en el servidor: Supabase llama a la función "motor" cada 10 segundos.
-- Correr en el SQL Editor DESPUÉS de esquema.sql y de desplegar la función.
-- Antes de correr, reemplaza los dos valores de abajo (URL del proyecto y clave anon).

-- 1) Extensiones: tareas programadas y llamadas HTTP desde la base.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
grant usage on schema cron to postgres;

-- 2) Candado para que no corran dos pasos del reparto a la vez.
create table if not exists public.candados (
  id text primary key,
  hasta bigint not null default 0 -- epoch ms hasta el que está tomado
);

create or replace function public.tomar_candado(nombre text, ms bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare ahora bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  insert into candados (id, hasta) values (nombre, ahora + ms)
  on conflict (id) do update set hasta = excluded.hasta where candados.hasta < ahora;
  return found;
end $$;

create or replace function public.soltar_candado(nombre text)
returns void language sql security definer set search_path = public as $$
  update candados set hasta = 0 where id = nombre;
$$;

grant execute on function public.tomar_candado(text, bigint) to anon, authenticated, service_role;
grant execute on function public.soltar_candado(text) to anon, authenticated, service_role;

-- 3) Secretos para que la tarea programada sepa a dónde llamar (quedan cifrados en Vault).
--    REEMPLAZA los dos valores. La URL es la del proyecto, sin /rest/v1.
select vault.create_secret('https://TU-PROYECTO.supabase.co', 'gruaya_url');
select vault.create_secret('TU_CLAVE_ANON', 'gruaya_anon');

-- 4) La tarea: cada 10 segundos llama a la función motor.
select cron.unschedule('gruaya-motor') where exists (select 1 from cron.job where jobname = 'gruaya-motor');
select cron.schedule(
  'gruaya-motor',
  '10 seconds',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'gruaya_url') || '/functions/v1/motor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'gruaya_anon')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
  $$
);

-- Para ver si está corriendo: select * from cron.job_run_details order by start_time desc limit 10;
-- Para pausarla: select cron.unschedule('gruaya-motor');
