# Changelog — Repod RPM Community Edition

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [SemVer](https://semver.org/).

---

## [1.0.6] — 2026-05-24

### Changed
- **Configuration** — `.env.example` et `backend.env.example` nettoyés pour la production : toutes les valeurs de test/développement supprimées, ports RPM Community alignés (8180/8100/3103) sans conflit avec APT Community (8280/8200/3203).
- **docker-compose.yaml** — Ports par défaut corrigés (8180/8100/3103), `REACT_APP_API_URL` en mode URLs relatives par défaut, `REPOD_EDITION: community` ajouté aux variables d'environnement du backend.
- **nginx (frontend)** — Le reverse proxy `location /api/ { proxy_pass http://backend:8000; }` (sans trailing slash) est confirmé fonctionnel : toutes les requêtes API transitent par le frontend nginx, éliminant les problèmes de CORS et d'accès depuis une IP distante. Le proxy passe le chemin complet au backend (qui utilise le préfixe `/api/v1`).
- **CVE — politique Community Edition** — Le scan Grype est **informatif uniquement** : `cve_status` est toujours forcé à `"approved"` après le scan, quel que soit le résultat. Aucun paquet ne peut être bloqué ou mis en révision par les CVE en Community. Les résultats restent visibles dans l'inspecteur de paquet. Le blocage et la file de révision RSSI sont des fonctionnalités Enterprise.
- **Upload pipeline** — Suppression de la logique `pending_review` (Enterprise) dans `upload.py` : `manifest_status` est toujours `"validated"`, `createrepo_c` s'exécute systématiquement, le retour est toujours `"accepted"`. Valable pour les deux endpoints (`POST /upload/` JSON et `POST /upload/stream` SSE).
- **Dashboard — overlays Enterprise** — Les panneaux `Révision RSSI`, `Posture CVE` et la stat `Révision RSSI` sont maintenant grisés avec un badge `Enterprise` et une icône cadenas. Ils restent visibles pour montrer ce qui est disponible en Enterprise, mais ne sont pas interactifs.
- **Badge sidebar** — Le badge `Community` (fond coloré) est remplacé par le texte `RPM Repository` sans fond, plus sobre et distinctif.
- **REPO_URL** — La valeur par défaut du fallback `REACT_APP_REPO_URL` est corrigée de `localhost:80` à `localhost:8180` dans le Dockerfile frontend, `ClientSetupPage.js` et `PackageList.js`.
- **Distribution** — L'étoile ★ retirée du sélecteur d'upload (AlmaLinux 8 ne mérite pas de mise en avant particulière).
- **Version** — Frontend et backend mis à jour en `v1.0.6`.
- **README** — Réécriture complète en français : ports RPM (8180/8100/3103), tableau Community vs Enterprise, avertissement explicite sur le scan CVE non bloquant, architecture ASCII, référence API complète, exemples dnf/yum/zypper, procédure de mise à jour.
- **CONTRIBUTING.md** — Nouveau fichier de guide de contribution adapté RPM : scope Community, conventions de code, workflow de PR, portée hors périmètre (fonctionnalités Enterprise uniquement).
- **LICENSE** — Copyright © 2026 NGANDO ARMEL — Getautoflow ajouté en en-tête.

---

## [1.0.5] — 2026-05-24

### Fixed
- **Upload — grands paquets (> ~50 Mo)** — Le workflow de validation n'était pas visible pendant l'upload de gros fichiers (ex : `grafana-9.2.10-17.el8_10.src` à 321 Mo). Cause : `fetch()` ne fournit pas d'événements de progression pendant l'envoi du corps multipart ; nginx bufférisait l'intégralité du corps avant de forwarder au backend, rendant l'interface gelée sans feedback pendant plusieurs minutes. **Fix** : upload en deux phases séparées — phase 1 via `XMLHttpRequest` (barre de progression temps réel avec `upload.onprogress`) vers le nouveau `POST /upload/stage`, phase 2 pipeline SSE via `POST /upload/pipeline/{staging_id}` (corps JSON minuscule → pas de bufferisation). Le workflow SSE s'affiche immédiatement au début de la validation.

---

## [1.0.4] — 2026-05-24

### Changed
- **Import — Sources RPM** — L'icône cadenas (🔒) sur les sources de sécurité (AlmaLinux BaseOS/AppStream, Rocky Linux, Oracle Linux, Fedora Updates, openSUSE Updates…) est remplacée par une icône bouclier pour indiquer clairement qu'il s'agit de sources contenant des avis de sécurité (CVE/ALSA/RLSA), et non de sources désactivées. Un bandeau d'information confirme que toutes les sources sont actives et synchronisables sans passer par les Paramètres.

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
