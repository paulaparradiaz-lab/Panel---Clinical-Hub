-- ============================================================
-- Perfiles de los usuarios del panel
-- 2026-09-27
--
-- Supabase Auth guarda solo lo de entrar (correo, contraseña, 2FA). Lo
-- demás de cada persona va en «perfiles», una fila por usuario, que Paula
-- edita a mano en el Table Editor:
--   correo ........ para saber de quién es la fila (se llena solo)
--   nombre ........ cómo se ve en «Asignar responsable» y en Mejoras
--   rol ........... su cargo, p. ej. «Cofounder»
--   es_admin ...... para el paso siguiente (solo administradores entran);
--                   hoy todavía no limita nada
--
-- Al registrar a alguien en Authentication, un disparador le crea su fila
-- sola (con el nombre vacío): solo falta escribirle nombre y rol.
--
-- Nadie la edita desde el panel: los usuarios solo la leen (con 2FA).
-- El Table Editor de Supabase sí puede editarla.
-- ============================================================

create table if not exists public.perfiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  correo    text,
  nombre    text,
  rol       text,
  es_admin  boolean not null default false,
  creado_en timestamptz not null default now()
);

alter table public.perfiles enable row level security;

-- Solo lectura desde el panel, y con 2FA como todas las tablas
revoke all on public.perfiles from anon, authenticated;
grant select on public.perfiles to authenticated;

drop policy if exists "lectura autenticados" on public.perfiles;
create policy "lectura autenticados" on public.perfiles
  for select to authenticated using (true);

drop policy if exists "exigir 2FA" on public.perfiles;
create policy "exigir 2FA" on public.perfiles
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

-- Cada usuario nuevo recibe su fila sola
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.perfiles (id, correo)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.crear_perfil() from public, anon, authenticated;

drop trigger if exists crear_perfil on auth.users;
create trigger crear_perfil after insert on auth.users
  for each row execute function public.crear_perfil();

-- Los usuarios que ya existen (hoy solo Paula)
insert into public.perfiles (id, correo)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

update public.perfiles
set nombre = 'Paula Parra', rol = 'Cofounder', es_admin = true
where correo = 'paulaplf555@gmail.com';

-- El panel toma el nombre del perfil; si no tiene, lo de antes
create or replace function public.usuarios_panel()
returns table (id uuid, correo text, nombre text)
language sql stable security definer set search_path = ''
as $$
  select u.id,
         u.email::text,
         coalesce(nullif(trim(p.nombre), ''),
                  nullif(trim(u.raw_user_meta_data ->> 'nombre'), ''),
                  nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
                  split_part(u.email, '@', 1))
  from auth.users u
  left join public.perfiles p on p.id = u.id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and u.deleted_at is null
  order by 3;
$$;
revoke all on function public.usuarios_panel() from public, anon;
grant execute on function public.usuarios_panel() to authenticated;

-- Comprobación: debe salir Paula Parra · Cofounder · true
-- select correo, nombre, rol, es_admin from public.perfiles;
