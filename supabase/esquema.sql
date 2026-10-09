-- GrúaYa · tablas para el piloto en Supabase.
-- Pegar completo en SQL Editor → New query → Run. Se puede volver a correr sin romper nada.
--
-- Cada fila guarda el objeto completo de la app en "datos" (JSON) más unas columnas
-- para buscar. Así la app sigue usando la misma lógica que la demo, pero los datos
-- viven en la nube y se ven en todos los teléfonos a la vez.

create table if not exists public.ajustes (
  id text primary key,
  datos jsonb not null,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.conductores (
  id text primary key,
  datos jsonb not null,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.grueros (
  id text primary key,
  datos jsonb not null,
  disponible boolean generated always as ((datos->>'disponible')::boolean) stored,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.servicios (
  id text primary key,
  datos jsonb not null,
  estado text generated always as (datos->>'estado') stored,
  conductor_id text generated always as (datos->>'conductorId') stored,
  gruero_id text generated always as (datos->>'grueroId') stored,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists servicios_estado on public.servicios (estado);
create index if not exists servicios_conductor on public.servicios (conductor_id);
create index if not exists servicios_gruero on public.servicios (gruero_id);

-- Marca la hora de cada cambio.
create or replace function public.marcar_actualizado() returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['ajustes', 'conductores', 'grueros', 'servicios'] loop
    execute format('drop trigger if exists marcar_actualizado on public.%I', t);
    execute format('create trigger marcar_actualizado before update on public.%I for each row execute function public.marcar_actualizado()', t);
  end loop;
end $$;

-- Piloto: la app entra con la clave pública (anon) y sin cuentas de usuario todavía,
-- así que estas políticas dejan leer y escribir a cualquiera que tenga la app.
-- Cuando se active el registro con cuentas, se cambian por políticas por usuario.
alter table public.ajustes enable row level security;
alter table public.conductores enable row level security;
alter table public.grueros enable row level security;
alter table public.servicios enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ajustes', 'conductores', 'grueros', 'servicios'] loop
    execute format('drop policy if exists piloto_todo on public.%I', t);
    execute format('create policy piloto_todo on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Avisos en vivo a los teléfonos cuando cambia una fila.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
do $$
declare t text;
begin
  foreach t in array array['ajustes', 'conductores', 'grueros', 'servicios'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Realtime con la tabla completa en cada aviso (para recibir "datos" al actualizar).
alter table public.ajustes replica identity full;
alter table public.conductores replica identity full;
alter table public.grueros replica identity full;
alter table public.servicios replica identity full;
