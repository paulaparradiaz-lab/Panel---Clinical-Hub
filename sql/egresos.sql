-- ============================================================
-- Egresos: gastos que los cofundadores anotan a mano (Ventas › Egresos)
-- ============================================================
-- En pesos (ver sección 4). Por ahora la categoría es «Anuncios». Quien registra queda
-- anotado; «pagado_por» dice quién puso la plata (Paula o Hámilton).
-- Cada gasto lleva su soporte (foto o PDF) en un espacio PRIVADO de
-- Storage: solo se abre desde el panel, con enlaces que vencen.

-- 1. Tabla
create table public.egresos (
  id              bigint generated always as identity primary key,
  fecha           date not null,
  monto_usd       numeric(12,2) not null check (monto_usd > 0),
  categoria       text not null default 'Anuncios',
  concepto        text not null,
  pagado_por      text not null check (pagado_por in ('Paula', 'Hámilton')),
  soporte         text not null,              -- ruta de la foto en el espacio privado
  registrado_por  uuid not null default auth.uid() references auth.users(id),
  registrado_en   timestamptz not null default now(),
  modificado_por  uuid references auth.users(id),
  modificado_en   timestamptz
);

-- Al editar, anota quién y cuándo
create function public.egresos_modificado() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.modificado_por := auth.uid();
  new.modificado_en := now();
  return new;
end; $$;
create trigger egresos_modificado before update on public.egresos
  for each row execute function public.egresos_modificado();

-- Solo con sesión segura (contraseña + código o passkey aprobada)
alter table public.egresos enable row level security;
revoke all on public.egresos from anon;
create policy "ver"     on public.egresos for select to authenticated using ((select public.sesion_segura()));
create policy "anotar"  on public.egresos for insert to authenticated with check ((select public.sesion_segura()));
create policy "editar"  on public.egresos for update to authenticated using ((select public.sesion_segura())) with check ((select public.sesion_segura()));
create policy "borrar"  on public.egresos for delete to authenticated using ((select public.sesion_segura()));

-- 2. Espacio PRIVADO para los soportes (máx. 10 MB; fotos o PDF)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('soportes-egresos', 'soportes-egresos', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf']);

create policy "soportes: ver"     on storage.objects for select to authenticated
  using (bucket_id = 'soportes-egresos' and (select public.sesion_segura()));
create policy "soportes: subir"   on storage.objects for insert to authenticated
  with check (bucket_id = 'soportes-egresos' and (select public.sesion_segura()));
create policy "soportes: cambiar" on storage.objects for update to authenticated
  using (bucket_id = 'soportes-egresos' and (select public.sesion_segura()));
create policy "soportes: borrar"  on storage.objects for delete to authenticated
  using (bucket_id = 'soportes-egresos' and (select public.sesion_segura()));

-- 3. (28-sep-2026) «Pagó» acepta también «Mitad y mitad»: en los totales
--    del panel se suma la mitad a cada uno.
alter table public.egresos drop constraint egresos_pagado_por_check;
alter table public.egresos add constraint egresos_pagado_por_check
  check (pagado_por in ('Paula', 'Hámilton', 'Mitad y mitad'));

-- 4. (28-sep-2026) Los gastos se anotan en PESOS. Cada uno guarda la TRM de
--    su día (el panel la trae de datos.gov.co y se puede corregir) y el
--    equivalente en dólares se calcula solo (para la rentabilidad estimada).
alter table public.egresos rename column monto_usd to monto_cop;
alter table public.egresos drop constraint egresos_monto_usd_check;
alter table public.egresos add constraint egresos_monto_cop_check check (monto_cop > 0);
alter table public.egresos add column trm numeric(10,2) not null check (trm > 0);   -- pesos por dólar ese día
alter table public.egresos add column monto_usd numeric(12,2)
  generated always as (round(monto_cop / trm, 2)) stored;

-- 5. (28-sep-2026) Un gasto puede tener VARIOS soportes (mínimo uno). El
--    soporte que ya tenía cada gasto pasa a la lista nueva.
alter table public.egresos add column soportes text[];
update public.egresos set soportes = array[soporte];
alter table public.egresos alter column soportes set not null;
alter table public.egresos add constraint egresos_soportes_check check (cardinality(soportes) >= 1);
alter table public.egresos drop column soporte;
