-- ============================================================
-- Marca «clave_propia» para Paula
-- 2026-09-27 · Paula lo corrió en Supabase el 28-sep (comprobado: true)
--
-- El panel ahora pide crear una contraseña propia la primera vez que
-- alguien entra (la inicial la pone quien crea la cuenta, o llega por
-- invitación sin contraseña). Sabe que ya la puso por la marca
-- user_metadata.clave_propia, que se guarda sola al crearla o cambiarla.
--
-- Paula ya tiene su propia contraseña desde antes de este cambio: se le
-- pone la marca a mano para que no se le pida otra vez.
-- ============================================================

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"clave_propia": true}'::jsonb
where email = 'paulaplf555@gmail.com';

-- Comprobación: debe decir true
-- select raw_user_meta_data->>'clave_propia' from auth.users where email = 'paulaplf555@gmail.com';
