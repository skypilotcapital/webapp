from api.db import get_db
from sqlalchemy import text

try:
    with get_db() as c:
        rows = c.execute(text('SELECT flow, step, started_at FROM pipeline.run_log ORDER BY started_at DESC LIMIT 20')).fetchall()
        for r in rows:
            print(f"Flow: {r.flow} | Step: {r.step} | Started: {r.started_at}")
except Exception as e:
    print(f"Error: {e}")
