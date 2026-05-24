# Changelog — Repod RPM Community Edition

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [SemVer](https://semver.org/).

---

## [1.0.3] — 2026-05-24

### Added
- **CVE display in packages** — `GET /security/packages/{name}/{version}/cve` now returns Grype scan results stored in the manifest (scanned at import time). CVE tab in the package inspector shows vulnerability list, severity badges, CVSS scores, and fix versions. EPSS enrichment, CISA KEV cross-reference and CISO review queue remain Enterprise-gated.

### Changed
- **Upload pipeline — progressive streaming** — Each validation step (Format .rpm, SHA-256, ClamAV, CVE/Grype, GPG, Dependencies) now emits a `running` event immediately when it starts and a `done/error/warn` event when it finishes. The pipeline was previously blocking — all sub-steps appeared at once after the full validation completed. Steps now appear one by one in real time.

---

## [1.0.2] — 2026-05-24

### Changed
- **Security pipeline** — CVE/Grype scan added as step 6 in the import pipeline UI. Results and CISO review queue remain Enterprise-gated; the step is visible in Community to show the scan is performed.

---

## [1.0.1] — 2026-05-24

### Changed
- **Frontend** — Enterprise features (Audit, SBOM, Download stats, SSO/OIDC, Settings, CVE scanning) are now properly gated behind an `EnterpriseGate` component, matching the APT Community Edition layout
- **Sidebar** — Community badge, lock icons on enterprise nav items, upgrade strip and "Passer à Enterprise" CTA
- **Default credentials** — `backend.env.example` now ships a valid bcrypt hash for `Admin1234` so first-deploy works out of the box

---

## [1.0.0] — 2026-05-24

### Added
- **RPM repository hosting** — AlmaLinux 8/9, Rocky Linux 8/9, CentOS Stream 9, Oracle Linux 8, Fedora 42, openSUSE Leap 15.6, openSUSE Tumbleweed (9 distributions)
- **Multi-architecture support** — x86_64, aarch64, noarch, i686
- **Package upload** — REST API (`POST /upload/`) and drag-and-drop web UI; `.rpm` validated with `rpm -qip` before acceptance
- **Antivirus scan** — ClamAV on every uploaded package; quarantine on positive detection
- **GPG auto-signing** — detached signature on `repomd.xml.asc`; key generated on first start
- **Local user management** — admin, maintainer, developer, viewer, readonly roles with bcrypt passwords
- **API tokens** — long-lived tokens for CI/CD pipelines (no password rotation needed)
- **Audit log** — append-only JSONL log; JSON and CSV export
- **Package index** — full-text search, filtering by distribution and architecture
- **Import** — batch import from local directory or remote URL
- **Web dashboard** — React + Tailwind; package table, KPI cards, distribution overview
- **Health endpoints** — `/health`, `/health/live`, `/health/ready` (no auth required)
- **Prometheus metrics** — `/metrics` endpoint for Grafana/Prometheus scraping

### Enterprise features (not included — upgrade at repod.getautoflow.dev)
- CVE/CVSS scanning with Grype
- EPSS exploit-probability scores (FIRST.org)
- CISA KEV cross-reference (Known Exploited Vulnerabilities)
- CISO approval queue (dual-control workflow)
- RBAC with per-distribution scoping
- LDAP / Active Directory integration
- OIDC / SSO (OpenID Connect with PKCE)
- MFA / TOTP
- SBOM export (SPDX 2.3, CycloneDX 1.5)
- SARIF 2.1.0 export (GitHub Code Scanning, SonarQube)
- NIS2 Article 21 compliance mode
- Email & webhook notifications
- SLA enforcement on CVE decisions

---

<!-- next release notes go above this line -->
