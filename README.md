# stock-trackers-pages

Static Cloudflare Pages dashboard for local stock tracker outputs.

## Data flow

1. Local morning runner executes `Watchlist Tracker.py` and `Week High Tracker.py`.
2. Each script exports JSON to:
   - `Most_Used_Files/아침 돌리는거 (US Stocks)/web_exports/watchlist/latest.json`
   - `Most_Used_Files/아침 돌리는거 (US Stocks)/web_exports/week_high/latest.json`
3. `publish_stock_pages.py` copies those files into `site/data/*`, updates `site/data/meta.json`, commits, and pushes.
4. The repository remains the source archive; production is published by a direct Cloudflare Pages deployment of `site`.

## Korea dashboards

- `/sugeup/`: existing Korea EOD 수급·테마 dashboard
- `/sugeup-v2/`: Korea Master Thematic Screener v2

## Local setup

```bash
git init
git add .
git commit -m "feat(site): initial stock trackers dashboard"
git branch -M main
git remote add origin https://github.com/<your-user>/stock-trackers-pages.git
git push -u origin main
```

## Cloudflare Pages deployment

- Project: `intraday-korean-stock-dashboard`
- Output directory: `site`
- Production branch label: `main`
- Deploy command: `npx wrangler pages deploy site --project-name intraday-korean-stock-dashboard --branch main`

## Runtime env vars (used by local trackers)

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `STOCK_DATA_XLSX_PATH` (optional override)
- `STOCK_CODES_PATH` (optional override)
