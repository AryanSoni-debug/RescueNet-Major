from __future__ import annotations
import os, sqlite3, time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

# Load .env (simple KEY=VALUE lines) before importing modules that read the environment.
_env = Path(__file__).resolve().parents[1] / ".env"
if _env.exists():
    for _l in _env.read_text(encoding="utf-8").splitlines():
        _l = _l.strip()
        if _l and not _l.startswith("#") and "=" in _l:
            _k, _v = _l.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

from fastapi import FastAPI, HTTPException, Request, Response, UploadFile, File, Form, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from . import security as sec
from . import ai_verify, assistant

ROOT = sec.ROOT


@asynccontextmanager
async def lifespan(app: FastAPI):
    for m in sec.init_db(): print("[RescueNet]", m, flush=True)
    yield


DEBUG = os.getenv("RESCUENET_DEBUG") == "1"
app = FastAPI(title="RescueNet API", version="3.0", lifespan=lifespan,
              docs_url="/docs" if DEBUG else None, redoc_url=None, openapi_url="/openapi.json" if DEBUG else None)
for d in ("css", "js", "icons"):
    app.mount(f"/{d}", StaticFiles(directory=ROOT / d), name=d)

CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
       "font-src https://fonts.gstatic.com; "
       "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://cdnjs.cloudflare.com; "
       "connect-src 'self' https://router.project-osrm.org https://nominatim.openstreetmap.org; "
       "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")


@app.middleware("http")
async def guard(request: Request, call_next):
    # CSRF defence in depth: SameSite=Strict cookie + same-origin check + required custom header.
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        if origin and urlparse(origin).netloc != request.headers.get("host"):
            return JSONResponse({"detail": "Cross-site request blocked."}, status_code=403)
        if request.headers.get("x-requested-with") != "RescueNet":
            return JSONResponse({"detail": "Missing request header."}, status_code=403)
    resp = await call_next(request)
    resp.headers.update({
        "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin", "Cross-Origin-Opener-Policy": "same-origin",
        "Permissions-Policy": "geolocation=(self), camera=(self), microphone=(), payment=()",
    })
    if request.url.path.startswith("/api/"): resp.headers["Cache-Control"] = "no-store"
    if sec.is_https(request): resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return resp


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(x) for x in first.get("loc", []) if x not in ("body", "query"))
    msg = first.get("msg", "Invalid input").replace("Value error, ", "")
    return JSONResponse({"detail": f"{field}: {msg}" if field else msg}, status_code=422)


# ----------------------------------------------------------------------------- pages
@app.get("/")
def home(): return FileResponse(ROOT / "index.html", headers={"Cache-Control": "no-cache"})
@app.get("/manifest.webmanifest")
def manifest(): return FileResponse(ROOT / "manifest.webmanifest", media_type="application/manifest+json")
@app.get("/sw.js")
def service_worker(): return FileResponse(ROOT / "sw.js", media_type="application/javascript", headers={"Cache-Control": "no-cache"})
@app.get("/data/firstaid.json")
def firstaid(): return FileResponse(ROOT / "data" / "firstaid.json", media_type="application/json")
@app.get("/api/health")
def health(): return {"status": "ok", "service": "RescueNet API"}


# ----------------------------------------------------------------------------- auth
class LoginBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class RegisterBody(BaseModel):
    # extra="forbid": a request that tries to smuggle in {"role": "admin"} is rejected outright.
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=128)


def public(u): return {"email": u["email"], "name": u["name"], "role": u["role"]}


@app.post("/api/auth/login")
def login(body: LoginBody, request: Request, response: Response):
    email, ip = body.email.lower(), sec.client_ip(request)
    with sec.connect() as c:
        sec.check_login_allowed(c, ip, email)
        row = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        ok = sec.verify_password(body.password, row["password_hash"] if row else sec.DUMMY_HASH)  # same cost either way
        if not row or not ok:
            sec.record_login_failure(c, ip, email)
            raise HTTPException(401, "Email or password is incorrect.")
        sec.clear_login_failures(c, ip, email)
        if sec.needs_rehash(row["password_hash"]):
            c.execute("UPDATE users SET password_hash=? WHERE email=?", (sec.hash_password(body.password), email))
        c.execute("UPDATE users SET last_login=? WHERE email=?", (int(time.time()), email))
        sec.start_session(c, response, request, email)
    return public(row)


@app.post("/api/auth/register", status_code=201)
def register(body: RegisterBody, request: Request, response: Response):
    email, name = body.email.lower(), " ".join(body.name.split())
    with sec.connect() as c:
        regkey = f"reg:{sec.client_ip(request)}"
        n, retry = sec._count(c, regkey, 3600)
        if n >= 8: sec.too_many(retry, "sign-up attempts")
        problems = sec.password_problems(body.password, email, name)
        if problems: raise HTTPException(422, "Password needs: " + "; ".join(problems) + ".")
        sec.hit(c, regkey)  # only well-formed attempts count; typos against the password rules are free
        try:  # role is hard-coded; admin-reserved addresses are refused by a database trigger.
            c.execute("INSERT INTO users (email,name,role,password_hash,created_at,last_login) VALUES (?,?,'user',?,?,?)",
                      (email, name, sec.hash_password(body.password), int(time.time()), int(time.time())))
        except sqlite3.IntegrityError as ex:
            if "reserved" in str(ex): raise HTTPException(403, "That email address cannot be used to create an account.")
            raise HTTPException(409, "An account with this email already exists.")
        sec.start_session(c, response, request, email)
    return {"email": email, "name": name, "role": "user"}


@app.get("/api/auth/me")
def me(user=Depends(sec.require_user)): return public(user)


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    sec.end_session(request, response); return {"ok": True}


@app.post("/api/auth/change-password")
def change_password(body: ChangePasswordBody, request: Request, response: Response, user=Depends(sec.require_user)):
    with sec.connect() as c:
        sec.limit_api(c, f"pw:{user['email']}", 5, 900, "password change attempts")
        row = c.execute("SELECT password_hash FROM users WHERE email=?", (user["email"],)).fetchone()
        if not sec.verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(401, "Current password is incorrect.")
        problems = sec.password_problems(body.new_password, user["email"], user["name"])
        if problems: raise HTTPException(422, "Password needs: " + "; ".join(problems) + ".")
        if body.new_password == body.current_password: raise HTTPException(422, "Choose a different password.")
        c.execute("UPDATE users SET password_hash=? WHERE email=?", (sec.hash_password(body.new_password), user["email"]))
        c.execute("DELETE FROM sessions WHERE email=?", (user["email"],))   # sign out every device
        sec.start_session(c, response, request, user["email"])              # keep this one signed in
    return {"ok": True, "message": "Password changed. Other devices were signed out."}


@app.post("/api/auth/logout-all")
def logout_all(request: Request, response: Response, user=Depends(sec.require_user)):
    sec.end_session(request, response, everywhere_for=user["email"]); return {"ok": True}


# ----------------------------------------------------------------------------- admin (server-enforced)
@app.get("/api/admin/users")
def admin_users(admin=Depends(sec.require_admin)):
    with sec.connect() as c:
        users = [dict(r) for r in c.execute(
            "SELECT email,name,role,created_at,last_login FROM users ORDER BY role, created_at DESC LIMIT 500")]
        wl = [r["email"] for r in c.execute("SELECT email FROM admin_whitelist ORDER BY email")]
    return {"users": users, "admin_whitelist": wl, "locked": True}


@app.post("/api/admin/reset-image-hashes")
def reset_hashes(admin=Depends(sec.require_admin)):
    with sec.connect() as c: c.execute("DELETE FROM image_hashes")
    return {"ok": True}


# ----------------------------------------------------------------------------- AI
@app.post("/api/ai/verify-image")
def verify_image(file: UploadFile = File(...), report_id: str | None = Form(None),
                 lat: float | None = Form(None), lon: float | None = Form(None), user=Depends(sec.require_user)):
    data = file.file.read(ai_verify.MAX_BYTES + 1)
    if len(data) > ai_verify.MAX_BYTES: raise HTTPException(413, "Image is larger than 5 MB.")
    if not data: raise HTTPException(400, "Empty file.")
    mime = ai_verify.sniff(data)  # real type from magic bytes; the client-sent type is not trusted
    if not mime: raise HTTPException(415, "File is not a valid JPG, PNG or WebP image.")
    if report_id and len(report_id) > 24: report_id = report_id[:24]
    with sec.connect() as c:
        sec.limit_api(c, f"img:{user['email']}", 20, 600, "photo checks")
        return ai_verify.verify(data, mime, c, user["email"], report_id, lat, lon)


class Turn(BaseModel):
    role: str = Field(max_length=10)
    text: str = Field(max_length=400)


class AskBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message: str = Field(min_length=1, max_length=400)
    context: dict = {}
    history: list[Turn] = Field(default_factory=list, max_length=8)


@app.post("/api/ai/assistant")
def ask(body: AskBody, user=Depends(sec.require_user)):
    with sec.connect() as c: sec.limit_api(c, f"ask:{user['email']}", 40, 600, "assistant messages")
    ctx = {k: str(v)[:60] for k, v in (body.context or {}).items() if k in ("type", "injured", "severity", "eta")}
    return assistant.answer(body.message, ctx, [t.model_dump() for t in body.history])
