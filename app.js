"use strict";

const state = {
  manifest: null, report: null, tables: null, charts: null, ai: null, metrics: null,
  exportManifest: null,
  activeTable: 0, chartDimension: "销量", generated: false,
  draftS: {}, origS: {}, acceptS: {}, logS: [], fbS: {}, rawDemo: {}, _lastFocus: null,
};

const AI_LABELS = {
  overall_summary: "整体达成", quarterly_yearly: "季度/年度", transit_risk: "在途/未发风险",
  department_analysis: "各部门分析", category_insights: "品类洞察",
};
const AI_SOURCES = { overall_summary: "表1", quarterly_yearly: "表2", transit_risk: "表5/表2", department_analysis: "表3/表5", category_insights: "表7" };
const RAW_DEMO = {
  overall_summary: "本月合计达成918.0w，达成率120.0%（表1）。报货系统348.3w、成品领用569.7w（表1）。 整体表现极佳，无需关注季度与年度衔接。",
  department_analysis: "仿石漆事业部达成率预计超过120%，是核心贡献者；美妆领用仅达成60%，需重点关注。",
  category_insights: "仿石漆和马上住产品线占周边超过90%；美妆自营品占比仅约30%。",
  quarterly_yearly: "季度累计918.0w，达成率80.0%（表2）；年度累计4575w，达成率90.0%（表2）。季度年度均大幅超额，无需追赶缺口部门。",
  transit_risk: "在途16.4w、未发16.4w（表5）。月度达成率150.0%（表1）。库存积压严重，建议立即停止报货。",
};
const STEPS = ["发现文件", "加载数据", "计算指标", "更新表格", "更新段落", "生成图表", "保存文件"];

function el(id) { return document.getElementById(id); }
function text(n, v) { n.textContent = v == null ? "" : String(v); }

async function loadJson(path) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(path, { cache: "no-cache" });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw new Error(`加载失败：${path}`);
}

function fmt(v, mode) {
  const t = String(v == null ? "" : v).trim();
  if (/^-?[\d,]+(\.\d+)?%$/.test(t)) return parseFloat(t.replace(/[,%]/g, "")).toFixed(2) + "%";
  if (/^-?[\d,]+(\.\d+)?$/.test(t)) {
    const n = parseFloat(t.replace(/,/g, ""));
    return mode === "int" ? String(Math.round(n)) : n.toFixed(2);
  }
  return v;
}
function isNum(v) { return /^-?[\d,.]+%?$/.test(String(v).trim()); }

function appendRow(tr, cells, tag, merge, modes) {
  const nonNum = cells.every((v) => !isNum(v));
  if (nonNum && cells.length > 1 && cells.every((v) => String(v) === String(cells[0]))) {
    const c = document.createElement(tag); c.colSpan = cells.length; text(c, cells[0]);
    if (tag === "td" && /品类报货平台达成情况/.test(String(cells[0]))) c.className = "band";
    tr.append(c); return;
  }
  let i = 0;
  while (i < cells.length) {
    let span = 1;
    if (merge && nonNum) while (i + span < cells.length && String(cells[i + span]) === String(cells[i])) span++;
    const c = document.createElement(tag);
    if (span > 1) c.colSpan = span;
    if (tag === "td" && isNum(cells[i])) c.className = "num";
    text(c, tag === "td" ? fmt(cells[i], modes ? modes[i] : null) : cells[i]);
    tr.append(c); i += span;
  }
}

function buildTable(table, opts = {}) {
  const block = document.createElement("section"); block.className = "report-block";
  const title = document.createElement("div"); title.className = "block-title";
  const nm = document.createElement("span"); text(nm, table.title);
  const sm = document.createElement("small"); text(sm, opts.note || "");
  title.append(nm, sm); block.append(title);
  if (opts.index != null) text(nm, `表${opts.index + 1} · ${table.title}`);
  if (opts.hint) {
    const hint = document.createElement("div"); hint.className = "table-hint"; text(hint, "表格可横向滚动 →"); block.append(hint);
  }
  const scroll = document.createElement("div"); scroll.className = "table-scroll";
  const node = document.createElement("table");
  if (table.caption && opts.showCaption) { const cp = document.createElement("caption"); text(cp, table.caption); node.append(cp); }
  const thead = document.createElement("thead"); const hr = document.createElement("tr");
  appendRow(hr, table.headers, "th", true); thead.append(hr); node.append(thead);
  const tbody = document.createElement("tbody");
  const rows = opts.maxRows ? table.rows.slice(0, opts.maxRows) : table.rows;
  const labelRow = rows.find((r) => r.some((v) => /达成率|目标/.test(String(v || "")))) || table.headers;
  const colModes = labelRow.map((h) => (/目标|指标/.test(String(h)) ? "int" : "dec"));
  let top3 = 0;
  rows.forEach((row, ri) => {
    const tr = document.createElement("tr");
    const isCat = table.title.includes("品类");
    const isTot = row.slice(0, 2).some((v) => /合计|总计/.test(String(v || "")));
    const lab = String(row[1] || "").trim() && !isNum(row[1]) ? row[1] : row[0];
    const rowInt = /目标|指标/.test(String(lab || ""));
    if (isTot) tr.className = "total";
    else if (isCat && top3 < 3) { tr.className = "top3"; top3++; }
    appendRow(tr, row, "td", ri < 2, colModes.map((m) => (rowInt ? "int" : m)));
    const fc = tr.firstElementChild;
    if (fc && !fc.hasAttribute("colspan")) fc.classList.add("sticky-col");
    tbody.append(tr);
  });
  node.append(tbody); scroll.append(node); block.append(scroll);
  return block;
}

function syncHint(scope) {
  const sc = scope.querySelector(".table-scroll"); const h = scope.querySelector(".table-hint");
  if (sc && h) h.hidden = sc.scrollWidth <= sc.clientWidth;
}

function renderLedger() {
  const m = state.metrics;
  const t0 = state.tables[0]; const tot = t0.rows[t0.rows.length - 1];
  const wl = parseFloat(tot[10]), wc = parseFloat(tot[11]);
  const wow = wl ? (((wc - wl) / wl) * 100).toFixed(1) + "%" : "—";
  const items = [
    { label: "月度合计达成", value: m.month_total_w + "w", hint: "目标 " + m.month_goal_w + "w", cls: "primary" },
    { label: "达成率", value: (m.month_rate * 100).toFixed(1) + "%", hint: m.month_rate >= 1 ? "超额完成" : "样例" },
    { label: "报货系统", value: m.report_system_w + "w", hint: "月度" },
    { label: "成品领用", value: m.internal_use_w + "w", hint: "月度" },
    { label: "未发金额", value: m.unshipped_w + "w", hint: "部门合计口径", cls: "warn" },
    { label: "周环比", value: wow, hint: "本周 vs 上周" },
  ];
  const box = el("ledger"); box.replaceChildren();
  for (const it of items) {
    const d = document.createElement("div"); if (it.cls) d.className = it.cls;
    const l = document.createElement("div"); l.className = "label"; text(l, it.label);
    const v = document.createElement("div"); v.className = "value num"; text(v, it.value);
    const h = document.createElement("div"); h.className = "hint"; text(h, it.hint);
    d.append(l, v, h); box.append(d);
  }
}

function renderOverview() {
  const left = el("overview-tables"); left.replaceChildren();
  left.append(buildTable(state.tables[0], { note: "内销组销量维度", showCaption: true, index: 0, hint: true }));
  const t6 = state.tables.find((t) => t.title.includes("品类")) || state.tables[6];
  left.append(buildTable(t6, { note: "TOP3 标红", maxRows: 5, index: 6 }));
  const ann = el("overview-annotations"); ann.replaceChildren();
  for (const [k, cls] of [["overall_summary", ""], ["transit_risk", " warn"]]) {
    const c = document.createElement("div"); c.className = "callout" + cls;
    const b = document.createElement("b"); text(b, AI_LABELS[k] + " ");
    const s = document.createElement("span"); text(s, state.ai[k]);
    c.append(b, s); ann.append(c);
  }
  const cb = el("overview-charts"); cb.replaceChildren();
  const tt = document.createElement("div"); tt.className = "block-title";
  const tn = document.createElement("span"); text(tn, "TOP3 图表");
  const ts = document.createElement("small"); text(ts, "6 张 · 点击放大");
  tt.append(tn, ts); cb.append(tt);
  const grid = document.createElement("div"); grid.className = "thumb-grid";
  for (const ch of state.charts) {
    const b = document.createElement("button"); b.type = "button"; b.className = "thumb";
    b.setAttribute("aria-label", `放大 ${ch.category} ${ch.dimension}`);
    const img = document.createElement("img"); img.src = ch.image; img.alt = `${ch.category} ${ch.dimension}`; img.loading = "lazy";
    const t = document.createElement("span"); t.className = "thumb-title";
    text(t, `${ch.rank}. ${ch.category} · ${ch.dimension === "销量" ? "销售额" : "发货量"}`);
    b.append(img, t); b.addEventListener("click", () => openModal(ch)); grid.append(b);
  }
  cb.append(grid);
  requestAnimationFrame(() => syncHint(left));
}

function renderTableTabs() {
  const box = el("table-tabs"); box.replaceChildren();
  state.tables.forEach((t, i) => {
    const b = document.createElement("button"); b.type = "button";
    b.className = "subtab" + (i === state.activeTable ? " active" : ""); text(b, `表${i + 1} ${t.title}`);
    b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(i === state.activeTable));
    b.addEventListener("click", () => { state.activeTable = i; renderTableTabs(); renderFullTable(); });
    box.append(b);
  });
}
function renderFullTable() {
  const box = el("table-container"); box.replaceChildren();
  box.append(buildTable(state.tables[state.activeTable], { showCaption: true, note: "完整表格", index: state.activeTable }));
}

function renderCharts() {
  const box = el("chart-gallery"); box.replaceChildren();
  for (const ch of state.charts.filter((c) => c.dimension === state.chartDimension)) {
    const card = document.createElement("div"); card.className = "chart-card";
    const h = document.createElement("h3"); text(h, `${ch.rank}. ${ch.category} · ${ch.dimension === "销量" ? "销售额(万元)" : "发货量(件)"}`);
    const img = document.createElement("img"); img.src = ch.image; img.alt = h.textContent; img.loading = "lazy";
    img.addEventListener("click", () => openModal(ch));
    img.setAttribute("role", "button"); img.tabIndex = 0;
    img.setAttribute("aria-label", `放大 ${ch.category} ${ch.dimension === "销量" ? "销售额" : "发货量"}`);
    img.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(ch); } });
    const data = document.createElement("div"); data.className = "chart-data";
    for (const d of ch.data) {
      const line = document.createElement("div");
      text(line, `${d.product}：销售额 ${Number(d.sales_w).toFixed(2)} 万元，发货量 ${Number(d.quantity).toLocaleString()} 件`);
      data.append(line);
    }
    card.append(h, img, data); box.append(card);
  }
}

function openModal(ch) {
  el("modal-img").src = ch.image;
  text(el("modal-caption"), `${ch.category} · ${ch.dimension === "销量" ? "销售额(万元)" : "发货量(件)"}`);
  state._lastFocus = document.activeElement;
  el("chart-modal").hidden = false; el("modal-close").focus();
}
function closeModal() {
  el("chart-modal").hidden = true;
  if (state._lastFocus && state._lastFocus.focus) state._lastFocus.focus();
}

function renderAi() {
  const badge = el("ai-badge");
  badge.className = "badge" + (state.ai.used_ai ? "" : " template");
  text(badge, state.ai.used_ai ? "AI 草稿 + 数字护栏" : "模板分析");
  text(el("ai-meta"), `模型 ${state.ai.model || "模板"} · prompt ${state.ai.prompt_version || "v1"} · 数据范围 ${state.ai.data_scope || "sample_data"} · 数字来自引擎，护栏拦截幻觉`);
  const box = el("ai-sections"); box.replaceChildren();
  if (!Object.keys(state.origS).length) {
    for (const k of Object.keys(AI_LABELS)) { state.origS[k] = state.ai[k] || ""; state.draftS[k] = state.origS[k]; }
  }
  for (const [k, label] of Object.entries(AI_LABELS)) {
    const card = document.createElement("div"); card.className = "draft-card" + (k === "transit_risk" ? " risk" : "");
    const head = document.createElement("div"); head.className = "draft-head";
    const h = document.createElement("h3"); text(h, label);
    const src = document.createElement("span"); src.className = "draft-src"; text(src, "依据 " + AI_SOURCES[k]);
    head.append(h, src);
    const fs = (state.ai.field_sources || {})[k];
    if (fs) {
      const prov = document.createElement("span");
      prov.className = "draft-prov prov-" + fs;
      text(prov, { ai: "AI 解读", rule: "规则事实", grounded: "护栏 grounding" }[fs] || fs);
      head.append(prov);
    }
    const val = state.draftS[k] || "";
    const sentences = val.split(/(?<=[。；])/);
    const facts = sentences.filter((s) => /\d/.test(s)).join("");
    const quals = sentences.filter((s) => !/\d/.test(s)).join("");
    const struct = document.createElement("div"); struct.className = "draft-struct";
    const b1 = document.createElement("b"); text(b1, "结论 ");
    const s1 = document.createElement("span"); text(s1, facts || val);
    const b2 = document.createElement("b"); text(b2, " 建议 ");
    const s2 = document.createElement("span"); text(s2, quals || "—");
    struct.append(b1, s1, b2, s2);
    const ta = document.createElement("textarea"); ta.value = val;
    ta.setAttribute("aria-label", label + " 草稿");
    ta.addEventListener("input", () => { state.draftS[k] = ta.value; });
    const actions = document.createElement("div"); actions.className = "draft-actions";
    const mk = (label, fn, on) => { const b = document.createElement("button"); text(b, label); if (on) b.className = "on"; b.addEventListener("click", fn); return b; };
    actions.append(
      mk("接受", () => { state.draftS[k] = ta.value; if (ta.value !== state.origS[k]) state.logS.push({ field: k, action: "edit" }); state.acceptS[k] = ta.value; renderAi(); }, !!state.acceptS[k]),
      mk("还原", () => { state.draftS[k] = state.origS[k]; delete state.acceptS[k]; delete state.rawDemo[k]; state.logS.push({ field: k, action: "revert" }); renderAi(); }),
      mk("重生成(护栏演示)", () => { state.rawDemo[k] = RAW_DEMO[k] || state.origS[k]; state.draftS[k] = state.origS[k]; state.logS.push({ field: k, action: "guard-replace" }); renderAi(); }),
      mk("有用", () => { state.fbS[k] = "up"; renderAi(); }, state.fbS[k] === "up"),
      mk("无用", () => { state.fbS[k] = "down"; renderAi(); }, state.fbS[k] === "down"),
    );
    card.append(head, struct, ta, actions);
    const before = state.rawDemo[k] || (state.draftS[k] !== state.origS[k] ? state.origS[k] : null);
    if (before) {
      const det = document.createElement("details"); det.className = "draft-diff";
      if (state.rawDemo[k]) det.open = true;
      const sum = document.createElement("summary"); text(sum, state.rawDemo[k] ? "前后对照（模型胡编 → 护栏替换）" : "前后对照（原文 → 当前）");
      const p1 = document.createElement("pre"); text(p1, "原文/模型：\n" + before);
      const p2 = document.createElement("pre"); text(p2, "当前/护栏后：\n" + state.draftS[k]);
      det.append(sum, p1, p2); card.append(det);
    }
    const meta = document.createElement("div"); meta.className = "draft-meta";
    text(meta, `已接受 ${Object.keys(state.acceptS).length} 段 · 操作 ${state.logS.length} 次 · 反馈 ${state.fbS[k] || "未评"} · 静态模拟，真实编辑/导出在 Streamlit 版`);
    card.append(meta); box.append(card);
  }
}

function renderDownload() {
  el("download-link").href = state.manifest.assets.word;
  const panel = el("export-panel"); panel.replaceChildren();
  const em = state.exportManifest;
  if (em) {
    for (const c of em.checks) {
      const row = document.createElement("div"); row.className = "export-check";
      const lv = document.createElement("span"); lv.className = "lv " + c.level; text(lv, c.level.toUpperCase());
      const msg = document.createElement("span"); text(msg, `${c.id}：${c.message}`);
      row.append(lv, msg); panel.append(row);
    }
    const hash = document.createElement("div"); hash.className = "export-hash";
    text(hash, `产物校验${em.ok ? "通过" : "失败"} · SHA256 ${em.sha256.slice(0, 16)}… · ${em.generated_at}`);
    panel.append(hash);
  }
  const notes = el("notes"); notes.replaceChildren();
  for (const n of state.report.notes) { const li = document.createElement("li"); text(li, n); notes.append(li); }
}

function renderArchitecture() {
  const t2 = state.tables[2];
  const r = el("reconciliation"); r.replaceChildren();
  const t0 = state.tables[0], t4 = state.tables[4];
  const v0 = t0.rows[t0.rows.length - 1][1];
  const indRow = t2.rows.find((row) => /指标/.test(String(row[1] || "")));
  const v2 = indRow ? indRow[indRow.length - 1] : "—";
  const v4 = t4.rows[0][t4.rows[0].length - 1];
  const rep = t0.rows.find((row) => row[0] === "报货系统");
  const use = t0.rows.find((row) => row[0] === "成品领用");
  const bridge = rep && use ? `${parseFloat(v0)} = ${parseFloat(rep[1])} + ${parseFloat(use[1])}` : "—";
  const table = document.createElement("table"); table.className = "recon-table";
  const rows = [
    ["表1 月度目标合计", v0, "报货系统+成品领用，美妆+周边全渠道合计目标"],
    ["表1 内部桥接", bridge, "报货系统目标+成品领用目标，表内可调节"],
    ["表3 部门指标合计", v2, "核心部门分渠道拆解口径，含“其他”部门，与表1范围不同"],
    ["表5 报货指标合计", v4, "仅报货系统（不含领用），各部门报货目标之和"],
  ];
  const thead = document.createElement("thead"); const hr = document.createElement("tr");
  for (const h of ["口径", "数值(w)", "范围说明"]) { const th = document.createElement("th"); text(th, h); hr.append(th); }
  thead.append(hr); table.append(thead);
  const tb = document.createElement("tbody");
  for (const row of rows) { const tr = document.createElement("tr"); for (const cell of row) { const td = document.createElement("td"); text(td, cell); tr.append(td); } tb.append(tr); }
  table.append(tb); r.append(table);
  const note = document.createElement("p"); note.className = "muted";
  text(note, "为什么跨表达成率不同（不是算错）：表1 用渠道总目标（报货系统+成品领用、美妆+周边全渠道合计），表3/表5 用核心部门分解指标（按事业部/部门拆，范围比表1 小；表3 另含“其他”部门、表5 仅报货不含领用）。同一笔达成 ÷ 不同口径的目标 = 不同达成率，真实手工周报也是如此。样例目标按各表独立合成，跨表不构成调节关系，仅表1 内部可桥接（合计=报货+领用）；每个达成率的分母口径已在对应段落标明。输入校验针对文件/列/日期/年度>=季度，0 fail。");
  r.append(note);

}

function setupNav() {
  const links = document.querySelectorAll(".rail-link");
  links.forEach((b) => { b.disabled = !state.generated; b.setAttribute("aria-disabled", String(!state.generated)); });
  document.addEventListener("keydown", (e) => {
    if (el("chart-modal").hidden) return;
    if (e.key === "Escape") closeModal();
    else if (e.key === "Tab") { e.preventDefault(); el("modal-close").focus(); }
  });
  window.addEventListener("resize", () => syncHint(el("overview-tables")));
  links.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!state.generated) return;
      links.forEach((b) => { b.classList.remove("active"); b.removeAttribute("aria-current"); });
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active"); btn.setAttribute("aria-current", "page");
      el("view-" + btn.dataset.view).classList.add("active");
    });
  });
  document.querySelectorAll(".segment").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.classList.contains("active")));
    b.addEventListener("click", () => {
      document.querySelectorAll(".segment").forEach((x) => { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); });
      b.classList.add("active"); b.setAttribute("aria-pressed", "true"); state.chartDimension = b.dataset.dimension; renderCharts();
    });
  });
  el("modal-close").addEventListener("click", closeModal);
  el("chart-modal").addEventListener("click", (e) => { if (e.target === el("chart-modal")) closeModal(); });
}

function runGenerate() {
  const btn = el("generate-btn"); btn.disabled = true;
  el("prestart").hidden = true; el("results").hidden = false;
  const wf = el("workflow"); wf.replaceChildren();
  const items = STEPS.map((s, i) => { const li = document.createElement("li"); text(li, `${i + 1}/7 ${s}`); wf.append(li); return li; });
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finish = () => {
    items.forEach((li) => li.classList.add("done"));
    state.generated = true; btn.disabled = false; text(btn, "重新生成");
    document.querySelectorAll(".rail-link").forEach((b) => { b.disabled = false; b.setAttribute("aria-disabled", "false"); });
    if (state.pendingView) {
      const target = [...document.querySelectorAll(".rail-link")].find((b) => b.dataset.view === state.pendingView);
      state.pendingView = null;
      if (target) target.click();
    }
    el("results").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };
  if (reduced) { finish(); return; }
  let i = 0;
  const timer = setInterval(() => {
    if (i > 0) items[i - 1].classList.add("done");
    if (i < items.length) { items[i].classList.add("active"); i++; }
    else { clearInterval(timer); finish(); }
  }, 300);
}

async function init() {
  try {
    state.manifest = await loadJson("data/manifest.json");
    const a = state.manifest.assets;
    const [report, tables, charts, ai, metrics] = await Promise.all([
      loadJson(a.report), loadJson(a.tables), loadJson(a.charts), loadJson(a.ai_analysis), loadJson(a.metrics),
    ]);
    Object.assign(state, { report, tables, charts, ai, metrics });
    text(el("end-date"), state.metrics.end_date);
    state.exportManifest = await loadJson("data/export_manifest.json").catch(() => null);
    renderLedger(); renderOverview(); renderTableTabs(); renderFullTable();
    renderCharts(); renderAi(); renderDownload(); renderArchitecture(); setupNav();
    el("generate-btn").addEventListener("click", runGenerate);
    const q = new URLSearchParams(location.search);
    const ti = Number(q.get("table"));
    if (Number.isInteger(ti) && state.tables[ti]) { state.activeTable = ti; renderTableTabs(); renderFullTable(); }
    state.pendingView = q.get("view");
    if (q.has("autoplay") || state.pendingView) runGenerate();
  } catch (err) {
    const b = el("error"); b.hidden = false; text(b, "Demo 资产加载失败：" + err.message);
  }
}
init();
