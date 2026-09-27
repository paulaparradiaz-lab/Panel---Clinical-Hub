-- ============================================================
-- Mejoras sin duplicados: se crean en un solo paso
-- 2026-09-27
--
-- Antes, crear una mejora eran 3 pasos separados desde el panel (crear,
-- enlazar a su indicador/tema, asignar personas). Si se cortaba la red a
-- mitad, al volver a «Guardar» se creaba otra mejora y la primera quedaba
-- huérfana.
--
-- Ahora:
-- 1. crear_mejora_completa() hace los 3 pasos dentro de Supabase, en una
--    sola transacción: o se guarda todo o no se guarda nada.
-- 2. Cada ventana manda una «clave» única que nace al abrirla. Si llega
--    dos veces (doble clic o reintento tras un corte), la segunda
--    devuelve la mejora ya creada en vez de crear otra.
--
-- Es security invoker: corre con el permiso de quien la llama, así que
-- respeta las políticas de siempre (incluida «exigir 2FA»).
-- ============================================================

alter table public.mejoras_ia add column if not exists clave uuid unique;
grant insert (clave) on public.mejoras_ia to authenticated;

create or replace function public.crear_mejora_completa(
  p_clave         uuid,
  p_titulo        text,
  p_detalle       text,
  p_estado        text,
  p_completada_en timestamptz,
  p_creado_en     timestamptz,
  p_enlaces       text[],
  p_personas      uuid[]
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id bigint;
begin
  -- Reintento: esta ventana ya creó su mejora
  if p_clave is not null then
    select id into v_id from mejoras_ia where clave = p_clave;
    if v_id is not null then return v_id; end if;
  end if;

  if coalesce(array_length(p_enlaces, 1), 0) = 0 then
    raise exception 'La mejora necesita al menos un indicador.';
  end if;

  begin
    insert into mejoras_ia (titulo, detalle, estado, completada_en, creado_en, clave)
    values (p_titulo, nullif(trim(coalesce(p_detalle, '')), ''), coalesce(p_estado, 'pendiente'),
            p_completada_en, coalesce(p_creado_en, now()), p_clave)
    returning id into v_id;
  exception when unique_violation then
    -- Dos envíos a la vez con la misma clave: gana el primero
    select id into v_id from mejoras_ia where clave = p_clave;
    return v_id;
  end;

  insert into mejora_ia_tema (mejora_id, tema_slug)
  select v_id, s from unnest(p_enlaces) as s
  on conflict do nothing;

  insert into mejora_ia_persona (mejora_id, usuario_id)
  select v_id, u from unnest(coalesce(p_personas, '{}'::uuid[])) as u
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.crear_mejora_completa(uuid, text, text, text, timestamptz, timestamptz, text[], uuid[]) from public, anon;
grant execute on function public.crear_mejora_completa(uuid, text, text, text, timestamptz, timestamptz, text[], uuid[]) to authenticated;
