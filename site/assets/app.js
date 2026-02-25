const META_URL = "./data/meta.json";
const WEEK_HIGH_URL = "./data/week_high/latest.json";
const WATCHLIST_URL = "./data/watchlist/latest.json";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "N/A";
  }
  return Number(value).toFixed(digits);
}

function formatPctCell(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '<span class="neutral">N/A</span>';
  }
  const n = Number(value);
  const cls = n > 0 ? "pos" : n < 0 ? "neg" : "neutral";
  return `<span class="${cls}">${n.toFixed(digits)}%</span>`;
}

function renderTable(targetId, columns, rows) {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (!rows || rows.length === 0) {
    target.innerHTML = '<p class="placeholder">No rows available.</p>';
    return;
  }

  const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const raw = row[c.key];
          const html = c.render ? c.render(raw, row) : escapeHtml(raw ?? "N/A");
          const cls = c.numeric ? "numeric" : "";
          return `<td class="${cls}">${html}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  target.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderWeekHighSummary(payload) {
  const rows = payload.summary_by_sector || [];
  renderTable(
    "week-high-summary",
    [
      { key: "sector", label: "Sector" },
      { key: "count_latest_day", label: "Latest Count", numeric: true },
      {
        key: "change_vs_prev_day",
        label: "Change vs Prev",
        numeric: true,
        render: (v) => formatPctCell(v, 0).replace("%", ""),
      },
      {
        key: "percentage",
        label: "Share",
        numeric: true,
        render: (v) => formatPctCell(v, 1),
      },
    ],
    rows,
  );
}

function renderWeekHighStocks(payload) {
  const rows = payload.highs_by_stock || [];
  renderTable(
    "week-high-stocks",
    [
      { key: "ticker", label: "Ticker" },
      { key: "industry", label: "Industry" },
      { key: "close", label: "Close", numeric: true, render: (v) => formatNumber(v, 4) },
      { key: "high_50d", label: "50D High", numeric: true, render: (v) => formatNumber(v, 4) },
      { key: "high_52w", label: "52W High", numeric: true, render: (v) => formatNumber(v, 4) },
      {
        key: "diff_pct",
        label: "Diff %",
        numeric: true,
        render: (v) => formatPctCell(v, 2),
      },
      {
        key: "recent_high_dates",
        label: "Recent High Dates",
        render: (v) => Array.isArray(v) ? escapeHtml(v.join(", ")) : "N/A",
      },
    ],
    rows,
  );
}

function renderBuySummary(payload) {
  const rows = payload.buy_price_summary || [];
  renderTable(
    "buy-price-summary",
    [
      { key: "ticker", label: "Ticker" },
      { key: "buy_price", label: "Buy Price", numeric: true, render: (v) => formatNumber(v, 4) },
      { key: "last", label: "Last", numeric: true, render: (v) => formatNumber(v, 4) },
      { key: "pnl_pct", label: "PnL %", numeric: true, render: (v) => formatPctCell(v, 2) },
    ],
    rows,
  );
}

function renderSectorBlocks(payload) {
  const host = document.getElementById("watchlist-sectors");
  if (!host) return;

  const sectors = payload.sectors || [];
  if (sectors.length === 0) {
    host.innerHTML = '<p class="placeholder">No sector metrics available.</p>';
    return;
  }

  host.innerHTML = sectors
    .map((sector) => {
      const rows = sector.rows || [];
      const columns = [
        { key: "ticker", label: "Ticker" },
        { key: "d1_pct", label: "1D %", numeric: true, render: (v) => formatPctCell(v, 2) },
        { key: "d5_pct", label: "5D %", numeric: true, render: (v) => formatPctCell(v, 2) },
        { key: "m1_pct", label: "1M %", numeric: true, render: (v) => formatPctCell(v, 2) },
        { key: "rsi14", label: "RSI14", numeric: true, render: (v) => formatNumber(v, 1) },
        { key: "above_sma20", label: "SMA20", render: (v) => (v ? "YES" : "NO") },
        { key: "above_sma50", label: "SMA50", render: (v) => (v ? "YES" : "NO") },
        {
          key: "delta_vs_sma50_pct",
          label: "Delta vs SMA50 %",
          numeric: true,
          render: (v) => formatPctCell(v, 2),
        },
        {
          key: "pct_from_52w_high",
          label: "From 52W High %",
          numeric: true,
          render: (v) => formatPctCell(v, 2),
        },
        { key: "breakout_10d", label: "Breakout", render: (v) => (v ? "YES" : "NO") },
        { key: "score", label: "Score", numeric: true, render: (v) => formatNumber(v, 4) },
      ];

      const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
      const body = rows
        .map((row) => {
          const cells = columns
            .map((c) => {
              const raw = row[c.key];
              const html = c.render ? c.render(raw, row) : escapeHtml(raw ?? "N/A");
              return `<td class="${c.numeric ? "numeric" : ""}">${html}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");

      return `
        <section class="subsection">
          <h4>${escapeHtml(sector.name || "Unnamed Sector")}</h4>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr>${head}</tr></thead>
              <tbody>${body || '<tr><td colspan="11">No rows</td></tr>'}</tbody>
            </table>
          </div>
        </section>
      `;
    })
    .join("");
}

function renderMeta(meta) {
  const statusEl = document.getElementById("status-text");
  const generatedEl = document.getElementById("generated-at");
  const alertPanel = document.getElementById("alert-panel");
  const alertText = document.getElementById("alert-text");

  statusEl.textContent = meta.status || "unknown";
  generatedEl.textContent = meta.generated_at || "N/A";

  if (meta.status && meta.status !== "success") {
    alertPanel.hidden = false;
    alertPanel.classList.add("alert");
    alertText.textContent = meta.error_message || "Latest publish marked as failed.";
  }
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

async function boot() {
  try {
    const [meta, weekHigh, watchlist] = await Promise.all([
      loadJson(META_URL),
      loadJson(WEEK_HIGH_URL),
      loadJson(WATCHLIST_URL),
    ]);

    renderMeta(meta);
    renderWeekHighSummary(weekHigh);
    renderWeekHighStocks(weekHigh);
    renderBuySummary(watchlist);
    renderSectorBlocks(watchlist);
  } catch (error) {
    const alertPanel = document.getElementById("alert-panel");
    const alertText = document.getElementById("alert-text");
    alertPanel.hidden = false;
    alertPanel.classList.add("alert");
    alertText.textContent = `Failed to load dashboard data: ${error.message}`;
  }
}

boot();
