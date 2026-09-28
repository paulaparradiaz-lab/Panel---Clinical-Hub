-- ============================================================
-- Hitos: serie diaria acumulada para el metro (pestaña Hitos)
-- ============================================================
-- Una fila por día con algún movimiento (hora de Colombia):
--   medicos         médicos (suscripciones) que han pagado alguna vez, sin reembolsos
--   activos         suscripciones activas al cierre del día
--   activos_record  el máximo de activos alcanzado hasta ese día (las estaciones son récord)
--   neta            facturación neta del producto acumulada (parte de Paula × 2, 50/50)
-- Los pagos reembolsados o con contracargo no cuentan. Solo lee hotmart_eventos.

create or replace view public.v_hotmart_hitos
with (security_invoker = true) as
with ev as (
  select fecha, evento, suscriptor, transaccion, neto_usd from public.hotmart_eventos
),
devueltas as (
  select distinct transaccion from ev
  where evento in ('PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK') and transaccion is not null
),
pagos as (
  select * from ev
  where evento = 'PURCHASE_APPROVED'
    and (transaccion is null or transaccion not in (select transaccion from devueltas))
),
primera as (
  select suscriptor, min(fecha) as f from pagos group by suscriptor
),
-- Activa tras un cobro aprobado; deja de estarlo con atraso, cancelación,
-- baja, reembolso o contracargo. Cada cambio suma o resta uno.
estados as (
  select suscriptor, fecha, evento in ('PURCHASE_APPROVED', 'PURCHASE_COMPLETE') as activo
  from ev
  where suscriptor is not null
    and evento in ('PURCHASE_APPROVED', 'PURCHASE_COMPLETE', 'PURCHASE_DELAYED',
                   'SUBSCRIPTION_CANCELLATION', 'SUBSCRIPTION_INACTIVE',
                   'PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK', 'PURCHASE_CANCELED')
    -- una compra que después se reembolsó no cuenta como activa
    and not (evento = 'PURCHASE_APPROVED' and transaccion in (select transaccion from devueltas))
),
cambios as (
  select fecha,
         case when activo and not lag(activo, 1, false) over w then 1
              when not activo and lag(activo, 1, false) over w then -1
              else 0 end as d
  from estados
  window w as (partition by suscriptor order by fecha)
),
dias as (
  select (f at time zone 'America/Bogota')::date as dia, 1 as nuevos, 0 as delta, 0::numeric as neta from primera
  union all
  select (fecha at time zone 'America/Bogota')::date, 0, d, 0 from cambios where d <> 0
  union all
  select (fecha at time zone 'America/Bogota')::date, 0, 0, coalesce(neto_usd, 0) * 2 from pagos
),
serie as (
  select dia, sum(nuevos) as nuevos, sum(delta) as delta, sum(neta) as neta from dias group by dia
),
acum as (
  select dia,
         sum(nuevos) over (order by dia) as medicos,
         sum(delta)  over (order by dia) as activos,
         sum(neta)   over (order by dia) as neta
  from serie
)
select dia, medicos, activos,
       max(activos) over (order by dia) as activos_record,
       round(neta, 2) as neta
from acum;
