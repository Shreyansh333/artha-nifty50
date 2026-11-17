# Deployment

## Architecture

```
GitHub Actions (cron, weekdays 11:45 UTC ≈ 17:15 IST, after NSE close)
  └─ python pipeline/run.py fetch      → yfinance → data/cache (committed back to the repo)
  └─ python pipeline/run.py build      → web/public/data/*.json   (static data API)
  └─ python pipeline/run.py excel      → web/public/downloads/*.xlsx
  └─ pytest + verify_workbook.py       → abort deploy on failure
  └─ npm ci && npm run build           → web/dist
  └─ wrangler pages deploy web/dist    → Cloudflare Pages (global CDN)
```

Why this design: yfinance needs Python, which Cloudflare Pages cannot run, and the data changes once a day. Running
the pipeline on a schedule and publishing static files means zero servers, no database, no API keys in the browser,
fast global delivery, and the site keeps working when no one's computer is on. Cloudflare Pages has no SPA
`404.html`, so unknown paths serve `index.html` (client-side routing). Cache headers are in `web/public/_headers`.

Storage choice: the raw cache is plain CSV/JSON in Git (≈ 35 MB, small daily diffs, fully auditable history). SQLite,
D1, R2 and Postgres were considered; at 50 companies × daily prices a database adds operational cost without benefit.

## Environment variables / secrets

| Name | Where | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub → Settings → Secrets → Actions | Token with **Cloudflare Pages: Edit** permission (Account scope) |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub → Settings → Secrets → Actions | Your Cloudflare account ID (dashboard sidebar) |
| `CF_PAGES_PROJECT` | GitHub → Settings → Variables (optional) | Pages project name; defaults to `artha-nifty50` |

Nothing else is required: yfinance needs no key, and the frontend has no secrets.

## First deployment (from a local machine)

```bash
# 1. Data + workbook
pip install -r pipeline/requirements.txt
python pipeline/run.py all

# 2. Web build
cd web && npm ci && npm run build && cd ..

# 3. Cloudflare (one-time login opens a browser)
npx wrangler login
npx wrangler pages project create artha-nifty50 --production-branch main
npx wrangler pages deploy web/dist --project-name artha-nifty50 --branch main
```

The site is then served at `https://artha-nifty50.pages.dev` (or the name you chose).

## Automatic updates (GitHub)

1. Create an empty GitHub repository and push this project (`git remote add origin …; git push -u origin main`).
2. Add the two secrets above.
3. Actions → *Update data & deploy* → **Run workflow** once to confirm; afterwards it runs every weekday.
   `workflow_dispatch` accepts `full_refresh` to force a complete re-download.

## Updating the constituent list

Nothing to do: the NSE file is re-read on every fetch. If NSE blocks the CI runner's IP, the committed snapshot in
`data/universe/` is used and the site shows it as stale. To force an update from your own machine, run
`python pipeline/run.py fetch` locally and commit `data/universe/`.

## Reproducing locally

```bash
python pipeline/run.py all          # or: fetch / build / excel / docs
python -m pytest pipeline/tests -q
python pipeline/tests/verify_workbook.py   # independent recalculation of workbook formulas
cd web && npm run dev                # http://localhost:5173
```
