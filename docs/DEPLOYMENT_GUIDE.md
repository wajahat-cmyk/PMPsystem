# PMP Systems — GitHub + Railway Deployment Guide

## PART 1 — GitHub Repo Setup

### Repository Structure
```
pmp-systems/                    ← Git root
├── .env.example                ← Template (committed, no secrets)
├── .env.local                  ← Local secrets (GITIGNORED)
├── .gitignore                  ← Properly configured
├── docker-compose.yml          ← Local dev only
├── drizzle.config.ts           ← Drizzle Kit config
├── next.config.ts              ← Next.js config
├── postcss.config.mjs          ← Tailwind v4
├── package.json
├── package-lock.json           ← Committed (reproducible installs)
├── tsconfig.json
├── drizzle/                    ← Generated migrations (committed)
│   └── migrations/
├── public/
├── src/                        ← All application code
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── server/
├── worker.ts                   ← Background worker entry (Phase 2)
└── docs/                       ← Spec documents (committed)
```

### Branch Strategy
```
main          ← Production (auto-deploys to Railway)
  └── dev     ← Development/staging (manual merge to main)
       └── feature/xxx  ← Feature branches (merge to dev via PR)
```

- `main` — Always deployable. Railway auto-deploys from this branch.
- `dev` — Integration branch. Test features together before promoting.
- `feature/*` — Short-lived. One feature per branch.

### What to Include vs Exclude

**COMMITTED (in repo):**
- All source code (`src/`)
- Package files (`package.json`, `package-lock.json`)
- Config files (`.eslintrc.json`, `tsconfig.json`, `next.config.ts`, etc.)
- `.env.example` (template with placeholder values)
- `docker-compose.yml` (local dev convenience)
- `drizzle/migrations/` (database migration files)
- `docs/` (specification documents)

**GITIGNORED (never committed):**
- `.env.local` (contains real secrets)
- `node_modules/`
- `.next/` (build output)
- `.DS_Store`
- `.claude/` (Claude workspace)

---

## PART 2 — Code Migration to GitHub

### Step-by-Step

```bash
# 1. Already in the project directory
cd /Users/wajahatshaikh/pmp-systems

# 2. Git is already initialized by create-next-app
git status

# 3. Create GitHub repo (use GitHub CLI or web)
gh repo create pmp-systems --private --source=. --remote=origin

# 4. If gh CLI not available, create repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/pmp-systems.git

# 5. Stage all files
git add -A

# 6. Initial commit
git commit -m "feat: PMP Systems Phase 1 MVP foundation

- Next.js 15 + Tailwind v4 + shadcn/ui
- tRPC with 7 routers (credentials, products, sync, keywords, overview, activity, comments)
- Drizzle ORM with 21 table schemas
- Full Settings module (credentials with AES-256 encryption, product CRUD, sync config)
- Dashboard layout with 15-module sidebar navigation
- JWT auth + bcrypt password verification
- Docker Compose for local Postgres + Redis"

# 7. Push to main
git push -u origin main

# 8. Create dev branch
git checkout -b dev
git push -u origin dev
```

### Config Separation
- **Secrets** (API keys, encryption key, DB password): ONLY in `.env.local` (local) and Railway env vars (production). NEVER in code.
- **Non-secret config** (API endpoints, feature flags, pagination defaults): In `src/lib/constants.ts`. Committed.
- **Database URL**: Auto-provided by Railway Postgres plugin. Locally in `.env.local`.

---

## PART 3 — Railway Deployment

### Step-by-Step Railway Setup

1. **Log in to Railway** (railway.app)
2. **Create New Project** → "Empty Project"
3. **Add PostgreSQL** → Click "+ New" → "Database" → "PostgreSQL"
4. **Add Redis** → Click "+ New" → "Database" → "Redis"
5. **Add Web Service** → Click "+ New" → "GitHub Repo" → Select `pmp-systems`
   - Branch: `main`
   - Build: Nixpacks (auto-detected)
   - Start: `npm run start`

### Environment Variables (set in Railway)

Click the web service → Variables tab → Add these:

```
DATABASE_URL          → Click "Add Reference" → Select PostgreSQL → DATABASE_URL
REDIS_URL             → Click "Add Reference" → Select Redis → REDIS_URL
ENCRYPTION_KEY        → Generate: run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` locally
SESSION_SECRET        → Generate: same command
ADMIN_USERNAME        → your login username
ADMIN_PASSWORD_HASH   → Generate: run `node -e "require('bcryptjs').hash('YOUR_PASSWORD', 10).then(console.log)"` locally
NODE_ENV              → production
```

### Build & Start Commands

Railway auto-detects from `package.json`:
- **Build**: `npm run build` (runs `next build`)
- **Start**: `npm run start` (runs `next start`)

### Database Setup (After First Deploy)

Option A — Railway Shell:
```bash
# In Railway dashboard → Web Service → Settings → Railway Shell
npx drizzle-kit push
npx tsx src/server/db/seed.ts
```

Option B — Add to build command:
Change build command to: `npm run build && npx drizzle-kit push`
(Run seed separately once via Railway shell)

### Health Check
Set in Railway → Service Settings:
- Health Check Path: `/api/health`
- Health Check Timeout: 30s

### Custom Domain (Optional)
Railway → Service → Settings → Domains → Add custom domain or use the generated `*.up.railway.app` URL.

---

## PART 4 — CI/CD Workflow

### Auto-Deploy Flow
```
Developer pushes to main branch
    → Railway detects push via GitHub webhook
    → Railway runs: npm install → npm run build
    → If build succeeds → deploys new version
    → Old version keeps running until new one passes health check
    → Zero-downtime swap
    → If build fails → old version stays live, Railway shows error
```

### Branch Workflow
```
1. Create feature branch:
   git checkout dev
   git pull origin dev
   git checkout -b feature/add-keyword-engine

2. Write code, commit:
   git add -A
   git commit -m "feat: add keyword engine read-only table"

3. Push + create PR to dev:
   git push -u origin feature/add-keyword-engine
   → Create PR on GitHub: feature/add-keyword-engine → dev

4. Review + merge to dev:
   → Merge PR (squash merge recommended)

5. When dev is stable, merge to main:
   git checkout main
   git pull origin main
   git merge dev
   git push origin main
   → Railway auto-deploys

6. Clean up:
   git branch -d feature/add-keyword-engine
   git push origin --delete feature/add-keyword-engine
```

### Preventing Broken Deployments
1. **TypeScript strict mode** — catches type errors before build
2. **ESLint in build** — `next build` runs linting automatically
3. **Railway rollback** — Railway keeps previous builds. Click "Rollback" in deploy history if needed.
4. **Branch protection** — On GitHub: Settings → Branches → Add rule for `main`:
   - Require PR before merging
   - Require status checks (optional: add GitHub Actions later)

---

## PART 5 — Real-World Update Flow

### Making a Change (Complete Flow)

```bash
# 1. Start on dev branch
git checkout dev
git pull origin dev

# 2. Create feature branch
git checkout -b feature/fix-credential-validation

# 3. Make your code changes
# ... edit files ...

# 4. Test locally
npm run dev    # Check in browser
npx tsc --noEmit   # TypeScript check
npm run build  # Full build check

# 5. Commit
git add src/server/trpc/routers/credentials.ts
git commit -m "fix: add validation for empty API credentials"

# 6. Push
git push -u origin feature/fix-credential-validation

# 7. Create PR on GitHub (feature → dev)
# Review, approve, merge

# 8. When ready for production, merge dev → main
git checkout main
git pull origin main
git merge dev
git push origin main

# 9. Railway auto-deploys (takes ~2-3 minutes)
# Monitor: Railway dashboard → Deployments tab
# Verify: visit https://your-app.up.railway.app/api/health

# 10. Done. Live.
```

### Quick Hotfix (Emergency)
```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-fix
# ... fix ...
git add -A && git commit -m "hotfix: fix encryption key validation"
git push origin hotfix/critical-fix
# Create PR directly to main, merge immediately
# Railway auto-deploys
# Then backport to dev:
git checkout dev && git merge main && git push origin dev
```

---

## PART 6 — Security

### API Key Handling
- Amazon Ads API and SP-API credentials: stored **encrypted** in the database using AES-256-GCM
- Encryption key (`ENCRYPTION_KEY`): stored ONLY in Railway env vars and local `.env.local`
- Session secret (`SESSION_SECRET`): same — env vars only
- Admin password: stored as bcrypt hash in env var (`ADMIN_PASSWORD_HASH`)

### Avoiding Secret Commits
1. `.env.local` is in `.gitignore` — never committed
2. `.env.example` has placeholder values — safe to commit
3. No hardcoded credentials anywhere in source code
4. All sensitive values read from `process.env` at runtime
5. Pre-commit check (optional): add to `.git/hooks/pre-commit`:
   ```bash
   if git diff --cached | grep -iE "(secret|password|token|key).*=.*[a-zA-Z0-9]{20}" | grep -v ".example" | grep -v ".gitignore"; then
     echo "WARNING: Possible secret in commit"
     exit 1
   fi
   ```

### Environment Variable Management
| Variable | Where Stored | How Set |
|----------|-------------|---------|
| `DATABASE_URL` | Railway env | Auto-linked from Postgres plugin |
| `REDIS_URL` | Railway env | Auto-linked from Redis plugin |
| `ENCRYPTION_KEY` | Railway env + `.env.local` | Generate with `crypto.randomBytes(32).toString('base64')` |
| `SESSION_SECRET` | Railway env + `.env.local` | Generate same way |
| `ADMIN_USERNAME` | Railway env + `.env.local` | Plain text |
| `ADMIN_PASSWORD_HASH` | Railway env + `.env.local` | bcrypt hash |
| Amazon API creds | Database (encrypted) | Entered via Settings UI |

---

## PART 7 — What I Need From You

To complete the deployment, I need:

### Required Now
1. **GitHub account username** — to create the repo (or you create it and share the URL)
2. **Railway account confirmation** — confirm you can log in to railway.app
3. **Admin password** — choose a password, I'll generate the bcrypt hash for you

### Required Before Going Live
4. **Custom domain** (optional) — if you want `pmp.yourdomain.com` instead of `*.up.railway.app`
5. **Amazon Ads API credentials** — Client ID, Client Secret, Refresh Token, Profile ID (entered via Settings UI after deploy)
6. **SP-API credentials** — Client ID, Client Secret, Refresh Token, AWS keys (entered via Settings UI)

### Not Required Yet (Phase 2+)
7. **Resend API key** — for email automation (Phase 3)
8. **DataDive/DataRover API keys** — if they offer APIs (Phase 3)
9. **Team member emails** — for multi-user access (Phase 2)
