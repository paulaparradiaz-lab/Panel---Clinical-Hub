-- ============================================================
-- Borrar la tabla vieja «feedback» (la del panel anterior)
-- 2026-09-27 · Paula lo corrió en Supabase (SQL Editor) el 27-sep
--
-- Antes de correrlo:
--   1. Confirma que en n8n ya no hay ningún paso que escriba en
--      «feedback». El 24-sep a las 19:31 UTC n8n todavía hizo
--      POST /rest/v1/feedback (visto en los registros de Supabase).
--      Si ese paso sigue, fallará al no existir la tabla.
--   2. (Opcional) Respaldo: en Supabase › Table Editor › feedback ›
--      «Export to CSV». Es permanente: sin respaldo no se recupera.
--
-- Qué se pierde: 105 filas. 102 ya están en
-- feedback_prueba_clasificacion_por_ia (la tabla que usa el panel).
-- Las 3 que están solo aquí son pruebas: «O» (22-sep, WhatsApp),
-- «Probando supabase» (22-sep, encuesta) y «Probando» (24-sep, encuesta).
--
-- El panel no lee esta tabla: no cambia nada en el panel.
-- ============================================================

drop table if exists public.feedback;

-- El rol público (anon, sin sesión) no necesita nada en las tablas del
-- panel: las políticas ya lo bloqueaban fila por fila, esto quita el
-- permiso de raíz. El panel entra con sesión y 2FA; n8n, con la clave
-- secreta (service_role): ninguno de los dos cambia.
revoke all on public.feedback_prueba_clasificacion_por_ia from anon;
revoke all on public.categorias_para_ia from anon;

-- Comprobación (dio 0 y vacío el 27-sep):
-- select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'feedback';
-- select * from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon';
