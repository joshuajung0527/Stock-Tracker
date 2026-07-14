const META_URL = "./data/meta.json";
const WEEK_HIGH_URL = "./data/week_high/latest.json";
const WATCHLIST_URL = "./data/watchlist/latest.json";
const TRANSCRIPTS_URL = "./data/transcripts/latest.json";
const KOREA_THEME_DASHBOARD_URL = "./data/korea-theme/theme_dashboard_latest.json";
const KOREA_REALTIME_FLOW_URL = "./data/korea-theme/realtime_flow_latest.json";
const KOREA_THEME_FIRST_SCREENER_URL = "./data/korea-theme/theme_first_screener_latest.json";
const TAB_STORAGE_KEY = "stock_tracker_active_tab";
const VALID_TABS = new Set(["overview", "week-high", "watchlist", "transcripts", "korea-theme"]);

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

function formatTimestamp(value) {
  if (!value) return "N/A";
  const text = String(value).trim();
  return text.replace("T", " ");
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

function formatSignalPill(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) {
    return '<span class="signal-pill">Baseline</span>';
  }
  if (n >= 2.5) {
    return '<span class="signal-pill hot">Strong Interest</span>';
  }
  if (n >= 1.5) {
    return '<span class="signal-pill warm">Emerging</span>';
  }
  return '<span class="signal-pill">Baseline</span>';
}

function formatActionPill(label) {
  const text = String(label || "").trim();
  if (text === "Long Confirmed") {
    return '<span class="signal-pill hot">Long Confirmed</span>';
  }
  if (text === "Flow Only") {
    return '<span class="signal-pill warm">Flow Only</span>';
  }
  if (text === "Down Pressure") {
    return '<span class="signal-pill cold">Down Pressure</span>';
  }
  return `<span class="signal-pill">${escapeHtml(text || "Baseline")}</span>`;
}

const FACTOR_LABELS = {
  turnover: "Turnover",
  volume: "Volume",
  breadth: "Breadth",
  leader: "Leader",
  persistence: "Persistence",
  concentration: "Concentration",
};

function getStrongestThemeZScore(row) {
  const zScores = row?.z_scores || {};
  const values = Object.values(zScores)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return NaN;
  }
  return Math.max(...values);
}

function getLeadContributorName(row) {
  if (Array.isArray(row?.top_contributors) && row.top_contributors.length > 0) {
    return row.top_contributors[0]?.symbol_name || row.top_contributors[0]?.symbol || "N/A";
  }
  return row?.symbol_name || "N/A";
}

function getThemeBundleName(row) {
  const breadcrumb = String(row?.breadcrumb || "").trim();
  if (breadcrumb) {
    const root = breadcrumb
      .split(">")
      .map((part) => part.trim())
      .filter(Boolean)[0];
    if (root) return root;
  }
  return row?.parent_theme_name_ko || row?.theme_name_ko || "기타";
}

function getParticipationText(row) {
  const active = Number(row?.active_member_count || 0);
  const total = Number(row?.theme_total_members || 0);
  if (!total) return "N/A";
  const ratio = (active / total) * 100;
  return `${active} / ${total} (${ratio.toFixed(0)}%)`;
}

function getPositionView(row) {
  const currentWeek = Number(row?.current_week_score || 0);
  const delta = Number(row?.delta_vs_prior_week || 0);
  const trend = String(row?.trend_state || "").toLowerCase();
  if (trend === "stable" && currentWeek >= 60 && delta >= 0) {
    return "Hold Uptrend";
  }
  if (trend === "stable" && currentWeek >= 55) {
    return "Constructive";
  }
  if (trend === "weakening" || trend === "fading") {
    return "Cooling";
  }
  return "Watchlist";
}

function normalizeContributorMapRows(rows) {
  const themeMap = new Map();
  for (const row of rows || []) {
    if (!row || !row.theme_name_ko) continue;
    let topContributor = null;
    if (Array.isArray(row.top_contributors) && row.top_contributors.length > 0) {
      topContributor = row.top_contributors[0];
    } else if (typeof row.top_contributors_json === "string" && row.top_contributors_json.trim()) {
      try {
        const parsed = JSON.parse(row.top_contributors_json);
        if (Array.isArray(parsed) && parsed.length > 0) {
          topContributor = parsed[0];
        }
      } catch (_error) {
        // Ignore malformed contributor JSON and fall back to flat fields.
      }
    }

    const normalized = {
      theme_name_ko: row.theme_name_ko,
      contributor_name: topContributor?.symbol_name || row.symbol_name || row.symbol || "N/A",
      contributor_share_pct: Number.isFinite(Number(topContributor?.share_pct))
        ? Number(topContributor.share_pct)
        : Number(row.contributor_share_pct),
      price_change_pct: Number.isFinite(Number(topContributor?.price_change_pct))
        ? Number(topContributor.price_change_pct)
        : Number(row.price_change_pct),
    };

    const existing = themeMap.get(normalized.theme_name_ko);
    if (!existing || Number(normalized.contributor_share_pct) > Number(existing.contributor_share_pct)) {
      themeMap.set(normalized.theme_name_ko, normalized);
    }
  }

  return Array.from(themeMap.values()).sort(
    (left, right) => Number(right.contributor_share_pct || 0) - Number(left.contributor_share_pct || 0),
  );
}

function buildImpactClusters(payload) {
  const bundleSnapshotMap = new Map(
    ((payload?.bundle_market_snapshot || payload?.intraday_review?.bundle_market_snapshot || [])).map((row) => [row.bundle_name, row]),
  );
  const sourceRows = [
    ...(payload?.now || []),
    ...(payload?.top_narrow_themes || []),
    ...(payload?.top_broad_themes || []),
  ];
  const uniqueRows = new Map();
  for (const row of sourceRows) {
    const rowKey = [
      row?.theme_name_ko || "",
      row?.theme_level || "",
      row?.breadcrumb || "",
    ].join("::");
    if (!uniqueRows.has(rowKey)) {
      uniqueRows.set(rowKey, row);
    }
  }
  const clusters = new Map();

  for (const row of uniqueRows.values()) {
    const bundleName = getThemeBundleName(row);
    if (!bundleName || bundleName === "N/A") continue;
    const key = bundleName;
    const strongestZ = getStrongestThemeZScore(row);
    const contributors = Array.isArray(row?.top_contributors) ? row.top_contributors : [];

    if (!clusters.has(key)) {
      clusters.set(key, {
        bundle_name: bundleName,
        heat_score: Number(row?.heat_score) || 0,
        strongest_z: Number.isFinite(strongestZ) ? strongestZ : NaN,
        active_theme_count: 0,
        active_member_count: 0,
        theme_total_members: 0,
        themes: new Set(),
        subthemes: new Set(),
        impact_stock_scores: new Map(),
        impact_stock_moves: new Map(),
      });
    }

    const cluster = clusters.get(key);
    cluster.active_theme_count += 1;
    cluster.heat_score = Math.max(cluster.heat_score, Number(row?.heat_score) || 0);
    cluster.active_member_count = Math.max(cluster.active_member_count, Number(row?.active_member_count) || 0);
    cluster.theme_total_members = Math.max(cluster.theme_total_members, Number(row?.theme_total_members) || 0);
    if (Number.isFinite(strongestZ)) {
      cluster.strongest_z = Number.isFinite(cluster.strongest_z) ? Math.max(cluster.strongest_z, strongestZ) : strongestZ;
    }
    if (row?.theme_name_ko) {
      cluster.themes.add(row.theme_name_ko);
      if (row.theme_name_ko !== bundleName) {
        cluster.subthemes.add(row.theme_name_ko);
      }
    }

    if (contributors.length) {
      for (const contributor of contributors) {
        const name = contributor?.symbol_name || contributor?.symbol;
        if (!name) continue;
        const share = Number.isFinite(Number(contributor?.share_pct)) ? Number(contributor.share_pct) : 0;
        const move = Number.isFinite(Number(contributor?.price_change_pct)) ? Number(contributor.price_change_pct) : 0;
        const existing = cluster.impact_stock_scores.get(name) || 0;
        cluster.impact_stock_scores.set(name, existing + share);
        const existingMove = cluster.impact_stock_moves.get(name) || { weightedMove: 0, totalShare: 0 };
        cluster.impact_stock_moves.set(name, {
          weightedMove: existingMove.weightedMove + move * Math.max(share, 1),
          totalShare: existingMove.totalShare + Math.max(share, 1),
        });
      }
    } else {
      const fallbackName = getLeadContributorName(row);
      if (fallbackName && fallbackName !== "N/A") {
        const existing = cluster.impact_stock_scores.get(fallbackName) || 0;
        cluster.impact_stock_scores.set(fallbackName, existing + 100);
        const existingMove = cluster.impact_stock_moves.get(fallbackName) || { weightedMove: 0, totalShare: 0 };
        cluster.impact_stock_moves.set(fallbackName, {
          weightedMove: existingMove.weightedMove,
          totalShare: existingMove.totalShare + 1,
        });
      }
    }
  }

  return Array.from(clusters.values())
    .map((cluster) => {
      const snapshot = bundleSnapshotMap.get(cluster.bundle_name) || {};
      const themeList = Array.from(cluster.themes);
      const subthemeList = Array.from(cluster.subthemes);
      const contributorImpactStocks = Array.from(cluster.impact_stock_scores.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([name]) => name);
      const impactMoves = contributorImpactStocks.map((name) => {
        const moveState = cluster.impact_stock_moves.get(name) || { weightedMove: 0, totalShare: 1 };
        return {
          name,
          move: moveState.totalShare ? moveState.weightedMove / moveState.totalShare : 0,
        };
      });
      const positiveCount = Number.isFinite(Number(snapshot.advancing_count))
        ? Number(snapshot.advancing_count)
        : impactMoves.filter((item) => Number(item.move) > 0).length;
      const negativeCount = Number.isFinite(Number(snapshot.declining_count))
        ? Number(snapshot.declining_count)
        : impactMoves.filter((item) => Number(item.move) < 0).length;
      const avgMove = Number.isFinite(Number(snapshot.weighted_avg_change_pct))
        ? Number(snapshot.weighted_avg_change_pct)
        : impactMoves.length > 0
          ? impactMoves.reduce((sum, item) => sum + Number(item.move || 0), 0) / impactMoves.length
          : 0;
      const activeSymbols = Array.isArray(snapshot.active_symbols) && snapshot.active_symbols.length
        ? snapshot.active_symbols
        : contributorImpactStocks;
      const mappedSymbols = Array.isArray(snapshot.mapped_symbols) && snapshot.mapped_symbols.length
        ? snapshot.mapped_symbols
        : activeSymbols;
      const topImpactStocks = activeSymbols.slice(0, 6);
      const topMappedStocks = mappedSymbols.slice(0, 10);
      const topSubthemes = subthemeList.slice(0, 4);
      const extraThemeCount = Math.max(themeList.length - topSubthemes.length, 0);
      const extraStockCount = Math.max(activeSymbols.length - topImpactStocks.length, 0);
      const extraMappedCount = Math.max(mappedSymbols.length - topMappedStocks.length, 0);
      const mappedCount = Number(snapshot.mapped_symbol_count) || mappedSymbols.length;
      const activeCount = Number(snapshot.active_symbol_count) || activeSymbols.length;
      const coveragePct = mappedCount > 0 ? (activeCount / mappedCount) * 100 : 0;
      const preliminaryDirection =
        activeCount > 0 && (avgMove <= -2.5 || (avgMove <= -1.0 && negativeCount > positiveCount && negativeCount >= 2))
          ? "Down Pressure"
          : activeCount > 0 && (avgMove >= 1.0 || positiveCount >= negativeCount)
            ? "Up Interest"
            : "Mixed";
      const actionBucket =
        preliminaryDirection === "Down Pressure"
          ? "Down Pressure"
          : activeCount > 0 && avgMove >= 1.5 && positiveCount >= Math.max(2, negativeCount)
            ? "Long Confirmed"
            : "Flow Only";
      const positiveImpactStocks = impactMoves
        .filter((item) => Number(item.move) > 0)
        .map((item) => item.name);
      const negativeImpactStocks = impactMoves
        .filter((item) => Number(item.move) < 0)
        .map((item) => item.name);
      const directionalImpactStocks =
        preliminaryDirection === "Down Pressure"
          ? (negativeImpactStocks.length > 0 ? negativeImpactStocks : contributorImpactStocks)
          : preliminaryDirection === "Up Interest"
            ? (positiveImpactStocks.length > 0 ? positiveImpactStocks : contributorImpactStocks)
            : contributorImpactStocks;
      const directionalExtraStockCount = Math.max(directionalImpactStocks.length - 6, 0);
      return {
        bundle_name: cluster.bundle_name,
        heat_score: cluster.heat_score,
        active_theme_count: cluster.active_theme_count,
        active_member_count: cluster.active_member_count,
        theme_total_members: cluster.theme_total_members,
        signal_score: cluster.strongest_z,
        coverage_text: `${activeCount} / ${mappedCount} (${coveragePct.toFixed(0)}%)`,
        theme_bundle:
          topSubthemes.length > 0
            ? `${topSubthemes.join(", ")}${extraThemeCount > 0 ? ` 외 ${extraThemeCount}` : ""}`
            : cluster.bundle_name,
        impact_stocks:
          directionalImpactStocks.length > 0
            ? `${directionalImpactStocks.slice(0, 6).join(", ")}${directionalExtraStockCount > 0 ? ` 외 ${directionalExtraStockCount}` : ""}`
            : "N/A",
        bundle_universe:
          topMappedStocks.length > 0
            ? `${topMappedStocks.join(", ")}${extraMappedCount > 0 ? ` 외 ${extraMappedCount}` : ""}`
            : "N/A",
        mapped_symbol_count: mappedCount,
        active_symbol_count: activeCount,
        avg_move: avgMove,
        positive_count: positiveCount,
        negative_count: negativeCount,
        direction_label: preliminaryDirection,
        action_bucket: actionBucket,
        signal_label: actionBucket,
      };
    })
    .sort((left, right) => {
      if (Number(right.heat_score || 0) !== Number(left.heat_score || 0)) {
        return Number(right.heat_score || 0) - Number(left.heat_score || 0);
      }
      return Number(right.active_theme_count || 0) - Number(left.active_theme_count || 0);
    });
}

function buildCloseDriverMaps(payload) {
  const closeReview = payload?.close_review || {};
  const sourceRows = [
    ...(closeReview.leaderboard || []),
    ...(closeReview.top_narrow_themes || []),
    ...(closeReview.top_broad_themes || []),
  ];
  const byThemeId = new Map();
  const byThemeName = new Map();
  const byBundleName = new Map();

  for (const row of sourceRows) {
    const lead = getLeadContributorName(row);
    const bundleName = getThemeBundleName(row);
    if (row?.theme_id && lead && lead !== "N/A" && !byThemeId.has(row.theme_id)) {
      byThemeId.set(row.theme_id, lead);
    }
    if (row?.theme_name_ko && lead && lead !== "N/A" && !byThemeName.has(row.theme_name_ko)) {
      byThemeName.set(row.theme_name_ko, lead);
    }
    if (bundleName && lead && lead !== "N/A" && !byBundleName.has(bundleName)) {
      byBundleName.set(bundleName, lead);
    }
  }

  return { byThemeId, byThemeName, byBundleName };
}

function buildPositionLensRows(payload) {
  const reviewRows = (payload?.weekly_review || {}).review_rows || [];
  const closeDriverMaps = buildCloseDriverMaps(payload);

  const bundleRows = new Map();
  for (const row of reviewRows) {
    const bundleName = getThemeBundleName(row);
    if (!bundleRows.has(bundleName) || Number(row?.current_week_score || 0) > Number(bundleRows.get(bundleName)?.current_week_score || 0)) {
      bundleRows.set(bundleName, row);
    }
  }

  return Array.from(bundleRows.entries())
    .map(([bundleName, row]) => {
      const closeLead =
        closeDriverMaps.byThemeId.get(row?.theme_id) ||
        closeDriverMaps.byThemeName.get(row?.theme_name_ko) ||
        closeDriverMaps.byBundleName.get(bundleName) ||
        "-";
      return {
        bundle_name: bundleName,
        trend_state: row?.trend_state || "N/A",
        current_week_score: row?.current_week_score,
        delta_vs_prior_week: row?.delta_vs_prior_week,
        close_lead: closeLead,
        view: getPositionView(row),
      };
    })
    .sort((left, right) => Number(right.current_week_score || 0) - Number(left.current_week_score || 0))
    .slice(0, 12);
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
  generatedEl.textContent = formatTimestamp(meta.generated_at);
  if (overviewStatusEl) overviewStatusEl.textContent = meta.status || "unknown";
  if (overviewGeneratedEl) overviewGeneratedEl.textContent = formatTimestamp(meta.generated_at);

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

function parseStructuredArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function renderIssueCards(issueCards) {
  const cards = parseStructuredArray(issueCards);
  if (!cards.length) {
    return '<p class="placeholder">No concise Q&amp;A issue cards available for this quarter.</p>';
  }
  return `
    <div class="issue-card-grid">
      ${cards
        .map((card) => {
          const topic = escapeHtml(titleCase(card.topic || "General"));
          const analyst = escapeHtml(card.analyst || "Unknown analyst");
          const directness = escapeHtml(card.directness || "unknown");
          const status = escapeHtml(card.status || "unknown");
          return `
            <article class="issue-card">
              <div class="issue-card-head">
                <div class="issue-card-badges">
                  <span class="issue-badge topic">${topic}</span>
                  <span class="issue-badge directness">${directness}</span>
                  <span class="issue-badge status">${status}</span>
                </div>
                <p class="issue-analyst">${analyst}</p>
              </div>
              <div class="issue-copy">
                <section>
                  <h5>Question</h5>
                  <p>${escapeHtml(card.question_summary || "N/A")}</p>
                </section>
                <section>
                  <h5>Management Answer</h5>
                  <p>${escapeHtml(card.management_summary || "N/A")}</p>
                </section>
                <section>
                  <h5>Takeaway</h5>
                  <p>${escapeHtml(card.takeaway || "N/A")}</p>
                </section>
              </div>
              <details class="issue-evidence">
                <summary>Evidence</summary>
                <p><strong>Question:</strong> ${escapeHtml(card.question_evidence || "N/A")}</p>
                <p><strong>Answer:</strong> ${escapeHtml(card.answer_evidence || "N/A")}</p>
              </details>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
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
    ["Generated At", formatTimestamp(payload.generated_at)],
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
      const issueCards = parseStructuredArray(quarter.qa_issue_cards);
      const bullish = quarter.bullish_keywords ? escapeHtml(quarter.bullish_keywords) : "N/A";
      const bearish = quarter.bearish_keywords ? escapeHtml(quarter.bearish_keywords) : "N/A";
      const directness = escapeHtml(quarter.management_directness || "unknown");
      const unresolved = escapeHtml(quarter.unresolved_questions || "None");
      const keyEvidence = escapeHtml(quarter.key_evidence || "N/A");
      const guidanceView = escapeHtml(quarter.guidance_view || "N/A");
      const demandView = escapeHtml(quarter.demand_view || "N/A");
      const marginView = escapeHtml(quarter.margin_view || "N/A");
      const credibilityView = escapeHtml(quarter.credibility_view || "N/A");
      const concerns = escapeHtml(quarter.top_analyst_concerns || "N/A");
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

          <section class="transcript-priority-block">
            <div class="transcript-section-head">
              <h4>Top Q&amp;A Issues</h4>
              <p>Concise issue cards built from the highest-signal analyst exchanges.</p>
            </div>
            ${renderIssueCards(issueCards)}
          </section>

          <div class="transcript-metrics">
            <div><span>Direction</span><strong>${escapeHtml(quarter.tone_direction || "flat")}</strong></div>
            <div><span>Guidance</span><strong>${escapeHtml(quarter.guidance_delta || "N/A")}</strong></div>
            <div><span>Confidence</span><strong>${escapeHtml(quarter.analysis_confidence || "N/A")}</strong></div>
            <div><span>Q&A</span><strong>${quarter.qa_present ? "Present" : "Missing"}</strong></div>
            <div><span>Directness</span><strong>${directness}</strong></div>
            <div><span>Improved</span><strong>${escapeHtml(quarter.what_improved || "N/A")}</strong></div>
            <div><span>Worsened</span><strong>${escapeHtml(quarter.what_worsened || "N/A")}</strong></div>
            <div><span>Prev Quarter</span><strong>${escapeHtml(quarter.previous_quarter || "N/A")}</strong></div>
          </div>

          <div class="transcript-copy">
            <section>
              <h4>Top Analyst Concerns</h4>
              <p>${concerns}</p>
            </section>
            <section>
              <h4>Comparison</h4>
              <p>${escapeHtml(quarter.comparison_summary || "N/A")}</p>
            </section>
            <section>
              <h4>Management Answers</h4>
              <p>${escapeHtml(quarter.management_answers_summary || "N/A")}</p>
            </section>
          </div>

          <div class="transcript-copy">
            <section>
              <h4>Guidance View</h4>
              <p>${guidanceView}</p>
            </section>
            <section>
              <h4>Demand View</h4>
              <p>${demandView}</p>
            </section>
            <section>
              <h4>Margin View</h4>
              <p>${marginView}</p>
            </section>
          </div>

          <details class="transcript-detail-block">
            <summary>Quarter Narrative &amp; Supporting Detail</summary>
            <div class="transcript-copy transcript-copy-compact">
              <section>
                <h4>Quarter Summary</h4>
                <p>${escapeHtml(quarter.quarter_summary || "N/A")}</p>
              </section>
              <section>
                <h4>Credibility View</h4>
                <p>${credibilityView}</p>
              </section>
              <section>
                <h4>Key Evidence</h4>
                <p>${keyEvidence}</p>
              </section>
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
                <h4>Unresolved Questions</h4>
                <p>${unresolved}</p>
              </section>
              <section>
                <h4>Limitations</h4>
                <p>${escapeHtml(quarter.limitations || "None")}</p>
              </section>
            </div>
          </details>
        </article>
      `;
    })
    .join("");
}

function renderKoreaThemeDashboard(payload) {
  const summaryTarget = document.getElementById("korea-theme-summary");
  const contributorTarget = document.getElementById("korea-theme-contributors");
  if (!summaryTarget) return;
  if (!payload || !Array.isArray(payload.now) || payload.now.length === 0) {
    summaryTarget.innerHTML = '<p class="placeholder">No Korea theme snapshot published yet.</p>';
    if (contributorTarget) {
      contributorTarget.innerHTML = '<p class="placeholder">No contributor map published yet.</p>';
    }
    return;
  }

  const now = payload.now || [];
  const narrow = payload.top_narrow_themes || [];
  const broad = payload.top_broad_themes || [];
  const impactClusters = buildImpactClusters(payload);
  const longConfirmedClusters = impactClusters.filter((row) => row.action_bucket === "Long Confirmed");
  const flowOnlyClusters = impactClusters.filter((row) => row.action_bucket === "Flow Only");
  const downClusters = impactClusters.filter((row) => row.action_bucket === "Down Pressure");
  const positionLensRows = buildPositionLensRows(payload);
  const topBundle = longConfirmedClusters[0] || flowOnlyClusters[0] || downClusters[0] || impactClusters[0] || {};
  const topNarrow = narrow[0] || {};
  const methodology = payload.methodology || {};
  const filteredBroad = broad.filter((row) => {
    const activeCount = Number(row?.active_member_count || 0);
    const heatScore = Number(row?.heat_score || 0);
    const strongestZ = getStrongestThemeZScore(row);
    return activeCount >= 2 || heatScore >= 55 || (Number.isFinite(strongestZ) && strongestZ >= 1.0);
  });
  const broadRows = filteredBroad.length ? filteredBroad : broad;
  const topBroad = broadRows[0] || {};

  summaryTarget.innerHTML = `
    <div class="overview-grid">
      <article class="stat-card">
        <h3>Latest Snapshot</h3>
        <p class="stat-value">${escapeHtml(formatTimestamp(payload.generated_at || payload.intraday_date || payload.latest_date || "N/A"))}</p>
      </article>
      <article class="stat-card">
        <h3>Top Bundle Now</h3>
        <p class="stat-value">${escapeHtml(topBundle.bundle_name || "N/A")}</p>
      </article>
      <article class="stat-card">
        <h3>Current Heat</h3>
        <p class="stat-value">${formatNumber(topBundle.heat_score, 1)}</p>
      </article>
      <article class="stat-card">
        <h3>Top Specific</h3>
        <p class="stat-value">${escapeHtml(topNarrow.theme_name_ko || "N/A")}</p>
      </article>
      <article class="stat-card">
        <h3>Participation</h3>
        <p class="stat-value">${escapeHtml(getParticipationText(topNarrow))}</p>
      </article>
      <article class="stat-card">
        <h3>Position Leader</h3>
        <p class="stat-value">${escapeHtml((positionLensRows[0] || {}).bundle_name || topBroad.theme_name_ko || "N/A")}</p>
      </article>
    </div>
    <article class="method-card">
      <h3>How This Ranks Now</h3>
      <p>${escapeHtml(methodology.primary || "현재 시각까지의 누적 거래대금/거래량을 과거 같은 시각의 누적치와 비교해 상대강도를 봅니다.")}</p>
      <p>${escapeHtml(methodology.fallback || "같은 시각 이력이 부족하면 최근 20일 일평균 거래대금/거래량에 세션 진행률을 곱한 기대치로 보정합니다.")}</p>
      <p>${escapeHtml(methodology.minute_role || "1분봉은 상세 확인용이고, 메인 랭킹 기준은 same-time cumulative flow입니다.")}</p>
      <p>${escapeHtml(methodology.bundle_scope || "번들 해석은 현재 활성 종목만이 아니라, taxonomy에 매핑된 전체 종목군과 현재 활성 종목군을 함께 봅니다.")}</p>
      <p>${escapeHtml(methodology.coarse_scope || "장중 broad coarse는 전 종목에 가깝게 넓게 훑고, minute 상세는 shortlist만 추적해 병목을 줄입니다.")}</p>
    </article>
  `;

  renderTable(
    "korea-theme-position-lens",
    [
      { key: "bundle_name", label: "Theme Bundle" },
      { key: "trend_state", label: "Weekly Trend" },
      { key: "current_week_score", label: "Current W", numeric: true, render: (v) => formatNumber(v, 1) },
      { key: "delta_vs_prior_week", label: "WoW Delta", numeric: true, render: (v) => formatNumber(v, 1) },
      { key: "close_lead", label: "Close Driver" },
      { key: "view", label: "Position View" },
    ],
    positionLensRows,
  );

  renderTable(
    "korea-theme-now",
    [
      { key: "bundle_name", label: "Theme Bundle" },
      { key: "heat_score", label: "Heat", numeric: true, render: (v) => formatNumber(v, 1) },
      { key: "coverage_text", label: "Coverage" },
      { key: "impact_stocks", label: "Impact Stocks" },
      { key: "theme_bundle", label: "Covered Themes" },
      { key: "signal_label", label: "Signal", render: (_v, row) => formatActionPill(row.signal_label) },
    ],
    longConfirmedClusters.slice(0, 18),
  );

  renderTable(
    "korea-theme-flow",
    [
      { key: "bundle_name", label: "Theme Bundle" },
      { key: "heat_score", label: "Heat", numeric: true, render: (v) => formatNumber(v, 1) },
      { key: "coverage_text", label: "Coverage" },
      { key: "impact_stocks", label: "Impact Stocks" },
      { key: "theme_bundle", label: "Covered Themes" },
      { key: "signal_label", label: "Signal", render: (_v, row) => formatActionPill(row.signal_label) },
    ],
    flowOnlyClusters.slice(0, 14),
  );

  renderTable(
    "korea-theme-down",
    [
      { key: "bundle_name", label: "Theme Bundle" },
      { key: "heat_score", label: "Heat", numeric: true, render: (v) => formatNumber(v, 1) },
      { key: "coverage_text", label: "Coverage" },
      { key: "impact_stocks", label: "Impact Stocks" },
      { key: "theme_bundle", label: "Covered Themes" },
      {
        key: "signal_label",
        label: "Signal",
        render: (_v, row) => formatActionPill(row.signal_label || "Down Pressure"),
      },
    ],
    downClusters.slice(0, 12),
  );

  renderTable(
    "korea-theme-narrow",
    [
      { key: "theme_name_ko", label: "Theme" },
      { key: "heat_score", label: "Heat", numeric: true, render: (v) => formatNumber(v, 1) },
      { key: "turnover_z", label: "Turnover Z", numeric: true, render: (_v, row) => formatNumber(row.z_scores?.turnover, 2) },
      { key: "volume_z", label: "Volume Z", numeric: true, render: (_v, row) => formatNumber(row.z_scores?.volume, 2) },
      { key: "lead", label: "Lead", render: (_v, row) => escapeHtml(getLeadContributorName(row)) },
    ],
    narrow.slice(0, 18),
  );

  renderTable(
    "korea-theme-broad",
    [
      { key: "theme_name_ko", label: "Theme" },
      { key: "heat_score", label: "Heat", numeric: true, render: (v) => formatNumber(v, 1) },
      { key: "active_member_count", label: "Active", numeric: true },
      { key: "turnover_z", label: "Turnover Z", numeric: true, render: (_v, row) => formatNumber(row.z_scores?.turnover, 2) },
      { key: "volume_z", label: "Volume Z", numeric: true, render: (_v, row) => formatNumber(row.z_scores?.volume, 2) },
      { key: "lead", label: "Top Contributor", render: (_v, row) => escapeHtml(getLeadContributorName(row)) },
    ],
    broadRows.slice(0, 14),
  );

  renderTable(
    "korea-theme-weekly",
    [
      { key: "theme_name_ko", label: "Theme" },
      { key: "trend_state", label: "Trend" },
      { key: "current_week_score", label: "Current W", numeric: true, render: (v) => formatNumber(v, 1) },
      { key: "prior_week_score", label: "Prior W", numeric: true, render: (v) => formatNumber(v, 1) },
      { key: "delta_vs_prior_week", label: "Delta", numeric: true, render: (v) => formatNumber(v, 1) },
      { key: "four_week_mean", label: "4W Mean", numeric: true, render: (v) => formatNumber(v, 1) },
    ],
    ((payload.weekly_review || {}).review_rows || []).slice(0, 20),
  );

  renderTable(
    "korea-theme-explorer",
    [
      { key: "theme_name_ko", label: "Theme" },
      { key: "theme_level", label: "Level" },
      { key: "breadcrumb", label: "Hierarchy" },
      { key: "heat_score", label: "Heat", numeric: true, render: (v) => formatNumber(v, 1) },
      { key: "reason_text", label: "Reason" },
    ],
    (payload.theme_explorer || []).slice(0, 30),
  );

  if (contributorTarget) {
    contributorTarget.innerHTML = impactClusters.length
      ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Theme Bundle</th><th>Active Now</th><th>Bundle Universe</th><th>Coverage</th><th>Covered Themes</th><th>Heat</th></tr></thead><tbody>${impactClusters
          .slice(0, 20)
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.bundle_name || "N/A")}</td><td>${escapeHtml(row.impact_stocks || "N/A")}</td><td>${escapeHtml(row.bundle_universe || "N/A")}</td><td>${escapeHtml(row.coverage_text || "N/A")}</td><td>${escapeHtml(row.theme_bundle || "N/A")}</td><td class="numeric">${formatNumber(row.heat_score, 1)}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : '<p class="placeholder">No contributor map published yet.</p>';
  }
}

function renderKoreaRealtimeFlow(payload) {
  const summaryTarget = document.getElementById("korea-realtime-summary");
  const buyTarget = document.getElementById("korea-realtime-buy");
  const flowTarget = document.getElementById("korea-realtime-flow");
  const sellTarget = document.getElementById("korea-realtime-sell");
  if (!summaryTarget || !buyTarget || !flowTarget || !sellTarget) return;

  if (!payload || !payload.feed_status) {
    const placeholder = '<p class="placeholder">No live realtime flow snapshot published yet.</p>';
    summaryTarget.innerHTML = placeholder;
    buyTarget.innerHTML = placeholder;
    flowTarget.innerHTML = placeholder;
    sellTarget.innerHTML = placeholder;
    return;
  }

  const status = payload.feed_status || {};
  summaryTarget.innerHTML = `
    <div class="overview-grid realtime-grid">
      <article class="stat-card">
        <h3>Live Feed Mode</h3>
        <p class="stat-value">${escapeHtml(status.monitoring_mode || "N/A")}</p>
      </article>
      <article class="stat-card">
        <h3>Realtime Snapshot</h3>
        <p class="stat-value">${escapeHtml(formatTimestamp(payload.generated_at || status.generated_at || "N/A"))}</p>
      </article>
      <article class="stat-card">
        <h3>Workers</h3>
        <p class="stat-value">${escapeHtml(String(status.worker_count ?? "N/A"))}</p>
      </article>
      <article class="stat-card">
        <h3>Active Tier</h3>
        <p class="stat-value">${escapeHtml(String(status.active_subscription_count ?? "N/A"))}</p>
      </article>
      <article class="stat-card">
        <h3>Lower Tier</h3>
        <p class="stat-value">${escapeHtml(String(status.lower_tier_count ?? "N/A"))}</p>
      </article>
      <article class="stat-card">
        <h3>Buy Pops</h3>
        <p class="stat-value">${escapeHtml(String(status.buy_pressure_count ?? 0))}</p>
      </article>
    </div>
    <article class="method-card">
      <h3>How Live Flow Works</h3>
      <p>${escapeHtml(payload.methodology?.primary || "SC 체결 누적 거래대금/거래량을 20일 일평균과 세션 진행률 기대치에 비교합니다.")}</p>
      <p>${escapeHtml(payload.methodology?.confirmation || "SH 호가를 같이 받아 buy-pressure proxy와 가격 방향을 확인합니다.")}</p>
      <p>${escapeHtml(payload.methodology?.tiering || "전 종목 universe를 shard로 나누고 active tier와 lower tier를 30초 cadence로 재평가합니다.")}</p>
    </article>
  `;

  const columns = [
    { key: "symbol", label: "Symbol" },
    { key: "symbol_name", label: "Name" },
    { key: "bundles_text", label: "Bundle Context" },
    { key: "price_change_pct", label: "Chg %", numeric: true, render: (v) => formatPctCell(v, 2) },
    { key: "turnover_z", label: "Turnover Z", numeric: true, render: (v) => formatNumber(v, 2) },
    { key: "volume_z", label: "Volume Z", numeric: true, render: (v) => formatNumber(v, 2) },
    { key: "buy_pressure_proxy", label: "Pressure", numeric: true, render: (v) => formatNumber(v, 2) },
    { key: "themes_text", label: "Themes" },
  ];

  renderTable("korea-realtime-buy", columns, payload.buy_pressure_pops || []);
  renderTable("korea-realtime-flow", columns, payload.flow_only || []);
  renderTable("korea-realtime-sell", columns, payload.sell_pressure || []);
}

function renderKoreaThemeFirstScreener(payload) {
  const target = document.getElementById("korea-theme-first-screener");
  if (!target) return;
  if (!payload || payload.status !== "success") {
    target.innerHTML = '<p class="placeholder">No theme-first EOD screener report published yet.</p>';
    return;
  }

  const markdownText = String(payload.markdown_text || "").trim();
  const payloadData = payload.payload || {};
  const representativeRows = Array.isArray(payloadData.representatives)
    ? payloadData.representatives
    : Array.isArray(payloadData.representative_stocks)
      ? payloadData.representative_stocks
    : Array.isArray(payloadData.final_candidates)
      ? payloadData.final_candidates
      : [];
  const compactRows = representativeRows.slice(0, 12).map((row) => ({
    name: row.symbol_name || row.name || row["종목명"] || row.symbol || "N/A",
    symbol: row.symbol || row.ticker || row["티커"] || "",
    theme: row.traded_subtheme || row.theme?.traded_subtheme || row.theme || row["테마"] || row.theme_name_ko || "N/A",
    classification: row.leader_role || row.condition16_bucket || row.classification || row.bucket || row["classification"] || row["판단"] || "N/A",
    action: row.action_bucket || row.action || row["액션"] || row.current_action || "N/A",
  }));
  const directMarkdownUrl = payload.markdown_artifact
    ? `./data/korea-theme/${encodeURIComponent(payload.markdown_artifact)}`
    : "";

  target.innerHTML = `
    <div class="overview-grid">
      <article class="stat-card">
        <h3>Screen Date</h3>
        <p class="stat-value">${escapeHtml(payload.screen_date || "N/A")}</p>
      </article>
      <article class="stat-card">
        <h3>Discovery Period</h3>
        <p class="stat-value">${escapeHtml([payload.start_date, payload.end_date].filter(Boolean).join(" - ") || "N/A")}</p>
      </article>
      <article class="stat-card">
        <h3>Published</h3>
        <p class="stat-value">${escapeHtml(formatTimestamp(payload.generated_at || "N/A"))}</p>
      </article>
      <article class="stat-card">
        <h3>Full Report</h3>
        <p class="stat-value">${directMarkdownUrl ? `<a href="${directMarkdownUrl}" target="_blank" rel="noreferrer">Open MD</a>` : "Inline"}</p>
      </article>
    </div>
    <div id="korea-theme-first-screener-table"></div>
    <details class="markdown-report-shell" open>
      <summary>Full Theme-First Screener Report</summary>
      <pre class="markdown-report">${escapeHtml(markdownText || "No markdown report body found.")}</pre>
    </details>
  `;

  renderTable(
    "korea-theme-first-screener-table",
    [
      { key: "name", label: "Name" },
      { key: "symbol", label: "Ticker" },
      { key: "theme", label: "Theme" },
      { key: "classification", label: "Classification" },
      { key: "action", label: "Action" },
    ],
    compactRows,
  );
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

async function loadJsonOrNull(url) {
  try {
    return await loadJson(url);
  } catch (_error) {
    return null;
  }
}

async function loadAndRenderDashboard() {
  try {
    const [meta, weekHigh, watchlist, transcripts, themeFirstScreener] = await Promise.all([
      loadJson(META_URL),
      loadJson(WEEK_HIGH_URL),
      loadJson(WATCHLIST_URL),
      loadJson(TRANSCRIPTS_URL),
      loadJsonOrNull(KOREA_THEME_FIRST_SCREENER_URL),
    ]);

    renderMeta(meta);
    renderWeekHighSummary(weekHigh);
    renderWeekHighStocks(weekHigh);
    renderBuySummary(watchlist);
    renderSectorBlocks(watchlist);
    renderOverview(weekHigh, watchlist, transcripts);
    renderTranscriptAnalysis(transcripts);
    renderKoreaThemeFirstScreener(themeFirstScreener);
    const alertPanel = document.getElementById("alert-panel");
    if (alertPanel) {
      alertPanel.hidden = true;
      alertPanel.classList.remove("alert");
    }
  } catch (error) {
    const alertPanel = document.getElementById("alert-panel");
    const alertText = document.getElementById("alert-text");
    alertPanel.hidden = false;
    alertPanel.classList.add("alert");
    alertText.textContent = `Failed to load dashboard data: ${error.message}`;
  }
}

function bindRefreshButton() {
  const button = document.getElementById("refresh-dashboard-btn");
  if (!button) return;
  button.addEventListener("click", async () => {
    const priorLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Refreshing...";
    await loadAndRenderDashboard();
    button.textContent = priorLabel;
    button.disabled = false;
  });
}

async function boot() {
  bindTabEvents();
  bindRefreshButton();
  setActiveTab(getInitialTab(), { persist: false });
  await loadAndRenderDashboard();
}

boot();
