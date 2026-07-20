const REPORT_URL = "../data/korea-theme/sugeup_latest.json";
const REPORT_POLL_INTERVAL_MS = 5 * 60 * 1000;
const SCHEDULED_SLOTS_KST = new Set(["16:00", "18:00", "21:00"]);

let report = null;
let reportRequestInFlight = false;
let rsHorizon = "short_term";

const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function text(value, fallback = "데이터 없음") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function formatDate(value) {
  if (!value) return "데이터 없음";
  const compact = String(value).match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}.${compact[2]}.${compact[3]}`;
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${year}.${month}.${day}` : String(value);
}

function formatUpdateTime(payload) {
  const slot = payload?.scheduled_run_slot_kst;
  if (SCHEDULED_SLOTS_KST.has(slot)) return `${slot} KST`;

  const generatedAt = new Date(payload?.generated_at_utc || "");
  if (Number.isNaN(generatedAt.getTime())) return "데이터 없음";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(generatedAt)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute} KST`;
}

function formatPct(value, digits = 1) {
  const n = number(value);
  if (n === null) return "데이터 없음";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function formatScore(value) {
  const n = number(value);
  return n === null ? "—" : Math.round(n).toString();
}

function formatPrice(value) {
  const n = number(value);
  if (n === null) return "데이터 없음";
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n)}원`;
}

function formatMoneyMillion(value, signed = false) {
  const n = number(value);
  if (n === null) return "데이터 없음";
  const sign = signed && n > 0 ? "+" : "";
  const abs = Math.abs(n);
  if (abs >= 100) return `${sign}${(n / 100).toFixed(abs >= 10_000 ? 0 : 1)}억`;
  return `${sign}${n.toFixed(0)}백만`;
}

function formatKrw(value) {
  const n = number(value);
  if (n === null) return "데이터 없음";
  return `${(n / 100_000_000).toFixed(Math.abs(n) >= 1_000_000_000 ? 1 : 2)}억`;
}

function flowClass(value) {
  const n = number(value);
  if (n === null || n === 0) return "";
  return n > 0 ? "flow-positive" : "flow-negative";
}

function flowText(value) {
  const n = number(value);
  if (n === null) return "데이터 없음";
  const icon = n > 0 ? "🟢" : n < 0 ? "🔴" : "⚪";
  return `${icon} ${formatMoneyMillion(n, true)}`;
}

function names(rows, fallback = "—") {
  if (!Array.isArray(rows) || rows.length === 0) return fallback;
  return rows
    .map((row) => (typeof row === "string" ? row : row?.name || row?.symbol))
    .filter(Boolean)
    .join(" · ");
}

function renderHero() {
  const coverage = report.data_coverage || {};
  const summary = report.market_summary || {};
  const conclusion = report.conclusion || {};
  const top = (report.top_regimes || [])[0] || {};
  const leading = conclusion.truly_leading_themes || [];
  const traded = conclusion.actually_traded_subthemes || [];

  byId("screen-date").textContent = formatDate(coverage.screen_date || report.screen_date);
  byId("update-time").textContent = formatUpdateTime(report);
  byId("period-label").textContent = `${formatDate(coverage.requested_start_date)} – ${formatDate(coverage.requested_end_date)}`;
  byId("session-count").textContent = `${(coverage.available_trading_dates || []).length}일`;
  byId("data-health").textContent = coverage.market_cap?.available && coverage.market_alert?.available ? "완전" : "일부 보조자료 없음";
  byId("top-regime").textContent = top.name || "유효 주도 테마 없음";
  byId("market-style").textContent = conclusion.market_favors || summary.market_favors || "관찰";

  const leadingText = leading.length ? `기간 주도는 ${leading.slice(0, 3).join(" · ")}` : "기간 주도 테마는 제한적";
  const tradedText = traded.length ? `실제 거래는 ${traded.slice(0, 3).join(" · ")}에 집중됐습니다.` : "강한 하위 테마가 제한적입니다.";
  byId("market-conclusion").textContent = `${leadingText}이며, ${tradedText} 화면 기준일 환경은 ${conclusion.market_favors || "선별 관찰"} 쪽에 가깝습니다.`;
}

function renderSummaryCards() {
  const coverage = report.data_coverage || {};
  const conclusion = report.conclusion || {};
  const shortCandidates = report.viability_candidates?.short_term || {};
  const viableShortCount = ["지금 리더", "초기 흡수", "재돌파 대기"].reduce((sum, label) => sum + (shortCandidates[label] || []).length, 0);
  const cards = [
    ["주도 테마", (report.top_regimes || []).length, "상위 3개 제한"],
    ["거래 하위 테마", (report.traded_subthemes || []).length, "상위 5개 제한"],
    ["대표 종목", (report.representative_stocks || []).length, "유동성·리더십 반영"],
    ["다음 날 관찰", (report.watchlist || []).length, "최대 15개"],
    ["단기 유효 후보", viableShortCount, viableShortCount ? "수급·리스크 게이트 통과" : "조건 충족 종목 0개"],
  ];
  byId("summary-cards").innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="summary-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(note)}</small>
        </article>`,
    )
    .join("");

  if ((coverage.missing_weekday_dates || []).length) {
    byId("data-health").textContent = "거래일 확인 필요";
  }
}

function metricCard(label, value, note, tone = "") {
  return `<article class="fund-metric ${escapeHtml(tone)}">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    <small>${escapeHtml(note)}</small>
  </article>`;
}

function equityPath(points, key, minimum, maximum, width, height, padding) {
  const usable = points
    .map((point, index) => ({ index, value: number(point[key]) }))
    .filter((point) => point.value !== null && point.value > 0);
  if (usable.length < 2) return "";
  const logMin = Math.log(minimum);
  const logMax = Math.log(maximum);
  return usable
    .map((point, pathIndex) => {
      const x = padding + (point.index / Math.max(1, points.length - 1)) * (width - padding * 2);
      const y = height - padding - ((Math.log(point.value) - logMin) / Math.max(0.0001, logMax - logMin)) * (height - padding * 2);
      return `${pathIndex ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function renderEquityChart() {
  const curve = report.backtest?.equity_curve || [];
  const container = byId("equity-chart");
  if (!curve.length) {
    container.innerHTML = '<p class="context-empty">검증 가능한 백테스트 구간이 없습니다.</p>';
    return;
  }
  const keys = ["net", "market_proxy", "hedged_net"];
  const values = curve.flatMap((point) => keys.map((key) => number(point[key])).filter((value) => value !== null && value > 0));
  const minimum = Math.max(1, Math.min(...values) * 0.88);
  const maximum = Math.max(minimum * 1.05, Math.max(...values) * 1.12);
  const width = 820;
  const height = 300;
  const padding = 44;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding + ratio * (height - padding * 2);
    const logValue = Math.log(maximum) - ratio * (Math.log(maximum) - Math.log(minimum));
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" />
      <text x="${padding - 8}" y="${y + 4}" text-anchor="end">${Math.exp(logValue).toFixed(0)}</text>`;
  }).join("");
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="정규화 지수, 로그 축">
    <g class="chart-grid">${grid}</g>
    <path class="curve-net" d="${equityPath(curve, "net", minimum, maximum, width, height, padding)}" />
    <path class="curve-market" d="${equityPath(curve, "market_proxy", minimum, maximum, width, height, padding)}" />
    <path class="curve-hedged" d="${equityPath(curve, "hedged_net", minimum, maximum, width, height, padding)}" />
    <text class="chart-date" x="${padding}" y="${height - 10}">${escapeHtml(formatDate(curve[0]?.date))}</text>
    <text class="chart-date" text-anchor="end" x="${width - padding}" y="${height - 10}">${escapeHtml(formatDate(curve.at(-1)?.date))}</text>
  </svg>`;
}

function renderSizing() {
  if (!report) return;
  const input = byId("fund-nav-eok");
  const navEok = Math.max(0, number(input?.value) ?? 10);
  const navKrw = navEok * 100_000_000;
  const decision = report.portfolio_decision || {};
  const holdings = decision.holdings || [];
  const hedgePct = number(report.hedge_plan?.hedge_notional_pct_of_nav) ?? 0;
  const hedgeNotional = navKrw * hedgePct / 100;
  const capacity = number(report.execution_capacity?.minimum_capacity_nav_krw);
  const breaches = holdings.filter((row) => {
    const weight = number(row.target_weight_pct) ?? 0;
    const advMillion = number(row.average_turnover_20d_million_krw);
    return advMillion && (navKrw * weight / 100) / (advMillion * 1_000_000) > 0.05;
  });
  const capacityUsage = capacity && capacity > 0 ? 100 * navKrw / capacity : null;
  byId("sizing-output").innerHTML = `
    <div><span>모의 주식 익스포저</span><strong>${escapeHtml(formatKrw(navKrw * (1 - (number(decision.cash_weight_pct) ?? 0) / 100)))}</strong></div>
    <div><span>시장 beta 프록시</span><strong>${number(decision.portfolio_beta_market_proxy)?.toFixed(2) ?? "—"}</strong></div>
    <div><span>진단상 헤지 명목</span><strong>${escapeHtml(formatKrw(hedgeNotional))}</strong></div>
    <div><span>최소 용량 대비 NAV</span><strong>${capacityUsage === null ? "데이터 없음" : `${capacityUsage.toFixed(1)}%`}</strong></div>
    <div class="${breaches.length ? "sizing-warning" : "sizing-ok"}"><span>5% ADV 초과</span><strong>${breaches.length}종목</strong></div>
    <div><span>선물 계약 수</span><strong>${escapeHtml(report.hedge_plan?.contract_count_status || "미연결")}</strong></div>`;

  document.querySelectorAll("[data-book-symbol]").forEach((row) => {
    const weight = number(row.dataset.weight) ?? 0;
    const advMillion = number(row.dataset.adv);
    const amount = navKrw * weight / 100;
    const participation = advMillion ? 100 * amount / (advMillion * 1_000_000) : null;
    const amountNode = row.querySelector("[data-book-amount]");
    const participationNode = row.querySelector("[data-book-participation]");
    if (amountNode) amountNode.textContent = formatKrw(amount);
    if (participationNode) {
      participationNode.textContent = participation === null ? "ADV 데이터 없음" : `ADV ${participation.toFixed(2)}%`;
      participationNode.classList.toggle("is-breach", participation !== null && participation > 5);
    }
  });
}

function renderDecisionBook() {
  const decision = report.portfolio_decision || {};
  const rows = decision.holdings || [];
  if (!rows.length) {
    byId("decision-book").innerHTML = '<p class="empty-state">기관형 모멘텀 이력 조건을 충족한 모의 종목이 없습니다.</p>';
    return;
  }
  byId("decision-book").innerHTML = `<div class="table-scroll"><table class="fund-table">
    <thead><tr><th>종목 / 조치</th><th>점수</th><th>비중 / 주문</th><th>6-1M / 12-1M</th><th>수급 / 위험</th><th>트리거 / 무효화</th></tr></thead>
    <tbody>${rows.map((row) => {
      const risks = (row.risk_flags || []).slice(0, 2).join(" · ") || "추가 하드 위험 없음";
      return `<tr data-book-symbol="${escapeHtml(row.symbol)}" data-weight="${number(row.target_weight_pct) ?? 0}" data-adv="${number(row.average_turnover_20d_million_krw) ?? ""}">
        <td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.symbol)} · ${escapeHtml(row.market)}<br><span class="book-action">${escapeHtml(row.action)}</span></small></td>
        <td><strong>${formatScore(row.score)}</strong><small>Fast RS ${formatScore(row.fast_rs_score)} · 진입 ${formatScore(row.entry_timing_score)}</small></td>
        <td><strong>${formatPct(row.target_weight_pct)}</strong><small data-book-amount>—</small><small data-book-participation>—</small></td>
        <td><strong>${formatPct(row.momentum_6_1_pct)} / ${formatPct(row.momentum_12_1_pct)}</strong><small>6-1 순위 ${formatScore(row.percentile_6_1)} · 12-1 ${formatScore(row.percentile_12_1)}</small></td>
        <td><strong>수급 ${formatScore(row.flow_percentile_20d)} · β ${number(row.beta_60d_market_proxy)?.toFixed(2) ?? "—"}</strong><small>${escapeHtml(risks)}</small></td>
        <td><strong>${escapeHtml(row.trigger || "종가 확인")}${number(row.trigger_price) !== null ? ` · ${escapeHtml(formatPrice(row.trigger_price))}` : ""}</strong><small>무효화 ${escapeHtml(formatPrice(row.invalidation_price))}</small></td>
      </tr>`;
    }).join("")}</tbody>
  </table></div>`;
}

function renderFundCockpit() {
  const readiness = report.investment_readiness || {};
  const backtest = report.backtest || {};
  const net = backtest.net_metrics || {};
  const gross = backtest.gross_metrics || {};
  const ic = backtest.information_coefficient || {};
  const failures = readiness.failed_gates || [];
  const ready = readiness.capital_deployment_allowed === true;
  byId("readiness-banner").className = `readiness-banner ${ready ? "is-ready" : "is-research"}`;
  byId("readiness-banner").innerHTML = `<div class="readiness-main">
    <span class="readiness-label">${escapeHtml(readiness.label || "판정 대기")}</span>
    <div><strong>${ready ? "자본투입 게이트 통과" : "실자본 투입 금지 · 모의운용만"}</strong><p>${escapeHtml(readiness.next_gate || "검증 데이터가 더 필요합니다.")}</p></div>
  </div><ul>${failures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join("")}</ul>`;
  byId("fund-metrics").innerHTML = [
    metricCard("비용 차감 연환산", formatPct(net.annualized_return_pct), `총 ${formatPct(net.total_return_pct)} · 짧은 표본`, "positive"),
    metricCard("비용 차감 Sharpe", number(net.sharpe_zero_rf)?.toFixed(2) ?? "—", "무위험 0% 가정", ""),
    metricCard("최대 낙폭", formatPct(net.max_drawdown_pct), "게이트: -20% 이내", (number(net.max_drawdown_pct) ?? 0) < -20 ? "negative" : ""),
    metricCard("평균 Rank IC", number(ic.mean_rank_ic)?.toFixed(3) ?? "—", `${ic.observation_dates ?? 0}개 평가일`, ""),
    metricCard("리밸런싱 회전율", formatPct(backtest.average_one_way_turnover_pct), `회당 비용 ${formatPct(backtest.average_estimated_cost_pct_per_rebalance, 2)}`, ""),
    metricCard("비용 드래그", `${(number(gross.total_return_pct) ?? 0) - (number(net.total_return_pct) ?? 0) >= 0 ? "-" : "+"}${Math.abs((number(gross.total_return_pct) ?? 0) - (number(net.total_return_pct) ?? 0)).toFixed(1)}%p`, `${backtest.rebalance_periods ?? 0}회 리밸런싱`, ""),
  ].join("");
  byId("backtest-period").textContent = `${formatDate(backtest.evaluation_start)} – ${formatDate(backtest.evaluation_end)} · ${backtest.rebalance_periods ?? 0}회`;
  renderEquityChart();
  const statistical = backtest.statistical_validation || {};
  const limitations = backtest.known_limitations || [];
  byId("backtest-notes").innerHTML = `<p><strong>체결:</strong> ${escapeHtml(backtest.method?.signal_time || "종가 확정")} → ${escapeHtml(backtest.method?.first_tradable_time || "다음 시가")}</p>
    <p><strong>헤지선:</strong> ${backtest.hedge_result_status === "executable" ? "실행 가능" : "공식 지수·선물 이력 미연결로 비실행 진단치"} · 차트는 로그 축</p>
    <p><strong>통계 판정:</strong> ${escapeHtml(statistical.reason || "추가 표본 필요")}</p>
    <ul>${limitations.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  renderDecisionBook();
  renderSizing();
}

function renderRegimes() {
  const rows = report.top_regimes || [];
  byId("regime-grid").innerHTML = rows.length
    ? rows
        .map((row, index) => {
          const score = Math.max(0, Math.min(100, number(row.combined_score) ?? 0));
          return `
            <article class="regime-card">
              <div class="regime-rank">
                <span>0${index + 1}</span>
                <span class="badge">${escapeHtml(row.classification || row.rotation_phase || "관찰")}</span>
              </div>
              <h3>${escapeHtml(row.name)}</h3>
              <p class="regime-subtheme">${escapeHtml(row.rotation_phase || "로테이션 관찰")}</p>
              <div class="score-track" aria-label="종합 점수 ${formatScore(row.combined_score)}"><i style="width:${score}%"></i></div>
              <small>테마 점수 ${formatScore(row.combined_score)} · ${row.rotation_alive ? "로테이션 유지" : "연속성 확인 필요"}</small>
              <div class="regime-flow">
                <div class="metric-box"><span>3D 스폰서</span><strong class="${flowClass(row.sponsor_3d)}">${escapeHtml(flowText(row.sponsor_3d))}</strong></div>
                <div class="metric-box"><span>기간 개인</span><strong class="${flowClass(row.period_individual)}">${escapeHtml(flowText(row.period_individual))}</strong></div>
                <div class="metric-box"><span>폭 / 열기</span><strong>${escapeHtml(formatPct(row.screen_breadth_pct))} / ${escapeHtml(formatPct(row.screen_heat_pct))}</strong></div>
                <div class="metric-box"><span>대표주</span><strong>${escapeHtml(names(row.representative_stocks).slice(0, 44))}</strong></div>
              </div>
            </article>`;
        })
        .join("")
    : '<p class="empty-state">조건을 충족한 주도 테마가 없습니다.</p>';
}

function table(headers, bodyRows) {
  return `
    <table class="data-table">
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${bodyRows.join("")}</tbody>
    </table>`;
}

function renderSubthemes() {
  const rows = report.traded_subthemes || [];
  const body = rows.map(
    (row, index) => `
      <tr>
        <td><strong>${index + 1}</strong></td>
        <td><strong>${escapeHtml(row.name)}</strong><br><small>${escapeHtml(row.parent_regime_theme || "독립 하위 테마")}</small></td>
        <td><span class="badge">${escapeHtml(row.classification || "관찰")}</span></td>
        <td class="${flowClass(row.sponsor_3d)}">${escapeHtml(flowText(row.sponsor_3d))}</td>
        <td class="${flowClass(row.period_sponsor)}">${escapeHtml(flowText(row.period_sponsor))}</td>
        <td>${escapeHtml(formatPct(row.screen_breadth_pct))} / ${escapeHtml(formatPct(row.screen_heat_pct))}</td>
        <td>${escapeHtml(names(row.representative_stocks))}</td>
        <td>${escapeHtml(row.judgment || row.screen_weakness_interpretation || "관찰")}</td>
      </tr>`,
  );
  byId("subtheme-table").innerHTML = rows.length
    ? table(["#", "하위 테마 / 상위 체계", "분류", "3D 스폰서", "기간 스폰서", "폭 / 열기", "대표 종목", "판단"], body)
    : '<p class="empty-state">유효한 거래 하위 테마가 없습니다.</p>';
}

function renderRotation() {
  const missedOnly = byId("missed-only").checked;
  const allRows = report.theme_rotation?.all_regimes || [];
  const rows = allRows
    .filter((row) => !missedOnly || row.screen_date_only_miss)
    .slice(0, 18);
  const body = rows.map(
    (row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(row.name)}</strong>${row.screen_date_only_miss ? '<br><span class="badge">1D만 보면 놓침</span>' : ""}</td>
        <td>${escapeHtml(row.rotation_phase || "관찰")}</td>
        <td class="${flowClass(row.period_sponsor)}">${escapeHtml(flowText(row.period_sponsor))}</td>
        <td class="${flowClass(row.period_individual)}">${escapeHtml(flowText(row.period_individual))}</td>
        <td>${escapeHtml(`${row.sponsor_positive_days ?? "—"} / ${row.individual_negative_days ?? "—"} / ${row.overlap_days ?? "—"}`)}</td>
        <td>${escapeHtml(row.active_theme_days ?? "—")}</td>
        <td class="${flowClass(row.sponsor_1d)}">${escapeHtml(flowText(row.sponsor_1d))}</td>
        <td>${escapeHtml(row.screen_weakness_interpretation || "중립")}</td>
      </tr>`,
  );
  byId("rotation-table").innerHTML = rows.length
    ? table(["#", "테마", "국면", "기간 스폰서", "기간 개인", "스폰서+ / 개인- / 겹침", "활성일", "화면일 1D", "약세 해석"], body)
    : '<p class="empty-state">해당 조건의 로테이션 테마가 없습니다.</p>';
}

function scorePills(scores = {}) {
  const fields = [
    ["테마", scores.theme_leadership],
    ["연속", scores.flow_continuity],
    ["흡수", scores.early_absorption],
    ["리더", scores.stock_leadership],
    ["타이밍", scores.entry_timing],
    ["보조", scores.auxiliary_confirmation],
  ];
  return fields.map(([label, value]) => `<span class="score-pill">${label}<strong>${formatScore(value)}</strong></span>`).join("");
}

function investorFlow(flow = {}) {
  const fields = [
    ["외국인", flow.foreigner],
    ["사모", flow.private_equity],
    ["연기금", flow.pension],
    ["투신", flow.investment_trust],
    ["개인", flow.individual],
  ];
  return fields
    .map(([label, value]) => `<p><span class="detail-label">${label}</span><strong class="${flowClass(value)}">${escapeHtml(flowText(value))}</strong></p>`)
    .join("");
}

function isRiskAction(value) {
  return /분산|제외|관망|팝/.test(String(value || ""));
}

function leaderCard(stock) {
  const price = stock.price || {};
  const candle = stock.candle || {};
  const flow = stock.flow || {};
  const tape = stock.execution_tape || {};
  const short = stock.short_sale || {};
  const borrow = stock.borrow || {};
  const plan = stock.entry_plan || {};
  const auxiliary = stock.score_evidence?.auxiliary_sections || [];
  return `
    <details class="leader-card">
      <summary class="leader-summary">
        <div class="stock-name">
          <strong>${escapeHtml(stock.rank ? `${stock.rank}. ${stock.name}` : stock.name)}</strong>
          <small>${escapeHtml(stock.symbol)} · ${escapeHtml(formatPct(price.change_rate_pct))} · ${escapeHtml(formatMoneyMillion(price.turnover_million_krw))}</small>
        </div>
        <div class="theme-copy">
          <strong>${escapeHtml(stock.traded_subtheme)}</strong>
          <small>${escapeHtml(stock.regime_theme)}</small>
        </div>
        <div class="leader-role">
          <span class="role-pill">${escapeHtml(stock.leader_role || "후발주")}</span>
          <span class="action-pill ${isRiskAction(stock.action_bucket) ? "risk" : ""}">${escapeHtml(stock.action_bucket || stock.condition16_bucket || "관찰")}</span>
        </div>
        <div>
          <div class="flow-stack">
            <span class="${flowClass(flow["1d"]?.sponsor)}">1D ${escapeHtml(formatMoneyMillion(flow["1d"]?.sponsor, true))}</span>
            <span class="${flowClass(flow["3d"]?.sponsor)}">3D ${escapeHtml(formatMoneyMillion(flow["3d"]?.sponsor, true))}</span>
            <span class="${flowClass(flow["5d"]?.sponsor)}">5D ${escapeHtml(formatMoneyMillion(flow["5d"]?.sponsor, true))}</span>
          </div>
          <div class="candle-line">종가 위치 ${escapeHtml(formatPct(number(candle.close_pos) === null ? null : number(candle.close_pos) * 100))} · 윗꼬리 ${escapeHtml(formatPct(number(candle.upper_wick) === null ? null : number(candle.upper_wick) * 100))} · ${escapeHtml(plan.trigger || "회복 확인")}</div>
        </div>
        <span class="expand-mark" aria-hidden="true"></span>
      </summary>
      <div class="leader-detail">
        <section class="detail-block">
          <h4>점수와 분류</h4>
          <div class="score-list">${scorePills(stock.scores)}</div>
          <p><span class="detail-label">Condition 16</span>${escapeHtml(stock.condition16_bucket || "관망")}</p>
          <p><span class="detail-label">판단</span>${escapeHtml(stock.judgment || "데이터 없음")}</p>
        </section>
        <section class="detail-block">
          <h4>화면일 주체별 수급</h4>
          ${investorFlow(flow["1d"])}
        </section>
        <section class="detail-block">
          <h4>체결 · 공매도 · 대차</h4>
          <p><span class="detail-label">체결 테이프</span>${escapeHtml(tape.tape_shift_ko || "데이터 없음")}</p>
          <p><span class="detail-label">공매도</span>${escapeHtml(short.pressure_level || "데이터 없음")}${short.short_sale_amount_ratio_1d !== null && short.short_sale_amount_ratio_1d !== undefined ? ` · ${escapeHtml(formatPct(number(short.short_sale_amount_ratio_1d) * 100))}` : ""}</p>
          <p><span class="detail-label">대차</span>${escapeHtml(stock.short_borrow_classification || "데이터 없음")}</p>
          <p><span class="detail-label">NXT 회복</span>${escapeHtml(formatPct(price.nxt_recovery_pct))}</p>
        </section>
        <section class="detail-block">
          <h4>트리거와 무효화</h4>
          <p><span class="detail-label">필요 트리거</span>${escapeHtml(plan.trigger || "데이터 없음")}${number(plan.trigger_price) !== null ? ` · ${escapeHtml(formatPrice(plan.trigger_price))}` : ""}</p>
          <p><span class="detail-label">무효화</span>${escapeHtml(formatPrice(plan.invalidation_level))}</p>
          <p><span class="detail-label">갭 대응</span>${escapeHtml(plan.gap_up_guidance || "추격 금지")}</p>
          <p><span class="detail-label">보조 확인</span>${escapeHtml(auxiliary.length ? auxiliary.join(" · ") : "없음")}</p>
        </section>
      </div>
    </details>`;
}

function populateFilters() {
  const stocks = report.representative_stocks || [];
  const actions = [...new Set(stocks.map((row) => row.action_bucket).filter(Boolean))].sort();
  const themes = [...new Set(stocks.map((row) => row.traded_subtheme).filter(Boolean))].sort();
  byId("action-filter").innerHTML = '<option value="">전체 액션</option>' + actions.map((value) => `<option>${escapeHtml(value)}</option>`).join("");
  byId("theme-filter").innerHTML = '<option value="">전체 테마</option>' + themes.map((value) => `<option>${escapeHtml(value)}</option>`).join("");
}

function renderLeaders() {
  const query = byId("stock-search").value.trim().toLowerCase();
  const action = byId("action-filter").value;
  const theme = byId("theme-filter").value;
  const absorptionOnly = byId("absorption-only").checked;
  const rows = (report.representative_stocks || []).filter((stock) => {
    const haystack = [stock.name, stock.symbol, stock.traded_subtheme, stock.regime_theme].join(" ").toLowerCase();
    return (
      (!query || haystack.includes(query)) &&
      (!action || stock.action_bucket === action) &&
      (!theme || stock.traded_subtheme === theme) &&
      (!absorptionOnly || number(stock.scores?.early_absorption) >= 60)
    );
  });
  byId("leader-list").innerHTML = rows.map(leaderCard).join("");
  byId("leader-empty").hidden = rows.length > 0;
}

function renderWatchlist() {
  const rows = report.watchlist || [];
  byId("watch-grid").innerHTML = rows.length
    ? rows
        .map((stock) => {
          const plan = stock.entry_plan || {};
          return `
            <article class="watch-card">
              <span class="action-pill ${isRiskAction(stock.action_bucket) ? "risk" : ""}">${escapeHtml(stock.condition16_bucket || stock.action_bucket || "관찰")}</span>
              <h3>${escapeHtml(`${stock.watchlist_rank || ""}. ${stock.name}`)}</h3>
              <p class="watch-theme">${escapeHtml(stock.symbol)} · ${escapeHtml(stock.traded_subtheme)}</p>
              <div class="watch-plan">
                <div><span>왜 중요한가</span><strong>${escapeHtml(stock.why_it_matters_next_session || stock.judgment || "관찰")}</strong></div>
                <div><span>필요 트리거</span><strong>${escapeHtml(plan.trigger || "회복 확인")}</strong></div>
                <div><span>무효화</span><strong>${escapeHtml(formatPrice(plan.invalidation_level))} · ${escapeHtml(plan.gap_up_guidance || "추격 금지")}</strong></div>
              </div>
            </article>`;
        })
        .join("")
    : '<p class="empty-state">조건 충족 종목 0개뿐</p>';
}

function statusClass(status) {
  if (status === "정상") return "normal";
  if (status === "기준선 형성 중") return "baseline";
  return "delayed";
}

function metricValue(row = {}) {
  const value = number(row.value);
  if (value === null) return "데이터 없음";
  const unit = row.unit || "";
  if (unit === "%" || unit === "%p") return `${value.toFixed(2)}${unit}`;
  if (unit === "ratio") return value.toFixed(2);
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value)}${unit ? ` ${unit}` : ""}`;
}

function contextCard(title, source, asOf, status, body) {
  return `<article class="context-card">
    <div class="context-card-head"><h3>${escapeHtml(title)}</h3><span class="freshness-badge ${statusClass(status)}">${escapeHtml(status || "미연결")}</span></div>
    <p class="context-source">${escapeHtml(source || "원천 미연결")} · ${escapeHtml(formatDate(asOf))}</p>
    <div class="context-body">${body}</div>
  </article>`;
}

function renderMarketContext() {
  const market = report.market_regime || {};
  const breadth = market.markets || [];
  const breadthBodyCore = breadth.length
    ? breadth.map((row) => `<div class="context-line"><strong>${escapeHtml(row.market)}</strong><span>상승 ${row.advance_count ?? "—"} · 하락 ${row.decline_count ?? "—"} · A/D ${number(row.advance_decline_ratio)?.toFixed(2) ?? "—"}</span><small>MA20 ${formatPct(row.above_ma20_pct)} · MA60 ${formatPct(row.above_ma60_pct)} · 상승/하락 거래대금 ${number(row.up_down_turnover_ratio)?.toFixed(2) ?? "—"}</small></div>`).join("")
    : '<p class="context-empty">시장 내부강도 데이터 없음</p>';
  const indexLines = (market.indices || []).slice(0, 4).map((row) => `<div class="context-line compact"><strong>${escapeHtml(row.series_name)}</strong><span>${number(row.close)?.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) ?? "—"}</span><small>${formatPct(row.change_rate)} · ${escapeHtml(formatDate(row.source_as_of))}</small></div>`).join("");
  const themeLines = (market.theme_participation || []).slice(0, 2).map((row) => `<div class="context-line compact"><strong>${escapeHtml(row.theme)}</strong><span>참여 ${formatPct(row.advance_participation_pct)}</span><small>리더 집중 ${formatPct(row.leader_turnover_concentration_pct)} · ${row.stock_count}종목</small></div>`).join("");
  const breadthBody = breadthBodyCore + indexLines + themeLines;
  const derivative = report.derivatives_regime || {};
  const foreign = derivative.foreign_futures || {};
  const derivativeBody = `<div class="context-line"><strong>외국인 선물 ${escapeHtml(foreign.direction || "미연결")}</strong><span>5일 ${escapeHtml(foreign.five_day_direction || "기준선 형성 중")} · 신뢰도 ${escapeHtml(foreign.confidence || "미연결")}</span><small>관측 ${foreign.observation_count ?? 0}개 · 20D 백분위 ${formatScore(foreign.percentile_20d)} · 60D ${formatScore(foreign.percentile_60d)}</small></div>${(derivative.market_metrics || []).slice(0, 4).map((row) => `<div class="context-line compact"><strong>${escapeHtml(row.metric_name)}</strong><span>${escapeHtml(metricValue(row))}</span><small>${escapeHtml(formatDate(row.source_as_of))}</small></div>`).join("")}`;
  const liquidity = report.liquidity_leverage || {};
  const liquidityBody = (liquidity.metrics || []).length
    ? (liquidity.metrics || []).slice(0, 6).map((row) => `<div class="context-line compact"><strong>${escapeHtml(row.metric_name)}</strong><span>${escapeHtml(metricValue(row))}</span><small>1D ${formatPct(row.change_1d)} · 20D z ${number(row.zscore_20d)?.toFixed(2) ?? "—"}</small></div>`).join("")
    : '<p class="context-empty">키 설정 후 투자자예탁금·신용·CMA가 표시됩니다.</p>';
  const macro = report.macro_context || {};
  const macroBody = (macro.series || []).length
    ? (macro.series || []).slice(0, 8).map((row) => `<div class="context-line compact"><strong>${escapeHtml(row.series_name)}</strong><span>${escapeHtml(metricValue(row))}</span><small>${escapeHtml(row.provider)} · ${escapeHtml(formatDate(row.source_as_of))}</small></div>`).join("")
    : '<p class="context-empty">ECOS·FRED 키 설정 후 매크로 레짐이 표시됩니다.</p>';
  byId("market-context-grid").innerHTML = [
    contextCard("시장 폭 · 현물 수급", market.source, market.as_of, market.status, breadthBody),
    contextCard("파생 레짐", derivative.source, derivative.as_of, derivative.status, derivativeBody),
    contextCard("유동성 · 레버리지", liquidity.source, liquidity.as_of, liquidity.status, liquidityBody),
    contextCard("한국 · 글로벌 매크로", macro.source, macro.as_of, macro.status, macroBody),
  ].join("");
  const freshness = report.source_freshness || [];
  byId("freshness-strip").innerHTML = freshness.length
    ? freshness.map((item) => `<span class="freshness-item"><i class="freshness-badge ${statusClass(item.status)}">${escapeHtml(item.status)}</i><strong>${escapeHtml(item.name || item.source)}</strong><small>${escapeHtml(formatDate(item.as_of))}</small></span>`).join("")
    : '<span class="context-empty">원천 상태 정보 없음</span>';
}

function rsRows() {
  const leaderRows = report.relative_strength_leaders?.[rsHorizon] || [];
  const groups = report.viability_candidates?.[rsHorizon] || {};
  const merged = [...leaderRows, ...Object.values(groups).flat()];
  const unique = new Map();
  merged.forEach((row) => {
    const prior = unique.get(row.symbol);
    if (!prior || (!prior.is_viable && row.is_viable)) unique.set(row.symbol, row);
  });
  return [...unique.values()].sort((a, b) => (number(b.rs_score) ?? -Infinity) - (number(a.rs_score) ?? -Infinity));
}

function populateRsClassFilter() {
  const current = byId("rs-class-filter").value;
  const values = [...new Set(rsRows().map((row) => row.classification).filter(Boolean))].sort();
  byId("rs-class-filter").innerHTML = '<option value="">전체 분류</option>' + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (values.includes(current)) byId("rs-class-filter").value = current;
}

function rsCard(row, index) {
  const ranks = [5, 20, 60, 120, 252].map((horizon) => `<span><small>${horizon}D</small><strong>${formatScore(row.rs?.[String(horizon)]?.market_percentile)}</strong></span>`).join("");
  const why = (row.why_viable || []).join(" · ") || "순수 가격 RS 리더 — 수급·진입 게이트 추가 확인 필요";
  const wait = (row.wait_reason || []).join(" · ") || "별도 대기 사유 없음";
  return `<details class="rs-card">
    <summary>
      <div class="rs-rank">${String(index + 1).padStart(2, "0")}</div>
      <div class="stock-name"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.symbol)} · ${escapeHtml(row.market)} · ${escapeHtml(row.theme || "미분류")}</small></div>
      <div class="rs-score"><small>${rsHorizon === "short_term" ? "단기 RS" : "스윙 RS"}</small><strong>${formatScore(row.rs_score)}</strong></div>
      <span class="action-pill ${row.is_viable ? "" : "risk"}">${escapeHtml(row.classification || "관찰")}</span>
      <div class="rs-ranks">${ranks}</div>
      <span class="expand-mark" aria-hidden="true"></span>
    </summary>
    <div class="rs-detail">
      <div><span>왜 유효한가</span><strong>${escapeHtml(why)}</strong></div>
      <div><span>기다려야 하는 이유</span><strong>${escapeHtml(wait)}</strong></div>
      <div><span>트리거 / 무효화</span><strong>${escapeHtml(row.trigger || "재돌파 확인")} ${number(row.trigger_price) !== null ? `· ${escapeHtml(formatPrice(row.trigger_price))}` : ""}<br>${escapeHtml(formatPrice(row.invalidation_price))}</strong></div>
      <div><span>확인 근거</span><strong>테마 ${formatScore(row.theme_leadership_score)} · 수급 ${formatScore(row.flow_continuity_score)} · 진입 ${formatScore(row.entry_timing_score)}<br>${escapeHtml(row.short_borrow_classification || "공매도·대차 미확인")}</strong></div>
    </div>
  </details>`;
}

function renderRs() {
  populateRsClassFilter();
  const query = byId("rs-search").value.trim().toLowerCase();
  const classification = byId("rs-class-filter").value;
  const viableOnly = byId("rs-viable-only").checked;
  const rows = rsRows().filter((row) => {
    const haystack = [row.name, row.symbol, row.market, row.theme].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!classification || row.classification === classification) && (!viableOnly || row.is_viable);
  }).slice(0, 50);
  byId("rs-list").innerHTML = rows.map(rsCard).join("");
  byId("rs-empty").hidden = rows.length > 0;
}

function dataCard(title, block, countText) {
  const available = Boolean(block?.available);
  const dates = block?.dates_used || [];
  return `
    <article class="data-card">
      <h3>${escapeHtml(title)}</h3>
      <span class="data-status ${available ? "" : "missing"}">${available ? "사용 가능" : "데이터 없음"}</span>
      <p>${escapeHtml(countText || (dates.length ? `${dates.length}개 거래일 · ${formatDate(dates[0])}–${formatDate(dates.at(-1))}` : block?.reason || "해당 기간 자료 없음"))}</p>
    </article>`;
}

function renderData() {
  const coverage = report.data_coverage || {};
  const cards = [
    dataCard("UNIFIED 수급", { available: (coverage.available_trading_dates || []).length > 0, dates_used: coverage.available_trading_dates }),
    dataCard("체결 강도", coverage.execution),
    dataCard("공매도", coverage.short_sale),
    dataCard("대차 잔고", coverage.borrow),
    dataCard("당일 NXT", coverage.nxt_same_date, coverage.nxt_same_date?.available ? `${coverage.nxt_same_date.symbol_count}개 종목에서 당일 종가 확인` : "당일 NXT 종가 없음"),
    dataCard("시가총액", coverage.market_cap, coverage.market_cap?.available ? `${coverage.market_cap.symbol_count}개 종목` : coverage.market_cap?.reason),
    dataCard("시장경보", coverage.market_alert, coverage.market_alert?.reason),
    dataCard("거래일 세트", { available: true }, `1D ${names(coverage.dates_1d)} · 3D ${names(coverage.dates_3d)} · 5D ${names(coverage.dates_5d)}`),
  ];
  byId("data-grid").innerHTML = cards.join("");

  const freshnessCards = (report.source_freshness || []).map((item) => `
    <article class="data-card"><h3>${escapeHtml(item.name || item.source)}</h3>
    <span class="data-status ${item.status === "정상" ? "" : "missing"}">${escapeHtml(item.status || "미연결")}</span>
    <p>기준일 ${escapeHtml(formatDate(item.as_of))}${item.detail ? ` · ${escapeHtml(item.detail)}` : ""}</p></article>`);
  byId("data-grid").innerHTML += freshnessCards.join("");

  const method = report.methodology || {};
  const walkForward = report.walk_forward_validation || {};
  const walkForwardRows = (walkForward.cohorts || []).map((row) => `${escapeHtml(row.name)}: ${row.signal_count}건 · 5D 중앙 ${formatPct(row.median_return_5d_pct)} · 승률 ${formatPct(row.win_rate_5d_pct)} · MFE/MAE ${formatPct(row.median_mfe_20d_pct)} / ${formatPct(row.median_mae_20d_pct)}`).join("<br>");
  byId("method-copy").innerHTML = `
    <p><strong>발견과 표시 분리:</strong> ${escapeHtml(method.discovery_vs_display || "전체 기간으로 테마를 발견하고 화면일 이하 데이터만 표시")}</p>
    <p><strong>스폰서:</strong> ${escapeHtml(method.sponsor_formula || "외국인 + 사모 + 연기금 + 투신")}</p>
    <p><strong>점수:</strong> ${escapeHtml(method.scoring_note || "각 점수는 판단 근거를 분리하기 위한 보조 지표")}</p>
    <p><strong>Condition 16:</strong> ${escapeHtml(method.condition16_note || "테마 우선 시기 구분")}</p>
    <p><strong>워크포워드 (${escapeHtml(walkForward.status || "기준선 형성 중")}):</strong> ${walkForwardRows || "결과 축적 중"}</p>
    <p>${escapeHtml(walkForward.method || "과거 시점 데이터만 사용하며 구현 이후 viability 후보는 전진 축적")}</p>
    <p><a href="${REPORT_URL}" target="_blank" rel="noopener">원본 구조화 JSON 열기 →</a></p>`;
}

function bindControls() {
  byId("refresh-button").addEventListener("click", () => loadReport({ showLoading: true }));
  byId("missed-only").addEventListener("change", renderRotation);
  byId("stock-search").addEventListener("input", renderLeaders);
  byId("action-filter").addEventListener("change", renderLeaders);
  byId("theme-filter").addEventListener("change", renderLeaders);
  byId("absorption-only").addEventListener("change", renderLeaders);
  document.querySelectorAll(".rs-tab").forEach((button) => button.addEventListener("click", () => {
    rsHorizon = button.dataset.horizon;
    document.querySelectorAll(".rs-tab").forEach((item) => {
      const active = item === button; item.classList.toggle("is-active", active); item.setAttribute("aria-selected", String(active));
    });
    renderRs();
  }));
  byId("rs-search").addEventListener("input", renderRs);
  byId("rs-class-filter").addEventListener("change", renderRs);
  byId("rs-viable-only").addEventListener("change", renderRs);
  byId("fund-nav-eok").addEventListener("input", renderSizing);
}

function renderAll() {
  renderHero();
  renderSummaryCards();
  renderFundCockpit();
  renderMarketContext();
  renderRs();
  renderRegimes();
  renderSubthemes();
  renderRotation();
  populateFilters();
  renderLeaders();
  renderWatchlist();
  renderData();
}

function reportVersion(payload) {
  return [payload?.generated_at_utc, payload?.scheduled_run_slot_kst, payload?.screen_date].join("|");
}

async function loadReport({ showLoading = true } = {}) {
  if (reportRequestInFlight) return;
  reportRequestInFlight = true;
  const loading = byId("loading-screen");
  if (showLoading) {
    loading.classList.remove("is-done", "is-error");
    loading.querySelector("p").textContent = "수급과 테마를 정리하고 있습니다.";
  }
  try {
    const url = `${REPORT_URL}?v=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const nextReport = await response.json();
    if (!nextReport || !nextReport.data_coverage || !Array.isArray(nextReport.representative_stocks)) {
      throw new Error("대시보드 데이터 형식이 올바르지 않습니다.");
    }
    const changed = reportVersion(nextReport) !== reportVersion(report);
    report = nextReport;
    if (changed || showLoading) renderAll();
    loading.classList.add("is-done");
  } catch (error) {
    if (!report) {
      loading.classList.add("is-error");
      loading.querySelector("p").textContent = `데이터를 불러오지 못했습니다: ${error.message}`;
    } else {
      loading.classList.add("is-done");
      console.warn("대시보드 자동 업데이트 확인 실패", error);
    }
  } finally {
    reportRequestInFlight = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindControls();
  loadReport();
  window.setInterval(() => {
    if (document.visibilityState === "visible") loadReport({ showLoading: false });
  }, REPORT_POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadReport({ showLoading: false });
  });
});
