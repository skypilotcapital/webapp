from api.db import get_db
from sqlalchemy import text

try:
    with get_db() as c:
        rows = c.execute(text("""
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_schema IN ('raw', 'clean', 'factor', 'targets') 
            AND table_type = 'BASE TABLE'
            ORDER BY table_schema, table_name;
        """)).fetchall()
        for r in rows:
            print(f"{r.table_schema}.{r.table_name}")
except Exception as e:
    print(f"Error: {e}")
