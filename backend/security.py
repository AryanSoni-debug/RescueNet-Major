"""Authentication, sessions, rate limiting and the locked admin whitelist.

Design notes
- Passwords: PBKDF2-HMAC-SHA256 (600k rounds), per-user random salt, constant-time compare.
- Sessions: random 256-bit token in an HttpOnly + SameSite=Strict cookie. Only a SHA-256
  hash of the token is stored server-side, so a leaked database cannot be replayed.
- Admin accounts: a fixed whitelist is written ONCE (first run). SQLite triggers then make it
  impossible to add/remove/rename admins or change anyone's role, even through the API or SQL
  executed by the app. The public registration endpoint can only ever create role='user'.
- Brute-force protection: sliding-window limits per (ip+email), per email and per IP.
"""
from __future__ import annotations
import os, re, time, secrets, hashlib, hmac, sqlite3, unicodedata
from pathlib import Path
from fastapi import HTTPException, Request, Response

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.getenv("RESCUENET_DB", str(ROOT / "rescuenet.db")))
COOKIE = "rn_session"
SESSION_SECONDS = 12 * 3600
PBKDF2_ROUNDS = 600_000
LEGACY_ROUNDS = 310_000
MAX_ADMINS = 5
DEFAULT_ADMINS = "admin@rescuenet.demo"
DEFAULT_USER_EMAIL = "user@rescuenet.demo"

LOGIN_WINDOW = 15 * 60
LIMIT_PAIR, LIMIT_ACCOUNT, LIMIT_IP = 5, 10, 25

COMMON_PASSWORDS = {
    "password", "password1", "password123", "123456789", "1234567890", "12345678", "qwerty123",
    "qwertyuiop", "letmein123", "welcome123", "admin1234", "admin123", "iloveyou1", "abc123456",
    "demo123", "rescuenet", "rescue123", "ambulance", "chhattisgarh", "bhilai123", "durg12345",
}


def connect() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


# --------------------------------------------------------------------------- passwords
def hash_password(password: str, salt: bytes | None = None, rounds: int = PBKDF2_ROUNDS) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, rounds)
    return f"pbkdf2_sha256${rounds}${salt.hex()}${digest.hex()}"


def _parse(stored: str):
    if stored.startswith("pbkdf2_sha256$"):
        _, rounds, salt_hex, digest_hex = stored.split("$")
        return int(rounds), bytes.fromhex(salt_hex), digest_hex
    salt_hex, digest_hex = stored.split(":", 1)  # legacy v2 format
    return LEGACY_ROUNDS, bytes.fromhex(salt_hex), digest_hex


def verify_password(password: str, stored: str) -> bool:
    try:
        rounds, salt, digest_hex = _parse(stored)
        got = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, rounds).hex()
        return hmac.compare_digest(got, digest_hex)
    except Exception:
        return False


def needs_rehash(stored: str) -> bool:
    try:
        return _parse(stored)[0] < PBKDF2_ROUNDS
    except Exception:
        return True


DUMMY_HASH = hash_password("not-a-real-password-" + secrets.token_hex(4))


def password_problems(pw: str, email: str = "", name: str = "") -> list[str]:
    out = []
    if len(pw) < 10: out.append("at least 10 characters")
    if len(pw) > 128: out.append("no more than 128 characters")
    classes = sum(bool(re.search(p, pw)) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^A-Za-z0-9]"))
    if classes < 3: out.append("3 of: lowercase, UPPERCASE, number, symbol")
    low = pw.lower()
    if low in COMMON_PASSWORDS or any(w in low for w in COMMON_PASSWORDS if len(w) >= 7):
        out.append("not a common password")
    local = email.split("@")[0].lower()
    if len(local) >= 3 and local in low: out.append("must not contain your email name")
    for part in re.split(r"\s+", name.lower()):
        if len(part) >= 4 and part in low:
            out.append("must not contain your name"); break
    return out


def random_strong_password() -> str:
    core = secrets.token_urlsafe(12).replace("-", "x").replace("_", "y")
    return f"{core[:6].upper()}-{core[6:]}-{secrets.randbelow(90) + 10}!"


# --------------------------------------------------------------------------- schema + admin lock
def init_db() -> list[str]:
    """Create tables, lock the admin whitelist, and return console messages."""
    msgs: list[str] = []
    with connect() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','admin')),
            password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER);
        CREATE TABLE IF NOT EXISTS admin_whitelist (email TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL, ip TEXT, ua TEXT);
        CREATE TABLE IF NOT EXISTS hits (key TEXT NOT NULL, ts INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS hits_key ON hits(key, ts);
        CREATE TABLE IF NOT EXISTS image_hashes (
            sha256 TEXT NOT NULL, dhash TEXT NOT NULL, email TEXT, report_id TEXT, created_at INTEGER NOT NULL);
        """)
        try: c.execute("ALTER TABLE users ADD COLUMN last_login INTEGER")
        except sqlite3.OperationalError: pass

        if not c.execute("SELECT 1 FROM admin_whitelist LIMIT 1").fetchone():
            raw = os.getenv("RESCUENET_ADMIN_EMAILS", DEFAULT_ADMINS)
            emails = list(dict.fromkeys(x.strip().lower() for x in raw.split(",") if "@" in x))[:MAX_ADMINS]
            if not emails: raise RuntimeError("Set RESCUENET_ADMIN_EMAILS to at least one admin address.")
            for em in emails: c.execute("INSERT INTO admin_whitelist VALUES (?)", (em,))
            msgs.append(f"Admin whitelist created and LOCKED: {', '.join(emails)}")

        # Locking triggers (idempotent). After this, admins cannot be added, removed or re-roled.
        c.executescript("""
        CREATE TRIGGER IF NOT EXISTS wl_no_insert BEFORE INSERT ON admin_whitelist
            WHEN (SELECT COUNT(*) FROM admin_whitelist) > 0 BEGIN SELECT RAISE(ABORT,'admin whitelist is locked'); END;
        CREATE TRIGGER IF NOT EXISTS wl_no_update BEFORE UPDATE ON admin_whitelist BEGIN SELECT RAISE(ABORT,'admin whitelist is locked'); END;
        CREATE TRIGGER IF NOT EXISTS wl_no_delete BEFORE DELETE ON admin_whitelist BEGIN SELECT RAISE(ABORT,'admin whitelist is locked'); END;
        CREATE TRIGGER IF NOT EXISTS users_admin_only_whitelisted BEFORE INSERT ON users
            WHEN NEW.role='admin' AND NEW.email NOT IN (SELECT email FROM admin_whitelist)
            BEGIN SELECT RAISE(ABORT,'admin role is restricted'); END;
        CREATE TRIGGER IF NOT EXISTS users_whitelist_email_is_admin BEFORE INSERT ON users
            WHEN NEW.role='user' AND NEW.email IN (SELECT email FROM admin_whitelist)
            BEGIN SELECT RAISE(ABORT,'this address is reserved for an administrator'); END;
        CREATE TRIGGER IF NOT EXISTS users_role_immutable BEFORE UPDATE OF role, email ON users
            BEGIN SELECT RAISE(ABORT,'role and email cannot be changed'); END;
        CREATE TRIGGER IF NOT EXISTS users_admin_undeletable BEFORE DELETE ON users
            WHEN OLD.role='admin' BEGIN SELECT RAISE(ABORT,'admin accounts cannot be deleted'); END;
        """)

        # Retire the old published demo passwords from earlier versions.
        for row in c.execute("SELECT email, role, password_hash FROM users WHERE email IN (?,?)",
                             ("user@rescuenet.demo", "admin@rescuenet.demo")).fetchall():
            if verify_password("demo123", row["password_hash"]):
                if row["role"] == "admin":
                    c.execute("UPDATE users SET password_hash=? WHERE email=?",
                              (hash_password(_new_admin_password(row["email"], msgs)), row["email"]))
                    c.execute("DELETE FROM sessions WHERE email=?", (row["email"],))
                else:
                    c.execute("DELETE FROM users WHERE email=?", (row["email"],))
                    msgs.append(f"Removed legacy demo user {row['email']} (default password).")

        # Create any whitelisted admin that does not exist yet, with a strong generated password.
        for (em,) in c.execute("SELECT email FROM admin_whitelist").fetchall():
            if not c.execute("SELECT 1 FROM users WHERE email=?", (em,)).fetchone():
                nm = "Administrator" if em.startswith("admin") else em.split("@")[0].replace(".", " ").title()
                c.execute("INSERT INTO users (email,name,role,password_hash,created_at) VALUES (?,?,'admin',?,?)",
                          (em, nm, hash_password(_new_admin_password(em, msgs)), int(time.time())))
        c.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
    return msgs


def _new_admin_password(email: str, msgs: list[str]) -> str:
    pw = os.getenv("RESCUENET_ADMIN_PASSWORD", "").strip()
    if pw and not password_problems(pw, email):
        msgs.append(f"Admin {email}: password taken from RESCUENET_ADMIN_PASSWORD.")
        return pw
    pw = random_strong_password()
    path = ROOT / "ADMIN_CREDENTIALS.txt"
    with open(path, "a", encoding="utf-8") as f: f.write(f"{email}  {pw}\n")
    try: os.chmod(path, 0o600)
    except OSError: pass
    msgs.append(f"Admin {email}: generated password saved to {path.name} (change it after first sign-in).")
    return pw


# --------------------------------------------------------------------------- rate limiting
def client_ip(request: Request) -> str:
    if os.getenv("RESCUENET_TRUST_PROXY") == "1":
        fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if fwd: return fwd
    return request.client.host if request.client else "unknown"


def _count(c, key: str, window: int):
    t = int(time.time())
    row = c.execute("SELECT COUNT(*) n, MIN(ts) first FROM hits WHERE key=? AND ts>?", (key, t - window)).fetchone()
    return row["n"], (row["first"] + window - t) if row["first"] else 0


def hit(c, key: str):
    # Commit immediately: callers usually raise an HTTPException right after, and the connection
    # context manager would otherwise roll this record back and defeat the rate limit.
    c.execute("INSERT INTO hits VALUES (?,?)", (key, int(time.time())))
    c.commit()


def too_many(retry: int, what: str = "attempts"):
    retry = max(1, retry)
    raise HTTPException(429, f"Too many {what}. Try again in {max(1, round(retry / 60))} min.",
                        headers={"Retry-After": str(retry)})


def limit_api(c, key: str, limit: int, window: int, what="requests"):
    n, retry = _count(c, key, window)
    if n >= limit: too_many(retry, what)
    hit(c, key)


def check_login_allowed(c, ip: str, email: str):
    c.execute("DELETE FROM hits WHERE ts < ?", (int(time.time()) - 86400,))
    for key, lim in ((f"lp:{ip}:{email}", LIMIT_PAIR), (f"la:{email}", LIMIT_ACCOUNT), (f"li:{ip}", LIMIT_IP)):
        n, retry = _count(c, key, LOGIN_WINDOW)
        if n >= lim: too_many(retry, "failed sign-in attempts")


def record_login_failure(c, ip: str, email: str):
    for key in (f"lp:{ip}:{email}", f"la:{email}", f"li:{ip}"): hit(c, key)


def clear_login_failures(c, ip: str, email: str):
    c.execute("DELETE FROM hits WHERE key=?", (f"lp:{ip}:{email}",))


# --------------------------------------------------------------------------- sessions
def _h(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def is_https(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https" \
        or os.getenv("RESCUENET_COOKIE_SECURE") == "1"


def start_session(c, response: Response, request: Request, email: str):
    token = secrets.token_urlsafe(32)
    t = int(time.time())
    c.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?)",
              (_h(token), email, t, t + SESSION_SECONDS, client_ip(request), request.headers.get("user-agent", "")[:200]))
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, samesite="strict",
                        secure=is_https(request), path="/")


def end_session(request: Request, response: Response, everywhere_for: str | None = None):
    token = request.cookies.get(COOKIE)
    with connect() as c:
        if everywhere_for: c.execute("DELETE FROM sessions WHERE email=?", (everywhere_for,))
        elif token: c.execute("DELETE FROM sessions WHERE token_hash=?", (_h(token),))
    response.delete_cookie(COOKIE, path="/")


def current_user(request: Request):
    token = request.cookies.get(COOKIE)
    if not token: return None
    with connect() as c:
        row = c.execute("""SELECT u.email,u.name,u.role FROM sessions s JOIN users u ON u.email=s.email
                           WHERE s.token_hash=? AND s.expires_at>?""", (_h(token), int(time.time()))).fetchone()
    return dict(row) if row else None


def require_user(request: Request):
    u = current_user(request)
    if not u: raise HTTPException(401, "Please sign in.")
    return u


def require_admin(request: Request):
    u = require_user(request)
    if u["role"] != "admin": raise HTTPException(403, "Administrator access required.")
    return u
