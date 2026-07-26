"use strict";

const DATA_ROOT = "../data/v2";
const LEGACY_REPORT_URL = "../data/report.json";
const LOCKED_PREVIEW_CONTEXT = {
  screenDate: "20260724",
  cutoffKst: "21:15",
  technicalRowsKnownByCutoff: 0,
};

const ACTION_META = {
  "Enter Now": {
    label: "Enter Now",
    tone: "enter",
    emptyTitle: "현재 진입 가능한 종목이 없습니다.",
    emptyBody:
      "테마·실행·리스크·가격 구조가 동시에 통과한 종목만 이곳에 표시됩니다.",
  },
  "pullback/reclaim": {
    label: "눌림 후 회복 · 리클레임",
    tone: "wait",
    emptyTitle: "확정된 회복 진입이 없습니다.",
    emptyBody:
      "지지 확인 또는 리클레임 트리거가 형성되면 조건부 진입 후보로 이동합니다.",
  },
  accumulation: {
    label: "Accumulation Watch",
    tone: "watch",
    emptyTitle: "조용한 누적 관찰 종목이 없습니다.",
    emptyBody:
      "수급 흡수는 보이지만 가격 확인이 부족한 종목만 이곳에 머뭅니다.",
  },
  "no-chase/avoid": {
    label: "No Chase · Avoid",
    tone: "avoid",
    emptyTitle: "추격 금지 또는 회피 신호가 없습니다.",
    emptyBody:
      "과열, 분산, 하드 리스크 또는 실패한 구조가 확인되면 이곳에 표시됩니다.",
  },
};

const STATUS_LABELS = {
  ENTER_NOW: "진입 가능",
  ENTER_CONDITIONAL: "조건부 진입",
  IMMEDIATE_SWING: "즉시 스윙",
  BREAKOUT: "돌파",
  RECLAIM: "리클레임",
  PULLBACK_RECOVERY: "눌림 후 회복",
  QUIET_ACCUMULATION: "조용한 누적",
  ACCUMULATION_WATCH: "누적 관찰",
  OVERHEATED_NO_CHASE: "과열 · 추격 금지",
  LEADER_PULLBACK_WAIT: "리더 눌림 대기",
  DISTRIBUTION_AVOID: "분산 · 회피",
  OBSERVE: "관찰",
  WATCH: "관찰",
  NO_FILL: "미체결",
  EXPIRED: "만료",
  FAILED: "실패",
};

const model = {
  summary: null,
  actions: null,
  themes: null,
  catalog: null,
  search: null,
  legacy: null,
  activeTab: "Enter Now",
  openSymbol: null,
  symbolCache: new Map(),
};

const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

function compactDate(value) {
  const digits = String(value ?? "").replaceAll(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : "";
}

function formatDate(value) {
  const digits = compactDate(value);
  if (!digits) return value ? String(value) : "—";
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatNumber(value, digits = 0) {
  const parsed = number(value);
  if (parsed === null) return "—";
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(parsed);
}

function formatPrice(value) {
  const parsed = number(value);
  return parsed === null ? "—" : `${formatNumber(parsed)}원`;
}

function formatPct(value, digits = 1) {
  const parsed = number(value);
  if (parsed === null) return "—";
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(digits)}%`;
}

function formatEokFromMillion(value, digits = 1) {
  const parsed = number(value);
  if (parsed === null) return "—";
  return `${parsed > 0 ? "+" : ""}${formatNumber(parsed / 100, digits)}억`;
}

function truncate(value, maxLength = 42) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function nodeId(node) {
  return String(
    firstValue(
      node?.theme_id,
      node?.node_id,
      node?.root_id,
      node?.id,
      node?.slug,
      "",
    ),
  );
}

function nodeName(node) {
  return String(
    firstValue(
      node?.name_ko,
      node?.name,
      node?.label,
      node?.name_en,
      nodeId(node),
      "이름 없음",
    ),
  );
}

function themePathText(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value.replaceAll(".", " › ");
  if (Array.isArray(value)) {
    return value
      .map((item) => themePathText(item))
      .filter(Boolean)
      .join(" · ");
  }
  if (typeof value === "object") {
    const canonical = firstValue(
      value.canonical_path,
      value.theme_path,
      value.path,
      value.exposure_path,
    );
    if (canonical) return themePathText(canonical);
    const ordered = [
      value.macro,
      value.root,
      value.subtheme,
      value.product_or_process,
      value.product,
      value.business_role,
      value.role,
    ].filter(Boolean);
    if (ordered.length) return ordered.join(" › ");
    if (Array.isArray(value.value_chain)) return value.value_chain.join(" › ");
  }
  return "";
}

function primaryThemeText(decision) {
  const paths = asArray(decision?.theme_paths);
  const text = paths.map(themePathText).filter(Boolean).join(" · ");
  return text || String(decision?.primary_theme_id || "승인 테마 없음");
}

function statusText(decision) {
  return (
    decision?.setup_state_ko ||
    STATUS_LABELS[decision?.setup_state] ||
    STATUS_LABELS[decision?.trade_status] ||
    decision?.trade_status_label ||
    decision?.trade_status ||
    "판단 없음"
  );
}

function axisValue(decision, key) {
  const axes = asObject(decision?.axes);
  const direct = axes[key];
  if (direct && typeof direct === "object") {
    return firstValue(
      direct.tier,
      direct.code,
      direct.classification,
      direct.state,
      direct.regime,
    );
  }
  return direct;
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

async function fetchJson(relativePath) {
  const response = await fetch(`${DATA_ROOT}/${relativePath}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${relativePath} · HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchStandaloneJson(path) {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${path} · HTTP ${response.status}`);
  return response.json();
}

function setStatus(message, tone = "loading") {
  const element = byId("app-status");
  element.classList.toggle("is-ready", tone === "ready");
  element.classList.toggle("is-error", tone === "error");
  element.querySelector("span:last-child").textContent = message;
}

function actionRows(tab) {
  return asArray(asObject(model.actions?.tabs)[tab]).filter(
    (row) => row && typeof row === "object",
  );
}

function themeSnapshots() {
  return asArray(model.themes?.themes).filter(
    (row) => row && typeof row === "object",
  );
}

function searchEntries(type = null) {
  const entries = asArray(model.search?.entries);
  return type ? entries.filter((entry) => entry?.type === type) : entries;
}

function mappedSymbolCount() {
  if (model.themes) {
    const symbols = new Set();
    themeSnapshots().forEach((theme) => {
      asArray(theme.members).forEach((member) => {
        const symbol =
          typeof member === "string" ? member : firstValue(member?.symbol, member?.code);
        if (symbol) symbols.add(String(symbol));
      });
    });
    return symbols.size;
  }
  return searchEntries("symbol").filter((entry) => {
    return (
      entry?.primary_theme_id ||
      asArray(entry?.theme_paths).some((path) => Boolean(themePathText(path)))
    );
  }).length;
}

function liveThemeCount() {
  return themeSnapshots().filter((theme) => {
    const lifecycle = String(theme.lifecycle || "DORMANT").toUpperCase();
    const members = number(theme.member_count) || 0;
    return lifecycle !== "DORMANT" || members > 0;
  }).length;
}

function renderRunMetadata() {
  const publication = asObject(model.summary?.publication);
  const mode = String(publication.mode || "shadow").toUpperCase();
  const modeBadge = byId("publication-mode");
  modeBadge.textContent =
    mode === "PRODUCTION" ? "PRODUCTION · LIVE" : `${mode} · LIVE`;
  modeBadge.classList.toggle("is-shadow", mode !== "PRODUCTION");
  modeBadge.classList.toggle("is-production", mode === "PRODUCTION");
  byId("screen-date").textContent = formatDate(
    firstValue(model.summary?.screen_date, model.legacy?.screen_date),
  );
  const cutoff = firstValue(publication.cutoff_kst, LOCKED_PREVIEW_CONTEXT.cutoffKst);
  byId("cutoff-kst").textContent = cutoff ? `${cutoff} KST` : "—";
  byId("taxonomy-version").textContent = publication.taxonomy_version || "—";
  byId("decision-version").textContent = publication.decision_version || "—";
  byId("generated-at").textContent = `생성 ${formatDateTime(
    firstValue(publication.generated_at, model.legacy?.generated_at_utc),
  )} KST`;
}

function renderCoverageNotice() {
  const notice = byId("coverage-notice");
  const mapped = mappedSymbolCount();
  const decisions = Number(model.summary?.counts?.decisions || 0);
  const live = liveThemeCount();
  if (mapped === 0 || (decisions === 0 && live === 0)) {
    notice.hidden = false;
    notice.innerHTML = `
      <strong>v2 승인 멤버십 입력 전입니다.</strong>
      v2 실행 탭은 비어 있으며, 상단 우선 종목은 기존 전 종목 스크리너의
      조건부 매수 결과를 표시합니다.
    `;
    return;
  }
  notice.hidden = true;
  notice.textContent = "";
}

function renderBlockers() {
  const coverage = asObject(model.legacy?.data_coverage);
  const missingDates = asArray(coverage.missing_weekday_dates);
  const alertAvailable = coverage.market_alert?.available === true;
  const screenDate = compactDate(
    firstValue(model.summary?.screen_date, model.legacy?.screen_date),
  );
  const cutoff =
    model.summary?.publication?.cutoff_kst || LOCKED_PREVIEW_CONTEXT.cutoffKst;
  const technicalRows =
    screenDate === LOCKED_PREVIEW_CONTEXT.screenDate
      ? LOCKED_PREVIEW_CONTEXT.technicalRowsKnownByCutoff
      : null;
  const blockers = [
    {
      code: "APPROVED_MAPPING",
      message:
        mappedSymbolCount() === 0
          ? "승인 production 멤버십 0건"
          : `승인 테마 연결 ${formatNumber(mappedSymbolCount())}건`,
    },
    {
      code: "TECHNICAL_AT_CUTOFF",
      message:
        technicalRows === null
          ? "컷오프 기술 데이터 상태 확인 필요"
          : `${formatDate(screenDate)} ${cutoff} 기준 v2 기술 행 ${technicalRows}건`,
    },
    {
      code: "MISSING_SESSION",
      message: missingDates.length
        ? `기존 DB 거래일 누락: ${missingDates.map(formatDate).join(", ")}`
        : "확인된 거래일 누락 없음",
    },
    {
      code: "MARKET_ALERT",
      message: alertAvailable
        ? "시장경보 테이블 사용 가능"
        : "시장경보 테이블 사용 불가",
    },
  ];
  byId("preview-blockers").innerHTML = blockers
    .map(
      (blocker) => `
        <article class="blocker-card">
          <span>${escapeHtml(blocker.code)}</span>
          <strong>${escapeHtml(blocker.message)}</strong>
        </article>
      `,
    )
    .join("");
}

function renderSummary() {
  const counts = asObject(model.summary?.counts);
  const actionCounts = asObject(model.summary?.action_counts);
  const cards = [
    {
      label: "검색 가능 보통주",
      value: counts.searchable_common_stocks || model.search?.symbol_count || 0,
      note: "KOSPI · KOSDAQ 대상",
      accent: "rgba(98, 216, 232, 0.18)",
    },
    {
      label: "승인 테마 연결",
      value: mappedSymbolCount(),
      note: "현재 검색 인덱스 기준",
      accent: "rgba(187, 168, 255, 0.18)",
    },
    {
      label: "Enter Now",
      value: actionCounts["Enter Now"] || 0,
      note: "실행 조건 통과",
      accent: "rgba(78, 230, 168, 0.2)",
    },
    {
      label: "눌림 · 리클레임",
      value: actionCounts["pullback/reclaim"] || 0,
      note: "조건부 회복 진입",
      accent: "rgba(244, 190, 98, 0.2)",
    },
    {
      label: "활성 테마",
      value: liveThemeCount(),
      note: `${counts.catalog_nodes || model.catalog?.nodes?.length || 0}개 노드 중`,
      accent: "rgba(78, 230, 168, 0.16)",
    },
  ];
  byId("summary-cards").innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card" style="--summary-accent:${escapeHtml(card.accent)}">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(formatNumber(card.value))}</strong>
          <small>${escapeHtml(card.note)}</small>
        </article>
      `,
    )
    .join("");
}

function priorityCandidates() {
  const candidates = asArray(model.legacy?.all_market_screen?.candidates);
  const conditional = candidates.filter(
    (row) =>
      row?.execution_eligible === true &&
      String(row?.trade_status || "").trim() === "조건부 매수",
  );
  return conditional.slice(0, 10);
}

function priorityCandidateCard(row, index) {
  const flow = asObject(row?.flow);
  const flow3d = asObject(flow["3d"]);
  const reasons = asArray(row?.reasons).slice(0, 3);
  const risks = asArray(row?.risks).slice(0, 3);
  const cautions = [
    ...(String(row?.catalyst_layer || "").includes("공식 확인 대기")
      ? [row.catalyst_layer]
      : []),
    ...risks,
  ].slice(0, 4);
  return `
    <article class="priority-card">
      <div class="priority-card-head">
        <span class="priority-rank">#${String(index + 1).padStart(2, "0")}</span>
        <div class="priority-identity">
          <span>${escapeHtml(row?.theme || "테마 확인 필요")}</span>
          <h3>${escapeHtml(row?.name || row?.symbol || "이름 없음")}</h3>
          <p>${escapeHtml(row?.symbol || "—")} · ${escapeHtml(row?.market || "KRX")}</p>
        </div>
        <div class="priority-state">
          <span>${escapeHtml(row?.trade_status || "조건 확인")}</span>
          <small>${escapeHtml(row?.stage || "구조 신호")}</small>
        </div>
      </div>

      <p class="priority-action">${escapeHtml(
        row?.action || "트리거와 지지 확인 후 판단",
      )}</p>

      <div class="priority-geometry">
        <div>
          <span>Trigger</span>
          <strong>${escapeHtml(formatPrice(row?.trigger_price))}</strong>
        </div>
        <div>
          <span>Invalidation</span>
          <strong>${escapeHtml(formatPrice(row?.invalidation_price))}</strong>
        </div>
        <div>
          <span>3D 핵심 수급</span>
          <strong>${escapeHtml(formatEokFromMillion(flow3d.triad))}</strong>
        </div>
        <div>
          <span>1D 수익률</span>
          <strong>${escapeHtml(formatPct(row?.return_1d_pct))}</strong>
        </div>
      </div>

      <div class="priority-evidence">
        <div>
          <span class="priority-label">선정 근거</span>
          <ul>
            ${
              reasons.length
                ? reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")
                : "<li>세부 근거 확인 필요</li>"
            }
          </ul>
        </div>
        <div>
          <span class="priority-label is-risk">체크할 리스크</span>
          <p>${escapeHtml(
            cautions.length ? cautions.join(" · ") : "보고된 추가 리스크 없음",
          )}</p>
        </div>
      </div>

      <div class="priority-card-foot">
        <span>구조점수(확률 아님) ${escapeHtml(
          formatNumber(row?.structural_score, 1),
        )} · 체결강도 ${escapeHtml(formatNumber(row?.execution_strength, 1))}</span>
        <button
          class="text-button"
          type="button"
          data-open-symbol="${escapeHtml(row?.symbol || "")}"
        >
          종목 상세
        </button>
      </div>
    </article>
  `;
}

function renderPriorityCandidates() {
  const candidates = priorityCandidates();
  byId("priority-count").textContent = formatNumber(candidates.length);
  byId("priority-list").innerHTML = candidates.length
    ? candidates.map(priorityCandidateCard).join("")
    : `
      <div class="empty-state">
        <strong>기존 스크리너의 조건부 매수 후보가 없습니다.</strong>
        <p>전 종목 구조 신호와 실행 적격 상태를 다시 확인하세요.</p>
      </div>
    `;
}

function legacyThemeText(row) {
  const theme = asObject(row?.theme);
  return firstValue(
    row?.traded_subtheme,
    theme.traded_subtheme,
    row?.regime_theme,
    theme.regime_theme,
    row?.raw_theme,
    "기존 테마 없음",
  );
}

function legacyBaselineRow(row) {
  const price = asObject(row?.price);
  const bucket = firstValue(
    row?.action_bucket,
    row?.condition16_bucket,
    row?.leader_role,
    "기존 분류",
  );
  return `
    <article class="baseline-row">
      <div class="baseline-row-primary">
        <strong>${escapeHtml(row?.name || row?.symbol || "이름 없음")}</strong>
        <small>${escapeHtml(row?.symbol || "—")} · ${escapeHtml(
          truncate(legacyThemeText(row), 38),
        )}</small>
      </div>
      <div class="baseline-row-meta">
        <strong>${escapeHtml(truncate(bucket, 18))}</strong>
        <small>${escapeHtml(formatPct(price.change_rate_pct))}</small>
      </div>
    </article>
  `;
}

function renderLegacyBaseline() {
  const report = model.legacy;
  if (!report) {
    byId("baseline-summary").innerHTML = `
      <div class="empty-state">
        <strong>기존 기준선 파일을 읽을 수 없습니다.</strong>
        <p>${escapeHtml(LEGACY_REPORT_URL)}</p>
      </div>
    `;
    byId("baseline-leaders").innerHTML = "";
    byId("baseline-watch").innerHTML = "";
    return;
  }
  const leaders = asArray(report.representative_stocks);
  const watch = asArray(report.watchlist);
  const allMarket = asObject(report.all_market_screen);
  const cards = [
    ["기존 스키마", report.schema_version || "—", "read-only"],
    [
      "기존 전 종목",
      formatNumber(allMarket.universe_count || 0),
      `${formatNumber(allMarket.matched_count || 0)}건 구조 신호`,
    ],
    ["기존 대표 종목", formatNumber(leaders.length), "v2 진입 신호 아님"],
    ["기존 관찰 목록", formatNumber(watch.length), "비교 참고 전용"],
  ];
  byId("baseline-summary").innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="summary-card" style="--summary-accent:rgba(187,168,255,.18)">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(note)}</small>
        </article>
      `,
    )
    .join("");
  byId("baseline-leader-count").textContent = formatNumber(leaders.length);
  byId("baseline-watch-count").textContent = formatNumber(watch.length);
  byId("baseline-leaders").innerHTML = leaders.length
    ? leaders.slice(0, 12).map(legacyBaselineRow).join("")
    : '<div class="empty-state"><strong>기존 대표 종목 없음</strong></div>';
  byId("baseline-watch").innerHTML = watch.length
    ? watch.slice(0, 12).map(legacyBaselineRow).join("")
    : '<div class="empty-state"><strong>기존 관찰 종목 없음</strong></div>';
}

function actionSearchText(row) {
  return [
    row.symbol,
    row.name,
    row.market,
    row.primary_theme_id,
    primaryThemeText(row),
    row.setup_state,
    row.setup_state_ko,
    row.trade_status,
    ...asArray(row.reason_codes),
    ...asArray(row.risk_codes),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ko-KR");
}

function actionSortValue(row, mode) {
  if (mode === "name") return String(row.name || row.symbol || "");
  if (mode === "theme") return primaryThemeText(row);
  const score = firstValue(
    row.priority_score,
    row.decision_score,
    row.opportunity_score,
    row.setup_score,
    row.total_score,
    row.score,
  );
  const parsed = number(score);
  return parsed === null ? -Infinity : parsed;
}

function axisChips(row) {
  const pairs = [
    ["T", axisValue(row, "theme_tier")],
    ["E", axisValue(row, "execution_tier")],
    ["C", axisValue(row, "catalyst_tier")],
    ["R", axisValue(row, "risk_tier")],
    ["M", axisValue(row, "market_regime")],
  ].filter(([, value]) => value);
  return pairs.length
    ? pairs
        .map(
          ([label, value]) =>
            `<span class="axis-chip">${escapeHtml(label)} · ${escapeHtml(value)}</span>`,
        )
        .join("")
    : '<span class="axis-chip">axis 데이터 없음</span>';
}

function actionCard(row, tone) {
  const plan = asObject(row.trade_plan);
  const position = asObject(row.position_size);
  const zoneLow = firstValue(plan.entry_zone_low, plan.trigger_price);
  const zoneHigh = firstValue(plan.entry_zone_high, plan.trigger_price);
  const sizeTier = firstValue(plan.size_tier, position.size_tier, 0);
  const horizon = firstValue(
    row.recommended_horizon,
    plan.recommended_horizon,
    plan.horizon,
  );
  const orderState = row.order_state ? ` · ${row.order_state}` : "";
  return `
    <article class="action-card" data-tone="${escapeHtml(tone)}">
      <div class="action-card-header">
        <div>
          <h3 class="symbol-name">${escapeHtml(row.name || "이름 없음")}</h3>
          <span class="symbol-code">${escapeHtml(row.symbol || "—")} · ${escapeHtml(row.market || "KRX")}</span>
        </div>
        <span class="status-chip">${escapeHtml(statusText(row))}</span>
      </div>
      <p class="theme-path">${escapeHtml(truncate(primaryThemeText(row), 90))}</p>
      <div class="axis-row">${axisChips(row)}</div>
      <div class="trade-geometry">
        <div>
          <span>Trigger</span>
          <strong>${escapeHtml(formatPrice(plan.trigger_price))}</strong>
        </div>
        <div>
          <span>Entry zone</span>
          <strong>${escapeHtml(
            zoneLow === null || zoneLow === undefined
              ? "—"
              : `${formatNumber(zoneLow)}–${formatNumber(zoneHigh)}`,
          )}</strong>
        </div>
        <div>
          <span>Hard stop</span>
          <strong>${escapeHtml(formatPrice(plan.hard_stop_price))}</strong>
        </div>
      </div>
      <div class="action-card-footer">
        <span>Tier ${escapeHtml(sizeTier)} · ${escapeHtml(horizon || "horizon 없음")}${escapeHtml(orderState)}</span>
        <button class="text-button" type="button" data-open-symbol="${escapeHtml(row.symbol)}">
          상세 보기
        </button>
      </div>
    </article>
  `;
}

function renderActions() {
  const meta = ACTION_META[model.activeTab] || ACTION_META["Enter Now"];
  const query = byId("action-filter").value.trim().toLocaleLowerCase("ko-KR");
  const sort = byId("action-sort").value;
  let rows = actionRows(model.activeTab);
  if (query) rows = rows.filter((row) => actionSearchText(row).includes(query));
  rows = [...rows].sort((left, right) => {
    const a = actionSortValue(left, sort);
    const b = actionSortValue(right, sort);
    if (sort === "rank") return b - a || String(left.symbol).localeCompare(String(right.symbol));
    return String(a).localeCompare(String(b), "ko-KR");
  });

  Object.keys(ACTION_META).forEach((tab) => {
    document.querySelectorAll(`[data-tab-count="${CSS.escape(tab)}"]`).forEach((node) => {
      node.textContent = formatNumber(actionRows(tab).length);
    });
  });

  const panel = byId("action-panel");
  panel.setAttribute("aria-label", meta.label);
  if (!rows.length) {
    const suffix = query ? " 검색 조건을 지우고 다시 확인할 수 있습니다." : "";
    panel.innerHTML = `
      <div class="empty-state">
        <strong>${escapeHtml(meta.emptyTitle)}</strong>
        <p>${escapeHtml(meta.emptyBody + suffix)}</p>
      </div>
    `;
    return;
  }
  panel.innerHTML = rows.map((row) => actionCard(row, meta.tone)).join("");
}

function snapshotScore(snapshot) {
  return number(
    firstValue(
      snapshot?.score,
      snapshot?.theme_structural_score,
      snapshot?.structural_score,
      snapshot?.combined_score,
    ),
  );
}

function snapshotLifecycle(snapshot) {
  return String(firstValue(snapshot?.lifecycle, snapshot?.state, "DORMANT")).toUpperCase();
}

function themeRootRecords() {
  const roots = asArray(model.catalog?.roots);
  const nodes = asArray(model.catalog?.nodes);
  const nodeMap = new Map(nodes.map((node) => [nodeId(node), node]));
  const records = roots.map((root, index) => {
    const rootRecord = typeof root === "string" ? nodeMap.get(root) || { theme_id: root } : root;
    const id = nodeId(rootRecord);
    const merged = { ...(nodeMap.get(id) || {}), ...asObject(rootRecord) };
    return { ...merged, _rootId: id, _rootOrder: index + 1 };
  });
  if (records.length) {
    return records
      .sort((left, right) => {
        const leftOrder =
          number(left.sort_order) ||
          number(String(left._rootId).match(/\d+/)?.[0]) ||
          99_999;
        const rightOrder =
          number(right.sort_order) ||
          number(String(right._rootId).match(/\d+/)?.[0]) ||
          99_999;
        return leftOrder - rightOrder || nodeName(left).localeCompare(nodeName(right), "ko-KR");
      })
      .map((root, index) => ({ ...root, _rootOrder: index + 1 }));
  }
  return nodes
    .filter(
      (node) =>
        node?.node_type === "root" ||
        (!node?.parent_theme_id && node?.root_theme_id === nodeId(node)),
    )
    .map((node, index) => ({ ...node, _rootId: nodeId(node), _rootOrder: index + 1 }));
}

function childNodes(rootId) {
  return asArray(model.catalog?.nodes)
    .filter((node) => {
      const id = nodeId(node);
      return id && id !== rootId && String(node.root_theme_id || "") === rootId;
    })
    .sort(
      (left, right) =>
        (number(left.sort_order) || 99_999) - (number(right.sort_order) || 99_999) ||
        nodeName(left).localeCompare(nodeName(right), "ko-KR"),
    );
}

function renderThemes() {
  const snapshots = themeSnapshots();
  const snapshotMap = new Map(snapshots.map((snapshot) => [String(snapshot.theme_id), snapshot]));
  const query = byId("theme-filter").value.trim().toLocaleLowerCase("ko-KR");
  const lifecycleFilter = byId("lifecycle-filter").value;
  const roots = themeRootRecords();

  byId("root-count").textContent = formatNumber(roots.length);
  byId("node-count").textContent = formatNumber(asArray(model.catalog?.nodes).length);
  byId("live-theme-count").textContent = formatNumber(liveThemeCount());

  const cards = [];
  roots.forEach((root) => {
    const rootId = root._rootId || nodeId(root);
    const rootSnapshot = snapshotMap.get(rootId) || {};
    const allChildren = childNodes(rootId);
    const rootSearch = [
      rootId,
      nodeName(root),
      root.name_en,
      root.slug,
      ...allChildren.flatMap((child) => [
        nodeId(child),
        nodeName(child),
        child.name_en,
        child.slug,
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ko-KR");
    if (query && !rootSearch.includes(query)) return;

    let children = allChildren;
    if (query) {
      const directRootMatch = [rootId, nodeName(root), root.name_en, root.slug]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ko-KR")
        .includes(query);
      if (!directRootMatch) {
        children = children.filter((child) =>
          [nodeId(child), nodeName(child), child.name_en, child.slug]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("ko-KR")
            .includes(query),
        );
      }
    }

    if (lifecycleFilter !== "ALL") {
      const matchesLifecycle = (snapshot) => {
        const lifecycle = snapshotLifecycle(snapshot);
        if (lifecycleFilter === "ACTIVE") {
          return lifecycle !== "DORMANT" || (number(snapshot?.member_count) || 0) > 0;
        }
        return lifecycle === lifecycleFilter;
      };
      const rootMatches = matchesLifecycle(rootSnapshot);
      const matchingChildren = children.filter((child) =>
        matchesLifecycle(snapshotMap.get(nodeId(child)) || {}),
      );
      if (!rootMatches && !matchingChildren.length) return;
      if (!rootMatches) children = matchingChildren;
    }

    const life = snapshotLifecycle(rootSnapshot);
    const score = snapshotScore(rootSnapshot);
    const members = number(rootSnapshot.member_count) || 0;
    const active = number(rootSnapshot.active_member_count) || 0;
    const breadth = number(rootSnapshot.breadth_pct);
    const flow = number(rootSnapshot.sponsor_flow_diffusion);
    const childHtml = children.length
      ? children
          .map((child) => {
            const snapshot = snapshotMap.get(nodeId(child)) || {};
            return `
              <li class="subtheme-item" title="${escapeHtml(child.name_en || "")}">
                <span class="subtheme-name">${escapeHtml(nodeName(child))}</span>
                <span class="subtheme-member">${escapeHtml(formatNumber(snapshot.member_count || 0))}명</span>
                <span class="subtheme-score">${escapeHtml(
                  snapshotScore(snapshot) === null
                    ? "—"
                    : Math.round(snapshotScore(snapshot)),
                )}</span>
              </li>
            `;
          })
          .join("")
      : '<li class="subtheme-item"><span class="subtheme-name">표시할 하위 노드 없음</span></li>';

    cards.push(`
      <details class="theme-card">
        <summary>
          <div>
            <span class="theme-number">${escapeHtml(
              String(root._rootOrder || "").padStart(2, "0"),
            )} · ${escapeHtml(rootId)}</span>
            <h3>${escapeHtml(nodeName(root))}</h3>
          </div>
          <div class="theme-head-metrics">
            <span class="lifecycle-chip" data-life="${escapeHtml(life)}">${escapeHtml(life)}</span>
            <span class="theme-score">${escapeHtml(score === null ? "—" : Math.round(score))}</span>
          </div>
        </summary>
        <div class="theme-root-body">
          <div class="root-metrics">
            <div><span>Members</span><strong>${escapeHtml(formatNumber(members))}</strong></div>
            <div><span>Active</span><strong>${escapeHtml(formatNumber(active))}</strong></div>
            <div><span>Breadth</span><strong>${escapeHtml(formatPct(breadth))}</strong></div>
            <div><span>Flow diff.</span><strong>${escapeHtml(formatPct(flow))}</strong></div>
          </div>
          <ul class="subtheme-list">${childHtml}</ul>
        </div>
      </details>
    `);
  });

  byId("theme-grid").innerHTML = cards.length
    ? cards.join("")
    : `
      <div class="empty-state">
        <strong>조건에 맞는 테마가 없습니다.</strong>
        <p>검색어 또는 라이프사이클 필터를 바꿔 보세요.</p>
      </div>
    `;
}

function symbolMatches(entry, query) {
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  if (!needle) return true;
  const haystack =
    entry.search_text ||
    [
      entry.symbol,
      entry.name,
      entry.market,
      entry.primary_theme_id,
      ...asArray(entry.terms),
      ...asArray(entry.aliases),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ko-KR");
  return haystack.includes(needle);
}

function renderSearchResults(query = "") {
  const results = searchEntries("symbol")
    .filter((entry) => symbolMatches(entry, query))
    .slice(0, query ? 18 : 9);
  const container = byId("search-results");
  if (!results.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>검색 결과가 없습니다.</strong>
        <p>종목명 또는 6자리 종목코드를 확인해 주세요.</p>
      </div>
    `;
    return;
  }
  container.innerHTML = results
    .map(
      (entry) => `
        <article class="search-result">
          <button type="button" data-open-symbol="${escapeHtml(entry.symbol)}">
            <span class="search-result-primary">
              <strong>${escapeHtml(entry.name || entry.symbol)}</strong>
              <small>${escapeHtml(entry.symbol)} · ${escapeHtml(
                truncate(
                  themePathText(entry.theme_paths) ||
                    entry.primary_theme_id ||
                    "승인 테마 없음",
                  52,
                ),
              )}</small>
            </span>
            <span class="search-result-market">${escapeHtml(entry.market || "KRX")}</span>
          </button>
        </article>
      `,
    )
    .join("");
}

function metricBox(label, value) {
  return `
    <div class="metric-box">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? "—")}</strong>
    </div>
  `;
}

function codeList(values, risk = false) {
  const items = asArray(values).filter(Boolean);
  if (!items.length) return '<span class="axis-chip">없음</span>';
  return `
    <ul class="code-list">
      ${items
        .map(
          (item) =>
            `<li class="code-chip${risk ? " is-risk" : ""}">${escapeHtml(
              typeof item === "string" ? item : safeJson(item),
            )}</li>`,
        )
        .join("")}
    </ul>
  `;
}

function priceHistory(document) {
  const marketData = asObject(document?.market_data);
  const history = firstValue(
    marketData.price_history,
    marketData.history,
    document?.legacy_source?.price_history,
  );
  return asArray(history)
    .filter((row) => row && typeof row === "object" && number(row.close) !== null)
    .slice(-30);
}

function currentPrice(document) {
  const marketData = asObject(document?.market_data);
  const current = asObject(marketData.current);
  const price = asObject(marketData.price);
  const history = priceHistory(document);
  return firstValue(
    current.close,
    price.close,
    document?.legacy_source?.close,
    history.at(-1)?.close,
  );
}

function renderDrilldown(document) {
  const identity = asObject(document.identity);
  const decision = asObject(document.decision);
  const plan = asObject(document.trade_plan || decision.trade_plan);
  const themes = asObject(document.themes);
  const position = asObject(decision.position_size);
  const current = asObject(document.market_data?.current);
  const flow = asObject(document.flow);
  const execution = asObject(document.execution_and_supply);
  const evidence = asObject(document.evidence);
  const issues = asArray(document.data_health?.issues);
  const pathText =
    themePathText(themes.theme_paths) ||
    themes.primary_economic_theme_path ||
    themes.primary_theme_id ||
    "승인 테마 없음";
  const status = Object.keys(decision).length ? statusText(decision) : "거래 결정 없음";
  const reasonCodes = decision.reason_codes || evidence.decision_reason_codes;
  const riskCodes = decision.risk_codes || evidence.decision_risk_codes;
  const hasDecision = Object.keys(decision).length > 0;

  byId("dialog-title").textContent = `${identity.name || document.symbol || "종목"} 상세`;
  byId("dialog-body").innerHTML = `
    <section class="drilldown-hero">
      <div>
        <h3>${escapeHtml(identity.name || "이름 없음")}</h3>
        <p>${escapeHtml(document.symbol || identity.symbol || "—")} · ${escapeHtml(
          identity.market || "KRX",
        )} · ${escapeHtml(pathText)}</p>
        <div class="axis-row">
          <span class="status-chip">${escapeHtml(status)}</span>
          ${hasDecision ? axisChips(decision) : '<span class="axis-chip">결정 객체 없음</span>'}
        </div>
      </div>
      <div class="drilldown-price">
        <strong>${escapeHtml(formatPrice(currentPrice(document)))}</strong>
        <span>${escapeHtml(
          formatPct(
            firstValue(
              current.change_rate,
              current.return_1d_pct,
              document.market_data?.return_1d_pct,
            ),
          ),
        )}</span>
      </div>
    </section>

    <div class="drilldown-grid">
      <section class="drilldown-panel is-wide">
        <h4>30-session price · KRX confirmation</h4>
        <canvas
          id="price-chart"
          class="price-chart"
          role="img"
          aria-label="${escapeHtml(identity.name || document.symbol || "종목")} 최근 가격 캔들 차트"
        ></canvas>
      </section>

      <section class="drilldown-panel">
        <h4>Trade geometry</h4>
        <div class="metric-grid">
          ${metricBox("Trigger", formatPrice(plan.trigger_price))}
          ${metricBox("Zone low", formatPrice(plan.entry_zone_low))}
          ${metricBox("Zone high", formatPrice(plan.entry_zone_high))}
          ${metricBox("Hard stop", formatPrice(plan.hard_stop_price))}
          ${metricBox("Stop distance", formatPct(plan.stop_distance_pct))}
          ${metricBox("Valid sessions", formatNumber(plan.order_valid_sessions))}
        </div>
      </section>

      <section class="drilldown-panel">
        <h4>Size · horizon</h4>
        <div class="metric-grid">
          ${metricBox("Size tier", firstValue(plan.size_tier, position.size_tier, "—"))}
          ${metricBox("NAV risk", formatPct(plan.risk_budget_pct_nav))}
          ${metricBox("Max weight", formatPct(plan.max_weight_pct_nav))}
          ${metricBox("Shares", formatNumber(position.shares))}
          ${metricBox(
            "Position value",
            position.position_value_krw ? `${formatNumber(position.position_value_krw)}원` : "—",
          )}
          ${metricBox(
            "Horizon",
            firstValue(decision.recommended_horizon, plan.recommended_horizon, "—"),
          )}
        </div>
      </section>

      <section class="drilldown-panel is-wide">
        <h4>Entry legs · position management</h4>
        <div class="metric-grid">
          ${metricBox("Entry method", firstValue(plan.entry_method, plan.entry_order_type, "—"))}
          ${metricBox(
            "No-chase rule",
            truncate(firstValue(plan.no_chase_condition, plan.no_chase, "—"), 80),
          )}
          ${metricBox(
            "Entry legs",
            asArray(plan.entry_legs).length
              ? asArray(plan.entry_legs)
                  .map((leg) => {
                    const fraction = number(leg?.fraction);
                    return `${leg?.leg_id || "LEG"} ${
                      fraction === null ? "" : `${Math.round(fraction * 100)}%`
                    }`;
                  })
                  .join(" · ")
              : "—",
          )}
        </div>
        <details class="json-details">
          <summary>+1R · +2R · trailing · time-stop 규칙 펼치기</summary>
          <pre>${escapeHtml(safeJson(plan.position_management || {}))}</pre>
        </details>
      </section>

      <section class="drilldown-panel">
        <h4>Reason codes</h4>
        ${codeList(reasonCodes)}
      </section>

      <section class="drilldown-panel">
        <h4>Risk · data health</h4>
        ${codeList([...asArray(riskCodes), ...issues], true)}
      </section>

      <section class="drilldown-panel">
        <h4>Flow snapshot</h4>
        <details class="json-details" open>
          <summary>수급 원본 보기</summary>
          <pre>${escapeHtml(safeJson(flow))}</pre>
        </details>
      </section>

      <section class="drilldown-panel">
        <h4>Execution · supply</h4>
        <details class="json-details" open>
          <summary>실행·공매도·대차 원본 보기</summary>
          <pre>${escapeHtml(safeJson(execution))}</pre>
        </details>
      </section>

      <section class="drilldown-panel is-wide">
        <h4>Evidence · invalidation</h4>
        <div class="metric-grid">
          ${metricBox(
            "Thesis invalidation",
            truncate(asArray(plan.thesis_invalidation).join(" · ") || "—", 120),
          )}
          ${metricBox("Order state", firstValue(decision.order_state, "—"))}
          ${metricBox("State age", `${formatNumber(decision.state_age_sessions)} sessions`)}
        </div>
        <details class="json-details">
          <summary>근거 원본 펼치기</summary>
          <pre>${escapeHtml(safeJson(evidence))}</pre>
        </details>
      </section>
    </div>
  `;
  requestAnimationFrame(() => drawPriceChart(byId("price-chart"), priceHistory(document)));
}

function drawPriceChart(canvas, rows) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(280, Math.round(rect.width || 800));
  const height = Math.max(180, Math.round(rect.height || 220));
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  if (!rows.length) {
    context.fillStyle = "#9eb1aa";
    context.font = "12px system-ui";
    context.textAlign = "center";
    context.fillText("가격 이력이 없습니다.", width / 2, height / 2);
    return;
  }

  const values = rows.flatMap((row) =>
    [row.low, row.high, row.open, row.close].map(number).filter((value) => value !== null),
  );
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, Math.abs(high) * 0.01, 1);
  const pad = { top: 18, right: 16, bottom: 26, left: 58 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const y = (value) => pad.top + ((high - value) / span) * plotHeight;
  const slot = plotWidth / rows.length;
  const candleWidth = Math.max(3, Math.min(11, slot * 0.58));

  context.strokeStyle = "rgba(220,239,230,.09)";
  context.lineWidth = 1;
  context.fillStyle = "#738981";
  context.font = "9px system-ui";
  context.textAlign = "right";
  for (let index = 0; index <= 4; index += 1) {
    const lineY = pad.top + (plotHeight / 4) * index;
    context.beginPath();
    context.moveTo(pad.left, lineY);
    context.lineTo(width - pad.right, lineY);
    context.stroke();
    const price = high - (span / 4) * index;
    context.fillText(formatNumber(price), pad.left - 8, lineY + 3);
  }

  rows.forEach((row, index) => {
    const open = number(row.open) ?? number(row.close);
    const close = number(row.close);
    const rowHigh = number(row.high) ?? Math.max(open, close);
    const rowLow = number(row.low) ?? Math.min(open, close);
    const x = pad.left + slot * index + slot / 2;
    const rising = close >= open;
    const color = rising ? "#4ee6a8" : "#ff7d78";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1.15;
    context.beginPath();
    context.moveTo(x, y(rowHigh));
    context.lineTo(x, y(rowLow));
    context.stroke();
    const bodyTop = Math.min(y(open), y(close));
    const bodyHeight = Math.max(1.5, Math.abs(y(open) - y(close)));
    context.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
  });

  const firstDate = formatDate(rows[0]?.trade_date || rows[0]?.date);
  const lastDate = formatDate(rows.at(-1)?.trade_date || rows.at(-1)?.date);
  context.fillStyle = "#738981";
  context.font = "9px system-ui";
  context.textAlign = "left";
  context.fillText(firstDate, pad.left, height - 7);
  context.textAlign = "right";
  context.fillText(lastDate, width - pad.right, height - 7);
}

async function openSymbol(symbol) {
  if (!symbol) return;
  const dialog = byId("stock-dialog");
  model.openSymbol = symbol;
  byId("dialog-title").textContent = `${symbol} 불러오는 중`;
  byId("dialog-body").innerHTML = `
    <div class="empty-state">
      <strong>종목 상세를 불러오고 있습니다.</strong>
      <p>${escapeHtml(symbol)}</p>
    </div>
  `;
  if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
  else dialog.setAttribute("open", "");

  try {
    let document = model.symbolCache.get(symbol);
    if (!document) {
      const entry = searchEntries("symbol").find((item) => item.symbol === symbol);
      const path = entry?.artifact_path || `symbols/${symbol}.json`;
      document = await fetchJson(path);
      model.symbolCache.set(symbol, document);
    }
    renderDrilldown(document);
  } catch (error) {
    byId("dialog-body").innerHTML = `
      <div class="empty-state">
        <strong>종목 상세를 불러오지 못했습니다.</strong>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function bindEvents() {
  byId("action-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    model.activeTab = button.dataset.tab;
    document.querySelectorAll(".action-tab").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    renderActions();
  });

  byId("action-tabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll(".action-tab")];
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    tabs[next].focus();
    tabs[next].click();
  });

  byId("action-filter").addEventListener("input", renderActions);
  byId("action-sort").addEventListener("change", renderActions);
  byId("theme-filter").addEventListener("input", renderThemes);
  byId("lifecycle-filter").addEventListener("change", renderThemes);

  byId("stock-query").addEventListener("input", (event) => {
    renderSearchResults(event.target.value);
  });
  byId("stock-search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = byId("stock-query").value;
    const exact = searchEntries("symbol").find(
      (entry) =>
        String(entry.symbol) === query.trim() ||
        String(entry.name || "").toLocaleLowerCase("ko-KR") ===
          query.trim().toLocaleLowerCase("ko-KR"),
    );
    if (exact) openSymbol(exact.symbol);
    else renderSearchResults(query);
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-symbol]");
    if (button) openSymbol(button.dataset.openSymbol);
  });

  byId("dialog-close").addEventListener("click", () => byId("stock-dialog").close());
  byId("stock-dialog").addEventListener("click", (event) => {
    if (event.target === byId("stock-dialog")) byId("stock-dialog").close();
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const dialog = byId("stock-dialog");
      if (!dialog.open) return;
      const document = model.openSymbol
        ? model.symbolCache.get(model.openSymbol)
        : null;
      if (document) drawPriceChart(byId("price-chart"), priceHistory(document));
    }, 120);
  });
}

function renderAll() {
  renderRunMetadata();
  renderPriorityCandidates();
  renderCoverageNotice();
  renderBlockers();
  renderSummary();
  renderActions();
  renderLegacyBaseline();
  renderThemes();
  renderSearchResults("");
}

async function loadApplication() {
  bindEvents();
  try {
    model.legacy = await fetchStandaloneJson(LEGACY_REPORT_URL);
  } catch (error) {
    console.warn("기존 스크리너 기준선 로드 실패", error);
  }
  try {
    model.summary = await fetchJson("summary.json");
    const screenDate = compactDate(model.summary?.screen_date);
    if (!screenDate) throw new Error("summary.json에 올바른 screen_date가 없습니다.");
    const [actions, themes, catalog, search] = await Promise.all([
      fetchJson(`actions/${screenDate}.json`),
      fetchJson(`themes/${screenDate}.json`),
      fetchJson("theme-catalog.json"),
      fetchJson("search-index.json"),
    ]);
    model.actions = actions;
    model.themes = themes;
    model.catalog = catalog;
    model.search = search;
    renderAll();
    setStatus(
      `${formatDate(screenDate)} 결과를 불러왔습니다. 이 대시보드는 주문을 전송하지 않습니다.`,
      "ready",
    );
  } catch (error) {
    const fileHint =
      window.location.protocol === "file:"
        ? " 파일을 직접 열지 말고 웹 서버를 통해 접속하세요."
        : "";
    setStatus(`v2 결과를 불러오지 못했습니다: ${error.message}.${fileHint}`, "error");
    renderRunMetadata();
    renderPriorityCandidates();
    renderCoverageNotice();
    renderSummary();
    renderActions();
    renderLegacyBaseline();
    renderThemes();
    renderSearchResults("");
    renderBlockers();
  }
}

document.addEventListener("DOMContentLoaded", loadApplication);
