const META_URL = "./data/meta.json";
const WEEK_HIGH_URL = "./data/week_high/latest.json";
const WATCHLIST_URL = "./data/watchlist/latest.json";
const TRANSCRIPTS_URL = "./data/transcripts/latest.json";
const TAB_STORAGE_KEY = "stock_tracker_active_tab";
const VALID_TABS = new Set(["overview", "week-high", "watchlist", "transcripts"]);

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
  const overviewStatusEl = document.getElementById("overview-status");
  const overviewGeneratedEl = document.getElementById("overview-generated-at");
  const alertPanel = document.getElementById("alert-panel");
  const alertText = document.getElementById("alert-text");

  statusEl.textContent = meta.status || "unknown";
  generatedEl.textContent = meta.generated_at || "N/A";
  if (overviewStatusEl) overviewStatusEl.textContent = meta.status || "unknown";
  if (overviewGeneratedEl) overviewGeneratedEl.textContent = meta.generated_at || "N/A";

  if (meta.status && meta.status !== "success") {
    alertPanel.hidden = false;
    alertPanel.classList.add("alert");
    alertText.textContent = meta.error_message || "Latest publish marked as failed.";
  }
}

function formatScoreBadge(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '<span class="neutral">N/A</span>';
  }
  const n = Number(value);
  const cls = n > 0.35 ? "pos" : n < -0.35 ? "neg" : "neutral";
  return `<span class="${cls}">${n.toFixed(digits)}</span>`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function renderOverview(weekHighPayload, watchlistPayload, transcriptPayload) {
  const weekHighSummary = weekHighPayload.summary_by_sector || [];
  const weekHighStocks = weekHighPayload.highs_by_stock || [];
  const watchlistBuy = watchlistPayload.buy_price_summary || [];
  const watchlistSectors = watchlistPayload.sectors || [];
  const transcriptQuarters = transcriptPayload.quarters || [];
  const latestTranscript = transcriptQuarters[transcriptQuarters.length - 1] || null;
  const watchlistRows = watchlistSectors.reduce((acc, sector) => {
    const rows = Array.isArray(sector.rows) ? sector.rows.length : 0;
    return acc + rows;
  }, 0);

  setText("overview-week-high-sectors", String(weekHighSummary.length));
  setText("overview-week-high-stocks", String(weekHighStocks.length));
  setText("overview-watchlist-buy", String(watchlistBuy.length));
  setText("overview-watchlist-rows", String(watchlistRows));
  setText("overview-transcript-ticker", transcriptPayload.ticker || "N/A");
  setText("overview-transcript-quarters", String(transcriptQuarters.length));
  setText(
    "overview-transcript-score",
    latestTranscript ? `${formatNumber(latestTranscript.normalized_score, 0)} / 100` : "N/A",
  );

  const topWeekHighHost = document.getElementById("overview-top-week-high");
  if (topWeekHighHost) {
    const top = weekHighSummary.slice(0, 8);
    if (!top.length) {
      topWeekHighHost.innerHTML = '<p class="placeholder">No sector summary rows.</p>';
    } else {
      topWeekHighHost.innerHTML = `<ol class="mini-list">${top
        .map((row) => {
          const sector = escapeHtml(row.sector || "N/A");
          const count = Number.isFinite(Number(row.count_latest_day)) ? Number(row.count_latest_day) : 0;
          const delta = Number.isFinite(Number(row.change_vs_prev_day)) ? Number(row.change_vs_prev_day) : 0;
          return `<li><strong>${sector}</strong> (${count}, Δ ${delta >= 0 ? "+" : ""}${delta})</li>`;
        })
        .join("")}</ol>`;
    }
  }

  const watchlistSectorHost = document.getElementById("overview-watchlist-sectors");
  if (watchlistSectorHost) {
    if (!watchlistSectors.length) {
      watchlistSectorHost.innerHTML = '<p class="placeholder">No watchlist sectors.</p>';
    } else {
      watchlistSectorHost.innerHTML = `<ol class="mini-list">${watchlistSectors
        .map((sector) => {
          const name = escapeHtml(sector.name || "Unnamed Sector");
          const rows = Array.isArray(sector.rows) ? sector.rows.length : 0;
          return `<li><strong>${name}</strong> (${rows} rows)</li>`;
        })
        .join("")}</ol>`;
    }
  }

  const transcriptTimelineHost = document.getElementById("overview-transcript-timeline");
  if (transcriptTimelineHost) {
    if (!transcriptQuarters.length) {
      transcriptTimelineHost.innerHTML = '<p class="placeholder">No transcript quarters published.</p>';
    } else {
      transcriptTimelineHost.innerHTML = `<ol class="mini-list">${transcriptQuarters
        .map((quarter) => {
          const label = escapeHtml(quarter.quarter || "Unknown quarter");
          const score = Number.isFinite(Number(quarter.normalized_score))
            ? `${Number(quarter.normalized_score).toFixed(0)}`
            : "N/A";
          const tone = escapeHtml(quarter.tone_direction || "flat");
          return `<li><strong>${label}</strong> (${score}/100, ${tone})</li>`;
        })
        .join("")}</ol>`;
    }
  }
}

function renderTranscriptAnalysis(payload) {
  const summaryHost = document.getElementById("transcript-summary");
  const quartersHost = document.getElementById("transcript-quarters");
  if (!summaryHost || !quartersHost) return;

  const quarters = payload.quarters || [];
  const latest = quarters[quarters.length - 1] || null;

  const summaryCards = [
    ["Ticker", payload.ticker || "N/A"],
    ["Company", payload.company_name || "N/A"],
    ["Quarter Count", String(quarters.length)],
    ["Latest Quarter", latest?.quarter || "N/A"],
    ["Latest Score", latest ? `${formatNumber(latest.normalized_score, 0)} / 100` : "N/A"],
    ["Generated At", payload.generated_at || "N/A"],
  ];

  summaryHost.innerHTML = summaryCards
    .map(
      ([label, value]) => `
        <article class="stat-card">
          <h3>${escapeHtml(label)}</h3>
          <p class="stat-value">${escapeHtml(value)}</p>
        </article>
      `,
    )
    .join("");

  if (!quarters.length) {
    quartersHost.innerHTML = '<p class="placeholder">No transcript quarters published.</p>';
    return;
  }

  quartersHost.innerHTML = quarters
    .map((quarter) => {
      const bullish = quarter.bullish_keywords ? escapeHtml(quarter.bullish_keywords) : "N/A";
      const bearish = quarter.bearish_keywords ? escapeHtml(quarter.bearish_keywords) : "N/A";
      return `
        <article class="transcript-card">
          <div class="transcript-card-head">
            <div>
              <h3>${escapeHtml(quarter.quarter || "Unknown quarter")}</h3>
              <p>${escapeHtml(quarter.call_date || "Unknown date")}</p>
            </div>
            <div class="transcript-scorebox">
              <div class="score-pill">${formatNumber(quarter.normalized_score, 0)}/100</div>
              <div class="score-sub">${formatScoreBadge(quarter.overall_score)}</div>
            </div>
          </div>

          <div class="transcript-metrics">
            <div><span>Direction</span><strong>${escapeHtml(quarter.tone_direction || "flat")}</strong></div>
            <div><span>Guidance</span><strong>${escapeHtml(quarter.guidance_delta || "N/A")}</strong></div>
            <div><span>Confidence</span><strong>${escapeHtml(quarter.analysis_confidence || "N/A")}</strong></div>
            <div><span>Q&A</span><strong>${quarter.qa_present ? "Present" : "Missing"}</strong></div>
          </div>

          <div class="transcript-copy">
            <section>
              <h4>Quarter Summary</h4>
              <p>${escapeHtml(quarter.quarter_summary || "N/A")}</p>
            </section>
            <section>
              <h4>Top Analyst Questions</h4>
              <p>${escapeHtml(quarter.top_analyst_questions || "N/A")}</p>
            </section>
            <section>
              <h4>Management Answers</h4>
              <p>${escapeHtml(quarter.management_answers_summary || "N/A")}</p>
            </section>
          </div>

          <div class="transcript-copy transcript-copy-compact">
            <section>
              <h4>Key Risks</h4>
              <p>${escapeHtml(quarter.key_risks || "N/A")}</p>
            </section>
            <section>
              <h4>Key Improvements</h4>
              <p>${escapeHtml(quarter.key_improvements || "N/A")}</p>
            </section>
            <section>
              <h4>Keywords</h4>
              <p><strong>Bullish:</strong> ${bullish}</p>
              <p><strong>Bearish:</strong> ${bearish}</p>
            </section>
            <section>
              <h4>Limitations</h4>
              <p>${escapeHtml(quarter.limitations || "None")}</p>
            </section>
          </div>
        </article>
      `;
    })
    .join("");
}

function setActiveTab(tabId, options = {}) {
  const persist = options.persist !== false;
  const normalizedTab = VALID_TABS.has(tabId) ? tabId : "overview";

  const tabButtons = document.querySelectorAll(".tab-btn[data-tab]");
  const tabPanels = document.querySelectorAll(".tab-panel[id^='tab-panel-']");

  tabButtons.forEach((button) => {
    const active = button.dataset.tab === normalizedTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.setAttribute("tabindex", active ? "0" : "-1");
  });

  tabPanels.forEach((panel) => {
    const panelTab = panel.id.replace("tab-panel-", "");
    const active = panelTab === normalizedTab;
    panel.classList.toggle("is-hidden", !active);
    panel.setAttribute("aria-hidden", active ? "false" : "true");
  });

  if (persist) {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, normalizedTab);
    } catch (_error) {
      // Ignore storage errors (privacy mode, blocked storage).
    }
  }
}

function bindTabEvents() {
  const tabButtons = document.querySelectorAll(".tab-btn[data-tab]");
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab || "overview");
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const all = Array.from(tabButtons);
      const idx = all.indexOf(button);
      if (idx < 0) return;
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = all[(idx + delta + all.length) % all.length];
      next.focus();
      setActiveTab(next.dataset.tab || "overview");
    });
  });
}

function getInitialTab() {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    if (stored && VALID_TABS.has(stored)) {
      return stored;
    }
  } catch (_error) {
    // Ignore storage errors.
  }
  return "overview";
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

async function boot() {
  bindTabEvents();
  setActiveTab(getInitialTab(), { persist: false });

  try {
    const [meta, weekHigh, watchlist, transcripts] = await Promise.all([
      loadJson(META_URL),
      loadJson(WEEK_HIGH_URL),
      loadJson(WATCHLIST_URL),
      loadJson(TRANSCRIPTS_URL),
    ]);

    renderMeta(meta);
    renderWeekHighSummary(weekHigh);
    renderWeekHighStocks(weekHigh);
    renderBuySummary(watchlist);
    renderSectorBlocks(watchlist);
    renderOverview(weekHigh, watchlist, transcripts);
    renderTranscriptAnalysis(transcripts);
  } catch (error) {
    const alertPanel = document.getElementById("alert-panel");
    const alertText = document.getElementById("alert-text");
    alertPanel.hidden = false;
    alertPanel.classList.add("alert");
    alertText.textContent = `Failed to load dashboard data: ${error.message}`;
  }
}

boot();
