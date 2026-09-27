-- ============================================================
-- Accesos del panel: el nombre del acceso ES el rol («Cofounder»)
-- 2026-09-27
--
-- Antes «perfiles» tenía dos columnas: rol (una etiqueta) y es_admin
-- (sí/no). Paula quiere una sola cosa: su acceso se llama «Cofounder».
--
--   accesos .......... la lista de accesos que existen (por ahora solo
--                      Cofounder). En el Table Editor, la columna
--                      «acceso» de cada perfil muestra esta lista como
--                      desplegable.
--   perfiles.acceso .. el acceso de cada persona (vacío = sin asignar)
--
-- Todavía ningún acceso limita nada en el panel: eso es el paso
-- siguiente (hacer valer los accesos con las reglas por fila).
-- Otros accesos (p. ej. «Clasificador», «Lectura») se agregan cuando
-- se necesiten, junto con lo que puede ver y hacer cada uno.
-- ============================================================

create table if not exists public.accesos (
  nombre      text primary key,
  descripcion text
);

alter table public.accesos enable row level security;
revoke all on public.accesos from anon, authenticated;
grant select on public.accesos to authenticated;

drop policy if exists "lectura autenticados" on public.accesos;
create policy "lectura autenticados" on public.accesos
  for select to authenticated using (true);

drop policy if exists "exigir 2FA" on public.accesos;
create policy "exigir 2FA" on public.accesos
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

insert into public.accesos (nombre, descripcion)
values ('Cofounder', 'Todo el panel, sin restricciones')
on conflict (nombre) do nothing;

-- El acceso de cada persona sale de la lista
alter table public.perfiles
  add column if not exists acceso text references public.accesos (nombre) on update cascade;

update public.perfiles set acceso = 'Cofounder' where es_admin;

-- Ya no hacen falta
alter table public.perfiles drop column if exists es_admin;
alter table public.perfiles drop column if exists rol;

-- Comprobación: debe salir Paula Parra · Cofounder
-- select correo, nombre, acceso from public.perfiles;
