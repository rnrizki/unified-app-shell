# Web Container dan Unified App Shell

Implementasi arsitektur portal terpadu berbasis **Unified App Shell (Web Container)** yang dipadukan dengan **Reverse Proxy** dan **Centralized SSO (Keycloak)** sesuai dokumen arsitektur *"Web Container dan Unified App Shell"* oleh Doni Ramdhani.

Arsitektur ini menggabungkan navigasi, autentikasi, dan pertukaran data dalam satu portal utama tanpa mengharuskan penulisan ulang aplikasi yang sudah berjalan.

---

## 🏛️ Pembagian 4 Lapisan Arsitektur

```
+-----------------------------------------------------------------------------------+
|                            TIER 1: CLIENT & EDGE LAYER                            |
|  [ User Browser ]  <--- HTTPS/TLS --->  [ Edge Reverse Proxy (Traefik / Nginx) ]   |
|                                         - SSL/TLS Termination                     |
|                                         - CSP & Frame-Ancestors Security Headers  |
|                                         - Subpath Routing (/edu, /ops)            |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        TIER 2: CONTAINER & IDENTITY LAYER                         |
|  [ App Shell Container ]                 [ Centralized SSO & Auth Bridge ]        |
|  - Vanilla JS Bundle (< 20 KB)           - Keycloak Realm: portal-enterprise      |
|  - Topbar & App Switcher                 - OIDC / JWT RS256 Verification          |
|  - Global Search & Notifications         - Shared Root Cookie: .lmrei.id          |
|  - Light / Dark Theme Switcher           - URL: https://user-shell-login.lmrei.id |
|  - URL: https://user-shell-app.lmrei.id                                           |
|                                                                                   |
|  <-------------------- Cross-App Event Bus (postMessage) ---------------------->  |
|  - Strict Origin Whitelist Validation (app-registry.json)                         |
|  - Theme Synchronization, Badge Counters, Deep Linking                            |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                            TIER 3: MANAGED APPLICATIONS                           |
|  - portal-edukasi (Learning Platform)    --> Mode: Smart Iframe + Event Bus       |
|  - internal-ops (Operations & Task Hub)  --> Mode: Reverse-Proxy Subpath (/ops)   |
|  - REIDIG Ecosystem (Dashboard, APK, API)--> Mode: Smart Iframe Bridge            |
+-----------------------------------------------------------------------------------+
```

---

## 🚀 Fitur Utama & Kepatuhan Arsitektur

1. **Lightweight Bundle (< 30 KB)**:
   App Shell diimplementasikan menggunakan **Vanilla JS & Modern CSS** murni tanpa framework besar (React/Vue/Angular) untuk mencegah konflik DOM dan isolasi gaya optimal. Total bundle yang ditransfer di bawah **20 KB**.

2. **Declarative Application Registry (`app-registry.json`)**:
   Katalog aplikasi terdaftar secara deklaratif tanpa mengubah kode inti kerangka utama. Mendukung filtering berbasis peran (**RBAC**) dengan atribut `requiredRoles`.

3. **Smart Iframe + Event Bus Bridge**:
   Isolasi gaya dan skrip tingkat tinggi dengan atribut sandbox:
   `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"`
   Komunikasi bidirectional menggunakan `window.postMessage` dengan verifikasi `origin` yang ketat.

4. **Centralized SSO & OIDC Keycloak Realm**:
   - **Realm Keycloak**: `portal-enterprise`
   - **Client ID**: `user-shell`
   - **Domain Cookie**: `.lmrei.id` (Shared Root Domain Cookie)
   - **Format Token**: OIDC / JWT RS256

---

## 👥 Pengguna Uji Coba OIDC (Test Users)

Semua pengguna telah dikonfigurasi di Keycloak realm `portal-enterprise` dengan password default:

| Username / Email | Nama Lengkap | Peran (Roles) | Skenario Akses |
|---|---|---|---|
| `hanif1@lmrei.id` | Hanif Pratama | `member` | Akses modul standar (Learning Platform, APK) |
| `doni2@lmrei.id` | Doni Ramdhani | `admin`, `member` | Akses penuh seluruh modul dan sistem |
| `rizki3@lmrei.id` | Rizki N | `admin`, `staff`, `member` | Akses operasional dan administrasi |
| `andri4@lmrei.id` | Andri Setiawan | `staff`, `member` | Akses modul operasional internal (`/ops`) |

> **Password default**: `PortalLmrei2026!`

---

## 🌐 Endpoint Layanan

- **Unified App Shell (Web Container)**: [https://user-shell-app.lmrei.id](https://user-shell-app.lmrei.id)
- **Centralized SSO Login Bridge**: [https://user-shell-login.lmrei.id](https://user-shell-login.lmrei.id)
- **Keycloak IAM**: [https://keycloak.lmrei.id](https://keycloak.lmrei.id)
- **Dokploy Panel**: [https://aws.lmrei.id](https://aws.lmrei.id)

---

## 📋 Manifes Registri Aplikasi (`app-registry.json`)

```json
{
  "containerVersion": "1.0.0",
  "apps": [
    {
      "id": "portal-edukasi",
      "name": "Learning Platform",
      "entryUrl": "/apps/edu/",
      "routePrefix": "/edu",
      "embedMode": "iframe-bridge",
      "allowedOrigins": ["https://user-shell-app.lmrei.id"],
      "requiredRoles": ["member", "admin"],
      "healthCheckEndpoint": "/health"
    },
    {
      "id": "internal-ops",
      "name": "Operations & Task Hub",
      "entryUrl": "/apps/ops/",
      "routePrefix": "/ops",
      "embedMode": "reverse-proxy",
      "allowedOrigins": ["https://user-shell-app.lmrei.id"],
      "requiredRoles": ["staff", "admin"],
      "healthCheckEndpoint": "/health"
    },
    {
      "id": "reidig-dashboard",
      "name": "REIDIG Dashboard",
      "entryUrl": "https://dashboard-reidig-andri.lmrei.id",
      "routePrefix": "/reidig-dashboard",
      "embedMode": "iframe-bridge",
      "allowedOrigins": ["https://dashboard-reidig-andri.lmrei.id"],
      "requiredRoles": ["staff", "admin"],
      "healthCheckEndpoint": "https://dashboard-reidig-andri.lmrei.id"
    },
    {
      "id": "reidig-apk",
      "name": "REIDIG APK Portal",
      "entryUrl": "https://apk-reidig-andri.lmrei.id",
      "routePrefix": "/reidig-apk",
      "embedMode": "iframe-bridge",
      "allowedOrigins": ["https://apk-reidig-andri.lmrei.id"],
      "requiredRoles": ["member", "staff", "admin"],
      "healthCheckEndpoint": "https://apk-reidig-andri.lmrei.id"
    },
    {
      "id": "reidig-api",
      "name": "REIDIG Core API",
      "entryUrl": "https://api-reidig-andri.lmrei.id/docs",
      "routePrefix": "/reidig-api",
      "embedMode": "iframe-bridge",
      "allowedOrigins": ["https://api-reidig-andri.lmrei.id"],
      "requiredRoles": ["admin"],
      "healthCheckEndpoint": "https://api-reidig-andri.lmrei.id"
    }
  ]
}
```

---

## 🛠️ Menjalankan Lokal

```bash
docker compose up -d --build
```
- App Shell: `http://localhost:8085`
- SSO Login: `http://localhost:8086`

---

## 📜 Lisensi
MIT License - Dilindungi untuk ekosistem LMREI Enterprise.
