-- ============================================================
-- Seguridad: v_ia_feedback vuelve a respetar RLS («exigir 2FA»)
-- 2026-09-27
--
-- fecha_segura.sql recreó la vista con «create or replace view» sin
-- «with (security_invoker = true)», y en Postgres eso le quitó la
-- opción: la vista corría con el permiso de su dueño (postgres) y se
-- saltaba las políticas de feedback_prueba_clasificacion_por_ia, incluida
-- la restrictiva «exigir 2FA». Un usuario con sesión pero sin segundo
-- factor podía leer los comentarios por esta vista (anon no: no tiene
-- permiso sobre la vista).
--
-- Con security_invoker la vista se lee con el permiso de quien consulta,
-- como v_ia_por_revisar y v_ia_mejoras. fecha_feedback() no es security
-- definer y authenticated puede ejecutarla, así que el panel sigue igual.
-- ============================================================
alter view public.v_ia_feedback set (security_invoker = true);

-- Comprobación: debe decir {security_invoker=true}
-- select reloptions from pg_class where oid = 'public.v_ia_feedback'::regclass;
