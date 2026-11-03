/* JUICED · charts and interactions. Vanilla JS, hand-rolled SVG. */
(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const $ = (s, r = document) => r.querySelector(s);
  const DATA = {};
  const FILES = ["league_trend", "change_points", "ball_or_juice", "hr_distribution", "aging_curves",
    "aging_summary", "model_outliers", "unmasking", "unmasking_null", "unmasking_top", "big_seasons",
    "late_bloomers", "late_bloomers_by_era", "canseco_degrees", "canseco_teammates_documented",
    "juice_index", "policy_timeline", "food_juice", "food_correlation", "milk_lag"];
  const TIER_LABEL = { confirmed: "confirmed", named: "named", stimulant: "stimulant only", none: "no documented link" };
  const tierOf = (t) => (t && t !== "none" ? t : "none");

  // ---------- theme ----------
  const themeBtn = $("#theme");
  try { const t = localStorage.getItem("juiced-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  themeBtn.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("juiced-theme", next); } catch (e) {}
  });

  // ---------- small helpers ----------
  function s(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function h(tag, attrs = {}, html) {
    const n = document.createElement(tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const lin = (d0, d1, r0, r1) => { const f = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0); f.inv = (p) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0); return f; };
  const fmt = (v, d = 0) => v == null ? "–" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const ticks = (lo, hi, step) => { const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6)); return out; };
  const pathOf = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
  const chip = (t) => `<span class="chip ${tierOf(t)}">${TIER_LABEL[tierOf(t)]}</span>`;

  // ---------- tooltip ----------
  const tip = $("#tip");
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.classList.add("on");
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    tip.style.left = Math.max(8, left) + "px"; tip.style.top = Math.max(8, top) + "px";
  }
  const hideTip = () => tip.classList.remove("on");
  const row = (k, v, sw) => `<div class="row"><span>${sw ? `<i style="background:${sw}"></i>` : ""}${k}</span><span>${v}</span></div>`;
  addEventListener("scroll", hideTip, { passive: true });

  // ---------- figure shell: title, legend, chart, table toggle, SQL panel ----------
  function shell(fig, { title, sub, legend = [], table, note }) {
    fig.innerHTML = "";
    const head = h("div", { class: "fig-head" });
    head.appendChild(h("div", {}, `<div class="fig-title">${title}</div>${sub ? `<div class="fig-sub">${sub}</div>` : ""}`));
    if (legend.length) head.appendChild(h("div", { class: "legend" }, legend.map(([cls, lbl, style]) =>
      `<span><i class="${cls}" ${style ? `style="${style}"` : ""}></i>${lbl}</span>`).join("")));
    fig.appendChild(head);
    const chart = h("div", { class: "chart" });
    fig.appendChild(chart);
    const foot = h("div", { class: "fig-foot" });
    foot.appendChild(h("span", {}, note || ""));
    const right = h("span");
    if (table) {
      const b = h("button", { class: "linkish", type: "button" }, "Show table");
      let tw = null;
      b.onclick = () => {
        if (tw) { tw.remove(); tw = null; b.textContent = "Show table"; return; }
        tw = renderTable(table.cols, table.rows); fig.insertBefore(tw, foot.nextSibling); b.textContent = "Hide table";
      };
      right.appendChild(b);
    }
    foot.appendChild(right);
    fig.appendChild(foot);
    if (fig.dataset.sql) fig.appendChild(sqlPanel(fig.dataset.sql));
    return chart;
  }
  function renderTable(cols, rows) {
    const wrap = h("div", { class: "tbl-wrap" });
    const t = h("table", { class: "data" });
    t.innerHTML = `<thead><tr>${cols.map((c) => `<th class="${c.n ? "n" : ""}">${c.label}</th>`).join("")}</tr></thead><tbody>${
      rows.map((r) => `<tr>${cols.map((c) => { const v = typeof c.key === "function" ? c.key(r) : r[c.key];
        return `<td class="${c.n ? "n" : ""}">${v == null ? "–" : c.raw ? v : esc(v)}</td>`; }).join("")}</tr>`).join("")}</tbody>`;
    wrap.appendChild(t); return wrap;
  }

  // ---------- SQL panels ----------
  const KW = new Set(("select from where group by order having limit with as and or not in is null join left right inner outer on using " +
    "create replace view table schema insert into values case when then else end distinct over partition rows between " +
    "unbounded preceding following current row union all recursive key cast coalesce nullif sum count avg min max round " +
    "exists asc desc true false lag lead row_number rank dense_rank qualify filter within quantile_cont percentile_cont " +
    "generate_series range cross lateral double integer varchar date primary references check if alter add greatest least " +
    "abs sqrt ln exp floor ceil md5 hash string_agg arg_min arg_max list unnest struct interval extract").split(" "));
  function highlight(sql) {
    return sql.replace(/(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([&<>])/g, (m, c, st, n, w, sp) => {
      if (c) return `<span class="tok-cmt">${esc(c)}</span>`;
      if (st) return `<span class="tok-str">${esc(st)}</span>`;
      if (n) return `<span class="tok-num">${n}</span>`;
      if (w) return KW.has(w.toLowerCase()) ? `<span class="tok-kw">${w}</span>` : w;
      return esc(sp);
    });
  }
  const sqlCache = {};
  const getSQL = (name) => (sqlCache[name] ||= fetch(`sql/analysis/${name}.sql`).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }));
  window.JUICED_getSQL = getSQL;
  function sqlPanel(name) {
    const d = h("details", { class: "sql" });
    d.innerHTML = `<summary>View the SQL · ${name}.sql</summary>`;
    d.addEventListener("toggle", async () => {
      if (!d.open || d.dataset.loaded) return;
      d.dataset.loaded = 1;
      const body = h("div");
      d.appendChild(body);
      try {
        const sql = await getSQL(name);
        const acts = h("div", { class: "sql-actions" });
        const open = h("button", { class: "linkish", type: "button" }, "Open in the live console ↓");
        open.onclick = () => window.JUICED_openInConsole && window.JUICED_openInConsole(name);
        const copy = h("button", { class: "linkish", type: "button" }, "Copy");
        copy.onclick = () => navigator.clipboard?.writeText(sql).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1200); });
        acts.append(open, copy);
        body.appendChild(acts);
        const pre = h("pre", { class: "code" });
        pre.innerHTML = highlight(sql);
        body.appendChild(pre);
      } catch (e) { body.innerHTML = `<p class="status err">Couldn't load ${name}.sql</p>`; }
    });
    return d;
  }

  // ---------- generic frame ----------
  function frame(chart, { height, m, x, y, xTicks, yTicks, xFmt = (v) => v, yFmt = (v) => v, yLabel }) {
    const W = Math.max(300, chart.clientWidth), H = height;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, chart);
    const X = lin(x[0], x[1], m.l, W - m.r), Y = lin(y[0], y[1], H - m.b, m.t);
    const g = s("g", {}, svg);
    (yTicks || []).forEach((v) => {
      s("line", { class: "gridline", x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, g);
      s("text", { class: "tick", x: m.l - 8, y: Y(v) + 4, "text-anchor": "end" }, g).textContent = yFmt(v);
    });
    s("line", { class: "axisline", x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }, g);
    (xTicks || []).forEach((v) => {
      s("text", { class: "tick", x: X(v), y: H - m.b + 18, "text-anchor": "middle" }, g).textContent = xFmt(v);
    });
    if (yLabel) s("text", { class: "tick", x: m.l - 8, y: m.t - 12, "text-anchor": "end" }, g).textContent = "";
    return { svg, W, H, X, Y, m };
  }

  // crosshair for line charts: series = [{label, color, get(x)->y, fmt}]
  function crosshair(F, xs, series, title) {
    const { svg, X, Y, m, H, W } = F;
    const line = s("line", { class: "cross", y1: m.t, y2: H - m.b, visibility: "hidden" }, svg);
    const dots = series.map((sr) => s("circle", { r: 4.5, class: "ring", style: `fill:${sr.color}`, visibility: "hidden" }, svg));
    const hit = s("rect", { class: "hit", x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }, svg);
    const move = (ev) => {
      const pt = ev.touches ? ev.touches[0] : ev;
      const r = svg.getBoundingClientRect();
      const px = ((pt.clientX - r.left) / r.width) * W;
      const xv = X.inv(px);
      let best = xs[0];
      for (const v of xs) if (Math.abs(v - xv) < Math.abs(best - xv)) best = v;
      line.setAttribute("x1", X(best)); line.setAttribute("x2", X(best)); line.setAttribute("visibility", "visible");
      let html = `<b>${title(best)}</b>`;
      series.forEach((sr, i) => {
        const yv = sr.get(best);
        if (yv == null) { dots[i].setAttribute("visibility", "hidden"); return; }
        dots[i].setAttribute("cx", X(best)); dots[i].setAttribute("cy", Y(yv)); dots[i].setAttribute("visibility", "visible");
        html += row(sr.label, sr.fmt(yv), sr.color);
      });
      showTip(html, pt.clientX, pt.clientY);
    };
    const leave = () => { line.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); hideTip(); };
    hit.addEventListener("mousemove", move); hit.addEventListener("touchmove", move, { passive: true });
    hit.addEventListener("mouseleave", leave); hit.addEventListener("touchend", leave);
  }

  // ---------- CHARTS ----------
  const charts = {};

  charts.trend = (fig) => {
    const d = DATA.league_trend, cp = DATA.change_points;
    const chart = shell(fig, {
      title: "League home runs per 100 plate appearances, 1901–2025",
      sub: "Dashed steps: the four eras the change-point search picked for 1960–2025",
      legend: [["line f1", "HR per 100 PA", "background:var(--s1)"], ["dash", "Best-fit era average"], ["band", "Untested era, 1993–2004"]],
      table: { cols: [{ label: "Year", key: "year_id" }, { label: "HR / 100 PA", key: "hr_per_100_pa", n: 1 }, { label: "HR / game", key: "hr_per_game", n: 1 }, { label: "K %", key: "so_pct", n: 1 }], rows: d.slice().reverse() },
      note: "AL + NL combined. 2020 was a 60-game season.",
    });
    const narrow = chart.clientWidth < 560;
    const F = frame(chart, { height: narrow ? 300 : 360, m: { t: 28, r: 16, b: 30, l: 40 }, x: [1901, 2025], y: [0, 4],
      xTicks: narrow ? [1920, 1960, 2000] : [1910, 1930, 1950, 1970, 1990, 2010], yTicks: [0, 1, 2, 3, 4] });
    const { svg, X, Y, m, H } = F;
    s("rect", { class: "bandrect", x: X(1992.5), width: X(2004.5) - X(1992.5), y: m.t, height: H - m.b - m.t }, svg);
    cp.forEach((c) => s("path", { class: "step", d: pathOf([[X(c.start_year - 0.5), Y(c.mean_hr_per_100_pa)], [X(c.end_year + 0.5), Y(c.mean_hr_per_100_pa)]]) }, svg));
    // vertical ticks at the breaks
    [1994, 2016].forEach((yr) => {
      s("line", { class: "cross", x1: X(yr - 0.5), x2: X(yr - 0.5), y1: m.t - 6, y2: H - m.b, "stroke-dasharray": "2 3" }, svg);
      s("text", { class: "lbl-strong", x: X(yr - 0.5), y: m.t - 10, "text-anchor": "middle" }, svg).textContent = yr;
    });
    s("path", { class: "ln c1", d: pathOf(d.map((r) => [X(r.year_id), Y(r.hr_per_100_pa)])) }, svg);
    const pick = (yr) => d.find((r) => r.year_id === yr);
    [[2000, "2000: 2.99", -1], [2019, "2019: 3.63", -1]].forEach(([yr, t, side]) => {
      const r = pick(yr);
      s("circle", { cx: X(yr), cy: Y(r.hr_per_100_pa), r: 4.5, class: "f1 ring" }, svg);
      s("text", { class: "lbl", x: yr === 2019 ? X(2015.5) - 6 : X(yr) - 8, y: yr === 2019 ? Y(r.hr_per_100_pa) + 4 : Y(r.hr_per_100_pa) - 10, "text-anchor": "end" }, svg).textContent = t;
    });
    const r68 = pick(1968);
    s("text", { class: "lbl", x: X(1968), y: Y(r68.hr_per_100_pa) + 22, "text-anchor": "middle" }, svg).textContent = narrow ? "1968" : "1968: year of the pitcher";
    const byYear = new Map(d.map((r) => [r.year_id, r]));
    const era = (yr) => cp.find((c) => yr >= c.start_year && yr <= c.end_year);
    crosshair(F, d.map((r) => r.year_id), [
      { label: "HR / 100 PA", color: "var(--s1)", get: (x) => byYear.get(x)?.hr_per_100_pa, fmt: (v) => fmt(v, 2) },
      { label: "Era average", color: "var(--text-2)", get: (x) => era(x)?.mean_hr_per_100_pa, fmt: (v) => fmt(v, 2) },
    ], (x) => x);
  };

  charts["dumbbell-eras"] = (fig) => {
    const d = DATA.ball_or_juice;
    const chart = shell(fig, {
      title: "The middle vs the top, by stretch of years",
      sub: "HR per 100 PA among regulars (300+ PA). Tail ratio = top 1% ÷ median.",
      legend: [["f1", "Median regular", "background:var(--s1)"], ["f2", "Top 1%", "background:var(--s2)"]],
      table: { cols: [{ label: "Years", key: "label" }, { label: "Median", key: "median_hr_per_100_pa", n: 1 }, { label: "Top 1%", key: "p99_hr_per_100_pa", n: 1 }, { label: "Tail ratio", key: "tail_ratio", n: 1 }, { label: "Gini", key: "gini", n: 1 }], rows: d },
    });
    const W0 = chart.clientWidth, narrow = W0 < 620;
    const rowH = narrow ? 74 : 56, m = { t: 8, r: narrow ? 16 : 150, b: 30, l: narrow ? 16 : 230 };
    const H = m.t + m.b + rowH * d.length;
    const F = frame(chart, { height: H, m, x: [0, 8], y: [0, 1], xTicks: [0, 2, 4, 6, 8] });
    const { svg, X, W } = F;
    ticks(0, 8, 2).forEach((v) => s("line", { class: "gridline", x1: X(v), x2: X(v), y1: m.t, y2: H - m.b }, svg));
    if (!narrow) {
      s("text", { class: "tick", x: W - m.r + 24, y: m.t + 2, "text-anchor": "start" }, svg).textContent = "";
    }
    d.forEach((r, i) => {
      const cy = m.t + rowH * i + (narrow ? 48 : rowH / 2);
      const label = r.label.replace(/\s*\((.*)\)/, " · $1");
      s("text", { class: "lbl-strong", x: narrow ? m.l : m.l - 14, y: narrow ? cy - 22 : cy + 4, "text-anchor": narrow ? "start" : "end" }, svg).textContent = label;
      s("line", { class: "connector", x1: X(r.median_hr_per_100_pa), x2: X(r.p99_hr_per_100_pa), y1: cy, y2: cy }, svg);
      s("circle", { cx: X(r.median_hr_per_100_pa), cy, r: 6, class: "f1 ring" }, svg);
      s("circle", { cx: X(r.p99_hr_per_100_pa), cy, r: 6, class: "f2 ring" }, svg);
      const stat = `tail ${fmt(r.tail_ratio, 2)} · Gini ${fmt(r.gini, 3)}`;
      if (narrow) s("text", { class: "lbl", x: W - m.r, y: cy - 22, "text-anchor": "end" }, svg).textContent = stat;
      else s("text", { class: "lbl", x: W - m.r + 16, y: cy + 4 }, svg).textContent = stat;
      const hit = s("rect", { class: "hit", x: 0, y: cy - rowH / 2, width: W, height: rowH }, svg);
      hit.addEventListener("mousemove", (ev) => showTip(`<b>${esc(r.label)}</b>` + row("Median", fmt(r.median_hr_per_100_pa, 2), "var(--s1)") +
        row("Top 1%", fmt(r.p99_hr_per_100_pa, 2), "var(--s2)") + row("Tail ratio", fmt(r.tail_ratio, 2)) + row("Gini", fmt(r.gini, 3)), ev.clientX, ev.clientY));
      hit.addEventListener("mouseleave", hideTip);
    });
  };

  charts["dist-trend"] = (fig) => {
    const d = DATA.hr_distribution;
    const chart = shell(fig, {
      title: "Median regular vs top 1%, every season since 1960",
      sub: "The gap is the story: wide in the late 90s, narrow in the juiced-ball years",
      legend: [["line", "Top 1%", "background:var(--s2)"], ["line", "Median", "background:var(--s1)"], ["band", "Untested era"]],
      table: { cols: [{ label: "Year", key: "year_id" }, { label: "Regulars", key: "regulars", n: 1 }, { label: "Median", key: "p50_rate", n: 1 }, { label: "Top 10%", key: "p90_rate", n: 1 }, { label: "Top 1%", key: "p99_rate", n: 1 }, { label: "Gini", key: "gini", n: 1 }], rows: d.slice().reverse() },
      note: "2020 is missing: nobody reached 300 PA in a 60-game season.",
    });
    const narrow = chart.clientWidth < 560;
    const F = frame(chart, { height: narrow ? 260 : 300, m: { t: 16, r: 16, b: 30, l: 40 }, x: [1960, 2025], y: [0, 9],
      xTicks: narrow ? [1970, 1990, 2010] : [1960, 1970, 1980, 1990, 2000, 2010, 2020], yTicks: [0, 3, 6, 9] });
    const { svg, X, Y, m, H } = F;
    s("rect", { class: "bandrect", x: X(1992.5), width: X(2004.5) - X(1992.5), y: m.t, height: H - m.b - m.t }, svg);
    // break the line across the missing 2020
    const seg = (key) => { const parts = [[]]; let prev = null;
      d.forEach((r) => { if (prev != null && r.year_id - prev > 1) parts.push([]); parts.at(-1).push([X(r.year_id), Y(r[key])]); prev = r.year_id; });
      return parts.map(pathOf).join(""); };
    s("path", { class: "ln c2", d: seg("p99_rate") }, svg);
    s("path", { class: "ln c1", d: seg("p50_rate") }, svg);
    const by = new Map(d.map((r) => [r.year_id, r]));
    const xs = []; for (let y = 1960; y <= 2025; y++) xs.push(y);
    crosshair(F, xs, [
      { label: "Top 1%", color: "var(--s2)", get: (x) => by.get(x)?.p99_rate, fmt: (v) => fmt(v, 2) },
      { label: "Median", color: "var(--s1)", get: (x) => by.get(x)?.p50_rate, fmt: (v) => fmt(v, 2) },
    ], (x) => (by.has(x) ? x : `${x} · no qualifiers`));
  };

  charts.aging = (fig) => {
    const d = DATA.aging_curves;
    const eras = [...new Set(d.map((r) => r.era))];
    const cls = ["1", "2", "3"], vars = ["--s1", "--s2", "--s3"];
    const nice = (e) => e.replace(" · ", ", ");
    const chart = shell(fig, {
      title: "Power by age, relative to each era's peak",
      sub: "HR+ points above or below the peak age. Delta method, regulars only.",
      legend: eras.map((e, i) => [`line`, nice(e), `background:var(${vars[i]})`]),
      table: { cols: [{ label: "Era", key: "era" }, { label: "Age", key: "age", n: 1 }, { label: "Player pairs", key: "pairs", n: 1 }, { label: "HR+ vs peak", key: "hr_plus_vs_peak", n: 1 }], rows: d },
      note: DATA.aging_summary.map((a) => `${nice(a.era)}: ${a.change_30_to_35} from 30 to 35`).join(" · "),
    });
    const narrow = chart.clientWidth < 560;
    const F = frame(chart, { height: narrow ? 300 : 360, m: { t: 16, r: narrow ? 16 : 96, b: 30, l: 44 }, x: [22, 39], y: [-90, 5],
      xTicks: ticks(22, 39, narrow ? 4 : 2), yTicks: [0, -20, -40, -60, -80], yFmt: (v) => (v > 0 ? "+" : "") + v });
    const { svg, X, Y, W, m } = F;
    [30, 35].forEach((a) => s("line", { class: "cross", x1: X(a), x2: X(a), y1: m.t, y2: Y(-90), "stroke-dasharray": "2 3" }, svg));
    eras.forEach((e, i) => {
      const pts = d.filter((r) => r.era === e).sort((a, b) => a.age - b.age);
      s("path", { class: `ln c${cls[i]}`, d: pathOf(pts.map((r) => [X(r.age), Y(r.hr_plus_vs_peak)])) }, svg);
      const at35 = pts.find((r) => r.age === 35);
      s("circle", { cx: X(35), cy: Y(at35.hr_plus_vs_peak), r: 4.5, class: `f${cls[i]} ring` }, svg);
      if (!narrow) {
        const last = pts.at(-1);
        s("text", { class: "lbl", x: W - m.r + 8, y: Y(last.hr_plus_vs_peak) + 4 + (i - 1) * 13 }, svg).textContent = e.split(" · ")[1];
      }
    });
    const ages = []; for (let a = 22; a <= 39; a++) ages.push(a);
    const get = (e) => (x) => d.find((r) => r.era === e && r.age === x)?.hr_plus_vs_peak;
    crosshair(F, ages, eras.map((e, i) => ({ label: e.split(" · ")[1], color: `var(${vars[i]})`, get: get(e), fmt: (v) => (v > 0 ? "+" : "") + fmt(v, 1) })), (x) => `Age ${x}`);
  };

  // dumbbell list (expected→actual or prime→late), colored by tier
  function tierDumbbell(chart, rows, { lo, hi, x, xTicks, label, tipHtml }) {
    const narrow = chart.clientWidth < 560;
    const rowH = narrow ? 42 : 30, m = { t: 6, r: 44, b: 30, l: narrow ? 12 : 190 };
    const H = m.t + m.b + rowH * rows.length;
    const F = frame(chart, { height: H, m, x, y: [0, 1], xTicks });
    const { svg, X, W } = F;
    xTicks.forEach((v) => s("line", { class: "gridline", x1: X(v), x2: X(v), y1: m.t, y2: H - m.b }, svg));
    rows.forEach((r, i) => {
      const cy = m.t + rowH * i + (narrow ? 30 : rowH / 2);
      const t = tierOf(r.ped_tier);
      s("text", { class: "lbl-strong", x: narrow ? m.l : m.l - 12, y: narrow ? cy - 12 : cy + 4, "text-anchor": narrow ? "start" : "end" }, svg).textContent = label(r);
      s("line", { class: "connector", x1: X(lo(r)), x2: X(hi(r)), y1: cy, y2: cy }, svg);
      s("circle", { cx: X(lo(r)), cy, r: 5, class: "hollow" }, svg);
      s("circle", { cx: X(hi(r)), cy, r: 6, class: `f-${t} ring` }, svg);
      s("text", { class: "lbl", x: X(hi(r)) + 10, y: cy + 4 }, svg).textContent = fmt(hi(r));
      const hit = s("rect", { class: "hit", x: 0, y: cy - rowH / 2 - (narrow ? 6 : 0), width: W, height: rowH }, svg);
      hit.addEventListener("mousemove", (ev) => showTip(tipHtml(r), ev.clientX, ev.clientY));
      hit.addEventListener("mouseleave", hideTip);
    });
  }
  const tierLegend = (withHollow) => [
    ...(withHollow ? [["", withHollow, "background:var(--surface);border:2px solid var(--text-3);border-radius:50%"]] : []),
    ["", "confirmed", "background:var(--t-confirmed);border-radius:50%"], ["", "named", "background:var(--t-named);border-radius:50%"],
    ["", "no documented link", "background:var(--t-none);border-radius:50%"]];

  charts.outliers = (fig) => {
    const d = DATA.model_outliers.slice(0, 12);
    const chart = shell(fig, {
      title: "The 12 seasons that beat their projection by the most",
      sub: "Projected home runs → actual. Ranked by z-score (how unlikely, given plate appearances).",
      legend: tierLegend("projected"),
      table: { cols: [{ label: "#", key: "rank", n: 1 }, { label: "Player", key: "name" }, { label: "Year", key: "year_id" }, { label: "Age", key: "age", n: 1 }, { label: "Team", key: "teams" },
        { label: "Projected", key: "expected_hr", n: 1 }, { label: "HR", key: "hr", n: 1 }, { label: "z", key: "z", n: 1 }, { label: "Tier", key: (r) => chip(r.ped_tier), raw: 1 }], rows: DATA.model_outliers.slice(0, 100) },
      note: "Table shows the top 100.",
    });
    tierDumbbell(chart, d, {
      lo: (r) => r.expected_hr, hi: (r) => r.hr, x: [0, 60], xTicks: [0, 10, 20, 30, 40, 50, 60],
      label: (r) => `${r.name} '${String(r.year_id).slice(2)}`,
      tipHtml: (r) => `<b>${esc(r.name)}, ${r.year_id}</b>` + row("Age", r.age) + row("Team", esc(r.teams)) + row("Projected HR", fmt(r.expected_hr, 1)) +
        row("Actual HR", r.hr) + row("z-score", fmt(r.z, 2)) + `<div style="margin-top:6px">${chip(r.ped_tier)}</div>`,
    });
  };

  charts.bloomers = (fig) => {
    const d = DATA.late_bloomers.slice(0, 12);
    const chart = shell(fig, {
      title: "Biggest power gains after 33",
      sub: "HR+ at ages 26–30 → ages 33–37",
      legend: tierLegend("26–30"),
      table: { cols: [{ label: "#", key: "rank", n: 1 }, { label: "Player", key: "name" }, { label: "Turned 33", key: "year_at_33" }, { label: "HR+ 26–30", key: "hr_plus_26_30", n: 1 }, { label: "HR+ 33–37", key: "hr_plus_33_37", n: 1 }, { label: "Change", key: "change", n: 1 }, { label: "Tier", key: (r) => chip(r.ped_tier), raw: 1 }], rows: DATA.late_bloomers },
    });
    tierDumbbell(chart, d, {
      lo: (r) => r.hr_plus_26_30, hi: (r) => r.hr_plus_33_37, x: [0, 350], xTicks: [0, 100, 200, 300],
      label: (r) => r.name,
      tipHtml: (r) => `<b>${esc(r.name)}</b>` + row("Turned 33", r.year_at_33) + row("HR+ 26–30", fmt(r.hr_plus_26_30)) + row("HR+ 33–37", fmt(r.hr_plus_33_37)) +
        row("HR, 26–30", r.hr_prime) + row("HR, 33–37", r.hr_late) + `<div style="margin-top:6px">${chip(r.ped_tier)}</div>`,
    });
  };

  charts["bloom-era"] = (fig) => {
    const d = DATA.late_bloomers_by_era;
    const chart = shell(fig, {
      title: "Share of hitters who gained power after 33",
      sub: "Grouped by the 5-year window they turned 33 in",
      table: { cols: [{ label: "Turned 33", key: (r) => `${r.turned_33_in}–${r.turned_33_in + 4}` }, { label: "Players", key: "players", n: 1 }, { label: "% gained", key: "pct_gained_power", n: 1 }, { label: "Late ÷ prime HR+ (median %)", key: "median_late_vs_prime_pct", n: 1 }], rows: d },
      note: "Highlighted: groups whose age 33–37 seasons fell mostly in 1993–2004.",
    });
    const F = frame(chart, { height: 300, m: { t: 22, r: 8, b: 30, l: 36 }, x: [0, d.length], y: [0, 60], yTicks: [0, 20, 40, 60], yFmt: (v) => v + "%" });
    const { svg, X, Y, m, H } = F;
    const bw = (X(1) - X(0)) - 2;
    d.forEach((r, i) => {
      const hot = r.turned_33_in >= 1990 && r.turned_33_in <= 2000;
      const x0 = X(i) + 1, y0 = Y(r.pct_gained_power), hgt = H - m.b - y0, rr = Math.min(4, bw / 2);
      s("path", { class: hot ? "f-deep" : "f-soft", d: `M${x0},${H - m.b}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x0 + bw - rr}Q${x0 + bw},${y0} ${x0 + bw},${y0 + rr}V${H - m.b}Z` }, svg);
      if (i % 2 === 0) s("text", { class: "tick", x: x0 + bw / 2, y: H - m.b + 18, "text-anchor": "middle" }, svg).textContent = "'" + String(r.turned_33_in).slice(2);
      if (r.turned_33_in === 1965 || r.turned_33_in === 1990) s("text", { class: "lbl", x: x0 + bw / 2, y: y0 - 6, "text-anchor": "middle" }, svg).textContent = Math.round(r.pct_gained_power) + "%";
      const hit = s("rect", { class: "hit", x: X(i), y: m.t, width: X(1) - X(0), height: H - m.b - m.t }, svg);
      hit.addEventListener("mousemove", (ev) => showTip(`<b>Turned 33 in ${r.turned_33_in}–${r.turned_33_in + 4}</b>` + row("Hitters", r.players) + row("Gained power", fmt(r.pct_gained_power, 1) + "%") + row("Late ÷ prime (median)", fmt(r.median_late_vs_prime_pct, 1) + "%"), ev.clientX, ev.clientY));
      hit.addEventListener("mouseleave", hideTip);
    });
  };

  charts.scatter = (fig) => {
    const d = DATA.big_seasons;
    const chart = shell(fig, {
      title: "Every 54+ home run season: raw total vs HR+",
      sub: "Further up = more dominant compared with that year's league",
      legend: tierLegend(),
      table: { cols: [{ label: "Player", key: "name" }, { label: "Year", key: "year_id" }, { label: "HR", key: "hr", n: 1 }, { label: "PA", key: "pa", n: 1 }, { label: "HR+", key: "hr_plus", n: 1 }, { label: "League HR/100 PA", key: "league_hr_per_100_pa", n: 1 }, { label: "Tier", key: (r) => chip(r.ped_tier), raw: 1 }], rows: d },
    });
    const narrow = chart.clientWidth < 560;
    const F = frame(chart, { height: narrow ? 360 : 440, m: { t: 16, r: narrow ? 20 : 120, b: 44, l: 48 }, x: [53, 74], y: [0, 1400],
      xTicks: narrow ? [55, 60, 65, 70] : [54, 56, 58, 60, 62, 64, 66, 68, 70, 72], yTicks: [0, 200, 400, 600, 800, 1000, 1200, 1400], yFmt: (v) => fmt(v) });
    const { svg, X, Y, m, H, W } = F;
    s("text", { class: "tick", x: (m.l + W - m.r) / 2, y: H - 6, "text-anchor": "middle" }, svg).textContent = "Home runs";
    s("line", { class: "cross", x1: m.l, x2: W - m.r, y1: Y(100), y2: Y(100), "stroke-dasharray": "2 3" }, svg);
    s("text", { class: "tick", x: W - m.r, y: Y(100) - 6, "text-anchor": "end" }, svg).textContent = "league average = 100";
    // jitter identical x slightly so ties at 54 stay visible
    const seen = {};
    const order = d.slice().sort((a, b) => (tierOf(a.ped_tier) === "none") - (tierOf(b.ped_tier) === "none")).reverse();
    order.forEach((r) => {
      const k = r.hr; const n = (seen[k] = (seen[k] || 0) + 1) - 1;
      const cx = X(r.hr) + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 5, cy = Y(r.hr_plus);
      const c = s("circle", { cx, cy, r: 6, class: `f-${tierOf(r.ped_tier)} ring` }, svg);
      const hit = s("circle", { cx, cy, r: 12, class: "hit" }, svg);
      hit.addEventListener("mousemove", (ev) => showTip(`<b>${esc(r.name)}, ${r.year_id}</b>` + row("HR", r.hr) + row("HR+", fmt(r.hr_plus)) + row("League HR/100 PA", fmt(r.league_hr_per_100_pa, 2)) + `<div style="margin-top:6px">${chip(r.ped_tier)}</div>`, ev.clientX, ev.clientY));
      hit.addEventListener("mouseleave", hideTip);
    });
    const labels = [["Barry Bonds", 2001, "Bonds '01", "end", -10, -8], ["Mark McGwire", 1998, "McGwire '98", "end", -10, -10], ["Babe Ruth", 1920, "Ruth '20", "start", 10, 4],
      ["Babe Ruth", 1927, "Ruth '27", "start", 10, 4], ["Roger Maris", 1961, "Maris '61", "start", 10, -6], ["Aaron Judge", 2022, "Judge '22", "start", 10, 14],
      ["Babe Ruth", 1921, "Ruth '21", "end", -10, 4], ["Jimmie Foxx", 1932, "Foxx '32", "start", 10, 4]];
    labels.forEach(([n, y, t, anchor, dx, dy]) => {
      if (narrow && !["Bonds '01", "Ruth '20", "Ruth '27", "Maris '61"].includes(t)) return;
      const r = d.find((q) => q.name === n && q.year_id === y); if (!r) return;
      s("text", { class: "lbl", x: X(r.hr) + dx, y: Y(r.hr_plus) + dy, "text-anchor": anchor }, svg).textContent = t;
    });
  };

  charts["null-hist"] = (fig) => {
    const d = DATA.unmasking_null, u = DATA.unmasking;
    const sur = u.find((r) => r.ranking === "surprise"), tal = u.find((r) => r.ranking === "talent");
    const chart = shell(fig, {
      title: "10,000 shuffles: documented players in a random top 50",
      sub: `Darker bars are shuffles that matched or beat the surprise list's ${sur.linked_in_top}. That share is the p-value.`,
      legend: [["f-deep", `≥ ${sur.linked_in_top} (p = ${fmt(sur.p_value, 2)})`, "background:var(--s1-deep)"], ["f-soft", `< ${sur.linked_in_top}`, "background:var(--s1-soft)"]],
      table: { cols: [{ label: "Documented in top 50", key: "hits", n: 1 }, { label: "Shuffles", key: "iterations", n: 1 }], rows: d },
      note: `Expected by chance: ${sur.expected_by_chance}. Talent list: ${tal.linked_in_top} (p = ${tal.p_value}).`,
    });
    const max = Math.max(...d.map((r) => r.iterations));
    const F = frame(chart, { height: 300, m: { t: 34, r: 16, b: 34, l: 48 }, x: [-0.5, 15.5], y: [0, 2200], xTicks: ticks(0, 15, 1).filter((v) => v % (chart.clientWidth < 480 ? 3 : 1) === 0), yTicks: [0, 500, 1000, 1500, 2000], yFmt: (v) => fmt(v) });
    const { svg, X, Y, m, H } = F;
    const bw = X(1) - X(0) - 2;
    d.forEach((r) => {
      const x0 = X(r.hits) - bw / 2, y0 = Y(r.iterations), rr = Math.min(4, (H - m.b - y0) / 2);
      s("path", { class: r.hits >= sur.linked_in_top ? "f-deep" : "f-soft", d: `M${x0},${H - m.b}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x0 + bw - rr}Q${x0 + bw},${y0} ${x0 + bw},${y0 + rr}V${H - m.b}Z` }, svg);
      const hit = s("rect", { class: "hit", x: X(r.hits - 0.5), y: m.t, width: X(1) - X(0), height: H - m.b - m.t }, svg);
      hit.addEventListener("mousemove", (ev) => showTip(`<b>${r.hits} documented in the top 50</b>` + row("Shuffles", fmt(r.iterations)) + row("Share", fmt((100 * r.iterations) / 10000, 1) + "%"), ev.clientX, ev.clientY));
      hit.addEventListener("mouseleave", hideTip);
    });
    const mark = (v, txt) => {
      s("line", { class: "marker", x1: X(v), x2: X(v), y1: m.t - 6, y2: H - m.b }, svg);
      s("text", { class: "lbl-strong", x: X(v), y: m.t - 12, "text-anchor": "middle" }, svg).textContent = txt;
    };
    mark(sur.linked_in_top, `Surprise list: ${sur.linked_in_top}`);
    mark(tal.linked_in_top, `Talent: ${tal.linked_in_top}`);
    s("text", { class: "tick", x: (m.l + F.W - m.r) / 2, y: H - 2, "text-anchor": "middle" }, svg).textContent = "Documented players in the top 50";
  };

  charts.canseco = (fig) => {
    const d = DATA.canseco_degrees;
    const chart = shell(fig, {
      title: "Distance from Canseco in the teammate graph, 1990s regulars",
      sub: "Share of each group at 1 hop (direct teammate), 2 hops, or 3+",
      legend: [["f-deep", "Direct teammate", "background:var(--s1-deep)"], ["f1", "2 hops", "background:var(--s1)"], ["f-soft", "3+ hops", "background:var(--s1-soft)"]],
      table: { cols: [{ label: "Group", key: "grp" }, { label: "Players", key: "players", n: 1 }, { label: "Direct %", key: "pct_direct_teammates", n: 1 }, { label: "2 hops %", key: "pct_two_hops", n: 1 }, { label: "3+ %", key: "pct_three_plus", n: 1 }, { label: "Avg hops", key: "avg_hops", n: 1 }], rows: d },
    });
    const narrow = chart.clientWidth < 560;
    const m = { t: 8, r: 16, b: 30, l: narrow ? 16 : 170 }, rowH = narrow ? 64 : 52, H = m.t + m.b + rowH * d.length;
    const F = frame(chart, { height: H, m, x: [0, 100], y: [0, 1], xTicks: [0, 25, 50, 75, 100], xFmt: (v) => v + "%" });
    const { svg, X } = F;
    d.forEach((r, i) => {
      const cy = m.t + rowH * i + (narrow ? 40 : rowH / 2);
      const lbl = `${r.grp === "documented" ? "Documented" : "Not documented"} (${r.players})`;
      s("text", { class: "lbl-strong", x: narrow ? m.l : m.l - 12, y: narrow ? cy - 18 : cy + 4, "text-anchor": narrow ? "start" : "end" }, svg).textContent = lbl;
      let acc = 0;
      [["pct_direct_teammates", "f-deep", "Direct"], ["pct_two_hops", "f1", "2 hops"], ["pct_three_plus", "f-soft", "3+ hops"]].forEach(([k, c, nm]) => {
        const v = r[k]; if (!v) { return; }
        const x0 = X(acc) + (acc ? 1 : 0), x1 = X(acc + v) - 1;
        s("rect", { class: c, x: x0, y: cy - 12, width: Math.max(1, x1 - x0), height: 24, rx: 3 }, svg);
        if (v > 12) s("text", { class: "lbl-strong", x: x0 + 8, y: cy + 4, fill: "#fff", style: "fill:#fff" }, svg).textContent = fmt(v, 1) + "%";
        acc += v;
      });
      const hit = s("rect", { class: "hit", x: 0, y: cy - rowH / 2, width: F.W, height: rowH }, svg);
      hit.addEventListener("mousemove", (ev) => showTip(`<b>${lbl}</b>` + row("Direct teammate", fmt(r.pct_direct_teammates, 1) + "%") + row("2 hops", fmt(r.pct_two_hops, 1) + "%") + row("3+ hops", fmt(r.pct_three_plus, 1) + "%") + row("Average hops", fmt(r.avg_hops, 2)), ev.clientX, ev.clientY));
      hit.addEventListener("mouseleave", hideTip);
    });
  };

  // ---------- Case 09: testing timeline ----------
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function eventDate(e) {
    const [y, mo, dd] = e.event_date.split("-").map(Number);
    if (e.date_precision === "day") return `${MON[mo - 1]} ${dd}, ${y}`;
    if (e.date_precision === "month") return `${MON[mo - 1]} ${y}`;
    if (e.date_precision === "season") return mo <= 3 ? `Spring ${y}` : `${y} season`;
    return String(y);
  }
  const eventGroups = () => {
    const g = new Map();
    DATA.policy_timeline.forEach((e) => { if (!g.has(e.year_id)) g.set(e.year_id, []); g.get(e.year_id).push(e); });
    return [...g.entries()].map(([year, evs], i) => ({ year, evs, n: i + 1 }));
  };

  charts["juice-timeline"] = (fig) => {
    const d = DATA.juice_index, groups = eventGroups();
    const chart = shell(fig, {
      title: "The juice index: share of all home runs hit by later-linked players, 1985–2025",
      sub: "Numbered markers are drug-policy milestones. Hover one, or find it in the list below.",
      legend: [["line", "Juice index", "background:var(--s2)"], ["", "Policy milestone", "background:var(--surface);border:2px solid var(--text-2);border-radius:50%"]],
      table: { cols: [{ label: "Year", key: "year_id" }, { label: "Juice index %", key: "juice_share", n: 1 }, { label: "Linked HR", key: "linked_hr", n: 1 }, { label: "League HR", key: "league_hr", n: 1 }, { label: "HR / 100 PA", key: "hr_per_100_pa", n: 1 }], rows: d.slice().reverse() },
      note: "Linked = confirmed or named in the PED table. Stimulant-only cases left out.",
    });
    const narrow = chart.clientWidth < 560;
    const F = frame(chart, { height: narrow ? 300 : 340, m: { t: 44, r: 16, b: 30, l: 40 }, x: [1984.5, 2025.5], y: [0, 18],
      xTicks: narrow ? [1990, 2005, 2020] : [1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025], yTicks: [0, 5, 10, 15], yFmt: (v) => v + "%" });
    const { svg, X, Y, m, H } = F;
    groups.forEach((g) => s("line", { class: "cross", x1: X(g.year), x2: X(g.year), y1: 26, y2: H - m.b, "stroke-dasharray": "2 3" }, svg));
    s("path", { class: "ln c2", d: pathOf(d.map((r) => [X(r.year_id), Y(r.juice_share)])) }, svg);
    const peak = d.reduce((a, b) => (b.juice_share > a.juice_share ? b : a));
    s("circle", { cx: X(peak.year_id), cy: Y(peak.juice_share), r: 4.5, class: "f2 ring" }, svg);
    s("text", { class: "lbl", x: X(peak.year_id) + 8, y: Y(peak.juice_share) - 8 }, svg).textContent = `${peak.year_id}: ${fmt(peak.juice_share, 1)}%`;
    const by = new Map(d.map((r) => [r.year_id, r]));
    crosshair(F, d.map((r) => r.year_id), [
      { label: "Juice index", color: "var(--s2)", get: (x) => by.get(x)?.juice_share, fmt: (v) => fmt(v, 1) + "%" },
      { label: "HR / 100 PA", color: "var(--text-3)", get: () => null, fmt: (v) => v },
    ], (x) => `${x} · ${fmt(by.get(x)?.hr_per_100_pa, 2)} HR per 100 PA`);
    groups.forEach((g) => {
      const cx = X(g.year);
      s("circle", { cx, cy: 18, r: narrow ? 7 : 9, class: "hollow" }, svg);
      s("text", { class: "tick", x: cx, y: 22, "text-anchor": "middle", style: `font-size:${narrow ? 9 : 11}px;font-weight:600;fill:var(--text)` }, svg).textContent = g.n;
      const hit = s("circle", { cx, cy: 18, r: 13, class: "hit" }, svg);
      hit.style.cursor = "pointer";
      hit.addEventListener("mousemove", (ev) => showTip(`<b>${g.year}</b>` + g.evs.map((e) => `<div style="margin-top:4px">${esc(eventDate(e))}: ${esc(e.event)}</div>`).join(""), ev.clientX, ev.clientY));
      hit.addEventListener("mouseleave", hideTip);
      hit.addEventListener("click", () => document.getElementById(`ev-${g.n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    });
  };

  function timeline() {
    const el = $("#timeline"); if (!el) return;
    el.innerHTML = eventGroups().map((g) => g.evs.map((e, i) => {
      const host = e.source.replace("https://en.wikipedia.org/wiki/", "").replace(/_/g, " ");
      const moved = e.hr100_before != null && e.hr100_after != null
        ? `<span class="tl-stat">League HR per 100 PA: ${fmt(e.hr100_before, 2)} → ${fmt(e.hr100_after, 2)} · juice ${fmt(e.juice_before, 1)}% → ${fmt(e.juice_after, 1)}%</span>` : "";
      return `<li ${i === 0 ? `id="ev-${g.n}"` : ""}><span class="tl-n">${i === 0 ? g.n : ""}</span><div>
        <div class="tl-date">${esc(eventDate(e))} · ${esc(e.kind)}</div>
        <div class="tl-event">${esc(e.event)}</div>
        <div class="tl-quote">"${esc(e.quote)}" · <a href="${esc(e.source)}" target="_blank" rel="noopener">${esc(host)}</a></div>
        ${e.note ? `<div class="tl-note">${esc(e.note)}</div>` : ""}${moved}</div></li>`;
    }).join("")).join("");
  }

  // ---------- Case 10: got milk ----------
  const FOODS = ["milk", "beef", "chicken", "pork", "lamb", "eggs", "fish"];
  const milk = { entity: "United States", food: "milk" };
  const regionName = (e) => (e === "United States" ? "US" : "World");
  function rerenderMilk() { ["got-milk", "food-corr"].forEach(render); }
  function controls(fig, withFood) {
    const c = h("div", { class: "seg-row" });
    const seg = (items, cur, set) => {
      const g = h("div", { class: "seg", role: "group" });
      items.forEach(([v, label]) => {
        const b = h("button", { type: "button", "aria-pressed": String(v === cur) }, label);
        b.onclick = () => { set(v); rerenderMilk(); };
        g.appendChild(b);
      });
      return g;
    };
    c.appendChild(seg([["United States", "US"], ["World", "World"]], milk.entity, (v) => (milk.entity = v)));
    if (withFood) c.appendChild(seg(FOODS.map((f) => [f, f[0].toUpperCase() + f.slice(1)]), milk.food, (v) => (milk.food = v)));
    fig.insertBefore(c, fig.querySelector(".chart"));
  }

  charts["got-milk"] = (fig) => {
    const juice = DATA.juice_index.filter((r) => r.year_id <= 2023);
    const food = DATA.food_juice.filter((r) => r.entity === milk.entity && r.food === milk.food);
    const corr = DATA.food_correlation.find((r) => r.entity === milk.entity && r.food === milk.food);
    const fname = milk.food === "chicken" ? "chicken" : milk.food;
    const chart = shell(fig, {
      title: `How juiced baseball was vs ${regionName(milk.entity)} ${fname} per person`,
      sub: `Two panels, two scales, one timeline. r = ${fmt(corr.r_levels, 2)} raw, ${fmt(corr.r_levels_pre2010, 2)} before FAO's 2010 method change, ${fmt(corr.r_changes, 2)} on year-over-year changes.`,
      legend: [["line", "Juice index (% of HR)", "background:var(--s2)"], ["line", `${regionName(milk.entity)} ${fname}, kg per person`, "background:var(--s1)"]],
      table: { cols: [{ label: "Year", key: "year_id" }, { label: "Juice index %", key: "juice_share", n: 1 }, { label: `${fname} kg / person`, key: "kg", n: 1 }], rows: food.slice().reverse() },
      note: "1985–2023: from the first season with linked players to the last FAO year.",
    });
    controls(fig, true);
    const narrow = chart.clientWidth < 560;
    const W = Math.max(300, chart.clientWidth), m = { t: 22, r: 16, b: 30, l: 46 }, ph = narrow ? 130 : 150, gap = 44;
    const H = m.t + ph + gap + ph + m.b;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, chart);
    const X = lin(1984.5, 2023.5, m.l, W - m.r);
    const kgs = food.map((r) => r.kg), lo = Math.min(...kgs), hi = Math.max(...kgs), pad = (hi - lo) * 0.15 || 1;
    const step = niceStep((hi - lo + 2 * pad) / 3);
    const y0 = Math.floor((lo - pad) / step) * step, y1 = Math.ceil((hi + pad) / step) * step;
    const panels = [
      { top: m.t, Y: lin(0, 18, m.t + ph, m.t), ticks: [0, 6, 12, 18], fmtv: (v) => v + "%", title: "Juice index" },
      { top: m.t + ph + gap, Y: lin(y0, y1, m.t + ph + gap + ph, m.t + ph + gap), ticks: ticks(y0, y1, step), fmtv: (v) => fmt(v, step < 1 ? 1 : 0), title: `${regionName(milk.entity)} ${fname} (kg per person)` },
    ];
    panels.forEach((p) => {
      p.ticks.forEach((v) => {
        s("line", { class: "gridline", x1: m.l, x2: W - m.r, y1: p.Y(v), y2: p.Y(v) }, svg);
        s("text", { class: "tick", x: m.l - 8, y: p.Y(v) + 4, "text-anchor": "end" }, svg).textContent = p.fmtv(v);
      });
      s("text", { class: "lbl-strong", x: m.l, y: p.top - 8 }, svg).textContent = p.title;
    });
    s("line", { class: "axisline", x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }, svg);
    (narrow ? [1990, 2005, 2020] : [1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020]).forEach((v) =>
      s("text", { class: "tick", x: X(v), y: H - m.b + 18, "text-anchor": "middle" }, svg).textContent = v);
    s("path", { class: "ln c2", d: pathOf(juice.map((r) => [X(r.year_id), panels[0].Y(r.juice_share)])) }, svg);
    // FAO's method change: the old and new food-balance series meet at 2010
    s("line", { class: "cross", x1: X(2009.5), x2: X(2009.5), y1: panels[1].top, y2: H - m.b, "stroke-dasharray": "2 3" }, svg);
    s("text", { class: "tick", x: X(2009.5) + 6, y: panels[1].top + 12 }, svg).textContent = "FAO changes its method";
    s("path", { class: "ln c1", d: pathOf(food.map((r) => [X(r.year_id), panels[1].Y(r.kg)])) }, svg);
    // shared crosshair across both panels
    const jb = new Map(juice.map((r) => [r.year_id, r])), fb = new Map(food.map((r) => [r.year_id, r]));
    const line = s("line", { class: "cross", y1: m.t, y2: H - m.b, visibility: "hidden" }, svg);
    const d1 = s("circle", { r: 4.5, class: "ring", style: "fill:var(--s2)", visibility: "hidden" }, svg);
    const d2 = s("circle", { r: 4.5, class: "ring", style: "fill:var(--s1)", visibility: "hidden" }, svg);
    const hit = s("rect", { class: "hit", x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }, svg);
    const move = (ev) => {
      const pt = ev.touches ? ev.touches[0] : ev, r = svg.getBoundingClientRect();
      const yr = Math.max(1985, Math.min(2023, Math.round(X.inv(((pt.clientX - r.left) / r.width) * W))));
      const a = jb.get(yr), b = fb.get(yr); if (!a || !b) return;
      [line].forEach((n) => { n.setAttribute("x1", X(yr)); n.setAttribute("x2", X(yr)); n.setAttribute("visibility", "visible"); });
      d1.setAttribute("cx", X(yr)); d1.setAttribute("cy", panels[0].Y(a.juice_share)); d1.setAttribute("visibility", "visible");
      d2.setAttribute("cx", X(yr)); d2.setAttribute("cy", panels[1].Y(b.kg)); d2.setAttribute("visibility", "visible");
      showTip(`<b>${yr}</b>` + row("Juice index", fmt(a.juice_share, 1) + "%", "var(--s2)") + row(`${fname} kg`, fmt(b.kg, 1), "var(--s1)"), pt.clientX, pt.clientY);
    };
    const leave = () => { [line, d1, d2].forEach((n) => n.setAttribute("visibility", "hidden")); hideTip(); };
    hit.addEventListener("mousemove", move); hit.addEventListener("touchmove", move, { passive: true });
    hit.addEventListener("mouseleave", leave); hit.addEventListener("touchend", leave);
  };
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }

  charts["food-corr"] = (fig) => {
    const d = DATA.food_correlation.filter((r) => r.entity === milk.entity).sort((a, b) => Math.abs(b.r_levels) - Math.abs(a.r_levels));
    const chart = shell(fig, {
      title: `Every food vs the juice index · ${regionName(milk.entity)}`,
      sub: "Filled: raw correlation. Hollow: after removing the trend. Watch them slide to zero.",
      legend: [["", "raw (levels)", "background:var(--s1);border-radius:50%"], ["", "year-over-year changes", "background:var(--surface);border:2px solid var(--text-3);border-radius:50%"]],
      table: { cols: [{ label: "Region", key: "entity" }, { label: "Food", key: "food" }, { label: "r (raw)", key: "r_levels", n: 1 }, { label: "r (changes)", key: "r_changes", n: 1 }, { label: "r (1985–2009)", key: "r_levels_pre2010", n: 1 }, { label: "R²", key: "r2_levels", n: 1 }, { label: "kg per juice point", key: "kg_per_juice_point", n: 1 }], rows: DATA.food_correlation },
    });
    controls(fig, false);
    const m = { t: 8, r: 20, b: 30, l: 74 }, rowH = 32, H = m.t + m.b + rowH * d.length;
    const F = frame(chart, { height: H, m, x: [-1, 1], y: [0, 1], xTicks: [-1, -0.5, 0, 0.5, 1], xFmt: (v) => (v > 0 ? "+" : "") + v });
    const { svg, X, W } = F;
    [-1, -0.5, 0.5, 1].forEach((v) => s("line", { class: "gridline", x1: X(v), x2: X(v), y1: m.t, y2: H - m.b }, svg));
    s("line", { class: "axisline", x1: X(0), x2: X(0), y1: m.t, y2: H - m.b }, svg);
    d.forEach((r, i) => {
      const cy = m.t + rowH * i + rowH / 2;
      s("text", { class: "lbl-strong", x: m.l - 12, y: cy + 4, "text-anchor": "end" }, svg).textContent = r.food[0].toUpperCase() + r.food.slice(1);
      s("line", { class: "connector", x1: X(r.r_levels), x2: X(r.r_changes), y1: cy, y2: cy }, svg);
      s("circle", { cx: X(r.r_changes), cy, r: 5, class: "hollow" }, svg);
      s("circle", { cx: X(r.r_levels), cy, r: 6, class: "f1 ring" }, svg);
      const hit = s("rect", { class: "hit", x: 0, y: cy - rowH / 2, width: W, height: rowH }, svg);
      hit.addEventListener("mousemove", (ev) => showTip(`<b>${esc(r.food)} · ${regionName(r.entity)}</b>` + row("r, raw", fmt(r.r_levels, 3), "var(--s1)") + row("r, changes", fmt(r.r_changes, 3)) + row("r, 1985–2009", fmt(r.r_levels_pre2010, 3)) + row("kg per juice point", fmt(r.kg_per_juice_point, 2)) + row("Range", `${r.kg_min}–${r.kg_max} kg`), ev.clientX, ev.clientY));
      hit.addEventListener("mouseleave", hideTip);
    });
  };

  charts["milk-lag"] = (fig) => {
    const d = DATA.milk_lag;
    const chart = shell(fig, {
      title: "Did the milk cause the juice?",
      sub: "US milk slid earlier (−) or later (+) against the juice index, then re-correlated",
      table: { cols: [{ label: "Milk shifted (years)", key: "lag_years", n: 1 }, { label: "r", key: "r", n: 1 }, { label: "Seasons", key: "seasons", n: 1 }], rows: d },
      note: "A real cause peaks at one sensible lag. This just keeps climbing toward the edge.",
    });
    const F = frame(chart, { height: 300, m: { t: 22, r: 8, b: 34, l: 36 }, x: [-5.5, 5.5], y: [0, 0.8], yTicks: [0, 0.2, 0.4, 0.6, 0.8], xTicks: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5], xFmt: (v) => (v > 0 ? "+" : "") + v });
    const { svg, X, Y, m, H } = F;
    const bw = X(1) - X(0) - 4;
    d.forEach((r) => {
      const x0 = X(r.lag_years) - bw / 2, y0 = Y(r.r), rr = Math.min(4, bw / 2);
      s("path", { class: r.lag_years === -5 ? "f-deep" : "f-soft", d: `M${x0},${H - m.b}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x0 + bw - rr}Q${x0 + bw},${y0} ${x0 + bw},${y0 + rr}V${H - m.b}Z` }, svg);
      const hit = s("rect", { class: "hit", x: X(r.lag_years - 0.5), y: m.t, width: X(1) - X(0), height: H - m.b - m.t }, svg);
      hit.addEventListener("mousemove", (ev) => showTip(`<b>Milk ${r.lag_years === 0 ? "same year" : Math.abs(r.lag_years) + " yr " + (r.lag_years < 0 ? "earlier" : "later")}</b>` + row("r", fmt(r.r, 3)) + row("Seasons", r.seasons), ev.clientX, ev.clientY));
      hit.addEventListener("mouseleave", hideTip);
    });
    const top = d.find((r) => r.lag_years === -5);
    s("text", { class: "lbl", x: X(-5) - bw / 2, y: Y(top.r) - 8 }, svg).textContent = `5 yrs earlier: ${fmt(top.r, 2)}`;
    s("text", { class: "tick", x: (m.l + F.W - m.r) / 2, y: H - 2, "text-anchor": "middle" }, svg).textContent = "Years milk is shifted";
  };

  // ---------- unmasking board ----------
  function board() {
    const d = DATA.unmasking_top, b = $("#board");
    b.innerHTML = d.map((r) => `<div class="card ${tierOf(r.ped_tier)}">
      <div class="rk">#${r.rank} · z ${fmt(r.max_z, 2)}</div>
      <div class="nm" data-name="${esc(r.name)}"><span class="mask"></span></div>
      <div class="meta">peak HR+ ${fmt(r.max_hr_plus)}</div>
      <div class="tierslot"></div></div>`).join("");
    const btn = $("#unmask-btn"), count = $("#unmask-count");
    const linked = d.filter((r) => tierOf(r.ped_tier) !== "none").length;
    btn.onclick = () => {
      if (b.classList.contains("revealed")) return;
      b.classList.add("revealed");
      btn.disabled = true; btn.textContent = "Unmasked";
      const cards = [...b.children];
      const reveal = (i) => {
        const r = d[i], card = cards[i];
        card.classList.add("shown");
        card.querySelector(".nm").textContent = r.name;
        if (tierOf(r.ped_tier) !== "none") card.querySelector(".tierslot").innerHTML = chip(r.ped_tier);
      };
      const anim = window.JUICED_anim;
      const finished = anim
        ? anim.unmask(cards, reveal)
        : new Promise((res) => { cards.forEach((_, i) => setTimeout(() => reveal(i), i * 18)); setTimeout(res, d.length * 18 + 200); });
      finished.then(() => {
        count.textContent = `${linked} of 50 documented`;
        $("#reveal").classList.add("on");
        const u = DATA.unmasking, sur = u.find((r) => r.ranking === "surprise"), tal = u.find((r) => r.ranking === "talent");
        $("#verdict").innerHTML = `
          <div class="v-card"><div class="kicker">Ranked by surprise</div><div class="big">${sur.linked_in_top} <small>of 50 vs ${sur.expected_by_chance} by chance</small></div>
            <div class="fig-sub">Lift ${sur.lift}× · p = ${fmt(sur.p_value, 2)} · not significant</div></div>
          <div class="v-card"><div class="kicker">Ranked by peak power</div><div class="big">${tal.linked_in_top} <small>of 50 vs ${tal.expected_by_chance} by chance</small></div>
            <div class="fig-sub">Lift ${tal.lift}× · p = ${tal.p_value} · significant</div></div>`;
        render("null-hist");
        if (anim) {
          document.querySelectorAll("#verdict .big").forEach((el, i) => {
            const n = el.firstChild; const span = document.createElement("span");
            span.dataset.to = n.textContent.trim(); span.textContent = n.textContent.trim();
            el.replaceChild(span, n); el.insertBefore(document.createTextNode(" "), span.nextSibling);
            anim.count(span, i * 0.15);
          });
          anim.refresh();
        }
      });
    };
  }

  function mates() {
    $("#mates").innerHTML = DATA.canseco_teammates_documented.map((r) =>
      `<div class="mate"><b>${esc(r.name)}</b>${chip(r.tier)}<br><span>${esc(r.shared_rosters)}</span></div>`).join("");
  }

  // ---------- boot ----------
  function render(name) {
    document.querySelectorAll(`[data-chart="${name}"]`).forEach((fig) => {
      if (!fig.offsetParent && name !== "null-hist") return;
      if (!fig.offsetParent) return;
      try { charts[name](fig); document.dispatchEvent(new CustomEvent("juiced:chart", { detail: fig })); } catch (e) { console.error(name, e); fig.innerHTML = `<p class="status err">Chart failed: ${esc(e.message)}</p>`; }
    });
  }
  const renderAll = () => Object.keys(charts).forEach(render);
  Promise.all(FILES.map((f) => fetch(`data/${f}.json`).then((r) => r.json()).then((j) => (DATA[f] = j))))
    .then(() => { renderAll(); board(); mates(); timeline(); })
    .catch((e) => { console.error(e); document.querySelectorAll("[data-chart]").forEach((f) => (f.innerHTML = `<p class="status err">Couldn't load data. Serve the site over http (python3 -m http.server).</p>`)); });

  let lastW = innerWidth, rt;
  addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(renderAll, 150); });
})();
