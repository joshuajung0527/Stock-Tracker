# stock-trackers-pages

Static Cloudflare Pages dashboard for local stock tracker outputs.

## Data flow

1. Local morning runner executes `Watchlist Tracker.py` and `Week High Tracker.py`.
2. Each script exports JSON to:
   - `Most_Used_Files/아침 돌리는거 (US Stocks)/web_exports/watchlist/latest.json`
   - `Most_Used_Files/아침 돌리는거 (US Stocks)/web_exports/week_high/latest.json`
3. `publish_stock_pages.py` copies those files into `site/data/*`, updates `site/data/meta.json`, commits, and pushes.
4. Cloudflare Pages redeploys from `main`.

## Local setup

```bash
git init
git add .
git commit -m "feat(site): initial stock trackers dashboard"
git branch -M main
git remote add origin https://github.com/<your-user>/stock-trackers-pages.git
git push -u origin main
```

## Cloudflare Pages setup

- Framework preset: `None`
- Build command: *(empty)*
- Build output directory: `site`
- Production branch: `main`

## Runtime env vars (used by local trackers)

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `STOCK_DATA_XLSX_PATH` (optional override)
- `STOCK_CODES_PATH` (optional override)
