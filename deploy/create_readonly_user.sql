-- Create a read-only PostgreSQL user for the webapp.
-- Run this once on the droplet as the postgres superuser:
--   psql -U postgres -d skypilot -f deploy/create_readonly_user.sql
--
-- Replace 'CHANGE_ME' with the actual password before running.
-- Store the password in /root/webapp/.env as DB_PASSWORD.

CREATE USER skypilot_app WITH PASSWORD 'CHANGE_ME';

-- Grant SELECT on all current and future tables in each schema
GRANT USAGE ON SCHEMA raw        TO skypilot_app;
GRANT USAGE ON SCHEMA clean      TO skypilot_app;
GRANT USAGE ON SCHEMA factor     TO skypilot_app;
GRANT USAGE ON SCHEMA targets    TO skypilot_app;
GRANT USAGE ON SCHEMA secmaster  TO skypilot_app;
GRANT USAGE ON SCHEMA pipeline   TO skypilot_app;

GRANT SELECT ON ALL TABLES IN SCHEMA raw       TO skypilot_app;
GRANT SELECT ON ALL TABLES IN SCHEMA clean     TO skypilot_app;
GRANT SELECT ON ALL TABLES IN SCHEMA factor    TO skypilot_app;
GRANT SELECT ON ALL TABLES IN SCHEMA targets   TO skypilot_app;
GRANT SELECT ON ALL TABLES IN SCHEMA secmaster TO skypilot_app;
GRANT SELECT ON ALL TABLES IN SCHEMA pipeline  TO skypilot_app;

-- Ensure future tables created in these schemas are also accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA raw       GRANT SELECT ON TABLES TO skypilot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA clean     GRANT SELECT ON TABLES TO skypilot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA factor    GRANT SELECT ON TABLES TO skypilot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA targets   GRANT SELECT ON TABLES TO skypilot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA secmaster GRANT SELECT ON TABLES TO skypilot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pipeline  GRANT SELECT ON TABLES TO skypilot_app;
