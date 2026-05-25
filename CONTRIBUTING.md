# Guide de contribution — Repod RPM Community Edition

Merci de l'intérêt que vous portez à Repod. Ce document décrit comment signaler un problème, proposer une amélioration et soumettre une pull request.

---

## Table des matières

1. [Code de conduite](#code-de-conduite)
2. [Signaler une vulnérabilité de sécurité](#signaler-une-vulnérabilité-de-sécurité)
3. [Signaler un bug](#signaler-un-bug)
4. [Proposer une fonctionnalité](#proposer-une-fonctionnalité)
5. [Configurer l'environnement de développement](#configurer-lenvironnement-de-développement)
6. [Soumettre une pull request](#soumettre-une-pull-request)
7. [Conventions de code](#conventions-de-code)
8. [Tests](#tests)
9. [Portée de la Community Edition](#portée-de-la-community-edition)

---

## Code de conduite

Ce projet adhère au [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). En participant, vous vous engagez à respecter ce code.

En résumé : soyez respectueux, constructif, et bienveillant envers les autres contributeurs, quelle que soit leur expérience ou leur origine.

Pour signaler un comportement inapproprié, contactez [contact@getautoflow.dev](mailto:contact@getautoflow.dev). Toutes les plaintes seront examinées et traitées de manière confidentielle.

---

## Signaler une vulnérabilité de sécurité

> ⚠️ **N'ouvrez pas d'issue publique pour une vulnérabilité de sécurité.**

Envoyez un email à **[security@getautoflow.dev](mailto:security@getautoflow.dev)** avec :

- Une description précise de la vulnérabilité
- Les étapes de reproduction
- L'impact potentiel estimé
- Votre proposition de correction, si vous en avez une

Nous nous engageons à :

- Accuser réception sous **72 heures**
- Vous tenir informé de l'avancement du correctif
- Vous créditer dans le CHANGELOG si vous le souhaitez

---

## Signaler un bug

Avant d'ouvrir une issue, vérifiez que le problème n'a pas déjà été signalé dans les [issues ouvertes](https://github.com/getautoflow/Repod-rpm-community/issues).

### Informations à fournir

Ouvrez une issue avec le modèle **Bug report** et incluez :

- **Version de Repod** : résultat de `docker inspect repod-rpm-community-backend | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['Config']['Image'])"`
- **OS et version** : `uname -a` et `cat /etc/os-release`
- **Version Docker** : `docker version`
- **Étapes de reproduction** : séquence minimale permettant de reproduire le problème
- **Comportement attendu** : ce qui devrait se passer
- **Comportement observé** : ce qui se passe réellement
- **Logs** : sortie de `docker logs repod-rpm-community-backend 2>&1 | tail -50`

---

## Proposer une fonctionnalité

Ouvrez une issue avec le modèle **Feature request** avant d'implémenter quoi que ce soit. Décrivez :

- Le problème que la fonctionnalité résout
- La solution envisagée
- Les alternatives que vous avez considérées

Attendez un retour des mainteneurs avant de commencer l'implémentation. Les fonctionnalités sans issue préalable risquent de ne pas être acceptées.

---

## Configurer l'environnement de développement

### Prérequis

- Docker >= 24.0 et Docker Compose >= 2.20
- Python >= 3.10
- Node.js >= 18 (pour le frontend)
- Git

### Cloner et démarrer en mode développement

```bash
# Cloner le dépôt
git clone https://github.com/getautoflow/Repod-rpm-community.git
cd Repod-rpm-community

# Créer les fichiers de configuration
cp .env.example .env
cp backend.env.example backend.env

# Générer une clé JWT
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
sed -i "s/CHANGE_ME_GENERATE_A_RANDOM_64_HEX_STRING/${JWT_SECRET}/" backend.env

# Démarrer la stack complète
docker compose up -d
```

### Backend — rechargement à chaud

Le backend FastAPI supporte le rechargement automatique. Pour développer sans rebuilder l'image :

```bash
# Monter le code source en volume et activer le hot-reload
docker compose -f docker-compose.yaml -f docker-compose.dev.yml up backend
```

> ℹ️ **Note** — `docker-compose.dev.yml` monte `./backend:/app` et passe `--reload` à uvicorn. Ce fichier n'est pas présent dans le dépôt par défaut ; créez-le si nécessaire.

### Frontend — développement local

```bash
cd frontend

# Installer les dépendances
npm install

# Démarrer le serveur de développement (hot-reload React)
REACT_APP_API_URL=http://localhost:8100 npm start
# Le tableau de bord est accessible sur http://localhost:3000
```

### Lancer les tests

```bash
# Tests backend (pytest)
cd backend
pip install -r requirements.txt pytest pytest-asyncio pytest-cov
pytest tests/ --tb=short -q

# Linter Python (ruff)
pip install ruff
ruff check backend/ --select E,F,W --ignore E501,E402,F401,E741
```

---

## Soumettre une pull request

### Workflow

1. **Forkez** le dépôt sur GitHub
2. **Créez une branche** à partir de `main` avec un nom descriptif :
   ```bash
   git checkout -b fix/clamav-timeout
   git checkout -b feat/webhook-notifications
   ```
3. **Implémentez** vos modifications en respectant les [conventions de code](#conventions-de-code)
4. **Ajoutez ou mettez à jour les tests** si applicable
5. **Vérifiez** que les tests et le linter passent localement
6. **Committez** avec un message clair :
   ```bash
   git commit -m "fix(clamav): increase socket timeout to 60s"
   ```
7. **Poussez** vers votre fork et **ouvrez une pull request** vers `main`

### Format du message de commit

Repod utilise les [Conventional Commits](https://www.conventionalcommits.org/) :

```
<type>(<scope>): <description courte>

[corps optionnel — expliquer le pourquoi, pas le quoi]

[pied de page optionnel — références d'issues]
```

Types acceptés : `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`.

Exemples :

```
feat(upload): add support for .rpm packages with epoch in version
fix(auth): prevent timing attack on password comparison
docs(readme): add firewall rules section
test(import): add batch import edge cases
chore(createrepo): upgrade createrepo_c to 1.1.4
```

### Checklist avant soumission

- [ ] Les tests passent : `pytest tests/ -q`
- [ ] Le linter ne retourne pas d'erreurs : `ruff check backend/`
- [ ] Le CHANGELOG.md est mis à jour si la modification est visible par les utilisateurs
- [ ] La documentation (README, commentaires) est à jour
- [ ] Aucun secret, credential ou fichier `backend.env` n'est inclus dans le commit

---

## Conventions de code

### Python (backend)

- Style : [PEP 8](https://peps.python.org/pep-0008/), appliqué via `ruff`
- Longueur de ligne : 120 caractères maximum (E501 ignoré par ruff, mais gardez les lignes lisibles)
- Type hints : obligatoires sur les signatures de fonctions publiques
- Docstrings : pour les fonctions non triviales, format Google style

```python
# Bon
async def upload_package(file: UploadFile, distribution: str) -> dict:
    """Upload and validate a .rpm package.

    Args:
        file: The uploaded .rpm file.
        distribution: Target RPM distribution codename (e.g. "almalinux9").

    Returns:
        A dict with keys: name, version, sha256, distribution.

    Raises:
        HTTPException: 400 if the file is not a valid .rpm.
        HTTPException: 422 if ClamAV detects a threat.
    """
```

### JavaScript / React (frontend)

- Pas de TypeScript requis pour les contributions simples
- Composants fonctionnels avec hooks
- Tailwind CSS pour le style — pas de CSS inline ni de classes personnalisées sauf nécessité absolue
- `npm run build` doit se terminer sans erreur ni avertissement critique

### YAML / Docker

- Indentation : 2 espaces
- Pas de tabulations
- Les secrets ne doivent jamais figurer dans `docker-compose.yaml` — utilisez `env_file`

---

## Tests

Les tests sont dans `backend/tests/`. Ils utilisent `pytest` et `pytest-asyncio`.

```bash
# Lancer tous les tests
cd backend
pytest tests/ --tb=short

# Lancer un fichier de tests spécifique
pytest tests/test_upload.py -v

# Avec couverture
pytest tests/ --cov=. --cov-report=term-missing
```

### Ajouter un test

Créez un fichier `test_<feature>.py` dans `backend/tests/`. Suivez les conventions des tests existants : fixtures pytest pour les dossiers temporaires, mocks pour les appels ClamAV et createrepo_c.

La CI GitHub exécute la suite complète sur Python 3.10 et 3.11 à chaque push et pull request. Une pull request ne sera pas mergée si les tests échouent.

---

## Portée de la Community Edition

Repod RPM Community Edition couvre :

- Hébergement de dépôts RPM (AlmaLinux, Rocky, CentOS Stream, Oracle, Fedora, openSUSE) avec createrepo_c
- Antivirus ClamAV sur chaque import (bloquant si menace)
- Signature GPG automatique de `repomd.xml.asc`
- Scan CVE via Grype — **informatif uniquement** (jamais bloquant)
- Visualisation des CVE dans l'inspecteur de paquet (sévérité, CVSS, version fixée)
- Gestion des utilisateurs locaux avec rôles
- API tokens pour CI/CD
- Import de paquets depuis dépôts RPM externes
- Tableau de bord web React
- Endpoints santé et métriques Prometheus

### Ce qui est hors périmètre (fonctionnalités Enterprise uniquement)

Les fonctionnalités suivantes **ne seront pas acceptées** dans ce dépôt, indépendamment de la qualité de la contribution :

| Fonctionnalité | Raison |
|---|---|
| Politique CVE configurable (block/review/warn) | Enterprise |
| Blocage d'import selon sévérité CVE | Enterprise |
| File de révision RSSI (dual-control workflow) | Enterprise |
| Score EPSS et corrélation CISA KEV | Enterprise |
| Audit trail immuable signé | Enterprise |
| LDAP / Active Directory | Enterprise |
| SSO / OIDC (OpenID Connect) | Enterprise |
| MFA / TOTP | Enterprise |
| SBOM (SPDX, CycloneDX) | Enterprise |
| Export SARIF | Enterprise |
| Notifications email / webhook | Enterprise |
| Mode conformité NIS2 Article 21 | Enterprise |

> ℹ️ **Note** — Les contributions qui améliorent le scan CVE existant (affichage, performance, compatibilité Grype) sont bienvenues, à condition de ne pas introduire de logique de blocage ou de révision.

---

## Questions

Pour toute question sur le développement, ouvrez une [Discussion GitHub](https://github.com/getautoflow/Repod-rpm-community/discussions) ou contactez [contact@getautoflow.dev](mailto:contact@getautoflow.dev).
