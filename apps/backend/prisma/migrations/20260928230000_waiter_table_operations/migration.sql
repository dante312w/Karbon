-- El mesero opera sus mesas desde el celular (docs/adr/0012-entrega-confirmada-por-el-mesero.md).
-- Solo datos: el esquema no cambia.

CREATE FUNCTION pg_temp.grant_permissions(target TEXT[], extra TEXT[]) RETURNS TEXT[] AS $$
  SELECT target || ARRAY(SELECT p FROM unnest(extra) AS p WHERE NOT p = ANY(target));
$$ LANGUAGE SQL IMMUTABLE;

-- Mover, unir y liberar mesas; el backend solo le deja tocar sus propias cuentas.
UPDATE "roles"
SET "permissions" = pg_temp.grant_permissions("permissions", ARRAY['tables:operate'])
WHERE "is_system" AND "code" = 'WAITER';

-- Desde esta versión cada quien opera solo sus pedidos. Los roles que cobran (caja propia del
-- negocio) venían operando los de todos: conservan esa capacidad.
UPDATE "roles"
SET "permissions" = pg_temp.grant_permissions("permissions", ARRAY['orders:manage_any'])
WHERE 'payments:create' = ANY("permissions");

DROP FUNCTION pg_temp.grant_permissions(TEXT[], TEXT[]);
