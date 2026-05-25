<p align="center">
  <img src="logo.png" alt="Repod" width="80" />
</p>

<h1 align="center">Repod — RPM Community Edition</h1>

[![Version](https://img.shields.io/badge/version-1.0.6-0F2A50)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/getautoflow/Repod-rpm-community/actions/workflows/ci.yml/badge.svg)](https://github.com/getautoflow/Repod-rpm-community/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker&logoColor=white)](docker-compose.yaml)
[![Docs](https://img.shields.io/badge/docs-docs.repod.getautoflow.dev-4F46E5)](https://docs.repod.getautoflow.dev)

Repod est un gestionnaire de dépôts RPM auto-hébergé, conçu pour les équipes DevSecOps qui distribuent des paquets RPM en interne.  
Il intègre un antivirus ClamAV sur chaque import, une signature GPG automatique des métadonnées (`repomd.xml.asc`), un scan de vulnérabilités CVE via Grype, et un tableau de bord web complet pour administrer distributions, utilisateurs et paquets.  
Il s'exécute entièrement sur votre infrastructure via Docker Compose — sans dépendance cloud, sans télémétrie.

**Distributions RPM supportées :** AlmaLinux 8/9 · Rocky Linux 8/9 · CentOS Stream 9 · Oracle Linux 8 · Fedora · openSUSE Leap 15.6 · openSUSE Tumbleweed

---

## Table des matières

1. [Fonctionnalités](#fonctionnalités)
2. [Prérequis](#prérequis)
3. [Contre-indications et erreurs fréquentes](#contre-indications-et-erreurs-fréquentes)
4. [Installation rapide](#installation-rapide)
5. [Configuration détaillée](#configuration-détaillée)
6. [Architecture](#architecture)
7. [Génération du mot de passe](#génération-du-mot-de-passe)
8. [HTTPS et reverse proxy](#https-et-reverse-proxy)
9. [Distributions et createrepo_c](#distributions-et-createrepo_c)
10. [Signature GPG](#signature-gpg)
11. [Upload de paquets](#upload-de-paquets)
12. [Scan CVE — Grype](#scan-cve--grype)
13. [Import depuis un dépôt externe](#import-depuis-un-dépôt-externe)
14. [Configuration des clients DNF/YUM](#configuration-des-clients-dnfyum)
15. [API REST — référence](#api-rest--référence)
16. [Supervision](#supervision)
17. [Mise à jour](#mise-à-jour)
18. [Dépannage](#dépannage)
19. [Contribution](#contribution)
20. [Licence](#licence)

---

## Fonctionnalités

| Fonctionnalité | Community | Enterprise |
|---|:---:|:---:|
| Hébergement dépôt RPM (9 distributions) | ✅ | ✅ |
| Upload et validation `.rpm` | ✅ | ✅ |
| Antivirus ClamAV à l'import | ✅ | ✅ |
| Signature GPG automatique (`repomd.xml.asc`) | ✅ | ✅ |
| Scan CVE Grype — **informatif, non bloquant** | ✅ | ✅ |
| Visualisation CVE dans l'inspecteur de paquet | ✅ | ✅ |
| Score CVSS + version de correctif | ✅ | ✅ |
| Gestion des utilisateurs locaux (5 rôles) | ✅ | ✅ |
| API tokens (CI/CD) | ✅ | ✅ |
| Journal d'audit | ✅ | ✅ |
| Tableau de bord web React | ✅ | ✅ |
| Métriques Prometheus | ✅ | ✅ |
| Politique CVE configurable (block/review/warn) | — | ✅ |
| Blocage d'import selon sévérité CVE | — | ✅ |
| File de révision RSSI (dual-control) | — | ✅ |
| Score EPSS (probabilité d'exploitation) | — | ✅ |
| Corrélation CISA KEV | — | ✅ |
| LDAP / Active Directory | — | ✅ |
| SSO / OIDC (OpenID Connect avec PKCE) | — | ✅ |
| MFA / TOTP | — | ✅ |
| Export SBOM (SPDX 2.3, CycloneDX 1.5) | — | ✅ |
| Export SARIF 2.1.0 | — | ✅ |
| Mode conformité NIS2 Article 21 | — | ✅ |

👉 **[Passer à Enterprise](https://repod.getautoflow.dev/#demo)**

---

## Prérequis

### Logiciels

| Dépendance | Version minimale | Vérification |
|---|---|---|
| Docker Engine | **24.0** | `docker version --format '{{.Server.Version}}'` |
| Docker Compose (plugin) | **2.20** | `docker compose version` |
| Git | 2.x | `git --version` |
| Python | **3.10** *(hash bcrypt uniquement)* | `python3 --version` |

> ⚠️ **Warning** — Repod requiert le plugin Docker Compose (`docker compose`), pas le binaire autonome legacy `docker-compose` (v1).

### Systèmes d'exploitation supportés

| OS | Version | Architecture |
|---|---|---|
| AlmaLinux | 8, 9 | amd64, arm64 |
| Rocky Linux | 8, 9 | amd64, arm64 |
| CentOS Stream | 9 | amd64 |
| Oracle Linux | 8 | amd64 |
| Fedora | Latest | amd64, arm64 |
| openSUSE Leap | 15.6 | amd64 |
| openSUSE Tumbleweed | — | amd64 |

> ℹ️ Repod RPM peut être hébergé sur n'importe quel système Linux capable d'exécuter Docker. Les distributions ci-dessus sont les **distributions gérées** par le dépôt, pas le système hôte requis.

### Ressources système

| Ressource | Minimum | Recommandé |
|---|---|---|
| RAM | 1,5 Go libres | 4 Go (ClamAV charge ~800 Mo de signatures) |
| CPU | 1 vCPU | 2 vCPU |
| Disque | 2 Go (hors paquets) | 50 Go+ (les paquets RPM sont souvent volumineux) |

> ℹ️ **Note** — Certains paquets RPM dépassent 300 Mo (Oracle Linux, Fedora Everything…). Prévoyez de l'espace disque en conséquence.

### Ports réseau

| Port hôte | Service | Protocole | Exposition recommandée |
|:---:|---|---|---|
| **8180** | Dépôt RPM (nginx) | HTTP | Réseau interne ou derrière reverse proxy |
| **8100** | API backend (FastAPI) | HTTP | Réseau interne ou derrière reverse proxy |
| **3103** | Tableau de bord web (React) | HTTP | Réseau interne ou derrière reverse proxy |

> ⚠️ **Warning** — Ces ports ne doivent **jamais** être exposés directement sur l'interface publique sans TLS. Voir la section [HTTPS et reverse proxy](#https-et-reverse-proxy).

> ℹ️ **Note** — Les ports RPM Community (8180/8100/3103) sont distincts de ceux de Repod APT Community (8280/8200/3203). Les deux éditions peuvent coexister sur le même hôte sans conflit.

---

## Contre-indications et erreurs fréquentes

### ❌ Ne pas exposer clamd sur l'interface publique

ClamAV (clamd) écoute sur un socket Unix interne au conteneur `backend`. Il n'est pas exposé sur le réseau hôte.

### ❌ Ne pas lancer sans reverse proxy en production

Les conteneurs exposent du HTTP non chiffré. En production, **un reverse proxy avec terminaison TLS est obligatoire**.

### ❌ Ne jamais committer `backend.env`

`backend.env` contient `JWT_SECRET_KEY` et `ADMIN_PASSWORD_HASH`. Il est listé dans `.gitignore`. Vérifiez avant chaque commit :

```bash
git status | grep backend.env
# Ce fichier ne doit PAS apparaître dans la liste des fichiers trackés
```

### ❌ Ne pas oublier de doubler les `$` dans `backend.env`

Docker Compose effectue une substitution de variables dans les fichiers `env_file`. Un hash bcrypt contient des `$` littéraux. Si vous oubliez de les doubler (`$$`), Docker Compose les supprime silencieusement — le hash devient invalide.

```bash
# ❌ Incorrect
ADMIN_PASSWORD_HASH=$2b$12$...

# ✅ Correct
ADMIN_PASSWORD_HASH=$$2b$$12$$...
```

### ⚠️ Paquets RPM volumineux

Les paquets RPM (Oracle Linux, Fedora, openSUSE) peuvent dépasser 300 Mo. Le timeout nginx est configuré à 300 secondes pour les uploads. Assurez-vous que votre reverse proxy éventuel a un timeout équivalent.

### ⚠️ Architecture mono-instance

Repod Community est conçu pour une instance unique. Il n'existe pas de mécanisme de réplication ou de haute disponibilité.

### ⚠️ Repod RPM n'est PAS adapté à ces cas d'usage

- **Paquets Debian/Ubuntu** (`.deb`, apt) — Pour APT, voir [Repod APT Community](https://github.com/getautoflow/Repod-apt-community).
- **Miroir public haute disponibilité** — Repod est conçu pour distribuer des paquets internes.
- **Déploiement sans Docker** — Il n'existe pas de mode d'installation bare-metal supporté.

---

## Installation rapide

```bash
# 1. Cloner le dépôt
git clone https://github.com/getautoflow/Repod-rpm-community.git
cd Repod-rpm-community

# 2. Créer les fichiers de configuration à partir des exemples
cp .env.example .env
cp backend.env.example backend.env

# 3. Générer une clé JWT secrète et l'insérer dans backend.env
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
sed -i "s/CHANGE_ME_generate_with__python3_-c__import_secrets_print_secrets.token_hex_32/${JWT_SECRET}/" backend.env

# 4. (Optionnel) Définir un mot de passe admin personnalisé avant le premier démarrage
#    Voir la section "Génération du mot de passe"

# 5. Démarrer la stack
docker compose up -d

# 6. Vérifier que les trois conteneurs sont actifs
docker compose ps
```

Résultat attendu de `docker compose ps` :

```
NAME                 STATUS          PORTS
repod-rpm-backend    Up X seconds    0.0.0.0:8100->8000/tcp
repod-rpm-frontend   Up X seconds    0.0.0.0:3103->80/tcp
repod-rpm-repo       Up X seconds    0.0.0.0:8180->80/tcp
```

```bash
# 7. Attendre l'initialisation de ClamAV (~30-60 secondes au premier démarrage)
docker logs repod-rpm-backend --follow | grep -i "clam\|ready\|started"

# 8. Vérifier que l'API répond et que l'antivirus est actif
curl -s http://localhost:3103/health | python3 -m json.tool
```

Ouvrir ensuite **http://localhost:3103** dans un navigateur.

> ⚠️ **Warning — Identifiants par défaut**
>
> | Utilisateur | Mot de passe |
> |---|---|
> | `admin` | `Admin1234` |
>
> Changez ce mot de passe immédiatement après la première connexion : **tableau de bord → icône utilisateur → Mon compte**, ou via l'API (`POST /api/v1/auth/change-password`).

---

## Configuration détaillée

### `.env` — ports et URLs

Copiez `.env.example` en `.env`. Ce fichier contrôle les ports exposés sur l'hôte et les URLs que le frontend JavaScript utilise pour joindre le backend.

| Variable | Défaut | Description |
|---|---|---|
| `RPM_PORT` | `8180` | Port hôte du dépôt RPM (nginx) |
| `BACKEND_PORT` | `8100` | Port hôte de l'API FastAPI |
| `FRONTEND_PORT` | `3103` | Port hôte du tableau de bord React |
| `REACT_APP_API_URL` | *(vide — URLs relatives)* | URL que le navigateur utilise pour joindre l'API. Laisser vide si le frontend est derrière un reverse proxy. Définir en accès direct : `http://IP:8100` |
| `REACT_APP_REPO_URL` | `http://localhost:8180` | URL affichée dans les instructions `.repo` du tableau de bord |
| `BIND_HOST` | `0.0.0.0` | Interface d'écoute. Définir à `127.0.0.1` si un reverse proxy tourne sur le même hôte. |

> 💡 **Tip** — Avec `BIND_HOST=127.0.0.1`, les ports ne sont accessibles que depuis l'hôte local, ce qui empêche toute connexion directe depuis l'extérieur.

### `backend.env` — secrets et authentification

| Variable | Obligatoire | Défaut | Description |
|---|:---:|---|---|
| `JWT_SECRET_KEY` | ✅ | *(aucun)* | Clé secrète JWT. Générer avec `python3 -c "import secrets; print(secrets.token_hex(32))"`. |
| `JWT_EXPIRE_MINUTES` | | `60` | Durée de vie des tokens d'accès en minutes |
| `ADMIN_USERNAME` | | `admin` | Nom du compte administrateur créé au premier démarrage |
| `ADMIN_PASSWORD_HASH` | ✅ | *(hash de `Admin1234`)* | Hash bcrypt du mot de passe admin. **Chaque `$` doit être doublé en `$$`**. |
| `CORS_ORIGINS` | | `http://localhost:3103` | Origines CORS autorisées, séparées par des virgules |
| `AUTH_RATELIMIT_PER_MINUTE` | | `10` | Tentatives de connexion maximum par minute et par IP |

### Variables internes (ne pas modifier)

| Variable | Valeur | Volume hôte |
|---|---|---|
| `POOL_DIR` | `/repos/pool` | `./repos/pool` |
| `MANIFEST_DIR` | `/repos/manifests` | `./repos/manifests` |
| `STAGING_INCOMING` | `/repos/staging/incoming` | `./repos/staging` |
| `CLAMAV_DB_DIR` | `/var/lib/clamav` | `./repos/clamav-db` |
| `AUTH_DB_PATH` | `/repos/auth/users.db` | `./repos/auth` |
| `REPO_BASE` | `/repos` | *(plusieurs volumes)* |
| `GNUPG_HOME` | `/repos/gnupg` | `./repos/gnupg` |
| `GRYPE_DB_CACHE_DIR` | `/repos/grype-db` | `./repos/grype-db` |

---

## Architecture

```
                        Réseau hôte
          ┌──────────────────────────────────────┐
          │  :8180 (RPM)  :8100 (API)  :3103 (UI)│
          └────┬──────────────┬──────────────┬───┘
               │              │              │
               ▼              ▼              ▼
      ┌──────────────┐ ┌────────────┐ ┌───────────┐
      │  rpm-repo    │ │  backend   │ │ frontend  │
      │  ──────────  │ │  ────────  │ │ ─────────  │
      │  nginx       │ │  FastAPI   │ │  nginx    │
      │  createrepo_c│ │  ClamAV    │ │  React    │
      └──────┬───────┘ │  Grype     │ └───────────┘
             │         │  scheduler │
             └───────┬─┴────────────┘
                     │
          repod-rpm-community_default
              (bridge Docker)
                     │
          ┌──────────▼────────────────┐
          │      Volumes ./repos/     │
          │  ────────────────────     │
          │  pool/   almalinux8/9/    │
          │  rocky8/9/ fedora/        │
          │  gnupg/  auth/            │
          │  clamav-db/ grype-db/     │
          │  manifests/ logs/         │
          └───────────────────────────┘
```

### Conteneurs

| Conteneur | Base | Rôle |
|---|---|---|
| `repod-rpm-repo` | nginx:alpine | Sert les fichiers du dépôt RPM. Les métadonnées sont générées par `createrepo_c` et signées GPG. |
| `repod-rpm-backend` | python:3.10-slim | API FastAPI, daemon ClamAV (clamd) intégré, scanner Grype CVE, logique upload/import/GPG/users, scheduler de rétention. |
| `repod-rpm-frontend` | nginx:alpine | Bundle React statique compilé. Proxifie `/api/` vers le backend. |

### Volumes persistants

Tout le contenu persistant est stocké sous `./repos/`. **Ce répertoire est la seule chose à sauvegarder.**

| Chemin hôte | Contenu | Utilisé par |
|---|---|---|
| `./repos/pool/` | Fichiers `.rpm` | `rpm-repo`, `backend` |
| `./repos/almalinux8/`, `almalinux9/`, … | Métadonnées RPM par distribution (`repomd.xml`, etc.) | `rpm-repo`, `backend` |
| `./repos/manifests/` | Métadonnées JSON des paquets (dont résultats CVE Grype) | `backend` |
| `./repos/staging/` | Zone de quarantaine antivirus | `backend` |
| `./repos/clamav-db/` | Base de signatures ClamAV | `backend` |
| `./repos/grype-db/` | Cache de la base de vulnérabilités Grype | `backend` |
| `./repos/auth/` | Base SQLite des utilisateurs | `backend` |
| `./repos/gnupg/` | Trousseau GPG (clés publique et privée) | `rpm-repo`, `backend` |
| `./repos/logs/` | Logs d'accès nginx | `rpm-repo`, `backend` |

---

## Génération du mot de passe

Repod utilise **bcrypt** pour stocker les mots de passe.

```python
python3 -c "
from passlib.hash import bcrypt
import getpass

password = getpass.getpass('Mot de passe : ')
hashed = bcrypt.hash(password)
escaped = hashed.replace('\$', '\$\$')

print()
print('Copiez cette ligne dans backend.env :')
print('ADMIN_PASSWORD_HASH=' + escaped)
"
```

> ⚠️ **Warning** — Ne stockez jamais le mot de passe en clair dans `backend.env`. Seul le hash bcrypt doit y figurer, avec chaque `$` doublé en `$$`.

---

## HTTPS et reverse proxy

En production, placez un reverse proxy devant Repod pour terminer TLS. Les exemples ci-dessous supposent `BIND_HOST=127.0.0.1` dans `.env`.

### Exemple Nginx

```nginx
# /etc/nginx/sites-available/repod-rpm-ui
server {
    listen 443 ssl http2;
    server_name repod-rpm.example.com;

    ssl_certificate     /etc/letsencrypt/live/repod-rpm.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/repod-rpm.example.com/privkey.pem;

    # Tableau de bord React + proxy API
    location / {
        proxy_pass         http://127.0.0.1:3103;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-Proto $scheme;
        # Upload de gros paquets RPM
        client_max_body_size 512m;
        proxy_read_timeout   300s;
    }
}

# /etc/nginx/sites-available/repod-rpm-repo
server {
    listen 443 ssl http2;
    server_name rpm.example.com;

    ssl_certificate     /etc/letsencrypt/live/rpm.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rpm.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8180;
    }
}
```

Mettez à jour `.env` :

```dotenv
BIND_HOST=127.0.0.1
REACT_APP_REPO_URL=https://rpm.example.com
```

> ⚠️ **Warning** — `REACT_APP_API_URL` et `REACT_APP_REPO_URL` sont compilés dans le bundle JavaScript au moment du build. Si vous les modifiez après le build, vous devez rebuilder l'image `frontend` : `docker compose build frontend && docker compose up -d frontend`.

---

## Distributions et createrepo_c

Repod utilise **createrepo_c** pour générer les métadonnées RPM de chaque distribution. Chaque distribution correspond à un dépôt yum/dnf indépendant.

### Distributions configurées

| Codename | OS | Architectures |
|---|---|---|
| `almalinux8` | AlmaLinux 8 | x86_64, aarch64, noarch |
| `almalinux9` | AlmaLinux 9 | x86_64, aarch64, noarch |
| `rocky8` | Rocky Linux 8 | x86_64, aarch64, noarch |
| `rocky9` | Rocky Linux 9 | x86_64, aarch64, noarch |
| `centos-stream9` | CentOS Stream 9 | x86_64, noarch |
| `oraclelinux8` | Oracle Linux 8 | x86_64, noarch |
| `fedora` | Fedora | x86_64, noarch |
| `opensuse-leap-15.6` | openSUSE Leap 15.6 | x86_64, noarch |
| `opensuse-tumbleweed` | openSUSE Tumbleweed | x86_64, noarch |

### Initialiser les distributions

Les distributions sont initialisées automatiquement au premier démarrage. Vous pouvez aussi les réinitialiser via l'API :

```bash
# Obtenir un token JWT
TOKEN=$(curl -s -X POST http://localhost:3103/api/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin1234"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Initialiser toutes les distributions
curl -s -X POST http://localhost:3103/api/v1/distributions/init \
  -H "Authorization: Bearer $TOKEN"
```

---

## Signature GPG

Repod génère automatiquement une paire de clés GPG au premier démarrage. La clé publique est disponible à :

```
http://localhost:8180/repos/gnupg/repo.asc
```

### Distribuer la clé publique aux clients RPM

```bash
# Sur chaque machine cliente (AlmaLinux/Rocky/CentOS/Oracle/Fedora)
sudo rpm --import http://your-repod-host:8180/repos/gnupg/repo.asc

# Vérifier que la clé est importée
rpm -q gpg-pubkey --qf '%{NAME}-%{VERSION}-%{RELEASE}\t%{SUMMARY}\n'
```

### Rotation de la clé GPG

```bash
# 1. Stopper les conteneurs
docker compose stop

# 2. Supprimer les trousseaux existants
sudo rm -rf ./repos/gnupg ./repos/.gnupg

# 3. Redémarrer — nouvelle paire générée automatiquement
docker compose up -d

# 4. Re-distribuer la nouvelle clé publique à tous les clients RPM
```

> ⚠️ **Warning** — Après une rotation, tous les clients doivent importer la nouvelle clé. Sans cela, `dnf install` échoue avec une erreur de signature GPG.

---

## Upload de paquets

Chaque paquet importé passe par le pipeline suivant avant d'être ajouté au dépôt :

1. **Validation du format** — `rpm -qip` vérifie que le fichier est un `.rpm` valide *(bloquant)*
2. **Intégrité SHA-256** — empreinte calculée et stockée dans le manifeste *(bloquant si altération détectée)*
3. **Scan antivirus ClamAV** — analyse complète du contenu du paquet *(bloquant si menace détectée)*
4. **Signature GPG** — vérification de la signature externe `.sig`/`.asc` si présente *(avertissement si absente)*
5. **Scan CVE Grype** — analyse les vulnérabilités et stocke les résultats dans le manifeste. **Non bloquant en Community Edition** — le paquet est toujours accepté. *(informatif)*
6. **Dépendances RPM** — vérifie la disponibilité dans le dépôt interne *(avertissement si manquantes)*
7. **createrepo_c** — régénère les métadonnées du dépôt RPM et signe `repomd.xml.asc`

### Via le tableau de bord

**Upload** dans la barre de navigation → glisser-déposer le fichier `.rpm` → sélectionner la distribution cible → le pipeline s'exécute en temps réel.

### Via l'API REST

```bash
# 1. Obtenir un token JWT
TOKEN=$(curl -s -X POST http://localhost:3103/api/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin1234"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. Uploader un paquet — réponse JSON synchrone
curl -s -X POST http://localhost:3103/api/v1/upload/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./nginx-1.24.0-1.el9.x86_64.rpm" \
  -F "distribution=almalinux9" \
  | python3 -m json.tool

# 2b. Uploader avec progression en temps réel (Server-Sent Events)
curl -s -N -X POST http://localhost:3103/api/v1/upload/stream \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./nginx-1.24.0-1.el9.x86_64.rpm" \
  -F "distribution=almalinux9"
```

---

## Scan CVE — Grype

Repod RPM Community intègre **[Grype](https://github.com/anchore/grype)** (Anchore) pour analyser automatiquement chaque paquet importé à la recherche de vulnérabilités connues. Grype supporte nativement les paquets RPM.

### Comportement en Community Edition — scan informatif, jamais bloquant

> ⚠️ **Important — le scan CVE ne bloque pas l'import en Community Edition.**
>
> Contrairement à la version Enterprise, les résultats CVE sont **purement informatifs** : quel que soit le nombre ou la sévérité des vulnérabilités détectées (Critical, High, Medium…), le paquet est toujours accepté et ajouté au dépôt RPM.
>
> **C'est à vous de consulter les CVE et de prendre vos propres décisions** sur l'utilisation du paquet. Vous pouvez :
> - Visualiser les vulnérabilités dans l'onglet **CVE** de l'inspecteur de paquet (tableau de bord → Paquets → cliquer sur un paquet)
> - Consulter le score CVSS, la version de correctif disponible et le statut du fix
> - Décider de supprimer le paquet via l'interface si vous le jugez trop risqué
>
> Le blocage automatique à l'import, la file de révision RSSI (dual-control) et les politiques CVE configurables sont des fonctionnalités de la version **Enterprise**.

### Comment fonctionne le scan

1. **Déclenchement automatique** — le scan Grype est lancé à chaque upload ou import.
2. **Non bloquant** — quel que soit le résultat, le paquet est intégré au dépôt. Le statut CVE est toujours marqué `approved` en Community Edition.
3. **Prise en compte de la distribution** — Grype utilise le codename de la distribution cible (ex. `almalinux:8`) pour affiner les résultats CVE.
4. **Stockage dans le manifeste** — les résultats sont écrits dans le manifeste JSON du paquet (`repos/manifests/`).
5. **Visualisation** — les vulnérabilités sont visibles dans l'onglet **CVE** de l'inspecteur de paquet.

### Consulter les CVE d'un paquet

Via le tableau de bord : **Paquets → cliquer sur un paquet → onglet CVE**.

Via l'API REST :

```bash
# Exemple pour nginx 1.24.0 sur AlmaLinux 9
curl -s "http://localhost:3103/api/v1/security/packages/nginx/1.24.0/cve?arch=x86_64" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Exemple de réponse :

```json
{
  "package": "nginx",
  "version": "1.24.0",
  "arch": "x86_64",
  "scanner": "grype",
  "edition": "community",
  "total": 2,
  "summary": { "medium": 1, "low": 1 },
  "cve_results": [
    {
      "id": "CVE-2023-44487",
      "severity": "Medium",
      "cvss_score": 7.5,
      "description": "HTTP/2 Rapid Reset Attack...",
      "package": "nginx",
      "installed_version": "1.24.0",
      "fix_version": "1.25.3",
      "fix_state": "fixed"
    }
  ]
}
```

### Mettre à jour la base de vulnérabilités Grype

La base Grype se met à jour automatiquement au démarrage du backend. Pour forcer une mise à jour manuelle :

```bash
docker exec repod-rpm-backend grype db update
```

> ℹ️ **Note** — La base Grype est téléchargée depuis Internet au premier démarrage (~100-200 Mo). Elle est mise en cache dans `./repos/grype-db/` et persiste entre les redémarrages.

### Fonctionnalités CVE Community vs Enterprise

| Fonctionnalité | Community | Enterprise |
|---|:---:|:---:|
| Scan Grype automatique à l'import | ✅ | ✅ |
| Prise en compte de la distro RPM cible | ✅ | ✅ |
| Affichage CVE dans l'inspecteur de paquet | ✅ | ✅ |
| Score CVSS + version de correctif | ✅ | ✅ |
| **Import non bloqué par les CVE** | ✅ (toujours) | Configurable |
| Politique CVE configurable (block/review/warn) | — | ✅ |
| Blocage automatique selon sévérité | — | ✅ |
| File de révision RSSI (dual-control) | — | ✅ |
| Score EPSS (probabilité d'exploitation) | — | ✅ |
| Corrélation CISA KEV | — | ✅ |
| SLA d'approbation CVE | — | ✅ |
| Export SBOM (SPDX, CycloneDX) | — | ✅ |
| Export SARIF 2.1.0 | — | ✅ |

---

## Import depuis un dépôt externe

Repod peut récupérer des paquets depuis les miroirs RPM officiels et les intégrer localement. Les paquets importés passent par le même pipeline antivirus et CVE que les uploads manuels.

### Rechercher un paquet disponible

```bash
curl -s "http://localhost:3103/api/v1/import/search?q=nginx" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### Importer un paquet

```bash
curl -s -N -X POST http://localhost:3103/api/v1/import/fetch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"package": "nginx", "distribution": "almalinux9"}'
```

### Import par lot

```bash
curl -s -N -X POST http://localhost:3103/api/v1/import/batch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "packages": ["nginx", "curl", "jq"],
    "distribution": "almalinux9"
  }'
```

---

## Configuration des clients DNF/YUM

```bash
# Créer le fichier de dépôt (adapter l'URL et la distribution)
cat > /etc/yum.repos.d/repod.repo << EOF
[repod]
name=Repod Private RPM Repository
baseurl=http://your-repod-host:8180/repos/almalinux9/x86_64/
enabled=1
gpgcheck=1
gpgkey=http://your-repod-host:8180/repos/gnupg/repo.asc
EOF

# Mettre à jour le cache
dnf makecache

# Installer un paquet depuis le dépôt privé
dnf install mypackage
```

> 💡 **Tip** — Le tableau de bord génère automatiquement la configuration `.repo` correcte pour chaque distribution. Accédez-y via **Config client** dans la barre de navigation.

### openSUSE (zypper)

```bash
zypper addrepo --gpgcheck http://your-repod-host:8180/repos/opensuse-leap-15.6/x86_64/ repod
zypper --gpg-auto-import-keys refresh
zypper install mypackage
```

---

## API REST — référence

La documentation interactive OpenAPI est disponible uniquement en mode développement :

```
http://localhost:8100/docs    # Swagger UI (ENV=development uniquement)
http://localhost:8100/redoc   # ReDoc (ENV=development uniquement)
```

En production (`ENV=production`), ces endpoints sont désactivés.

### Authentification

Repod utilise des tokens JWT. Chaque requête authentifiée doit inclure `Authorization: Bearer <token>`.

```bash
curl -s -X POST http://localhost:3103/api/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin1234"}'
# Réponse : {"access_token": "eyJ...", "token_type": "bearer"}
```

### Endpoints principaux

| Méthode | Chemin | Description | Rôle minimum |
|---|---|---|---|
| `POST` | `/api/v1/auth/token` | Connexion — retourne un JWT | *(public)* |
| `GET` | `/api/v1/auth/me` | Informations sur l'utilisateur courant | Tous |
| `POST` | `/api/v1/auth/change-password` | Changer son propre mot de passe | Tous |
| `GET` | `/api/v1/auth/users` | Lister les utilisateurs | Admin |
| `POST` | `/api/v1/auth/users` | Créer un utilisateur | Admin |
| `PATCH` | `/api/v1/auth/users/{username}` | Modifier le rôle | Admin |
| `DELETE` | `/api/v1/auth/users/{username}` | Supprimer un utilisateur | Admin |
| `GET` | `/api/v1/packages/` | Lister tous les paquets | Lecteur |
| `POST` | `/api/v1/upload/` | Uploader un `.rpm` — réponse JSON | Développeur+ |
| `POST` | `/api/v1/upload/stream` | Uploader un `.rpm` — flux SSE | Développeur+ |
| `DELETE` | `/api/v1/artifacts/{name}` | Supprimer un paquet | Mainteneur+ |
| `DELETE` | `/api/v1/artifacts/{name}/{version}` | Supprimer une version | Mainteneur+ |
| `GET` | `/api/v1/distributions/` | Lister les distributions | Lecteur |
| `POST` | `/api/v1/distributions/init` | Initialiser createrepo_c | Admin |
| `POST` | `/api/v1/distributions/promote` | Promouvoir vers une autre distribution | Mainteneur+ |
| `GET` | `/api/v1/import/search?q=` | Rechercher dans les sources | Développeur+ |
| `POST` | `/api/v1/import/fetch` | Importer un paquet (SSE) | Développeur+ |
| `POST` | `/api/v1/import/batch` | Importer jusqu'à 50 paquets (SSE) | Développeur+ |
| `GET` | `/api/v1/security/packages/{name}/{version}/cve` | Vulnérabilités CVE | Développeur+ |
| `GET` | `/api/v1/security/clamav/status` | Statut antivirus | Admin |
| `POST` | `/api/v1/security/clamav/update` | Forcer la mise à jour ClamAV | Admin |
| `GET` | `/api/v1/dashboard/stats` | Statistiques tableau de bord | Lecteur |
| `GET` | `/health` | Bilan de santé complet | *(public)* |
| `GET` | `/health/live` | Sonde liveness (Kubernetes) | *(public)* |
| `GET` | `/health/ready` | Sonde readiness (Kubernetes) | *(public)* |
| `GET` | `/metrics` | Métriques Prometheus | *(public)* |

### Rôles utilisateurs

| Rôle | Upload | Suppression | Gestion utilisateurs |
|---|:---:|:---:|:---:|
| `admin` | ✅ | ✅ | ✅ |
| `maintainer` | ✅ | ✅ | — |
| `developer` | ✅ | — | — |
| `viewer` | — | — | — |
| `readonly` | — | — | — |

---

## Supervision

### Endpoint `/health`

```bash
curl -s http://localhost:3103/health | python3 -m json.tool
```

Retourne l'état de chaque sous-système : API, ClamAV, espace disque, scheduler, packages.

### Métriques Prometheus

```bash
curl -s http://localhost:8100/metrics
```

Exemple de configuration dans `prometheus.yml` :

```yaml
scrape_configs:
  - job_name: repod-rpm-community
    static_configs:
      - targets: ['your-repod-host:8100']
    scrape_interval: 30s
```

### Logs

```bash
# Logs de l'API backend
docker logs repod-rpm-backend --follow

# Logs du conteneur RPM repo
docker logs repod-rpm-repo --follow

# Logs nginx du dépôt sur l'hôte
tail -f ./repos/logs/access.log
```

---

## Mise à jour

> ⚠️ **Warning** — Sauvegardez `./repos/` avant toute mise à jour. Ce répertoire contient l'intégralité des données : paquets, utilisateurs, métadonnées RPM, trousseau GPG.

```bash
# 1. Sauvegarder les données
tar -czf repod-rpm-backup-$(date +%Y%m%d-%H%M).tar.gz ./repos/

# 2. Récupérer la dernière version
git pull origin main

# 3. Rebuilder les images et recréer les conteneurs modifiés
docker compose build
docker compose up -d

# 4. Vérifier l'état de la stack
docker compose ps
curl -s http://localhost:3103/health | python3 -m json.tool
```

### Mise à jour de la base ClamAV

La base ClamAV se met à jour automatiquement toutes les 12 heures. Pour forcer une mise à jour manuelle, utilisez le tableau de bord : **Sécurité → Mettre à jour maintenant**.

```bash
# Ou via l'API
curl -s -X POST http://localhost:3103/api/v1/security/clamav/update \
  -H "Authorization: Bearer $TOKEN"
```

---

## Dépannage

### ClamAV met longtemps à démarrer

Normal au premier démarrage — ClamAV télécharge sa base (~300 Mo). Les redémarrages suivants utilisent le cache `./repos/clamav-db/`.

```bash
docker logs repod-rpm-backend --follow | grep -i clam
```

### `dnf install` retourne "GPG check FAILED"

La clé GPG n'est pas connue du client. Importez-la :

```bash
sudo rpm --import http://your-repod-host:8180/repos/gnupg/repo.asc
```

Ou désactivez temporairement la vérification pour un test (non recommandé en production) :

```bash
dnf install --nogpgcheck mypackage
```

### Erreur 401 après changement de mot de passe

Redémarrez le backend pour qu'il relise `backend.env` :

```bash
docker compose up -d backend
```

Si le hash contient des `$` non doublés, régénérez-le et doublez chaque `$` en `$$`.

### Upload retourne 500 / erreur antivirus

ClamAV n'est peut-être pas encore prêt. Vérifiez :

```bash
curl -s http://localhost:3103/api/v1/security/clamav/status | python3 -m json.tool
# "daemon_running" doit être true
```

Attendez 30 à 60 secondes et réessayez.

### Le scan CVE retourne des résultats vides

La base Grype n'est peut-être pas encore téléchargée :

```bash
docker logs repod-rpm-backend --follow | grep -i grype
docker exec repod-rpm-backend grype db update
```

### Upload bloqué sur de gros paquets (> 100 Mo)

Le frontend utilise un upload en deux phases avec barre de progression pour les gros fichiers. Si la progression se bloque, vérifiez :

```bash
# Espace disque disponible
df -h ./repos/

# Logs backend en temps réel
docker logs repod-rpm-backend --follow
```

### Erreur "Permission denied" sur `repos/`

```bash
sudo chown -R 1000:1000 ./repos/
```

---

## Contribution

Les contributions sont les bienvenues. Lisez [CONTRIBUTING.md](CONTRIBUTING.md) avant d'ouvrir une pull request.

Pour signaler une **vulnérabilité de sécurité**, n'ouvrez pas d'issue publique — envoyez un email à [security@getautoflow.dev](mailto:security@getautoflow.dev). Nous nous engageons à vous répondre sous 72 heures.

---

## Licence

Copyright © 2026 NGANDO ARMEL — Getautoflow.

Le code source de Repod RPM Community Edition est distribué sous licence **Apache 2.0** — voir [LICENSE](LICENSE).

---

<p align="center">
  <a href="https://repod.getautoflow.dev">repod.getautoflow.dev</a> ·
  <a href="https://docs.repod.getautoflow.dev">Documentation</a> ·
  <a href="mailto:contact@getautoflow.dev">Contact</a>
</p>
