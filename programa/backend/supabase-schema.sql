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

-- Plantillas: configuración de zonas de un producto SIN contenido real
-- (nombre/número/logo), para no rearmar el anclaje cada vez en prendas que
-- se repiten mucho (ver dominio/modelos.js·Plantilla).
create table if not exists plantillas (
  id text primary key,
  datos jsonb not null,
  creado_en timestamptz not null default now()
);

-- Eventos: historial de auditoría (qué se creó/actualizó/borró, cuándo,
-- resumen) -- ver almacen.js·registrarEvento. Append-only a propósito: el
-- backend nunca le pide update ni delete, y tampoco se los otorga acá, así
-- que ni un bug propio puede corromper el historial.
create table if not exists eventos (
  id text primary key,
  datos jsonb not null,
  creado_en timestamptz not null default now()
);

-- Fuentes: catálogo de tipografías propias (TTF/OTF) para nombre/número/
-- texto fijo de una zona -- sin esto, todo se escribía siempre con la
-- Helvetica estándar de pdf-lib. `datos` guarda nombre, la URL del archivo
-- en Storage, y la cobertura de ñ/acentos ya calculada UNA vez al subirla
-- (motor/fuentes.js·verificarCobertura), no en cada PDF generado.
create table if not exists fuentes (
  id text primary key,
  datos jsonb not null,
  creado_en timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  piezas, grupos, disenos, productos, pedidos, generaciones, plantillas, fuentes
  to anon, authenticated;
grant select, insert on eventos to anon, authenticated;

-- ============================================================================
-- Endurecer permisos (correr UNA vez, DESPUÉS de cargar SUPABASE_SERVICE_KEY
-- en Render): el backend ya usa la service_role para las tablas (ver
-- almacen.js), así que la clave anon/publishable deja de necesitar acceso.
-- Esa clave está pensada para ser pública: con RLS apagado y los GRANT de
-- arriba, cualquiera que la tuviera podía leer y borrar todo directo contra
-- Supabase, sin pasar por la clave de acceso del backend.
--
-- RLS activado SIN políticas = anon/authenticated no ven ni tocan nada; la
-- service_role se lo salta por diseño. Nota: la service_role también puede
-- hacer update/delete en `eventos` -- el append-only ahora lo garantiza el
-- código del backend (almacen.js nunca lo pide), no un permiso de Postgres.
-- ============================================================================
revoke all on piezas, grupos, disenos, productos, pedidos, generaciones, plantillas, fuentes, eventos
  from anon, authenticated;
alter table piezas enable row level security;
alter table grupos enable row level security;
alter table disenos enable row level security;
alter table productos enable row level security;
alter table pedidos enable row level security;
alter table generaciones enable row level security;
alter table plantillas enable row level security;
alter table fuentes enable row level security;
alter table eventos enable row level security;
