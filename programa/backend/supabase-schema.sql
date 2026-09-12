-- Ejecutar UNA VEZ en Supabase: Project -> SQL Editor -> pegar todo -> Run.
--
-- Una tabla por colección, con la misma forma que ya usan almacen.js/api.js:
-- cada fila es un registro completo guardado como jsonb en "datos" (mismo
-- objeto que antes vivía en un array dentro de un .json). No se normaliza
-- todavía a columnas reales -- es la migración mínima de "JSON en disco de
-- Render, que no sobrevive un redeploy" a "base de datos real", sin tocar
-- el resto del código.
--
-- RLS queda DESACTIVADO a propósito: hoy no hay login (ver
-- claude/DECISIONES-ARQUITECTURA.md), así que cualquier política de RLS
-- sería teatro -- el permiso real hoy es "quien tenga la clave puede todo".
-- Cuando se sume Google Sign-In, activar RLS acá es el paso natural.

create table if not exists piezas (
  id text primary key,
  datos jsonb not null,
  creado_en timestamptz not null default now()
);

create table if not exists grupos (
  id text primary key,
  datos jsonb not null,
  creado_en timestamptz not null default now()
);

create table if not exists disenos (
  id text primary key,
  datos jsonb not null,
  creado_en timestamptz not null default now()
);

create table if not exists productos (
  id text primary key,
  datos jsonb not null,
  creado_en timestamptz not null default now()
);

create table if not exists pedidos (
  id text primary key,
  datos jsonb not null,
  creado_en timestamptz not null default now()
);

create table if not exists generaciones (
  id text primary key,
  datos jsonb not null,
  creado_en timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  piezas, grupos, disenos, productos, pedidos, generaciones
  to anon, authenticated;
