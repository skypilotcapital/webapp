import psycopg2
import os
from urllib.parse import urlparse

# read from .env manually to avoid pydantic
env = {}
with open('api/.env', 'r') as f:
    for line in f:
        if line.strip() and not line.startswith('#'):
            k, v = line.strip().split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")

conn = psycopg2.connect(
    dbname=env['DB_NAME'],
    user=env['DB_USER'],
    password=env['DB_PASSWORD'],
    host=env.get('DB_HOST', 'localhost'),
    port=env.get('DB_PORT', 5432)
)

cur = conn.cursor()

# Get all tables
cur.execute("""
    SELECT table_schema, table_name
    FROM information_schema.tables 
    WHERE table_schema IN ('raw', 'clean', 'factor', 'targets') 
    AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name;
""")
print("All tables:")
for r in cur.fetchall():
    print(f"{r[0]}.{r[1]}")

print("\nRun logs flows:")
cur.execute("SELECT DISTINCT flow FROM pipeline.run_log;")
for r in cur.fetchall():
    print(r[0])
