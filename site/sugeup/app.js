const REPORT_URL = "../data/korea-theme/sugeup_latest.json";

let report = null;

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
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function text(value, fallback = "데이터 없음") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function formatDate(value) {
  if (!value) return "데이터 없음";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${year}.${month}.${day}` : String(value);
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

  byId("screen-date").textContent = formatDate(coverage.screen_date);
  byId("period-label").textContent = `${formatDate(coverage.requested_start_date)} – ${formatDate(coverage.requested_end_date)}`;
  byId("session-count").textContent = `${(coverage.available_trading_dates || []).length}일`;
  byId("data-health").textContent = coverage.market_cap?.available && coverage.market_alert?.available ? "완전" : "일부 보조자료 없음";
  byId("top-regime").textContent = top.name || "유효 주도 테마 없음";
  byId("market-style").textContent = conclusion.market_favors || summary.market_favors || "관찰";

  const leadingText = leading.length ? `기간 주도는 ${leading.slice(0, 3).join(" · ")}` : "기간 주도 테마는 제한적";
  const tradedText = traded.length ? `실제 거래는 ${traded.slice(0, 3).join(" · ")}에 집중됐습니다.` : "강한 하위 테마가 제한적입니다.";
  byId("market-conclusion").textContent = `${leadingText}이며, ${tradedText} 현재 환경은 ${conclusion.market_favors || "선별 관찰"} 쪽에 가깝습니다.`;
}

function renderSummaryCards() {
  const coverage = report.data_coverage || {};
  const conclusion = report.conclusion || {};
  const cards = [
    ["주도 테마", (report.top_regimes || []).length, "상위 3개 제한"],
    ["거래 하위 테마", (report.traded_subthemes || []).length, "상위 5개 제한"],
    ["대표 종목", (report.representative_stocks || []).length, "유동성·리더십 반영"],
    ["다음 날 관찰", (report.watchlist || []).length, "최대 15개"],
    ["1D만 보면 놓침", (conclusion.themes_missed_by_1d_only || []).length, "기간 수급으로 복원"],
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

  const method = report.methodology || {};
  byId("method-copy").innerHTML = `
    <p><strong>발견과 표시 분리:</strong> ${escapeHtml(method.discovery_vs_display || "전체 기간으로 테마를 발견하고 화면일 이하 데이터만 표시")}</p>
    <p><strong>스폰서:</strong> ${escapeHtml(method.sponsor_formula || "외국인 + 사모 + 연기금 + 투신")}</p>
    <p><strong>점수:</strong> ${escapeHtml(method.scoring_note || "각 점수는 판단 근거를 분리하기 위한 보조 지표")}</p>
    <p><strong>Condition 16:</strong> ${escapeHtml(method.condition16_note || "테마 우선 시기 구분")}</p>
    <p><a href="${REPORT_URL}" target="_blank" rel="noopener">원본 구조화 JSON 열기 →</a></p>`;
}

function bindControls() {
  byId("refresh-button").addEventListener("click", () => loadReport(true));
  byId("missed-only").addEventListener("change", renderRotation);
  byId("stock-search").addEventListener("input", renderLeaders);
  byId("action-filter").addEventListener("change", renderLeaders);
  byId("theme-filter").addEventListener("change", renderLeaders);
  byId("absorption-only").addEventListener("change", renderLeaders);
}

function renderAll() {
  renderHero();
  renderSummaryCards();
  renderRegimes();
  renderSubthemes();
  renderRotation();
  populateFilters();
  renderLeaders();
  renderWatchlist();
  renderData();
}

async function loadReport(force = false) {
  const loading = byId("loading-screen");
  loading.classList.remove("is-done", "is-error");
  loading.querySelector("p").textContent = "수급과 테마를 정리하고 있습니다.";
  try {
    const url = force ? `${REPORT_URL}?t=${Date.now()}` : REPORT_URL;
    const response = await fetch(url, { cache: force ? "no-store" : "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    report = await response.json();
    if (!report || !report.data_coverage || !Array.isArray(report.representative_stocks)) {
      throw new Error("대시보드 데이터 형식이 올바르지 않습니다.");
    }
    renderAll();
    loading.classList.add("is-done");
  } catch (error) {
    loading.classList.add("is-error");
    loading.querySelector("p").textContent = `데이터를 불러오지 못했습니다: ${error.message}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindControls();
  loadReport();
});
