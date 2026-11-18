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
  const big = (n) => (n == null ? "—" : n >= 1e12 ? (n / 1e12).toFixed(2) + "T" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : String(n));
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
    buybacks: (d) => kv({ buyback_yield: d.buyback_yield == null ? null : d.buyback_yield.toFixed(2) + "%", shares_outstanding: d.shares_outstanding == null ? null : big(d.shares_outstanding), market_cap: d.market_cap == null ? null : big(d.market_cap) }, []) +
      "<h3 class=\"pad\">Share repurchases by fiscal year</h3>" + (d.annual.length ? holderTable(d.annual, [S("year", "Year"), N("repurchased", "Repurchased ($)", big)]) : '<p class="pad sub">No repurchase history available.</p>') +
      '<p class="pad sub">Buyback yield is trailing repurchases as a percent of market cap (TradingView). Buybacks can be paused or reversed and are not a prediction of returns.</p>',
  };
  const DETAIL_TABS = [["analysis", "Analysis"], ["technicals", "Technicals"], ["fundamentals", "Fundamentals"], ["timeframes", "Timeframes"], ["news", "News"], ["earnings", "Earnings"], ["options", "Options"], ["holders", "Holders"], ["buybacks", "Buybacks"]];

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

  // ---------- personal: portfolio, watchlist, alerts (stored on the server, behind your login) ----------
  async function send(path, body) {
    const res = await fetch(API + path, { method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || "save failed (" + res.status + ")");
    return out.data;
  }
  const usd = (n) => (n == null ? "—" : (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const sgn = (n) => (n == null ? "" : n >= 0 ? "positive" : "negative");
  const flash = (el, text, bad) => { el.textContent = text; el.classList.toggle("negative", !!bad); };
  const PFOOT = '<p class="sub pad">Manual tracker for your own records, not a brokerage connection. Prices come from Yahoo Finance and may be delayed. Educational only, not financial advice.</p>';

  function mountPortfolio() {
    const root = $('.page[data-page="portfolio"] .screen');
    root.innerHTML = `<div class="stock-form" id="pf-tabs" role="tablist" aria-label="Portfolios"></div>
      <div class="stock-form" id="pf-profiles">
        <input id="pf-pname" placeholder="Profile name" maxlength="30" aria-label="Profile name" style="text-transform:none;width:150px">
        <button class="btn ghost" type="button" data-act="add">Add profile</button>
        <button class="btn ghost" type="button" data-act="rename">Rename</button>
        <button class="btn ghost" type="button" data-act="delete">Delete</button></div>
      <form class="stock-form" id="pf-form">
        <input id="pf-sym" placeholder="Ticker" maxlength="10" aria-label="Ticker" autocomplete="off" spellcheck="false" required>
        <input id="pf-shares" type="number" step="any" min="0" placeholder="Shares" aria-label="Shares" style="text-transform:none" required>
        <input id="pf-cost" type="number" step="any" min="0" placeholder="Cost / share" aria-label="Cost per share" style="text-transform:none" required>
        <input id="pf-date" type="date" aria-label="Date opened (optional)" style="text-transform:none;width:150px">
        <button class="btn" type="submit">Add position</button></form>
      <p class="sub pad" id="pf-msg" role="status"></p><div id="pf-body"></div><div id="pf-push"></div>` + PFOOT;
    const msg = (t, bad) => flash($("#pf-msg"), t, bad);
    const strip = (r) => ({ symbol: r.symbol, shares: r.shares, cost: r.cost, opened: r.opened, note: r.note });
    const key = (r) => [r.symbol, r.shares, r.cost, r.opened || ""].join("|");
    let busy = false, profiles = [], current = "main", armed = false;
    try { current = localStorage.getItem("pr-profile") || "main"; } catch (_) {}
    const pname = (id) => (profiles.find((x) => x.id === id) || {}).name || id;
    function drawProfiles() {
      if (current !== "all" && !profiles.some((x) => x.id === current)) current = profiles.length ? profiles[0].id : "main";
      try { localStorage.setItem("pr-profile", current); } catch (_) {}
      const tabs = profiles.concat(profiles.length > 1 ? [{ id: "all", name: "All (combined)" }] : []);
      $("#pf-tabs").innerHTML = '<b style="margin-right:4px">Portfolios:</b>' + tabs.map((x) => `<button type="button" role="tab" class="btn${x.id === current ? "" : " ghost"}" data-pid="${esc(x.id)}" aria-selected="${x.id === current}">${esc(x.name)}</button>`).join("");
      const all = current === "all";
      $("#pf-form").hidden = all;
      $('#pf-profiles [data-act="rename"]').disabled = all; $('#pf-profiles [data-act="delete"]').disabled = all || profiles.length < 2;
    }
    function render(d) {
      const t = d.totals, all = d.profile === "all";
      const cards = [
        card("Market value", `<div class="mval">${esc(usd(t.value))}</div>`),
        card("Cost basis", `<div class="mval">${esc(usd(t.cost))}</div>`),
        card("Day P/L", `<div class="mval ${sgn(t.day_pnl)}">${esc(usd(t.day_pnl))}</div>${t.day_pct == null ? "" : `<div class="${sgn(t.day_pct)}">${esc(pct(t.day_pct))}</div>`}`),
        card("Total P/L", `<div class="mval ${sgn(t.pnl)}">${esc(usd(t.pnl))}</div><div class="${sgn(t.pnl_pct)}">${esc(pct(t.pnl_pct))}</div>`),
      ].join("");
      if (!d.positions.length) return `<div class="mgrid">${cards}</div><p class="sub pad">No positions in ${esc(all ? "any profile" : pname(d.profile))} yet.${all ? "" : " Add one above."}</p>`;
      const rows = d.positions.map((r) => `<tr>${all ? `<td>${esc(r.profile_name)}</td>` : ""}<td>${esc(r.symbol)}</td><td class="num">${esc(r.shares)}</td><td class="num">${esc(usd(r.cost))}</td>
        <td class="num">${esc(usd(r.price))}</td><td class="num">${esc(usd(r.value))}</td><td class="num ${sgn(r.day_change_pct)}">${esc(pct(r.day_change_pct))}</td>
        <td class="num ${sgn(r.pnl)}">${esc(usd(r.pnl))}</td>
        <td class="num ${sgn(r.pnl_pct)}">${esc(pct(r.pnl_pct))}</td>
        <td class="num">${r.weight_pct == null ? "—" : esc(r.weight_pct.toFixed(1)) + "%"}</td><td>${esc(r.opened || "")}</td>
        <td>${all ? "" : `<button type="button" class="btn small" data-rm="${esc(key(r))}" aria-label="Remove ${esc(r.symbol)}">Remove</button>`}</td></tr>`).join("");
      const warn = t.missing_prices ? `<p class="sub pad negative">${esc(t.missing_prices)} position(s) have no live price right now and aren't in the totals.</p>` : "";
      return `<div class="mgrid">${cards}</div>${warn}<div class="table-scroll"><table class="table"><thead><tr>${all ? "<th>Profile</th>" : ""}<th>Symbol</th><th>Shares</th><th>Cost</th><th>Price</th><th>Value</th><th>Day</th><th>P/L</th><th>P/L %</th><th>Weight</th><th>Opened</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    async function loadView() {
      let d;
      try { d = await api("/api/user/portfolio?profile=" + encodeURIComponent(current)); }
      catch (e) { if (current === "main" || !/unknown profile/.test(e.message)) throw e; current = "main"; d = await api("/api/user/portfolio?profile=main"); }
      profiles = d.profiles; drawProfiles(); $("#pf-body").innerHTML = render(d); return d;
    }
    async function save(mutator, ok) {
      if (busy) return; busy = true; msg("Saving…");
      try {
        const cur = await api("/api/user/portfolio?profile=" + encodeURIComponent(current));
        const d = await send("/api/user/portfolio", { profile: current, positions: mutator(cur.positions.map(strip)) });
        profiles = d.profiles; $("#pf-body").innerHTML = render(d); msg(ok); return true;
      } catch (e) { msg("Couldn't save: " + e.message, true); } finally { busy = false; }
    }
    async function saveProfiles(next, ok, then) {
      if (busy) return; busy = true; msg("Saving…");
      try {
        const out = await send("/api/user/profiles", { profiles: next }); profiles = out.profiles;
        if (then) then(); drawProfiles(); await loadView(); msg(ok);
      } catch (e) { msg("Couldn't save: " + e.message, true); } finally { busy = false; }
    }
    const slug = (name) => {
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16) || "profile";
      let id = base, n = 2; while (profiles.some((x) => x.id === id) || id === "all") id = base + "-" + n++; return id;
    };
    $("#pf-tabs").addEventListener("click", (e) => {
      const tb = e.target.closest("button[data-pid]"); if (!tb || tb.dataset.pid === current) return;
      current = tb.dataset.pid; armed = false;
      try { localStorage.setItem("pr-profile", current); } catch (_) {}
      drawProfiles(); msg(""); $("#pf-body").innerHTML = '<p class="sub pad">Loading…</p>';
      loadView().catch((e) => { $("#pf-body").innerHTML = `<p class="sub pad negative">Couldn't load: ${esc(e.message)}</p>`; });
    });
    $("#pf-profiles").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]"); if (!b) return;
      const name = $("#pf-pname").value.trim().replace(/\s+/g, " "), act = b.dataset.act;
      if (act === "delete") {
        if (!armed) { armed = true; return msg(`Click Delete again to remove "${pname(current)}" and all of its positions.`, true); }
        armed = false; return saveProfiles(profiles.filter((x) => x.id !== current), "Profile deleted.", () => { current = profiles[0].id; });
      }
      armed = false;
      if (!name) return msg("Type a profile name first.", true);
      if (act === "add") { const id = slug(name); return saveProfiles(profiles.concat([{ id, name }]), "Profile added.", () => { current = id; try { localStorage.setItem("pr-profile", id); } catch (_) {} $("#pf-pname").value = ""; }); }
      if (act === "rename") return saveProfiles(profiles.map((x) => (x.id === current ? { id: x.id, name } : x)), "Renamed.", () => { $("#pf-pname").value = ""; });
    });
    $("#pf-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const symbol = $("#pf-sym").value.trim().toUpperCase(), shares = Number($("#pf-shares").value), cost = Number($("#pf-cost").value);
      if (!symbol || !(shares > 0) || !(cost >= 0)) return msg("Enter a ticker, shares above 0 and a cost per share.", true);
      const opened = $("#pf-date").value || null;
      let merged = false;
      save((list) => {
        const i = list.findIndex((r) => r.symbol === symbol);
        if (i < 0) return list.concat([{ symbol, shares, cost, opened, note: "" }]);
        merged = true; const o = list[i], n = o.shares + shares;
        const first = [o.opened, opened].filter(Boolean).sort()[0] || null;
        const m = { symbol, shares: n, cost: Math.round(((o.shares * o.cost + shares * cost) / n) * 1e6) / 1e6, opened: first, note: o.note || "" };
        return list.map((r, k) => (k === i ? m : r));
      }, "").then((ok) => { if (ok) { msg((merged ? "Combined with your existing " : "Added ") + symbol + (merged ? " position (average cost updated)." : " to " + pname(current) + ".")); $("#pf-form").reset(); } });
    });
    $("#pf-body").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-rm]"); if (!b) return;
      const k = b.dataset.rm; let gone = false;
      save((list) => list.filter((r) => (!gone && key(r) === k) ? !(gone = true) : true), "Removed.");
    });
    loadView().catch((e) => { $("#pf-body").innerHTML = `<p class="sub pad negative">Couldn't load data: ${esc(e.message)}</p>`; });
    const push = $("#pf-push"), pmsg = (t, bad) => flash($("#pa-msg"), t, bad);
    async function loadPush() {
      try {
        const st = await api("/api/user/settings"), pa = st.portfolio_alert;
        push.innerHTML = `<h3 class="pad">Phone alert</h3><form class="stock-form" id="pa-form">
          <label class="chk"><input type="checkbox" id="pa-on" ${pa.enabled ? "checked" : ""}> Message me if a portfolio is down</label>
          <input id="pa-pct" type="number" step="any" min="0.5" max="50" value="${esc(pa.drop_pct)}" style="width:80px;text-transform:none" aria-label="Drop percent"> % or more today
          <button class="btn" type="submit">Save</button> <button class="btn ghost" type="button" id="pa-test">Send test</button></form>
          <p class="sub pad" id="pa-msg" role="status">${st.push_configured ? "" : "Phone push isn't set up on the server yet."}</p>
          <p class="sub pad">Checked every 5 minutes during US market hours, even when this site is closed, with one message per trading day. Messages show percentages only, never dollar amounts.</p>`;
      } catch (e) { push.innerHTML = `<p class="sub pad negative">Couldn't load phone alert settings: ${esc(e.message)}</p>`; }
    }
    push.addEventListener("submit", async (e) => {
      e.preventDefault(); pmsg("Saving…");
      try { await send("/api/user/settings", { portfolio_alert: { enabled: $("#pa-on").checked, drop_pct: Number($("#pa-pct").value) } }); pmsg("Saved."); }
      catch (err) { pmsg("Couldn't save: " + err.message, true); }
    });
    push.addEventListener("click", async (e) => {
      if (!e.target.closest("#pa-test")) return; pmsg("Sending…");
      try { await send("/api/user/push-test", {}); pmsg("Test message sent. Check your phone."); }
      catch (err) { pmsg("Couldn't send: " + err.message, true); }
    });
    loadPush();
  }

  // Alerts: the server checks them whenever this site is open (any page) and marks each one triggered once.
  const ALERT_TYPES = { price_above: "Price rises to", price_below: "Price falls to", pct_up: "Day move up by", pct_down: "Day move down by" };
  const alertText = (a) => a.symbol + " " + (a.type === "price_above" ? "≥ " + usd(a.value) : a.type === "price_below" ? "≤ " + usd(a.value)
    : a.type === "pct_up" ? "up " + a.value + "% or more today" : "down " + a.value + "% or more today");
  let refreshAlerts = null, pollTimer = null;
  function notify(list) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    (list || []).forEach((a) => { try { new Notification("PossibleRobber alert: " + a.symbol, { body: alertText(a) + " (now " + usd(a.current) + ")" }); } catch (_) {} });
  }
  async function fetchAlerts() { const d = await api("/api/user/alerts"); notify(d.newly_triggered); return d; }
  function startPoll() {
    if (pollTimer || !("Notification" in window) || Notification.permission !== "granted") return;
    const tick = async () => { try { const d = await fetchAlerts(); if (refreshAlerts) refreshAlerts(d); } catch (_) {} };
    tick(); pollTimer = setInterval(tick, 120000);
  }

  function mountWatchlist() {
    const root = $('.page[data-page="watchlist"] .screen');
    const typeOpts = Object.entries(ALERT_TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
    root.innerHTML = `<h3 class="pad">Watchlist</h3>
      <form class="stock-form" id="wl-form"><input id="wl-sym" placeholder="Ticker" maxlength="10" aria-label="Ticker" autocomplete="off" spellcheck="false" required><button class="btn" type="submit">Add</button></form>
      <p class="sub pad" id="wl-msg" role="status"></p><div id="wl-body"></div>
      <h3 class="pad">Alerts</h3>
      <form class="stock-form" id="al-form"><input id="al-sym" placeholder="Ticker" maxlength="10" aria-label="Ticker" autocomplete="off" spellcheck="false" required>
        <select id="al-type" aria-label="Alert type">${typeOpts}</select>
        <input id="al-val" type="number" step="any" min="0" placeholder="Value" aria-label="Alert value" style="text-transform:none" required>
        <button class="btn" type="submit">Add alert</button> <button class="btn ghost" type="button" id="al-notify">Enable notifications</button></form>
      <p class="sub pad" id="al-msg" role="status"></p><div id="al-body"></div>
      <p class="sub pad">Alerts are checked about every 2 minutes while this site is open in a browser tab, and each fires once. Price alerts use dollars, move alerts use percent. Notifications need your browser's permission; the list below always shows what triggered. Educational only, not financial advice.</p>`;
    const wmsg = (t, bad) => flash($("#wl-msg"), t, bad), amsg = (t, bad) => flash($("#al-msg"), t, bad);
    const renderWl = (d) => !d.symbols.length ? '<p class="sub pad">Nothing on your watchlist yet.</p>' :
      `<div class="table-scroll"><table class="table"><thead><tr><th>Symbol</th><th>Price</th><th>Day</th><th></th></tr></thead><tbody>${d.quotes.map((q) =>
        `<tr><td>${esc(q.symbol)}</td><td class="num">${esc(usd(q.price))}</td><td class="num ${sgn(q.change_pct)}">${esc(pct(q.change_pct))}</td>
        <td><button type="button" class="btn small" data-rm="${esc(q.symbol)}" aria-label="Remove ${esc(q.symbol)}">Remove</button></td></tr>`).join("")}</tbody></table></div>`;
    const renderAl = (d) => !d.alerts.length ? '<p class="sub pad">No alerts yet.</p>' :
      `<div class="table-scroll"><table class="table"><thead><tr><th>Alert</th><th>Now</th><th>Status</th><th></th></tr></thead><tbody>${d.alerts.map((a) =>
        `<tr><td>${esc(alertText(a))}</td><td class="num">${esc(usd(a.current))}</td>
        <td class="${a.triggered ? "positive" : ""}">${a.triggered ? "Triggered " + esc(new Date(a.triggered).toLocaleString()) : a.active ? "Watching" : "Off"}</td>
        <td><button type="button" class="btn small" data-rm="${esc(a.id)}" aria-label="Delete alert">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
    let busy = false;
    async function mutate(path, field, body, mutator, render, target, say, ok) {
      if (busy) return; busy = true; say("Saving…");
      try {
        const cur = await api(path); notify(cur.newly_triggered); const d = await send(path, { [body]: mutator(cur[field]) });
        $(target).innerHTML = render(d); notify(d.newly_triggered); say(ok); return true;
      } catch (e) { say("Couldn't save: " + e.message, true); } finally { busy = false; }
    }
    $("#wl-form").addEventListener("submit", async (e) => {
      e.preventDefault(); const s = $("#wl-sym").value.trim().toUpperCase(); if (!s) return;
      if (await mutate("/api/user/watchlist", "symbols", "symbols", (l) => l.concat([s]), renderWl, "#wl-body", wmsg, "Added " + s + ".")) $("#wl-sym").value = "";
    });
    $("#wl-body").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-rm]"); if (!b) return;
      mutate("/api/user/watchlist", "symbols", "symbols", (l) => l.filter((x) => x !== b.dataset.rm), renderWl, "#wl-body", wmsg, "Removed.");
    });
    $("#al-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const symbol = $("#al-sym").value.trim().toUpperCase(), value = Number($("#al-val").value);
      if (!symbol || !(value > 0)) return amsg("Enter a ticker and a value above 0.", true);
      const a = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), symbol, type: $("#al-type").value, value, active: true, note: "", triggered: null };
      if (await mutate("/api/user/alerts", "alerts", "alerts", (l) => l.concat([a]), renderAl, "#al-body", amsg, "Alert added.")) { $("#al-val").value = ""; startPoll(); }
    });
    $("#al-body").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-rm]"); if (!b) return;
      mutate("/api/user/alerts", "alerts", "alerts", (l) => l.filter((x) => x.id !== b.dataset.rm), renderAl, "#al-body", amsg, "Alert deleted.");
    });
    $("#al-notify").addEventListener("click", async () => {
      if (!("Notification" in window)) return amsg("This browser doesn't support notifications.", true);
      const p = await Notification.requestPermission();
      amsg(p === "granted" ? "Notifications on for this browser." : "Notifications are blocked. You can allow them in your browser's site settings.", p !== "granted");
      startPoll();
    });
    refreshAlerts = (d) => { $("#al-body").innerHTML = renderAl(d); };
    panel($("#wl-body"), () => api("/api/user/watchlist"), renderWl);
    panel($("#al-body"), fetchAlerts, renderAl);
  }
  startPoll();

  // ---------- Overview (live) ----------
  function openStock(symbol) {
    const nav = $('.nav button[data-page="stock"]'); if (nav) nav.click();
    const input = $("#stock-input"), form = $("#stock-form");
    if (input && form) { input.value = symbol; form.requestSubmit(); }
  }
  function mountOverview() {
    const root = $('.page[data-page="overview"] .screen');
    root.innerHTML = '<h3 class="pad">Markets</h3><div id="ov-idx"></div><h3 class="pad">Your portfolio</h3><div id="ov-pf"></div>' +
      '<h3 class="pad">Your watchlist</h3><div id="ov-wl"></div><h3 class="pad">Top movers today</h3><div id="ov-mv"></div>' + FOOT;
    panel($("#ov-idx"), () => api("/api/market/overview"), (rows) => '<div class="mgrid">' + rows.map((r) =>
      card(r.name, `<div class="mval">${esc(f2(r.value))}</div><div class="${sgn(r.change_pct)}">${esc(pct(r.change_pct))}</div>`)).join("") + "</div>");
    panel($("#ov-pf"), () => api("/api/user/portfolio?profile=all"), (d) => {
      if (!d.positions.length) return '<p class="sub pad">No positions yet. Add them on the Portfolio page.</p>';
      const t = d.totals;
      return '<div class="mgrid">' + [
        card("Market value", `<div class="mval">${esc(usd(t.value))}</div>`),
        card("Day P/L", `<div class="mval ${sgn(t.day_pnl)}">${esc(usd(t.day_pnl))}</div>${t.day_pct == null ? "" : `<div class="${sgn(t.day_pct)}">${esc(pct(t.day_pct))}</div>`}`),
        card("Total P/L", `<div class="mval ${sgn(t.pnl)}">${esc(usd(t.pnl))}</div><div class="${sgn(t.pnl_pct)}">${esc(pct(t.pnl_pct))}</div>`),
      ].join("") + "</div>";
    });
    panel($("#ov-wl"), () => api("/api/user/watchlist"), (d) => !d.quotes.length
      ? '<p class="sub pad">Nothing on your watchlist yet. Add tickers on the Watchlist &amp; alerts page.</p>'
      : '<div class="table-scroll"><table class="table"><thead><tr><th>Symbol</th><th>Price</th><th>Day</th></tr></thead><tbody>' + d.quotes.map((q) =>
        `<tr><td><button type="button" class="linkbtn" data-open="${esc(q.symbol)}">${esc(q.symbol)}</button></td><td class="num">${esc(usd(q.price))}</td><td class="num ${sgn(q.change_pct)}">${esc(pct(q.change_pct))}</td></tr>`).join("") + "</tbody></table></div>");
    panel($("#ov-mv"), () => Promise.all([api("/api/movers/gainers"), api("/api/movers/losers")]), ([g, l]) => {
      const cols = [S("symbol", "Symbol"), N("price", "Price", f2), T("change_pct", "Change", pct)];
      return '<p class="sub pad">Top 5 gainers</p>' + tableHtml(g.slice(0, 5), cols) + '<p class="sub pad">Top 5 losers</p>' + tableHtml(l.slice(0, 5), cols);
    });
    root.onclick = (e) => { const b = e.target.closest("button[data-open]"); if (b) openStock(b.dataset.open); };
  }
  mountOverview();

  // ---------- Insiders & buybacks ----------
  function mountInsiders() {
    const root = $('.page[data-page="insiders"] .screen');
    root.innerHTML = '<h3 class="pad">Insider buying</h3><div id="in-buy"></div><h3 class="pad">Insider selling</h3><div id="in-sell"></div>' +
      '<h3 class="pad">Buyback leaders (S&amp;P 500)</h3><div id="in-bb"></div>' +
      '<p class="sub pad">Insider trades are SEC Form 4 filings, listed by OpenInsider (the filing can be a few days after the trade). Insiders sell for many reasons, such as taxes or diversifying, so a sale is not a signal by itself. Buyback yield is trailing repurchases as a percent of market cap. Educational only, not financial advice.</p>';
    const open = (s) => `<button type="button" class="linkbtn" data-open="${esc(s)}">${esc(s)}</button>`;
    const insCols = [["filing_date", "Filed"], ["symbol", "Symbol"], ["company", "Company"], ["insider", "Insider"], ["title", "Title"]];
    const insTable = (rows) => !rows ? '<p class="sub pad negative">This list is unavailable right now.</p>' : !rows.length ? '<p class="sub pad">Nothing to show.</p>' :
      '<div class="table-scroll"><table class="table"><thead><tr><th>Filed</th><th>Symbol</th><th>Company</th><th>Insider</th><th>Title</th><th>Price</th><th>Shares</th><th>Value</th><th>Own Δ</th></tr></thead><tbody>' +
      rows.map((r) => `<tr><td>${esc(r.filing_date)}</td><td>${open(r.symbol)}</td><td>${esc(r.company)}</td><td>${esc(r.insider)}</td><td>${esc(r.title)}</td><td class="num">${esc(f2(r.price))}</td><td class="num">${esc(r.shares == null ? "—" : Math.abs(r.shares).toLocaleString("en-US"))}</td><td class="num">${esc(r.value == null ? "—" : usd(Math.abs(r.value)))}</td><td class="num ${sgn(r.own_change_pct)}">${esc(pct(r.own_change_pct))}</td></tr>`).join("") + "</tbody></table></div>";
    const feed = api("/api/scan/insiders");
    panel($("#in-buy"), () => feed, (d) => insTable(d.buys));
    feed.then((d) => { $("#in-sell").innerHTML = insTable(d.sells); }).catch((e) => { $("#in-sell").innerHTML = `<p class="sub pad negative">Couldn't load data: ${esc(e.message)}</p>`; });
    panel($("#in-bb"), () => api("/api/scan/buybacks"), (rows) => '<div class="table-scroll"><table class="table"><thead><tr><th>Symbol</th><th>Name</th><th>Sector</th><th>Price</th><th>Day</th><th>Buyback yield</th><th>Mkt cap</th></tr></thead><tbody>' +
      rows.map((r) => `<tr><td>${open(r.symbol)}</td><td>${esc(r.name)}</td><td>${esc(r.sector || "")}</td><td class="num">${esc(f2(r.price))}</td><td class="num ${sgn(r.change_pct)}">${esc(pct(r.change_pct))}</td><td class="num">${esc(f2(r.buyback_yield))}%</td><td class="num">${esc(big(r.market_cap))}</td></tr>`).join("") + "</tbody></table></div>");
    root.onclick = (e) => { const b = e.target.closest("button[data-open]"); if (b) openStock(b.dataset.open); };
  }

  // Lazy-start each screen the first time its nav button is clicked.
  const started = new Set();
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".nav button[data-page]"); if (!b) return;
    const page = b.dataset.page;
    if (page === "overview") { mountOverview(); return; }
    if (started.has(page)) return;
    if (SCREENS[page]) { started.add(page); mountScreen(page); }
    else if (page === "stock") { started.add(page); mountStock(); }
    else if (page === "compare") { started.add(page); mountCompare(); }
    else if (page === "dashboard") { started.add(page); mountDashboard(); }
    else if (page === "monitor") { started.add(page); mountMonitor(); }
    else if (page === "macro") { started.add(page); mountMacro(); }
    else if (page === "insiders") { started.add(page); mountInsiders(); }
    else if (page === "portfolio") { started.add(page); mountPortfolio(); }
    else if (page === "watchlist") { started.add(page); mountWatchlist(); }
  });
  window.PRScreens = { candleSvg, SCREENS };
})();
