-- ============================================================
-- Passkey = contraseña + código de la app
-- ============================================================
-- Supabase cuenta el ingreso con passkey como un solo paso (aal1), así que
-- las reglas que exigían «aal2» pedían además el código de la app.
-- Desde aquí, una sesión vale si:
--   · pasó contraseña + código (aal2), o
--   · entró con passkey y TODAS las passkeys del usuario están aprobadas.
-- Una passkey queda aprobada solo si se registró desde una sesión con
-- código (aal2) y el panel la aprueba en los 10 minutos siguientes. Así,
-- quien sepa solo la contraseña no puede registrar su propia passkey y
-- saltarse el código: esa passkey quedaría sin aprobar y, mientras exista,
-- ninguna passkey de ese usuario sirve sin código.

-- 1. Passkeys aprobadas (solo se tocan desde las funciones de abajo)
create table if not exists public.passkeys_aprobadas (
  credencial  uuid primary key references auth.webauthn_credentials(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  aprobada_en timestamptz not null default now()
);
alter table public.passkeys_aprobadas enable row level security;
revoke all on public.passkeys_aprobadas from anon, authenticated;

-- 2. ¿La sesión actual vale como contraseña + código?
create or replace function public.sesion_segura()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or (
        exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m
                where m ->> 'method' = 'passkey')
        and exists (select 1 from auth.webauthn_credentials w where w.user_id = auth.uid())
        and not exists (select 1 from auth.webauthn_credentials w
                        where w.user_id = auth.uid()
                          and not exists (select 1 from public.passkeys_aprobadas a where a.credencial = w.id))
      );
$$;
revoke all on function public.sesion_segura() from public, anon;
grant execute on function public.sesion_segura() to authenticated;

-- 3. Aprobar una passkey recién registrada (solo con código de la app)
create or replace function public.aprobar_passkey(p_credencial uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'aal2 requerido';
  end if;
  if not exists (select 1 from auth.webauthn_credentials
                 where id = p_credencial and user_id = auth.uid()
                   and created_at > now() - interval '10 minutes') then
    raise exception 'passkey no encontrada';
  end if;
  insert into public.passkeys_aprobadas (credencial, user_id)
  values (p_credencial, auth.uid())
  on conflict (credencial) do nothing;
end;
$$;
revoke all on function public.aprobar_passkey(uuid) from public, anon;
grant execute on function public.aprobar_passkey(uuid) to authenticated;

-- 4. Las reglas «exigir 2FA» usan la función (mismos nombres y acciones)
alter policy "exigir 2FA" on public.perfiles
  using ((select public.sesion_segura()));
alter policy "exigir 2FA" on public.accesos
  using ((select public.sesion_segura()));
alter policy "exigir 2FA" on public.feedback_prueba_clasificacion_por_ia
  using ((select public.sesion_segura()));
alter policy "exigir 2FA al editar" on public.feedback_prueba_clasificacion_por_ia
  using ((select public.sesion_segura())) with check ((select public.sesion_segura()));
alter policy "exigir 2FA" on public.categorias_para_ia
  using ((select public.sesion_segura()));
alter policy "exigir 2FA al editar" on public.categorias_para_ia
  using ((select public.sesion_segura())) with check ((select public.sesion_segura()));
alter policy "exigir 2FA al crear" on public.categorias_para_ia
  with check ((select public.sesion_segura()));
alter policy "exigir 2FA" on public.mejoras_ia
  using ((select public.sesion_segura())) with check ((select public.sesion_segura()));
alter policy "exigir 2FA" on public.mejora_ia_tema
  using ((select public.sesion_segura())) with check ((select public.sesion_segura()));
alter policy "exigir 2FA" on public.mejora_ia_persona
  using ((select public.sesion_segura())) with check ((select public.sesion_segura()));
alter policy "exigir 2FA" on public.mejora_ia_historial
  using ((select public.sesion_segura()));

-- 5. Lista de usuarios del panel: misma condición
create or replace function public.usuarios_panel()
returns table(id uuid, correo text, nombre text)
language sql stable security definer
set search_path = ''
as $$
  select u.id,
         u.email::text,
         coalesce(nullif(trim(p.nombre), ''),
                  nullif(trim(u.raw_user_meta_data ->> 'nombre'), ''),
                  nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
                  split_part(u.email, '@', 1))
  from auth.users u
  left join public.perfiles p on p.id = u.id
  where (select public.sesion_segura())
    and u.deleted_at is null
  order by 3;
$$;
