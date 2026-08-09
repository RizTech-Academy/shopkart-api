/**
 * Schema.
 *
 * Money is INTEGER minor units — SQLite REAL is a double and must never hold a
 * price. Foreign keys cascade so clearing a session leaves no orphans.
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS products (
     id             TEXT PRIMARY KEY,
     title          TEXT NOT NULL,
     description    TEXT NOT NULL,
     category       TEXT NOT NULL,
     price_minor    INTEGER NOT NULL CHECK (price_minor >= 0),
     currency       TEXT NOT NULL DEFAULT 'USD',
     image_url      TEXT NOT NULL,
     rating_average REAL NOT NULL CHECK (rating_average BETWEEN 0 AND 5),
     rating_count   INTEGER NOT NULL CHECK (rating_count >= 0),
     in_stock       INTEGER NOT NULL CHECK (in_stock IN (0,1))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_products_category ON products (category)`,
  `CREATE INDEX IF NOT EXISTS idx_products_price    ON products (price_minor)`,
  `CREATE INDEX IF NOT EXISTS idx_products_rating   ON products (rating_average DESC)`,

  `CREATE TABLE IF NOT EXISTS sessions (
     id         TEXT PRIMARY KEY,
     created_at TEXT NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS cart_items (
     session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
     quantity   INTEGER NOT NULL CHECK (quantity > 0),
     added_at   TEXT NOT NULL,
     PRIMARY KEY (session_id, product_id)
   )`,

  `CREATE TABLE IF NOT EXISTS favourites (
     session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
     added_at   TEXT NOT NULL,
     PRIMARY KEY (session_id, product_id)
   )`,

  `CREATE TABLE IF NOT EXISTS orders (
     id          TEXT PRIMARY KEY,
     reference   TEXT NOT NULL UNIQUE,
     session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
     currency    TEXT NOT NULL DEFAULT 'USD',
     placed_at   TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_session ON orders (session_id, placed_at DESC)`,

  `CREATE TABLE IF NOT EXISTS order_lines (
     order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     product_id      TEXT NOT NULL,
     title           TEXT NOT NULL,
     unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
     quantity        INTEGER NOT NULL CHECK (quantity > 0),
     PRIMARY KEY (order_id, product_id)
   )`,
];
