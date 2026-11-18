/* Perspective "Market view" panel.
 * Loaded by index.html. Initialises Perspective the first time the Market view tab opens.
 * Uses DEMO rows only — swap `rows` for data from your own backend.
 */
import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer-datagrid/dist/cdn/perspective-viewer-datagrid.js";
import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer-charts/dist/cdn/perspective-viewer-charts.js";
import perspective from "https://cdn.jsdelivr.net/npm/@perspective-dev/client/dist/cdn/perspective.js";

const rows = [
  { symbol: "NVDA", sector: "Semis",    price: 142.68, change_pct:  1.82, volume: 212_400_000 },
  { symbol: "AMD",  sector: "Semis",    price: 164.20, change_pct: -0.43, volume:  48_900_000 },
  { symbol: "AAPL", sector: "Hardware", price: 228.15, change_pct:  0.56, volume:  51_300_000 },
  { symbol: "TSLA", sector: "Auto",     price: 338.90, change_pct: -1.12, volume:  93_700_000 },
  { symbol: "PLTR", sector: "Software", price: 108.35, change_pct:  2.07, volume:  66_800_000 },
];

const mount = document.getElementById("perspective-mount");
let started = false;

async function start() {
  if (started) return;
  started = true;

  mount.innerHTML = "<perspective-viewer></perspective-viewer>";
  const viewer = mount.querySelector("perspective-viewer");

  const worker = await perspective.worker();
  await worker.table(rows, { name: "market" });
  await viewer.load(worker);
  await viewer.restore({ table: "market", plugin: "Datagrid", theme: "Pro Dark" });
}

// Only spin up Perspective the first time the Market view tab is opened.
document.querySelector('.nav button[data-page="markets"]')
  .addEventListener("click", start);
