-- ============================================================
-- Pagos de diferencia (Dinero › Egresos › Por mes)   29-sep-2026
-- ============================================================
-- Los gastos van 50/50. Cuando uno puso más que el otro, el panel suma las
-- diferencias de los meses y el que debe le paga al otro. Cada pago dice
-- HASTA QUÉ MES deja las cuentas saldadas y lleva su foto.
--
-- · Los pagos NO se borran: se ANULAN (quién, cuándo y por qué). Solo se
--   puede anular el pago más reciente.
-- · Cada pago guarda una copia de la cuenta con la que se hizo (monto
--   calculado y la diferencia de cada mes en ese momento).
-- · Los gastos de un mes saldado no se pueden agregar, editar ni borrar
--   (hay que anular primero el pago que lo saldó).
-- Los mensajes que empiezan con «ch: » los muestra el panel tal cual.

-- 1. Tabla
create table public.pagos_diferencia (
  id               bigint generated always as identity primary key,
  fecha            date not null,
  monto_cop        numeric(14,0) not null check (monto_cop > 0),
  de               text not null check (de in ('Paula', 'Hámilton')),
  para             text not null check (para in ('Paula', 'Hámilton')),
  salda_hasta      date not null check (extract(day from salda_hasta) = 1),   -- primer día del mes
  monto_calculado  numeric(14,0) not null,     -- lo que el panel calculó que «de» le debía a «para»
  detalle          jsonb not null,             -- diferencia de cada mes al pagar: {"2026-06": -59954, …} (+ = a favor de Paula)
  soportes         text[] not null check (cardinality(soportes) >= 1),
  registrado_por   uuid not null default auth.uid() references auth.users(id),
  registrado_en    timestamptz not null default now(),
  anulado_por      uuid references auth.users(id),
  anulado_en       timestamptz,
  motivo_anulacion text,
  check (de <> para)
);

-- Hasta qué mes está saldado (pagos sin anular)
create function public.saldado_hasta() returns date
language sql stable set search_path = '' as $$
  select max(salda_hasta) from public.pagos_diferencia where anulado_en is null;
$$;

-- 2. Al registrar: quién y cuándo los pone Supabase; el mes tiene que ir
--    desde el último saldado en adelante (el mismo mes sirve para completar
--    un pago que quedó corto) y no puede ser un mes que no ha empezado
create function public.pagos_diferencia_nuevo() returns trigger
language plpgsql set search_path = '' as $$
declare
  hasta date := public.saldado_hasta();
begin
  new.registrado_por := auth.uid();
  new.registrado_en := now();
  new.anulado_por := null; new.anulado_en := null; new.motivo_anulacion := null;
  if hasta is not null and new.salda_hasta < hasta then
    raise exception 'ch: Ya está saldado hasta %. Elige ese mes o uno posterior.', to_char(hasta, 'MM/YYYY');
  end if;
  if new.salda_hasta > date_trunc('month', now() at time zone 'America/Bogota')::date then
    raise exception 'ch: Ese mes todavía no ha empezado.';
  end if;
  return new;
end; $$;
create trigger pagos_diferencia_nuevo before insert on public.pagos_diferencia
  for each row execute function public.pagos_diferencia_nuevo();

-- 3. Lo único que se puede cambiar es anularlo (con motivo), una sola vez,
--    y solo el más reciente (el de mes más alto; en el mismo mes, el último registrado)
create function public.pagos_diferencia_anular() returns trigger
language plpgsql set search_path = '' as $$
declare
  motivo text := btrim(coalesce(new.motivo_anulacion, ''));
begin
  if old.anulado_en is not null then
    raise exception 'ch: Ese pago ya estaba anulado.';
  end if;
  if motivo = '' then
    raise exception 'ch: Escribe por qué se anula el pago.';
  end if;
  if exists (select 1 from public.pagos_diferencia p
             where p.anulado_en is null and p.id <> old.id
               and (p.salda_hasta > old.salda_hasta or (p.salda_hasta = old.salda_hasta and p.id > old.id))) then
    raise exception 'ch: Primero anula el pago más reciente.';
  end if;
  new := old;
  new.anulado_por := auth.uid();
  new.anulado_en := now();
  new.motivo_anulacion := motivo;
  return new;
end; $$;
create trigger pagos_diferencia_anular before update on public.pagos_diferencia
  for each row execute function public.pagos_diferencia_anular();

-- 4. Seguridad: solo con sesión segura; nadie puede borrar
alter table public.pagos_diferencia enable row level security;
revoke all on public.pagos_diferencia from anon;
revoke delete, truncate on public.pagos_diferencia from authenticated;
create policy "ver"    on public.pagos_diferencia for select to authenticated using ((select public.sesion_segura()));
create policy "anotar" on public.pagos_diferencia for insert to authenticated with check ((select public.sesion_segura()));
create policy "anular" on public.pagos_diferencia for update to authenticated using ((select public.sesion_segura())) with check ((select public.sesion_segura()));

-- 5. Espacio PRIVADO para las fotos de los pagos: se pueden ver y subir,
--    no cambiar ni borrar
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('soportes-pagos', 'soportes-pagos', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf']);
create policy "pagos: ver"   on storage.objects for select to authenticated
  using (bucket_id = 'soportes-pagos' and (select public.sesion_segura()));
create policy "pagos: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'soportes-pagos' and (select public.sesion_segura()));

-- 6. Candado: los gastos de un mes saldado no se agregan, editan ni borran
create function public.egresos_mes_saldado() returns trigger
language plpgsql set search_path = '' as $$
declare
  hasta date := public.saldado_hasta();
begin
  if hasta is null then
    return coalesce(new, old);
  end if;
  if (tg_op in ('UPDATE', 'DELETE') and date_trunc('month', old.fecha)::date <= hasta)
     or (tg_op in ('INSERT', 'UPDATE') and date_trunc('month', new.fecha)::date <= hasta) then
    raise exception 'ch: Ese mes ya está saldado (hasta %). Para cambiar sus gastos, primero anula el pago de la diferencia.', to_char(hasta, 'MM/YYYY');
  end if;
  return coalesce(new, old);
end; $$;
create trigger egresos_mes_saldado before insert or update or delete on public.egresos
  for each row execute function public.egresos_mes_saldado();
