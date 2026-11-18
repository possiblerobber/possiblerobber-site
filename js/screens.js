/* Live data screens: movers, S&P 500 scan, short squeeze, stock chart.
 * Tables use Perspective when it loads, otherwise a plain HTML table.
 * Educational only. Data comes from the PossibleRobber API. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const API = (window.PR_CONFIG && window.PR_CONFIG.API_BASE || "").replace(/\/$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function api(path) {
    if (!API) throw new Error("API not configured (js/config.js)");
    const res = await fetch(API + path, { headers: { Accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "request failed (" + res.status + ")");
    return body.data;
  }

  // ---------- table rendering (Perspective with fallback) ----------
  let perspective = null, loading = null, seq = 0;
  function loadPerspective() {
    if (!loading) {
      const base = "https://cdn.jsdelivr.net/npm/@perspective-dev/";
      loading = Promise.race([
        (async () => {
          const [client] = await Promise.all([
            import(base + "client/dist/cdn/perspective.js"),
            import(base + "viewer/dist/cdn/perspective-viewer.js"),
            import(base + "viewer-datagrid/dist/cdn/perspective-viewer-datagrid.js"),
          ]);
          return { worker: await client.default.worker() };
        })(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 12000)),
      ]).catch((e) => { console.warn("Perspective unavailable, using plain tables:", e); return null; });
    }
    return loading;
  }

  function plainTable(mount, rows, columns) {
    const head = columns.map((c) => `<th>${esc(c.label)}</th>`).join("");
    const body = rows.map((r) => "<tr>" + columns.map((c) =>
      `<td class="${c.num ? "num" : ""}">${esc(c.fmt ? c.fmt(r[c.key]) : r[c.key])}</td>`).join("") + "</tr>").join("");
    mount.innerHTML = `<div class="table-scroll"><table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  async function showTable(mount, rows, columns) {
    if (!rows.length) { mount.innerHTML = '<p class="sub pad">No results right now.</p>'; return; }
    const p = await loadPerspective();
    if (!p) return plainTable(mount, rows, columns);
    try {
      const data = rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? null])));
      const name = "t" + (++seq);
      await p.worker.table(data, { name });
      mount.innerHTML = '<perspective-viewer class="pv"></perspective-viewer>';
      const viewer = mount.firstElementChild;
      await viewer.load(p.worker);
      await viewer.restore({ table: name, plugin: "Datagrid", theme: "Pro Dark" });
    } catch (e) { console.warn(e); plainTable(mount, rows, columns); }
  }

  const f2 = (n) => (n == null ? "—" : Number(n).toFixed(2));
  const pct = (n) => (n == null ? "—" : (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%");
  const big = (n) => (n == null ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : String(n));
  const S = (key, label) => ({ key, label });
  const N = (key, label, fmt) => ({ key, label, fmt, num: true });

  const MOVER_COLS = [S("symbol", "Symbol"), S("name", "Name"), N("price", "Price", f2), N("change_pct", "Change", pct), N("volume", "Volume", big)];
  const VOL_COLS = [S("symbol", "Symbol"), N("price", "Price", f2), N("volume", "Volume", big), N("avg_volume", "Avg vol", big), N("pct_vs_avg", "vs avg", pct)];
  const PM_COLS = [S("symbol", "Symbol"), N("price", "Price", f2), N("change_pct", "PM change", pct)];

  const SCREENS = {
    movers: { tabs: [
      ["Gainers", "/api/movers/gainers", MOVER_COLS], ["Losers", "/api/movers/losers", MOVER_COLS],
      ["Volume spikes", "/api/movers/volume", [S("symbol", "Symbol"), S("name", "Name"), ...VOL_COLS.slice(1)]],
      ["Premarket gainers", "/api/premarket/gainers", PM_COLS], ["Premarket losers", "/api/premarket/losers", PM_COLS],
      ["Premarket volume", "/api/premarket/volume", VOL_COLS],
    ] },
    sp500: { tabs: [["S&P 500 uptrends", "/api/scan/sp500", [
      S("symbol", "Symbol"), S("description", "Name"), S("trend", "Trend"), N("price", "Price", f2), N("change_pct", "Day", pct),
      N("perf_5d", "5D", pct), N("perf_1m", "1M", pct), N("rsi", "RSI", f2), N("avg_volume", "Avg vol", big), N("score", "Score", f2)]]] },
    squeeze: { note: "Heuristic 0–100 score of how squeeze-prone a stock looks. Short interest is reported about twice a month, so it is ~2 weeks old (see report date). Borrow fee and utilization aren't available from free sources. Not a prediction or advice.",
      tabs: [["Short squeeze scan", "/api/scan/squeeze", [
      S("symbol", "Symbol"), S("name", "Name"), N("score", "Score", f2), S("risk", "Setup"), N("short_pct_float", "Short % float", f2),
      N("days_to_cover", "Days to cover", f2), N("short_change_pct", "Short Δ mo", pct), N("float_shares", "Float", big),
      N("rel_volume", "Rel vol", (n) => (n == null ? "—" : n.toFixed(1) + "×")), N("pct_from_52w_high", "From 52w high", f2), S("short_report_date", "Short data as of")]]] },
  };

  function mountScreen(page) {
    const cfg = SCREENS[page], root = $(`.page[data-page="${page}"] .screen`);
    if (!root) return;
    root.innerHTML = (cfg.note ? `<p class="sub pad">${esc(cfg.note)}</p>` : "") +
      (cfg.tabs.length > 1 ? `<div class="controls tabs">${cfg.tabs.map((t, i) => `<button type="button" data-i="${i}">${esc(t[0])}</button>`).join("")}</div>` : "") +
      '<div class="screen-body"></div><div class="screen-foot sub pad"></div>';
    const body = $(".screen-body", root), foot = $(".screen-foot", root);
    async function select(i) {
      root.querySelectorAll(".tabs button").forEach((b, j) => b.classList.toggle("active", i === j));
      const [, path, cols] = cfg.tabs[i];
      body.innerHTML = '<p class="sub pad">Loading…</p>'; foot.textContent = "";
      try {
        const rows = await api(path);
        await showTable(body, rows, cols);
        foot.textContent = "Updated " + new Date().toLocaleTimeString() + " · Educational information only, not financial advice. Data may be delayed.";
      } catch (e) { body.innerHTML = `<p class="sub pad negative">Couldn't load data: ${esc(e.message)}</p>`; }
    }
    root.addEventListener("click", (e) => { const b = e.target.closest(".tabs button"); if (b) select(+b.dataset.i); });
    select(0);
  }

  // ---------- stock chart ----------
  function candleSvg(d) {
    const W = 900, H = 380, padL = 8, padR = 62, top = 10, volH = 60, ph = H - volH - 24;
    const cs = d.candles, n = cs.length;
    const lows = cs.map((c) => c.l), highs = cs.map((c) => c.h);
    const lv = [...d.support, ...d.resistance];
    let lo = Math.min(...lows), hi = Math.max(...highs);
    const span = (hi - lo) || 1; lo -= span * 0.04; hi += span * 0.04;
    const y = (v) => top + (hi - v) / (hi - lo) * ph;
    const step = (W - padL - padR) / n, bw = Math.max(1, Math.min(10, step * 0.7));
    const x = (i) => padL + step * (i + 0.5);
    const vmax = Math.max(...cs.map((c) => c.v), 1);
    let s = "";
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4, yy = y(v);
      s += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="#263444" stroke-dasharray="3 5"/>` +
           `<text x="${W - padR + 6}" y="${yy + 4}" fill="#8b98a9" font-size="11">${v.toFixed(2)}</text>`;
    }
    cs.forEach((c, i) => {
      const up = c.c >= c.o, col = up ? "#35d39a" : "#ff687a";
      s += `<line x1="${x(i)}" x2="${x(i)}" y1="${y(c.h)}" y2="${y(c.l)}" stroke="${col}" stroke-width="1"/>` +
           `<rect x="${x(i) - bw / 2}" y="${Math.min(y(c.o), y(c.c))}" width="${bw}" height="${Math.max(1, Math.abs(y(c.c) - y(c.o)))}" fill="${col}"/>` +
           `<rect x="${x(i) - bw / 2}" y="${H - 20 - (c.v / vmax) * volH}" width="${bw}" height="${(c.v / vmax) * volH}" fill="${col}" opacity=".35"/>`;
    });
    const line = (key, col) => {
      const pts = cs.map((c, i) => c[key] == null ? null : `${x(i)},${y(c[key])}`).filter(Boolean);
      return pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="1.4"/>` : "";
    };
    s += line("ma20", "#f5c451") + line("ma50", "#6aa8ff");
    d.support.forEach((v) => { s += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#35d39a" stroke-dasharray="6 4" opacity=".8"/><text x="${padL + 4}" y="${y(v) - 3}" fill="#35d39a" font-size="11">S ${v.toFixed(2)}</text>`; });
    d.resistance.forEach((v) => { s += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#ff687a" stroke-dasharray="6 4" opacity=".8"/><text x="${padL + 4}" y="${y(v) - 3}" fill="#ff687a" font-size="11">R ${v.toFixed(2)}</text>`; });
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(d.symbol)} candlestick chart">${s}</svg>`;
  }

  function mountStock() {
    const root = $('.page[data-page="stock"] .screen');
    root.innerHTML = `
      <form class="stock-form" id="stock-form"><input id="stock-input" value="AAPL" maxlength="10" aria-label="Ticker symbol" autocomplete="off" spellcheck="false">
        <button type="submit" class="btn">Load</button>
        <div class="controls" id="stock-tf">${["1D", "5D", "30D", "1Y"].map((t) => `<button type="button" data-tf="${t}" class="${t === "1Y" ? "active" : ""}">${t}</button>`).join("")}</div></form>
      <div id="stock-summary" class="sub pad"></div><div id="stock-chart" class="chart-wrap"></div>
      <div class="chart-legend pad"><span><i class="dot up"></i>Up</span><span><i class="dot down"></i>Down</span>
        <span style="color:#f5c451">— MA20</span><span style="color:#6aa8ff">— MA50</span><span style="color:#35d39a">- - Support</span><span style="color:#ff687a">- - Resistance</span></div>
      <p class="sub pad">Support/resistance are clustered pivot levels from the candles shown, not predictions. Educational only.</p>`;
    let tf = "1Y";
    async function load() {
      const sym = $("#stock-input").value.trim().toUpperCase(); if (!sym) return;
      $("#stock-chart").innerHTML = '<p class="sub pad">Loading…</p>'; $("#stock-summary").textContent = "";
      try {
        const d = await api(`/api/chart/${encodeURIComponent(sym)}?tf=${tf}`);
        const first = d.candles[0].o, last = d.candles[d.candles.length - 1].c, ch = (last - first) / first * 100;
        $("#stock-summary").innerHTML = `<strong>${esc(d.symbol)}</strong> · ${last.toFixed(2)} · <span class="${ch >= 0 ? "positive" : "negative"}">${pct(ch)} over ${esc(d.timeframe)}</span>`;
        $("#stock-chart").innerHTML = candleSvg(d);
      } catch (e) { $("#stock-chart").innerHTML = `<p class="sub pad negative">Couldn't load ${esc(sym)}: ${esc(e.message)}</p>`; }
    }
    $("#stock-form").addEventListener("submit", (e) => { e.preventDefault(); load(); });
    $("#stock-tf").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return; tf = b.dataset.tf;
      $("#stock-tf").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); load();
    });
    load();
  }

  // Lazy-start each screen the first time its nav button is clicked.
  const started = new Set();
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".nav button[data-page]"); if (!b) return;
    const page = b.dataset.page; if (started.has(page)) return;
    if (SCREENS[page]) { started.add(page); mountScreen(page); }
    else if (page === "stock") { started.add(page); mountStock(); }
  });
  window.PRScreens = { candleSvg, SCREENS };
})();
