/* PossibleRobber Market Terminal: navigation and page chrome.
 * Live data screens live in js/screens.js. Educational only, not financial advice. */
(function () {
  "use strict";

  const PAGE_TITLES = {
    overview:  "Market overview",
    dashboard: "Market dashboard",
    monitor:   "Risk monitor",
    macro:     "Macro & Fed",
    movers:    "Market movers",
    sp500:     "S&P 500 scan",
    squeeze:   "Short squeeze scanner",
    stock:     "Stock chart",
    compare:   "Compare stocks",
    scanners:  "Scanners",
    portfolio: "Portfolio",
    watchlist: "Watchlist & alerts",
    journal:   "Paper-trading journal",
    risk:      "Risk concepts",
    notes:     "Research notes",
  };

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function renderDate() {
    const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
    $("#eyebrow").textContent = `${day} · Market dashboard`;
  }

  function showPage(page) {
    $$(".nav button").forEach((b) => {
      const active = b.dataset.page === page;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $$(".page").forEach((p) => { p.hidden = p.dataset.page !== page; });
    $("#page-title").textContent = PAGE_TITLES[page] || PAGE_TITLES.overview;
    $("#sidebar").classList.remove("open");
  }

  function init() {
    renderDate();
    $$(".nav button").forEach((b) => b.addEventListener("click", () => showPage(b.dataset.page)));
    $("#menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
