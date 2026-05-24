# Repod RPM — Community Edition

[![CI](https://github.com/getautoflow/repod-rpm-community/actions/workflows/ci.yml/badge.svg)](https://github.com/getautoflow/repod-rpm-community/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/orgs/getautoflow/packages)

A self-hosted private RPM repository manager for AlmaLinux, Rocky Linux, CentOS Stream, Oracle Linux, Fedora and openSUSE.

**Supported distributions:** AlmaLinux 8/9 · Rocky Linux 8/9 · CentOS Stream 9 · Oracle Linux 8 · Fedora 42 · openSUSE Leap 15.6 · openSUSE Tumbleweed

---

## Features

| Feature | Community | Enterprise |
|---------|:---------:|:----------:|
| RPM upload + validation | ✅ | ✅ |
| ClamAV antivirus scan | ✅ | ✅ |
| GPG signing (repomd.xml.asc) | ✅ | ✅ |
| 9 RPM distributions | ✅ | ✅ |
| Local user management | ✅ | ✅ |
| API tokens (CI/CD) | ✅ | ✅ |
| Audit log | ✅ | ✅ |
| Web dashboard | ✅ | ✅ |
| Prometheus metrics | ✅ | ✅ |
| CVE/CVSS scanning (Grype) | — | ✅ |
| EPSS exploit-probability | — | ✅ |
| CISA KEV cross-reference | — | ✅ |
| CISO approval queue | — | ✅ |
| LDAP / Active Directory | — | ✅ |
| OIDC / SSO | — | ✅ |
| MFA / TOTP | — | ✅ |
| SBOM (SPDX 2.3, CycloneDX 1.5) | — | ✅ |
| SARIF 2.1.0 export | — | ✅ |
| NIS2 Article 21 compliance | — | ✅ |

👉 **[Upgrade to Enterprise](https://repod.getautoflow.dev/#demo)**

---

## Quick start

### Prerequisites
- Docker ≥ 24 and Docker Compose v2

### 1. Configure

```bash
cp .env.example .env
cp backend.env.example backend.env
```

Edit `backend.env`:
- `JWT_SECRET_KEY` — generate with `openssl rand -hex 32`
- `ADMIN_PASSWORD_HASH` — generate with `python3 -c "from passlib.hash import bcrypt; print(bcrypt.hash('YourPassword!'))"`  
  Then replace each `$` with `$$` in the value.

### 2. Start

```bash
docker compose up -d
```

Services:
- **Frontend** → http://localhost:3103
- **Backend API** → http://localhost:8100/docs (development mode only)
- **RPM repo** → http://localhost:8180

### 3. First login — default credentials

| Username | Password   |
|----------|------------|
| `admin`  | `Admin1234` |

> ⚠️ Change the password immediately after your first login, either from the **web UI** (Profile → Change password) or via the API (`POST /auth/change-password`).  
> To set a custom password before first start, update `ADMIN_PASSWORD_HASH` in `backend.env` (see above).

### 4. Add a repository to a client

```bash
# AlmaLinux 9 example
cat > /etc/yum.repos.d/repod.repo << EOF
[repod]
name=Repod Private Repository
baseurl=http://YOUR_HOST:8180/repos/almalinux9/x86_64/
enabled=1
gpgcheck=1
gpgkey=http://YOUR_HOST:8180/repos/gnupg/repo.asc
EOF

dnf makecache
```

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/upload/` | Upload an RPM package |
| `GET`  | `/api/v1/packages/` | List all packages |
| `GET`  | `/api/v1/distributions/` | List distributions |
| `GET`  | `/health` | Health check |
| `GET`  | `/metrics` | Prometheus metrics |

Full API documentation available at `/docs` in development mode (`ENV=development`).

---

## License

Apache License 2.0. See [LICENSE](LICENSE).

---

## Enterprise Edition

Need CVE scanning, CISA KEV enrichment, LDAP/AD, OIDC/SSO, NIS2 compliance, or SBOM export?  
→ **[repod.getautoflow.dev](https://repod.getautoflow.dev)**
