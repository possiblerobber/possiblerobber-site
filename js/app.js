/* PossibleRobber Market Terminal — app logic
 * All figures are DEMO placeholders. Replace `STOCKS` and drawChart() with a
 * real data source (via your own backend proxy) when you're ready.
 */
(function () {
  "use strict";

  // ---------- Demo data ----------
  const STOCKS = {
    NVDA: { name: "NVIDIA",                 full: "NVIDIA Corporation",     price: 142.68, change:  1.82 },
    AMD:  { name: "Advanced Micro Devices", full: "Advanced Micro Devices", price: 164.20, change: -0.43 },
    AAPL: { name: "Apple",                  full: "Apple Inc.",             price: 228.15, change:  0.56 },
    TSLA: { name: "Tesla",                  full: "Tesla, Inc.",            price: 338.90, change: -1.12 },
    PLTR: { name: "Palantir",               full: "Palantir Technologies",  price: 108.35, change:  2.07 },
  };

  const PAGE_TITLES = {
    overview:  "Market overview",
    markets:   "Market view",
    dashboard: "Market dashboard",
    monitor:   "Risk monitor",
    macro:     "Macro & Fed",
    movers:    "Market movers",
    sp500:     "S&P 500 scan",
    squeeze:   "Short squeeze scanner",
    stock:     "Stock chart",
    compare:   "Compare stocks",
    scanners:  "Scanners",
    watchlist: "Watchlist",
    journal:   "Paper-trading journal",
    risk:      "Risk concepts",
    notes:     "Research notes",
  };

  // ---------- Helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const fmtPrice  = (n) => "$" + n.toFixed(2);
  const fmtChange = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
  const tone      = (n) => (n >= 0 ? "positive" : "negative");

  // ---------- Header date ----------
  function renderDate() {
    const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
    $("#eyebrow").textContent = `${day} · Market dashboard`;
  }

  // ---------- Watchlist ----------
  function renderWatchlist() {
    $("#watchlist").innerHTML = Object.entries(STOCKS).map(([sym, s]) => `
      <div class="watch-row">
        <button type="button" data-symbol="${sym}">
          <div class="watch-symbol">${sym}</div>
          <div class="watch-name">${s.name}</div>
        </button>
        <div class="watch-price">${fmtPrice(s.price)}</div>
        <div class="change ${tone(s.change)}">${fmtChange(s.change)}</div>
      </div>`).join("");
  }

  // ---------- Illustrative candlestick chart ----------
  // Pseudo-random but deterministic per seed, so the same symbol/timeframe
  // always draws the same picture. NOT real price data.
  function drawChart(seed = 4) {
    let s = seed;
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

    const UP = "#35d39a", DOWN = "#ff687a";
    let svg = "";

    for (let y = 35; y < 260; y += 55) {
      svg += `<line x1="0" y1="${y}" x2="800" y2="${y}" stroke="#263444" stroke-dasharray="3 5"/>`;
    }

    let prev = 125;
    for (let i = 0; i < 52; i++) {
      const x     = 12 + i * 15;
      const open  = prev;
      const close = open + (rand() - 0.44) * 24;
      const high  = Math.max(open, close) + rand() * 10;
      const low   = Math.min(open, close) - rand() * 10;
      prev = close;

      const color = close >= open ? UP : DOWN;
      const y = (v) => 245 - v * 1.45;

      svg += `<line x1="${x + 4}" y1="${y(high)}" x2="${x + 4}" y2="${y(low)}" stroke="${color}" stroke-width="1.4"/>`
           + `<rect x="${x}" y="${Math.min(y(open), y(close))}" width="8" `
           + `height="${Math.max(3, Math.abs(y(close) - y(open)))}" fill="${color}" rx="1"/>`;
    }
    $("#chart").innerHTML = svg;
  }

  function selectSymbol(sym, index) {
    const s = STOCKS[sym];
    $("#chart-symbol").textContent = sym;
    $("#chart-name").textContent   = s.full;
    $("#chart-price").textContent  = fmtPrice(s.price);

    const change = $("#chart-change");
    change.textContent = `${fmtChange(s.change)} · sample data`;
    change.className   = `sub ${tone(s.change)}`;

    drawChart(index + 2);
  }

  // ---------- Page navigation ----------
  function showPage(page) {
    $$(".nav button").forEach((b) => {
      const active = b.dataset.page === page;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $$(".page").forEach((p) => { p.hidden = p.dataset.page !== page; });
    $("#page-title").textContent = PAGE_TITLES[page] || PAGE_TITLES.overview;
    const live = ["dashboard", "monitor", "macro", "movers", "sp500", "squeeze", "stock", "compare", "scanners"].includes(page);
    const pill = $("#data-pill");
    if (pill) { pill.textContent = live ? "● LIVE · may be delayed" : "● DEMO DATA"; pill.classList.toggle("demo", !live); }
    $("#sidebar").classList.remove("open");
  }

  // ---------- Wire up ----------
  function init() {
    renderDate();
    renderWatchlist();
    drawChart();

    $("#watchlist").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-symbol]");
      if (!btn) return;
      selectSymbol(btn.dataset.symbol, Object.keys(STOCKS).indexOf(btn.dataset.symbol));
    });

    $("#timeframes").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const buttons = $$("#timeframes button");
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      drawChart(buttons.indexOf(btn) + 5);
    });

    $$(".nav button").forEach((b) => b.addEventListener("click", () => showPage(b.dataset.page)));
    $("#menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
