-- ============================================================
-- CLINICAL HUB · FECHA SEGURA DEL FEEDBACK (2026-09-27)
-- Antes, si UN solo feedback llegaba con la fecha escrita distinto
-- (por ejemplo con un espacio invisible antes de «p. m.», como hacen
-- algunos navegadores nuevos), la vista v_ia_feedback fallaba entera
-- y el panel quedaba vacío (Inbox, Métricas, Mejoras e Impacto).
-- Ahora la fecha se lee con esta función, que tolera las variantes
-- conocidas y, si aun así no la entiende, devuelve NULL: ese feedback
-- sale «sin fecha» y el resto del panel sigue funcionando.
-- No toca ningún dato: solo cambia cómo se lee la fecha.
-- ============================================================

create or replace function public.fecha_feedback(t text)
returns timestamp language plpgsql immutable set search_path = ''
as $$
declare
  limpio text;
begin
  if t is null or btrim(t) = '' then
    return null;
  end if;
  -- Espacios raros (duro, angosto, fino) → espacio normal
  limpio := btrim(regexp_replace(t, '[   ]', ' ', 'g'));
  -- Formato internacional: 2026-09-24T14:31:47 o 2026-09-24 14:31:47
  if limpio ~ '^\d{4}-\d{2}-\d{2}' then
    return limpio::timestamp;
  end if;
  -- «p. m.», «p.m.», «pm», «PM» (y lo mismo con a. m.) → PM / AM
  limpio := regexp_replace(limpio, '\s*p\.?\s*m\.?$', ' PM', 'i');
  limpio := regexp_replace(limpio, '\s*a\.?\s*m\.?$', ' AM', 'i');
  if limpio ~ '(AM|PM)$' then
    return to_timestamp(limpio, 'DD/MM/YYYY, HH12:MI:SS AM')::timestamp;
  end if;
  -- Sin a. m. / p. m.: hora de 24 horas
  return to_timestamp(limpio, 'DD/MM/YYYY, HH24:MI:SS')::timestamp;
exception when others then
  return null;   -- no se entiende: sale sin fecha, el panel sigue
end;
$$;

-- La vista usa la función en vez de convertir directo (mismas columnas)
create or replace view public.v_ia_feedback
with (security_invoker = true) as
 SELECT id,
    public.fecha_feedback(fecha) AS fecha,
    pais,
        CASE
            WHEN TRIM(BOTH FROM estrellas) ~ '^[1-5]$'::text THEN TRIM(BOTH FROM estrellas)::integer
            ELSE NULL::integer
        END AS estrellas,
    origen,
    ARRAY( SELECT TRIM(BOTH FROM x.x) AS btrim
           FROM unnest(string_to_array(f.tipos, ','::text)) x(x)
          WHERE TRIM(BOTH FROM x.x) <> ''::text) AS tipos,
    ARRAY( SELECT TRIM(BOTH FROM x.x) AS btrim
           FROM unnest(string_to_array(f.tema_slug, ','::text)) x(x)
          WHERE TRIM(BOTH FROM x.x) <> ''::text) AS temas,
    ARRAY( SELECT TRIM(BOTH FROM x.x) AS btrim
           FROM unnest(string_to_array(f.mejora_slug, ','::text)) x(x)
          WHERE TRIM(BOTH FROM x.x) <> ''::text) AS mejoras,
    ARRAY( SELECT TRIM(BOTH FROM x.x) AS btrim
           FROM unnest(string_to_array(f.sugerencias, ','::text)) x(x)
          WHERE TRIM(BOTH FROM x.x) <> ''::text) AS sugerencias,
    confianza,
    estado,
    tema_puntual,
    guia_de_referencia,
    mejora AS mejora_texto
   FROM feedback_prueba_clasificacion_por_ia f;
