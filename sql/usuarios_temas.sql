-- ============================================================
-- Ranking de temas pedidos · contar USUARIOS distintos
-- Agrega a v_ia_feedback la columna "usuario": una huella (md5) del
-- correo o, si no hay, de los dígitos del teléfono. Sirve para saber si
-- dos comentarios son de la misma persona sin mostrar el dato real.
-- Sin correo ni teléfono queda vacía y el panel cuenta ese comentario
-- como un usuario aparte.
-- Misma vista de siempre (fecha_segura.sql) + la columna al final.
-- ============================================================
create or replace view public.v_ia_feedback
with (security_invoker = true) as
select
  f.id,
  public.fecha_feedback(f.fecha)                          as fecha,
  f.pais,
  case when trim(f.estrellas) ~ '^[1-5]$' then trim(f.estrellas)::int end as estrellas,
  f.origen,
  array(select trim(x) from unnest(string_to_array(f.tipos, ','))       x where trim(x) <> '') as tipos,
  array(select trim(x) from unnest(string_to_array(f.tema_slug, ','))   x where trim(x) <> '') as temas,
  array(select trim(x) from unnest(string_to_array(f.mejora_slug, ',')) x where trim(x) <> '') as mejoras,
  array(select trim(x) from unnest(string_to_array(f.sugerencias, ',')) x where trim(x) <> '') as sugerencias,
  f.confianza,
  f.estado,
  f.tema_puntual,
  f.guia_de_referencia,
  f.mejora                                                as mejora_texto,
  md5('ch-usuario:' || coalesce(
    nullif(lower(trim(f.correo)), ''),
    nullif(regexp_replace(coalesce(f.telefono, ''), '\D', '', 'g'), '')
  ))                                                      as usuario
from public.feedback_prueba_clasificacion_por_ia f;
