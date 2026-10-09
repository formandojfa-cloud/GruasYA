-- Notificaciones push: dónde avisar a cada piloto (una fila por teléfono).
-- Correr una vez en el SQL Editor, después de esquema.sql.
create table if not exists public.suscripciones (
  id text primary key, -- el endpoint que da el navegador
  gruero_id text not null,
  datos jsonb not null, -- endpoint, claves y la URL de la app
  actualizado_en timestamptz not null default now()
);
create index if not exists suscripciones_gruero on public.suscripciones (gruero_id);

grant select, insert, update, delete on public.suscripciones to anon, authenticated, service_role;
alter table public.suscripciones enable row level security;
drop policy if exists piloto_todo on public.suscripciones;
create policy piloto_todo on public.suscripciones for all to anon, authenticated using (true) with check (true);

-- Luego: en Admin → Ajustes → "Notificaciones push" se generan las claves VAPID.
-- La pública va como secreto VITE_VAPID_PUBLIC_KEY en GitHub (la app la usa al suscribirse)
-- y las dos como VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en Supabase → Edge Functions → Secrets.
