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
      `<td class="${c.num ? "num" : ""}${c.tone && r[c.key] != null ? (r[c.key] >= 0 ? " positive" : " negative") : ""}">${esc(c.fmt ? c.fmt(r[c.key]) : r[c.key])}</td>`).join("") + "</tr>").join("");
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

  const UNUSUAL_COLS = [S("symbol", "Symbol"), N("price", "Price", f2), N("change_pct", "Change", pct), N("rel_volume", "Rel vol", (n) => (n == null ? "—" : n.toFixed(2) + "×"))];
  SCREENS.scanners = { tabs: [
    ["Unusual activity", "/api/scan/unusual", UNUSUAL_COLS],
    ["Breakouts", "/api/scan/breakouts", [S("symbol", "Symbol"), S("direction", "Direction"), N("price", "Price", f2), N("level", "20-day level", f2), N("rel_volume", "Rel vol", (n) => (n == null ? "—" : n.toFixed(2) + "×"))]],
    ["Options flow", "/api/scan/flow", [S("symbol", "Symbol"), N("call_put_ratio", "Call/Put", f2), N("call_volume", "Call vol", big), N("put_volume", "Put vol", big), S("expiration", "Expiry")]],
    ["Momentum", "/api/scan/momentum", [S("symbol", "Symbol"), S("description", "Name"), N("price", "Price", f2), N("change_pct", "Day", pct), N("rsi", "RSI", f2), N("perf_5d", "5D", pct), N("perf_1m", "1M", pct), N("avg_volume", "Avg vol", big)]],
  ] };

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

  // ---------- market dashboards ----------
  const T = (key, label, fmt) => ({ key, label, fmt, num: true, tone: true });
  const na = (v, f = (x) => x) => (v == null ? "N/A" : f(v));
  const card = (title, body) => `<div class="mcard"><div class="mlabel">${esc(title)}</div>${body}</div>`;
  const tableHtml = (rows, cols) => { const d = document.createElement("div"); plainTable(d, rows, cols); return d.innerHTML; };
  async function panel(root, loader, render) {
    root.innerHTML = '<p class="sub pad">Loading…</p>';
    try { root.innerHTML = render(await loader()); }
    catch (e) { root.innerHTML = `<p class="sub pad negative">Couldn't load data: ${esc(e.message)}</p>`; }
  }
  const FOOT = '<p class="sub pad">Educational information only, not financial advice. Data may be delayed; unavailable sources show N/A.</p>';

  function mountDashboard() {
    const root = $('.page[data-page="dashboard"] .screen');
    root.innerHTML = '<div id="d-idx"></div><h3 class="pad">Sector performance</h3><div id="d-sec"></div><h3 class="pad">Macro snapshot</h3><div id="d-mac"></div>' + FOOT;
    panel($("#d-idx"), () => api("/api/market/overview"), (rows) => '<div class="mgrid">' + rows.map((r) =>
      card(r.name, `<div class="mval">${esc(f2(r.value))}</div><div class="${r.change_pct >= 0 ? "positive" : "negative"}">${esc(pct(r.change_pct))}</div>`)).join("") + "</div>");
    panel($("#d-sec"), () => api("/api/market/sectors"), (rows) => '<p class="sub pad">Ranked by 1-month return. Rotation shows relative performance, not a prediction.</p>' +
      tableHtml(rows, [N("rank_1m", "#", String), S("name", "Sector"), S("symbol", "ETF"), T("d5", "5D", pct), T("d21", "1M", pct), T("d63", "3M", pct)]));
    panel($("#d-mac"), () => api("/api/market/macro"), (rows) => tableHtml(rows, [S("name", "Asset"), S("symbol", "Symbol"), N("value", "Value", f2), T("change_pct", "Day", pct)]));
  }

  function mountMonitor() {
    const root = $('.page[data-page="monitor"] .screen');
    panel(root, () => api("/api/market/monitor"), (d) => {
      const r = d.regime, vix = d.volatility && d.volatility.VIX, fg = d.fear_greed, br = d.breadth, aa = d.aaii, v = d.valuation || {}, c = d.credit || {}, t = d.technicals;
      const tone = r.points >= 6 ? "negative" : r.points >= 3 ? "warn" : "positive";
      const cards = [
        card("Fear & Greed", fg ? `<div class="mval">${esc(fg.score.toFixed(0))}/100</div><div class="sub">${esc(fg.rating || "")}</div>` : '<div class="mval">N/A</div>'),
        card("Put / Call", `<div class="mval">${esc(na(d.put_call, f2))}</div>`),
        card("AAII sentiment", aa ? `<div class="mval">${esc(aa.bullish.toFixed(1))}% bull</div><div class="sub">${esc(aa.bearish.toFixed(1))}% bear · spread ${esc(aa.spread.toFixed(1))}</div>` : '<div class="mval">N/A</div>'),
        card("S&P 500 breadth", br ? `<div class="mval">${esc(br.above_200_pct.toFixed(0))}% &gt; 200D</div><div class="sub">${br.advancing} up · ${br.declining} down of ${br.total}</div>` : '<div class="mval">N/A</div>'),
        card("VIX", vix ? `<div class="mval">${esc(f2(vix.value))}</div><div class="sub">${esc(na(vix.change, (x) => (x >= 0 ? "+" : "") + x.toFixed(2)))} today</div>` : '<div class="mval">N/A</div>'),
        card("Valuation (SPY)", `<div class="sub">P/E ${esc(na(v.pe, f2))} · Fwd ${esc(na(v.forward_pe, f2))} · CAPE ${esc(na(v.cape, f2))}</div>`),
        card("Rates & credit", `<div class="sub">10Y–2Y ${esc(na(c.curve_10y2y, f2))} · HY OAS ${esc(na(c.hy_oas, f2))} · IG OAS ${esc(na(c.ig_oas, f2))}</div>`),
        card("SPY technicals", t ? `<div class="sub">ATR14 ${esc(f2(t.atr14))} · BB width ${esc(na(t.bb_width, f2))}% · BB pos ${esc(na(t.bb_position, f2))}%</div>` : '<div class="mval">N/A</div>'),
      ].join("");
      const vols = Object.entries(d.volatility || {}).map(([k, x]) => ({ name: k, value: x.value, change: x.change }));
      return `<div class="pad"><span class="badge ${tone}">${esc(r.label)}</span> <strong>Stress score ${r.points}</strong> <span class="sub">(transparent rule count, not a trading signal)</span></div>` +
        `<ul class="pad reasons">${r.reasons.map((x) => `<li>+${x.points} ${esc(x.reason)}</li>`).join("") || "<li>No stress rules triggered</li>"}</ul>` +
        `<div class="mgrid">${cards}</div><h3 class="pad">Volatility indexes</h3>` + tableHtml(vols, [S("name", "Index"), N("value", "Level", f2), T("change", "Change", f2)]) + FOOT;
    });
  }

  function mountMacro() {
    const root = $('.page[data-page="macro"] .screen');
    root.innerHTML = '<h3 class="pad">Federal Reserve &amp; rates</h3><div id="m-fed"></div><h3 class="pad">Economic calendar</h3><div id="m-cal"></div>' + FOOT;
    panel($("#m-fed"), () => api("/api/market/fed"), (rows) => '<div class="mgrid">' + rows.map((r) => card(r.name,
      `<div class="mval">${esc(r.value == null ? "N/A" : r.unit === "$B" ? "$" + Math.round(r.value / 1000).toLocaleString() + "B" : r.unit === "%" ? r.value.toFixed(2) + "%" : r.value.toFixed(2))}</div><div class="sub">${esc(r.date || "")}</div>`)).join("") + "</div>");
    panel($("#m-cal"), () => api("/api/market/calendar"), (d) => {
      const e = d.economic || {}, news = d.fed_news;
      const ev = !e.configured ? '<p class="sub pad">Economic calendar isn\'t set up on the server yet.</p>' : e.error ? `<p class="sub pad negative">${esc(e.error)}</p>`
        : e.events.length ? tableHtml(e.events, [S("date", "Date"), S("event", "Event")]) + '<p class="sub pad">Source: FRED release calendar. Verify release times before relying on them.</p>' : '<p class="sub pad">No CPI, jobs report or FOMC dates in the next 30 days.</p>';
      const nw = news == null ? '<p class="sub pad">Fed press feed unavailable right now.</p>' : '<ul class="pad news">' + news.map((n) => `<li>${n.link ? `<a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` : esc(n.title)} <span class="sub">${esc(n.date)}</span></li>`).join("") + "</ul>";
      return ev + '<h3 class="pad">Fed monetary-policy news</h3>' + nw;
    });
  }

  // ---------- stock detail panels ----------
  const label = (k) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  function fmtVal(k, v) {
    if (v == null || v === "") return "—";
    if (typeof v === "number") {
      if (/(market_cap|revenue$|fcf|volume|shares|value)/.test(k)) return big(v);
      if (/(growth|margin|roe|yield)/.test(k)) return (v * 100).toFixed(2) + "%";
      if (/change/.test(k)) return pct(v);
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    return String(v);
  }
  const kv = (obj, skip = []) => '<dl class="kv">' + Object.entries(obj).filter(([k, v]) => !skip.includes(k) && (v == null || typeof v !== "object"))
    .map(([k, v]) => `<div><dt>${esc(label(k))}</dt><dd>${esc(fmtVal(k, v))}</dd></div>`).join("") + "</dl>";
  const holderTable = (rows, cols) => { const d = document.createElement("div"); plainTable(d, rows, cols); return d.innerHTML; };

  const DETAIL = {
    analysis: (d) => `<p class="pad"><strong>Score ${d.score}/100</strong> · ${esc(d.trend)} <span class="sub">(informational signal mix, not a recommendation)</span></p>` +
      `<ul class="pad reasons">${d.reasons.map((r) => `<li>${esc(r)}</li>`).join("") || "<li>No strong signals</li>"}</ul>` +
      `<p class="pad sub">Support: ${d.support.map((x) => x.toFixed(2)).join(", ") || "—"} · Resistance: ${d.resistance.map((x) => x.toFixed(2)).join(", ") || "—"}</p>`,
    technicals: (d) => kv(d, ["symbol"]),
    fundamentals: (d) => `<p class="pad"><strong>${esc(d.name)}</strong> <span class="sub">${esc(d.sector || "")} ${esc(d.industry ? "· " + d.industry : "")}</span></p>` + kv(d, ["symbol", "name", "sector", "industry"]),
    timeframes: (d) => holderTable(d, [S("timeframe", "Timeframe"), N("price", "Price", f2), N("ma20", "MA20", f2), S("trend", "Trend")]),
    news: (d) => d.length ? '<ul class="pad news">' + d.map((n) => `<li>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` : esc(n.title)}</li>`).join("") + "</ul>" : '<p class="pad sub">No recent news.</p>',
    earnings: (d) => d.length ? holderTable(d, [S("field", "Field"), S("value", "Value")]) : '<p class="pad sub">No earnings calendar available.</p>',
    options: (d) => kv(d, ["symbol"]),
    holders: (d) => "<h3 class=\"pad\">Institutional holders</h3>" + holderTable(d.holders, [S("holder", "Holder"), N("shares", "Shares", big), N("value", "Value", big), S("date", "Reported")]) +
      "<h3 class=\"pad\">Insider transactions</h3>" + holderTable(d.insiders, [S("insider", "Insider"), S("transaction", "Transaction"), N("shares", "Shares", big), N("value", "Value", big)]) +
      "<h3 class=\"pad\">Ownership summary</h3>" + holderTable(d.major, [S("label", "Item"), S("value", "Value")]),
  };
  const DETAIL_TABS = [["analysis", "Analysis"], ["technicals", "Technicals"], ["fundamentals", "Fundamentals"], ["timeframes", "Timeframes"], ["news", "News"], ["earnings", "Earnings"], ["options", "Options"], ["holders", "Holders"]];

  function mountCompare() {
    const root = $('.page[data-page="compare"] .screen');
    root.innerHTML = `<form class="stock-form" id="cmp-form"><input id="cmp-input" value="NVDA AMD AVGO" maxlength="60" aria-label="Tickers" style="width:240px" autocomplete="off" spellcheck="false">
      <button type="submit" class="btn">Compare</button><span class="sub">2–4 tickers</span></form><div id="cmp-body"></div>`;
    $("#cmp-form").addEventListener("submit", async (e) => {
      e.preventDefault(); const body = $("#cmp-body"); body.innerHTML = '<p class="sub pad">Loading…</p>';
      try {
        const rows = await api("/api/compare?symbols=" + encodeURIComponent($("#cmp-input").value.trim().replace(/\s+/g, ",")));
        plainTable(body, rows, [S("symbol", "Symbol"), S("name", "Name"), N("price", "Price", f2), N("pe", "P/E", f2), N("peg", "PEG", f2), N("rsi", "RSI", f2),
          N("change_5d", "5D", pct), N("change_1m", "1M", pct), N("change_1y", "1Y", pct), N("market_cap", "Mkt cap", big), S("trend", "Trend")]);
      } catch (err) { body.innerHTML = `<p class="sub pad negative">Couldn't compare: ${esc(err.message)}</p>`; }
    });
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
      <p class="sub pad">Support/resistance are clustered pivot levels from the candles shown, not predictions. Educational only.</p>
      <div class="controls tabs" id="stock-detail-tabs">${DETAIL_TABS.map(([k, t]) => `<button type="button" data-k="${k}">${t}</button>`).join("")}</div>
      <div id="stock-detail" class="detail"></div>`;
    let tf = "1Y", kind = "analysis";
    async function loadDetail() {
      const sym = $("#stock-input").value.trim().toUpperCase(), box = $("#stock-detail"); if (!sym) return;
      $("#stock-detail-tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.k === kind));
      box.innerHTML = '<p class="sub pad">Loading…</p>';
      try { box.innerHTML = DETAIL[kind](await api(`/api/stock/${encodeURIComponent(sym)}/${kind}`)); }
      catch (e) { box.innerHTML = `<p class="sub pad negative">Couldn't load ${esc(label(kind).toLowerCase())}: ${esc(e.message)}</p>`; }
    }
    $("#stock-detail-tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { kind = b.dataset.k; loadDetail(); } });
    async function load() {
      const sym = $("#stock-input").value.trim().toUpperCase(); if (!sym) return;
      $("#stock-chart").innerHTML = '<p class="sub pad">Loading…</p>'; $("#stock-summary").textContent = "";
      try {
        const d = await api(`/api/chart/${encodeURIComponent(sym)}?tf=${tf}`);
        const first = d.candles[0].o, last = d.candles[d.candles.length - 1].c, ch = (last - first) / first * 100;
        $("#stock-summary").innerHTML = `<strong>${esc(d.symbol)}</strong> · ${last.toFixed(2)} · <span class="${ch >= 0 ? "positive" : "negative"}">${pct(ch)} over ${esc(d.timeframe)}</span>`;
        $("#stock-chart").innerHTML = candleSvg(d);
        loadDetail();
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
    else if (page === "compare") { started.add(page); mountCompare(); }
    else if (page === "dashboard") { started.add(page); mountDashboard(); }
    else if (page === "monitor") { started.add(page); mountMonitor(); }
    else if (page === "macro") { started.add(page); mountMacro(); }
  });
  window.PRScreens = { candleSvg, SCREENS };
})();
