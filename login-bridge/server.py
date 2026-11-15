import os
import json
import base64
import urllib.request
import urllib.parse
from typing import Optional
from fastapi import FastAPI, Request, Response, Form
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

KEYCLOAK_INTERNAL_URL = os.getenv("KEYCLOAK_INTERNAL_URL", "http://mail-keycloak-wr0ust:8080")
KEYCLOAK_PUBLIC_URL = os.getenv("KEYCLOAK_PUBLIC_URL", "https://keycloak.lmrei.id")
REALM_NAME = os.getenv("REALM_NAME", "portal-enterprise")
CLIENT_ID = os.getenv("CLIENT_ID", "user-shell")
APP_SHELL_URL = os.getenv("APP_SHELL_URL", "https://user-shell-app.lmrei.id")
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", ".lmrei.id")

app = FastAPI(title="LMREI SSO Auth Bridge", version="1.0.0")

# Mount templates and static
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

def decode_jwt_unverified(token: str) -> dict:
    try:
        parts = token.split(".")
        if len(parts) >= 2:
            padded = parts[1] + "=" * (-len(parts[1]) % 4)
            return json.loads(base64.urlsafe_b64decode(padded).decode())
    except Exception as e:
        print("Error decoding unverified token:", e)
    return {}

def exchange_credentials_with_keycloak(username, password):
    url = f"{KEYCLOAK_INTERNAL_URL}/realms/{REALM_NAME}/protocol/openid-connect/token"
    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "grant_type": "password",
        "username": username,
        "password": password,
        "scope": "openid profile email"
    }).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"Keycloak token error {e.code}: {err}")
        try:
            return json.loads(err)
        except Exception:
            return {"error": "auth_error", "error_description": err}
    except Exception as e:
        # Fallback to public URL if internal container hostname not resolvable
        try:
            fallback_url = f"{KEYCLOAK_PUBLIC_URL}/realms/{REALM_NAME}/protocol/openid-connect/token"
            req2 = urllib.request.Request(fallback_url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req2, timeout=10) as resp:
                return json.loads(resp.read().decode())
        except Exception as e2:
            return {"error": "network_error", "error_description": str(e2)}

@app.get("/health")
@app.head("/health")
def health():
    return {
        "status": "UP",
        "realm": REALM_NAME,
        "service": "user-shell-login",
        "keycloak_url": KEYCLOAK_PUBLIC_URL
    }

@app.get("/", response_class=HTMLResponse)
@app.head("/")
async def login_page(request: Request):
    user_cookie = request.cookies.get("portal_user")
    current_user = None
    if user_cookie:
        try:
            current_user = json.loads(urllib.parse.unquote(user_cookie))
        except Exception:
            pass

    return templates.TemplateResponse("login.html", {
        "request": request,
        "current_user": current_user,
        "app_shell_url": APP_SHELL_URL,
        "realm": REALM_NAME,
        "keycloak_public_url": KEYCLOAK_PUBLIC_URL
    })

@app.post("/api/auth/login")
async def do_login(response: Response, request: Request):
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            body = await request.json()
            username = body.get("email") or body.get("username")
            password = body.get("password")
        else:
            form = await request.form()
            username = form.get("email") or form.get("username")
            password = form.get("password")

        if not username or not password:
            return JSONResponse(status_code=400, content={"error": "Username and password required"})

        token_res = exchange_credentials_with_keycloak(username, password)
        if "access_token" not in token_res:
            desc = token_res.get("error_description", "Invalid username or password")
            return JSONResponse(status_code=401, content={"error": "unauthorized", "message": desc})

        access_token = token_res["access_token"]
        id_token = token_res.get("id_token", "")
        refresh_token = token_res.get("refresh_token", "")
        
        claims = decode_jwt_unverified(access_token)
        roles = claims.get("realm_access", {}).get("roles", [])
        clean_roles = [r for r in roles if not r.startswith("default-roles-") and r not in ["offline_access", "uma_authorization"]]

        user_info = {
            "sub": claims.get("sub"),
            "email": claims.get("email") or username,
            "name": claims.get("name") or username.split("@")[0],
            "roles": clean_roles,
            "exp": claims.get("exp")
        }

        # Set shared root domain cookie for .lmrei.id
        cookie_domain_to_use = COOKIE_DOMAIN if "lmrei.id" in request.headers.get("host", "") else None
        
        res = JSONResponse(content={
            "success": True,
            "user": user_info,
            "redirectUrl": APP_SHELL_URL
        })

        # Set cookies on response
        serialized_user = urllib.parse.quote(json.dumps(user_info))
        max_age = token_res.get("expires_in", 3600)

        # 1. Access token cookie (SameSite Lax, Secure for HTTPS)
        res.set_cookie(
            key="portal_session",
            value=access_token,
            max_age=max_age,
            domain=cookie_domain_to_use,
            path="/",
            samesite="lax",
            secure=True,
            httponly=False
        )
        # 2. User info cookie
        res.set_cookie(
            key="portal_user",
            value=serialized_user,
            max_age=max_age,
            domain=cookie_domain_to_use,
            path="/",
            samesite="lax",
            secure=True,
            httponly=False
        )
        if id_token:
            res.set_cookie(
                key="portal_id_token",
                value=id_token,
                max_age=max_age,
                domain=cookie_domain_to_use,
                path="/",
                samesite="lax",
                secure=True,
                httponly=False
            )

        return res

    except Exception as e:
        print("Login handler error:", e)
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/auth/session")
async def get_session(request: Request):
    user_cookie = request.cookies.get("portal_user")
    token_cookie = request.cookies.get("portal_session")
    auth_header = request.headers.get("Authorization", "")
    token = None

    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    elif token_cookie:
        token = token_cookie

    if not token and not user_cookie:
        return JSONResponse(status_code=401, content={"authenticated": False, "user": None})

    if token:
        claims = decode_jwt_unverified(token)
        if claims:
            roles = claims.get("realm_access", {}).get("roles", [])
            clean_roles = [r for r in roles if not r.startswith("default-roles-") and r not in ["offline_access", "uma_authorization"]]
            return {
                "authenticated": True,
                "user": {
                    "sub": claims.get("sub"),
                    "email": claims.get("email"),
                    "name": claims.get("name") or (claims.get("email") or "").split("@")[0],
                    "roles": clean_roles,
                    "exp": claims.get("exp")
                }
            }

    if user_cookie:
        try:
            user_data = json.loads(urllib.parse.unquote(user_cookie))
            return {"authenticated": True, "user": user_data}
        except Exception:
            pass

    return JSONResponse(status_code=401, content={"authenticated": False, "user": None})

@app.get("/api/auth/logout")
@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    cookie_domain_to_use = COOKIE_DOMAIN if "lmrei.id" in request.headers.get("host", "") else None
    res = RedirectResponse(url="/", status_code=303)
    res.delete_cookie(key="portal_session", domain=cookie_domain_to_use, path="/")
    res.delete_cookie(key="portal_user", domain=cookie_domain_to_use, path="/")
    res.delete_cookie(key="portal_id_token", domain=cookie_domain_to_use, path="/")
    return res

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
