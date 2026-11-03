// JUICED · live SQL console. DuckDB-WASM, loaded only when the reader asks for it.
const DUCKDB = "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm";
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const CASES = [
  ["10_home_run_explosion", "01 · The home run explosion"],
  ["11_ball_or_juice", "02 · Ball or juice"],
  ["12_aging_curves", "03 · Aging curves"],
  ["13_who_broke_the_model", "04 · Who broke the model"],
  ["14_the_unmasking", "05 · The unmasking (slow: 10,000 shuffles)"],
  ["15_era_adjusted", "06 · The 73 question"],
  ["16_late_bloomers", "07 · Late bloomers"],
  ["17_six_degrees_of_canseco", "08 · Six degrees of Canseco"],
  ["18_testing_timeline", "09 · The testing timeline"],
  ["19_got_milk", "10 · Got milk? (bonus)"],
];
const PRESETS = [
  ["Most dominant seasons", `-- HR+ = player HR rate ÷ league HR rate × 100
SELECT n.name, r.year_id, r.hr, r.pa, ROUND(r.hr_plus) AS hr_plus
FROM core.player_season_rel r
JOIN core.player_name n USING (player_id)
WHERE r.pa >= 400
ORDER BY r.hr_plus DESC
LIMIT 25;`],
  ["League HR rate by year", `SELECT year_id,
       ROUND(100 * hr_per_pa, 2) AS hr_per_100_pa,
       ROUND(100 * so_per_pa, 1) AS k_pct
FROM core.league_season
ORDER BY year_id DESC;`],
  ["The PED list", `SELECT n.name, p.tier, p.event_types, p.first_event
FROM core.ped_player p
JOIN core.player_name n USING (player_id)
ORDER BY p.tier, n.name;`],
  ["One player's career", `-- Change the name and run it again
SELECT r.year_id, r.age, r.teams, r.pa, r.hr, ROUND(r.hr_plus) AS hr_plus
FROM core.player_season_rel r
JOIN core.player_name n USING (player_id)
WHERE n.name = 'Brady Anderson'
ORDER BY r.year_id;`],
  ["Got milk?", `-- How "juiced" was each season, next to how much milk Americans drank
SELECT j.year_id, j.juice_share, ROUND(f.kg_per_capita, 1) AS us_milk_kg
FROM out.juice_index j
JOIN raw.food_supply f
  ON f.year = j.year_id AND f.entity = 'United States' AND f.food = 'milk'
ORDER BY j.year_id;`],
  ["What tables are there?", `SELECT table_schema, table_name, table_type
FROM information_schema.tables
ORDER BY 1, 2;`],
];

const TABLES = ["people", "batting", "teams", "ped_events", "policy_events", "food_supply"];
let db, conn, duckdb, booted = false, booting = null;

function split(sql) {
  // same rule as scripts/build.py: a statement ends at a line ending in ';'
  const out = []; let buf = [];
  for (const line of sql.split("\n")) {
    buf.push(line);
    if (line.trimEnd().endsWith(";")) { push(); }
  }
  push();
  return out;
  function push() {
    const st = buf.join("\n").trim(); buf = [];
    if (st && st.split("\n").some((l) => l.trim() && !l.trim().startsWith("--"))) out.push(st);
  }
}

const status = (el, msg, err) => { el.textContent = msg; el.classList.toggle("err", !!err); };

async function boot() {
  if (booted) return;
  if (booting) return booting;
  const st = $("#db-status"), btn = $("#boot-btn");
  booting = (async () => {
    btn.disabled = true; btn.textContent = "Loading the engine…";
    duckdb = await import(DUCKDB);
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    // cross-origin workers need a same-origin Blob that importScripts the real one
    const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    conn = await db.connect();
    btn.textContent = "Loading baseball data…";
    for (const t of TABLES) {
      await db.registerFileURL(`${t}.parquet`, new URL(`data/${t}.parquet`, location.href).href, duckdb.DuckDBDataProtocol.HTTP, false);
    }
    await conn.query("CREATE SCHEMA IF NOT EXISTS raw; CREATE SCHEMA IF NOT EXISTS out;");
    for (const t of TABLES) {
      await conn.query(`CREATE OR REPLACE TABLE raw.${t} AS SELECT * FROM read_parquet('${t}.parquet')`);
    }
    btn.textContent = "Building the model…";
    const model = await fetch("sql/02_model.sql").then((r) => r.text());
    for (const stmt of split(model)) {
      try { await conn.query(stmt); }
      catch (e) { if (!/^ALTER TABLE/i.test(stmt.replace(/^(--.*\n)*/, ""))) throw e; } // keys are optional here
    }
    booted = true;
    $("#boot-card").hidden = true;
    $("#console-ui").hidden = false;
    const n = await conn.query("SELECT COUNT(*) AS n FROM core.player_season");
    status(st, `Ready · DuckDB ${await db.getVersion()} · ${Number(n.toArray()[0].n).toLocaleString()} player-seasons`);
  })().catch((e) => {
    console.error(e);
    booting = null;
    btn.disabled = false; btn.textContent = "Try again";
    const p = $("#boot-card p");
    p.textContent = `Couldn't start the database: ${e.message}`;
    p.classList.add("status", "err");
  });
  return booting;
}

function cell(v, type) {
  if (v == null) return `<td class="n" style="color:var(--text-3)">NULL</td>`;
  if (typeof v === "bigint") return `<td class="n">${v.toLocaleString()}</td>`;
  if (typeof v === "number") {
    if (/Date/.test(type)) return `<td>${new Date(v).toISOString().slice(0, 10)}</td>`;
    const s = Number.isInteger(v) ? v : +v.toFixed(4);
    return `<td class="n">${s}</td>`;
  }
  if (v instanceof Date) return `<td>${v.toISOString().slice(0, 10)}</td>`;
  if (typeof v === "boolean") return `<td>${v}</td>`;
  if (typeof v === "object" && !Array.isArray(v)) {
    // Arrow HUGEINT / DECIMAL come back as objects with a useful toString
    const s = String(v).replace(/^"+|"+$/g, "");
    if (s !== "[object Object]") return /^-?\d+(\.\d+)?$/.test(s) ? `<td class="n">${Number(s).toLocaleString()}</td>` : `<td>${esc(s)}</td>`;
  }
  if (typeof v === "object") return `<td>${esc(JSON.stringify(v, (k, x) => (typeof x === "bigint" ? Number(x) : x)))}</td>`;
  return `<td>${esc(v)}</td>`;
}

function show(result, ms, note) {
  const out = $("#results");
  const fields = result.schema.fields;
  const rows = result.toArray();
  const LIMIT = 500;
  const head = `<tr>${fields.map((f) => `<th>${esc(f.name)}</th>`).join("")}</tr>`;
  const body = rows.slice(0, LIMIT).map((r) => {
    const o = r.toJSON();
    return `<tr>${fields.map((f) => cell(o[f.name], String(f.type))).join("")}</tr>`;
  }).join("");
  status($("#run-status"), `${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"} · ${ms} ms${rows.length > LIMIT ? ` · showing first ${LIMIT}` : ""}${note ? " · " + note : ""}`);
  out.innerHTML = fields.length ? `<div class="tbl-wrap" style="max-height:480px"><table class="data"><thead>${head}</thead><tbody>${body}</tbody></table></div>` : "";
}

// Some cases build on tables another case creates (case 05 uses case 04's projections).
// If the SQL reads one of those and it isn't there yet, run the case that makes it first.
const MADE_BY = {
  season_projection: "13_who_broke_the_model", season_surprise: "13_who_broke_the_model",
  unmask_population: "14_the_unmasking", unmask_null: "14_the_unmasking",
  teammate_edge: "17_six_degrees_of_canseco", canseco_number: "17_six_degrees_of_canseco",
  juice_index: "18_testing_timeline", policy_timeline: "18_testing_timeline",
};
async function ensureDeps(sql, rs, seen = new Set()) {
  const own = new Set([...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:core|out)\.([a-z_]+)/gi)].map((m) => m[1]));
  const used = new Set([...sql.matchAll(/(?:core|out)\.([a-z_]+)/gi)].map((m) => m[1]).filter((t) => MADE_BY[t] && !own.has(t)));
  if (!used.size) return;
  const have = new Set((await conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema IN ('core', 'out')")).toArray().map((r) => r.table_name));
  for (const t of used) {
    const file = MADE_BY[t];
    if (have.has(t) || seen.has(file)) continue;
    seen.add(file);
    status(rs, `First building ${t} from ${file}.sql…`);
    const dep = await window.JUICED_getSQL(file);
    await ensureDeps(dep, rs, seen);
    for (const st of split(dep)) await conn.query(st);
    (await conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema IN ('core', 'out')")).toArray().forEach((r) => have.add(r.table_name));
  }
  status(rs, "Running…");
}

async function run() {
  if (!booted) await boot();
  const rs = $("#run-status"), btn = $("#run-btn");
  const sql = $("#editor").value;
  const stmts = split(sql);
  if (!stmts.length) return;
  btn.disabled = true;
  status(rs, stmts.length > 1 ? `Running ${stmts.length} statements…` : "Running…");
  const t0 = performance.now();
  try {
    await ensureDeps(sql, rs);
    let last = null;
    for (const st of stmts) last = await conn.query(st);
    const ms = Math.round(performance.now() - t0);
    const created = [...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:VIEW|TABLE)\s+(out\.[a-z0-9_]+)/gi)].map((m) => m[1]);
    const lastIsSelect = /^\s*(--.*\n\s*)*(select|with|from|values|describe|show|summarize|pragma|table)\b/i.test(stmts.at(-1));
    if (!lastIsSelect && created.length) {
      // a case file only creates views; show the first one so there's something to look at
      const first = created[0];
      const r = await conn.query(`SELECT * FROM ${first}`);
      show(r, ms, `created ${created.join(", ")}. Showing ${first}`);
    } else {
      show(last, ms);
    }
  } catch (e) {
    status(rs, e.message.split("\n")[0], true);
    $("#results").innerHTML = `<pre class="code" style="color:var(--t-confirmed)">${esc(e.message)}</pre>`;
  } finally { btn.disabled = false; }
}

async function loadCase(name) {
  const sql = await window.JUICED_getSQL(name);
  $("#editor").value = sql;
  $("#case-select").value = name;
}

// ---- wire up ----
$("#boot-btn").addEventListener("click", async () => {
  await boot();
  if (booted && !$("#editor").value) { $("#editor").value = PRESETS[0][1]; run(); }
});
$("#presets").innerHTML = PRESETS.map((p, i) => `<button type="button" data-i="${i}">${esc(p[0])}</button>`).join("");
$("#presets").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  $("#editor").value = PRESETS[+b.dataset.i][1];
  $("#case-select").value = "";
  run();
});
$("#case-select").innerHTML += CASES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
$("#case-select").addEventListener("change", (e) => { if (e.target.value) loadCase(e.target.value).then(run); });
$("#run-btn").addEventListener("click", run);
$("#editor").addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); }
  if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    const t = e.target, a = t.selectionStart;
    t.setRangeText("    ", a, t.selectionEnd, "end");
  }
});

window.JUICED_openInConsole = async (name) => {
  if (window.JUICED_lenis) window.JUICED_lenis.scrollTo("#console", { offset: -60 });
  else $("#console").scrollIntoView({ behavior: "smooth" });
  await boot();
  if (!booted) return;
  await loadCase(name);
  status($("#run-status"), "Loaded. Press Run.");
};
