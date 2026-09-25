-- Sample schema used by the integration tests and for trying the app locally.
CREATE EXTENSION IF NOT EXISTS hstore;

CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');
CREATE DOMAIN positive_int AS integer CHECK (VALUE > 0);
CREATE TYPE dimensions AS (width numeric, height numeric);

CREATE TABLE customers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email text NOT NULL UNIQUE,
    full_name text NOT NULL,
    mood mood NOT NULL DEFAULT 'ok',
    score positive_int,
    tags text[] NOT NULL DEFAULT '{}',
    preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
    attributes hstore,
    balance numeric(12, 2) NOT NULL DEFAULT 0,
    ratio double precision,
    is_active boolean NOT NULL DEFAULT true,
    external_id uuid DEFAULT gen_random_uuid(),
    avatar bytea,
    birthday date,
    wake_up time,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamp,
    lifetime interval,
    ip inet,
    box_size dimensions,
    active_range int4range,
    search_name text GENERATED ALWAYS AS (lower(full_name)) STORED
);
COMMENT ON TABLE customers IS 'People who buy things';
COMMENT ON COLUMN customers.email IS 'Unique login';

CREATE TABLE orders (
    id serial PRIMARY KEY,
    customer_id bigint NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    total numeric(10, 2) NOT NULL CHECK (total >= 0),
    status text NOT NULL DEFAULT 'pending',
    placed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_customer_idx ON orders (customer_id, placed_at DESC);

CREATE TABLE order_items (
    order_id integer NOT NULL REFERENCES orders (id),
    line integer NOT NULL,
    sku text NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    PRIMARY KEY (order_id, line)
);

CREATE TABLE audit_log (
    happened_at timestamptz NOT NULL DEFAULT now(),
    message text
);

CREATE VIEW active_customers AS
    SELECT id, email, full_name FROM customers WHERE is_active;

CREATE MATERIALIZED VIEW customer_totals AS
    SELECT c.id, c.full_name, coalesce(sum(o.total), 0) AS total
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id, c.full_name;

CREATE FUNCTION customer_count() RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT count(*) FROM customers;
$$;

CREATE PROCEDURE archive_orders(before timestamptz) LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM orders WHERE placed_at < before;
END;
$$;

CREATE SCHEMA analytics;
CREATE TABLE analytics.daily_sales (
    day date PRIMARY KEY,
    revenue numeric(14, 2) NOT NULL
);

INSERT INTO customers (email, full_name, mood, score, tags, preferences, attributes, balance, ratio, birthday, wake_up, updated_at, lifetime, ip, box_size, active_range, avatar)
VALUES
    ('ann@example.com', 'Ann O''Brien', 'happy', 42, '{vip,"early adopter"}', '{"theme": "dark", "limits": [1, 2, 3]}', 'plan=>pro, seats=>5',
     1234.56, 0.75, '1990-05-17', '07:30', '2024-01-02 03:04:05.678', '1 year 2 mons 3 days 04:05:06', '192.168.1.10', ROW(10.5, 20), '[1,10)', '\xdeadbeef'),
    ('bob@example.com', 'Bob Smith', 'sad', NULL, '{}', '{}', NULL, -20, NULL, NULL, NULL, NULL, NULL, '2001:db8::1', NULL, 'empty', NULL),
    ('cy@example.com', 'Cy "The Cipher" Zed', 'ok', 7, '{a,b,c}', '[1, "two", null]', '', 0, 1e-7, '0001-01-01', '23:59:59.999999', 'infinity', '-01:00:00', '10.0.0.0/8', ROW(0, 0), '(,)', '');

INSERT INTO orders (customer_id, total, status, placed_at)
SELECT c.id, (n * 9.99)::numeric(10, 2), CASE WHEN n % 3 = 0 THEN 'shipped' ELSE 'pending' END, now() - (n || ' days')::interval
FROM customers c CROSS JOIN generate_series(1, 40) AS n;

INSERT INTO order_items (order_id, line, sku, quantity)
SELECT o.id, 1, 'SKU-' || o.id, 2 FROM orders o;

INSERT INTO audit_log (message) VALUES ('created'), (NULL);

INSERT INTO analytics.daily_sales (day, revenue)
SELECT current_date - n, n * 100 FROM generate_series(0, 30) AS n;

REFRESH MATERIALIZED VIEW customer_totals;
