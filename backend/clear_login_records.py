
from pathlib import Path
import sqlite3
from backend import security as sec

# Use the same database path as RescueNet itself.
db_path = Path(sec.DB_PATH).resolve()

if not db_path.exists():
    raise FileNotFoundError(f"Database not found: {db_path}")

backup_path = db_path.with_name(
    f"{db_path.stem}_backup_before_login_reset{db_path.suffix}"
)

# Create a consistent SQLite backup before changing anything.
with sec.connect() as db:
    backup_db = sqlite3.connect(str(backup_path))
    try:
        db.backup(backup_db)
    finally:
        backup_db.close()

    # Count records before clearing them.
    session_count = db.execute(
        "SELECT COUNT(*) FROM sessions"
    ).fetchone()[0]

    login_hit_count = db.execute("""
        SELECT COUNT(*) FROM hits
        WHERE key LIKE 'lp:%'
           OR key LIKE 'la:%'
           OR key LIKE 'li:%'
    """).fetchone()[0]

    # Clear sessions, login-failure/rate-limit records, and last-login timestamps.
    db.execute("DELETE FROM sessions")
    db.execute("""
        DELETE FROM hits
        WHERE key LIKE 'lp:%'
           OR key LIKE 'la:%'
           OR key LIKE 'li:%'
    """)
    db.execute("UPDATE users SET last_login = NULL")

print("Login-record reset completed.")
print(f"Database: {db_path}")
print(f"Backup: {backup_path}")
print(f"Sessions removed: {session_count}")
print(f"Login-attempt records removed: {login_hit_count}")
print("User accounts and other project tables were preserved.")
