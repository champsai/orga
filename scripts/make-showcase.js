// Draws the showcase pictures for ORCA's past work (public/showcase/*.svg).
// Each scene is generated from simple shapes with a fixed random seed, so the
// pictures are reproducible: `node scripts/make-showcase.js`.
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("public/showcase");
const W = 1600, H = 1000;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const R = (a, b) => a + rnd() * (b - a);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const f = (x) => Math.round(x * 10) / 10;

const lg = (id, stops, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
const rg = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</radialGradient>`;
const COMMON = `
  <filter id="b3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="b20" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="20"/></filter>
  <filter id="b60" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.07 0"/></filter>
  ${rg("vig", [[0.55, "#000", 0], [1, "#000", 0.55]], 0.5, 0.5, 0.75)}`;
const svg = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img">
<defs>${COMMON}${defs}</defs>
${body}
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.6"/>
</svg>`;

// ---------------------------------------------------------------- building blocks
function bokeh(n, { x0 = 0, x1 = W, y0 = 0, y1 = H, r0 = 6, r1 = 30, colors, op = [0.15, 0.5], blur = "b8" }) {
  let s = "";
  for (let i = 0; i < n; i++) s += `<circle cx="${f(R(x0, x1))}" cy="${f(R(y0, y1))}" r="${f(R(r0, r1))}" fill="${pick(colors)}" opacity="${f(R(...op) * 100) / 100}"/>`;
  return `<g filter="url(#${blur})">${s}</g>`;
}
function stars(n, y1 = H * 0.5, color = "#fff") {
  let s = "";
  for (let i = 0; i < n; i++) s += `<circle cx="${f(R(0, W))}" cy="${f(R(0, y1))}" r="${f(R(0.6, 2.2))}" fill="${color}" opacity="${f(R(0.3, 1) * 100) / 100}"/>`;
  return s;
}
const cat = (x1, y1, x2, y2, sag, t) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + sag * 4 * t * (1 - t)];
function lights(x1, y1, x2, y2, sag, count, { color = "#ffd27a", core = "#fff6dc", wire = "#2a1a12", r = 4 } = {}) {
  let d = "M" + Array.from({ length: 41 }, (_, i) => cat(x1, y1, x2, y2, sag, i / 40).map(f).join(",")).join(" L");
  let glow = "", cores = "";
  for (let i = 1; i < count; i++) {
    const [x, y] = cat(x1, y1, x2, y2, sag, i / count);
    glow += `<circle cx="${f(x)}" cy="${f(y + r * 2)}" r="${r * 4}" fill="${color}" opacity="0.45"/>`;
    cores += `<circle cx="${f(x)}" cy="${f(y + r * 2)}" r="${r}" fill="${core}"/>`;
  }
  return `<path d="${d}" stroke="${wire}" stroke-width="1.6" fill="none" opacity="0.8"/><g filter="url(#b8)">${glow}</g>${cores}`;
}
function skyline(baseY, { h0 = 80, h1 = 320, color = "#1d1530", win = "#ffd9a0", winOp = 0.55, x0 = 0, x1 = W } = {}) {
  let s = "", x = x0;
  while (x < x1) {
    const w = R(40, 120), h = R(h0, h1);
    s += `<rect x="${f(x)}" y="${f(baseY - h)}" width="${f(w)}" height="${f(h + 4)}" fill="${color}"/>`;
    if (rnd() > 0.7) s += `<rect x="${f(x + w / 2 - 2)}" y="${f(baseY - h - R(20, 60))}" width="3" height="60" fill="${color}"/>`;
    for (let wy = baseY - h + 12; wy < baseY - 10; wy += 16) for (let wx = x + 8; wx < x + w - 10; wx += 14) if (rnd() > 0.6) s += `<rect x="${f(wx)}" y="${f(wy)}" width="5" height="7" fill="${win}" opacity="${f(R(0.2, winOp) * 100) / 100}"/>`;
    x += w + R(0, 8);
  }
  return s;
}
function crowd(baseY, n, { color = "#120c18", s0 = 0.8, s1 = 1.2, x0 = 0, x1 = W, hands = 0 } = {}) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const x = R(x0, x1), k = R(s0, s1), y = baseY + R(-10, 20) * k;
    s += `<circle cx="${f(x)}" cy="${f(y - 58 * k)}" r="${f(13 * k)}" fill="${color}"/>`;
    s += `<path d="M${f(x - 26 * k)},${f(y + 30)} Q${f(x - 24 * k)},${f(y - 40 * k)} ${f(x)},${f(y - 42 * k)} Q${f(x + 24 * k)},${f(y - 40 * k)} ${f(x + 26 * k)},${f(y + 30)} Z" fill="${color}"/>`;
    if (rnd() < hands) s += `<path d="M${f(x + 16 * k)},${f(y - 32 * k)} Q${f(x + 30 * k)},${f(y - 60 * k)} ${f(x + 26 * k)},${f(y - 92 * k)}" stroke="${color}" stroke-width="${f(7 * k)}" fill="none" stroke-linecap="round"/><circle cx="${f(x + 26 * k)}" cy="${f(y - 94 * k)}" r="${f(5 * k)}" fill="${color}"/>`;
  }
  return s;
}
function candle(x, y, k = 1, { body = "#f6eee0", flame = "#ffcf6b" } = {}) {
  return `<rect x="${f(x - 3 * k)}" y="${f(y - 22 * k)}" width="${f(6 * k)}" height="${f(22 * k)}" rx="1" fill="${body}"/>
    <circle cx="${f(x)}" cy="${f(y - 28 * k)}" r="${f(16 * k)}" fill="${flame}" opacity="0.35" filter="url(#b8)"/>
    <ellipse cx="${f(x)}" cy="${f(y - 28 * k)}" rx="${f(2.6 * k)}" ry="${f(6 * k)}" fill="#fff4cf"/>`;
}
function flowers(cx, cy, n, spread, colors, r0 = 6, r1 = 14) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = R(0, Math.PI * 2), d = R(0, spread);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.55, r = R(r0, r1);
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${pick(colors)}"/><circle cx="${f(x - r * 0.25)}" cy="${f(y - r * 0.25)}" r="${f(r * 0.4)}" fill="#fff" opacity="0.35"/>`;
  }
  return s;
}
function table(cx, y, w, { cloth = "#f3ece2", shade = "#d8cbbb", candles = 6, flowerColors = ["#ffffff", "#f6d6d6", "#e9c9a8"], k = 1 } = {}) {
  let s = `<ellipse cx="${f(cx)}" cy="${f(y + 26 * k)}" rx="${f(w / 2 + 8)}" ry="${f(9 * k)}" fill="#000" opacity="0.25" filter="url(#b8)"/>
    <path d="M${f(cx - w / 2)},${f(y)} L${f(cx + w / 2)},${f(y)} L${f(cx + w / 2 + 6 * k)},${f(y + 24 * k)} L${f(cx - w / 2 - 6 * k)},${f(y + 24 * k)} Z" fill="${cloth}"/>
    <rect x="${f(cx - w / 2 - 6 * k)}" y="${f(y + 18 * k)}" width="${f(w + 12 * k)}" height="${f(6 * k)}" fill="${shade}"/>`;
  for (let i = 0; i < candles; i++) {
    const x = cx - w / 2 + (w / (candles + 1)) * (i + 1);
    s += i % 2 ? flowers(x, y - 6 * k, 5, 14 * k, flowerColors, 4 * k, 8 * k) : candle(x, y, k * 0.9);
  }
  return s;
}

// ---------------------------------------------------------------- scenes
const scenes = {};

scenes["rooftop-glow"] = () => {
  seed = 11;
  const defs = lg("sky", [[0, "#2b1b4d"], [0.35, "#7c3f78"], [0.62, "#e9796a"], [0.8, "#ffb37a"], [1, "#ffd9a6"]])
    + rg("sun", [[0, "#fff3c9"], [0.3, "#ffd28a", 0.8], [1, "#ff9a6b", 0]])
    + lg("glass", [[0, "#fff1d6", 0.55], [1, "#ffb878", 0.25]])
    + lg("deck", [[0, "#3d3a2c"], [0.4, "#232a1c"], [1, "#0f120c"]]) + rg("floorglow", [[0, "#ffc978", 0.45], [1, "#ffc978", 0]]);
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>
    <circle cx="1120" cy="560" r="380" fill="url(#sun)"/>
    ${stars(90, 260)}
    <g opacity="0.95">${skyline(640, { color: "#3b2347", win: "#ffd59a", h0: 60, h1: 240 })}</g>
    <g>${skyline(700, { color: "#24152c", win: "#ffcf8f", h0: 40, h1: 170, winOp: 0.8 })}</g>
    <rect y="690" width="${W}" height="310" fill="url(#deck)"/><ellipse cx="520" cy="820" rx="620" ry="170" fill="url(#floorglow)"/>
    <!-- glass pavilion -->
    <g transform="translate(980,410)">
      <path d="M0,290 L0,90 L170,0 L340,90 L340,290 Z" fill="url(#glass)"/>
      <circle cx="170" cy="190" r="170" fill="#ffcf8a" opacity="0.5" filter="url(#b60)"/>
      ${[0, 68, 136, 204, 272, 340].map((x) => `<line x1="${x}" y1="${x <= 170 ? 90 - x * 0.53 : (x - 170) * 0.53}" x2="${x}" y2="290" stroke="#fbe6c8" stroke-width="2" opacity="0.7"/>`).join("")}
      <path d="M0,90 L170,0 L340,90" stroke="#fff3df" stroke-width="3" fill="none"/>
      <line x1="0" y1="190" x2="340" y2="190" stroke="#fbe6c8" stroke-width="1.5" opacity="0.6"/>
      ${flowers(170, 260, 40, 120, ["#fff", "#f7d8d4", "#f2c1b6", "#cfe3c2"], 5, 11)}
    </g>`;
  // festoon canopy over the lawn
  for (let i = 0; i < 6; i++) b += lights(-40, 360 + i * 22, 1000 + i * 40, 420 + i * 30, 120 + i * 18, 22, { color: "#ffcc72" });
  for (let i = 0; i < 4; i++) b += lights(200 + i * 140, 330, 1640, 470 + i * 26, 90, 24, { color: "#ffd890" });
  b += crowd(752, 9, { color: "#1b0f1f", x0: 170, x1: 690, s0: 0.62, s1: 0.72 }) + table(430, 760, 560, { candles: 9 });
  b += crowd(852, 10, { color: "#160b19", x0: 180, x1: 860, s0: 0.78, s1: 0.9 }) + table(520, 860, 720, { candles: 11, k: 1.2 });
  b += `<g>${flowers(70, 700, 70, 120, ["#fff", "#f7d8d4", "#e7b8a7", "#bcd6ae", "#8fb48a"], 8, 18)}</g>`;
  b += `<path d="M20,980 C40,780 120,640 260,620" stroke="#8fb48a" stroke-width="10" fill="none"/>${flowers(260, 610, 40, 70, ["#fff", "#f7d8d4", "#f2c1b6"], 7, 14)}`;
  b += bokeh(50, { y0: 300, y1: 700, colors: ["#ffd28a", "#ffb37a", "#fff1d6"], r0: 8, r1: 34, op: [0.15, 0.45] });
  return svg(defs, b);
};

scenes["velvet-whiskers"] = () => {
  seed = 23;
  const defs = lg("room", [[0, "#12051f"], [0.6, "#3a0f4f"], [1, "#5b1b5e"]])
    + rg("moon", [[0, "#fff7dd"], [0.55, "#f5d78e"], [1, "#c8973c"]])
    + rg("moonglow", [[0, "#ffe3a3", 0.7], [1, "#ffe3a3", 0]])
    + lg("drape", [[0, "#6b1d5f"], [0.5, "#9b2f7d"], [1, "#4a1144"]], 1, 0)
    + lg("gold", [[0, "#fff1b8"], [0.5, "#e2b04a"], [1, "#9c6a1e"]]);
  let b = `<rect width="${W}" height="${H}" fill="url(#room)"/>${stars(140, 600, "#ffe8b0")}
    <circle cx="800" cy="360" r="330" fill="url(#moonglow)"/>
    <circle cx="800" cy="360" r="210" fill="url(#moon)"/>
    <circle cx="730" cy="300" r="26" fill="#d9b25e" opacity="0.5"/><circle cx="870" cy="410" r="38" fill="#d9b25e" opacity="0.4"/><circle cx="840" cy="270" r="14" fill="#d9b25e" opacity="0.5"/>
    <!-- cat sitting on the moon -->
    <path d="M760,168 L772,128 L792,156 Q800,152 808,156 L828,128 L840,168 Q852,190 846,214 Q900,240 900,300 Q900,330 870,336 L730,336 Q700,330 700,300 Q700,240 754,214 Q748,190 760,168 Z" fill="#1a0a24"/>
    <path d="M880,320 Q960,330 950,250 Q945,215 925,225" stroke="#1a0a24" stroke-width="16" fill="none" stroke-linecap="round"/>
    <circle cx="785" cy="186" r="5" fill="#ffd36b"/><circle cx="815" cy="186" r="5" fill="#ffd36b"/>
    <path d="M770,100 l14,-34 l14,22 l14,-26 l14,26 l14,-22 l14,34 Z" fill="url(#gold)" transform="translate(-14,40) scale(1)"/>`;
  // drapes
  for (const side of [0, 1]) for (let i = 0; i < 7; i++) {
    const x = side ? W - 40 - i * 46 : 40 + i * 46, sw = side ? -1 : 1;
    b += `<path d="M${x - 40 * sw},-10 Q${x + 40 * sw},${300 + i * 20} ${x - 10 * sw},${H + 10} L${x + 30 * sw},${H + 10} Q${x + 70 * sw},${320 + i * 25} ${x + 10 * sw},-10 Z" fill="url(#drape)" opacity="${0.75 + i * 0.03}"/>`;
  }
  // chandeliers
  for (const [cx, k] of [[420, 1], [1180, 1], [800, 0.7]]) {
    b += `<line x1="${cx}" y1="0" x2="${cx}" y2="${90 * k}" stroke="#d6a94a" stroke-width="2"/>`;
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9 - r * 2; i++) {
      const x = cx + (i - (8 - r * 2) / 2) * 16 * k, y = (100 + r * 26) * k + Math.abs(i - (8 - r * 2) / 2) * -3;
      b += `<line x1="${x}" y1="${y - 14}" x2="${x}" y2="${y}" stroke="#e6c27a" stroke-width="1" opacity="0.6"/><path d="M${x},${y} l4,8 l-4,10 l-4,-10 Z" fill="#fff5dc" opacity="0.9"/>`;
    }
    b += `<circle cx="${cx}" cy="${140 * k}" r="${90 * k}" fill="#ffe2a0" opacity="0.35" filter="url(#b20)"/>`;
  }
  // cake + table
  b += `<ellipse cx="800" cy="785" rx="300" ry="34" fill="#4a1652"/><path d="M500,785 Q800,830 1100,785 L1150,1000 L450,1000 Z" fill="url(#drape)"/><path d="M500,785 Q800,830 1100,785" stroke="url(#gold)" stroke-width="6" fill="none"/>${[0,1,2,3,4,5,6,7,8].map((i) => `<path d="M${520 + i * 70},${800 + Math.sin(i) * 4} q8,40 -6,${200}" stroke="#2e0a35" stroke-width="3" fill="none" opacity="0.5"/>`).join("")}
    <rect x="690" y="700" width="220" height="80" rx="10" fill="#f7e6ff"/><rect x="720" y="630" width="160" height="72" rx="10" fill="#efd3ff"/><rect x="750" y="575" width="100" height="58" rx="10" fill="#e5bfff"/>
    <path d="M760,575 L770,545 L785,575 Z M815,575 L830,545 L840,575 Z" fill="#e5bfff"/>
    <path d="M690,722 Q745,742 800,722 Q855,742 910,722" stroke="url(#gold)" stroke-width="6" fill="none"/><path d="M720,650 Q760,668 800,650 Q840,668 880,650" stroke="url(#gold)" stroke-width="5" fill="none"/>
    ${candle(800, 545, 1.2)}
    ${flowers(600, 770, 26, 50, ["#ffd36b", "#f4b6e6", "#fff"], 6, 12)}${flowers(1000, 770, 26, 50, ["#ffd36b", "#f4b6e6", "#fff"], 6, 12)}`;
  // gold balloons
  for (let i = 0; i < 14; i++) {
    const x = R(160, 1440), y = R(420, 700), r = R(26, 46);
    if (x > 560 && x < 1040 && y > 520) continue;
    b += `<line x1="${f(x)}" y1="${f(y + r)}" x2="${f(x + R(-20, 20))}" y2="${f(y + r + 160)}" stroke="#e6c27a" stroke-width="1" opacity="0.6"/><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 0.86)}" ry="${f(r)}" fill="url(#gold)"/><ellipse cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.4)}" rx="${f(r * 0.18)}" ry="${f(r * 0.3)}" fill="#fff" opacity="0.6"/>`;
  }
  // confetti
  for (let i = 0; i < 160; i++) b += `<rect x="${f(R(0, W))}" y="${f(R(0, H))}" width="${f(R(4, 10))}" height="${f(R(2, 5))}" fill="${pick(["#ffd36b", "#f4b6e6", "#fff", "#c9a2ff"])}" transform="rotate(${f(R(0, 180))} ${f(R(0, W))} ${f(R(0, H))})" opacity="0.8"/>`;
  b += bokeh(40, { colors: ["#ffd36b", "#f4b6e6", "#c9a2ff"], r0: 10, r1: 40, op: [0.1, 0.35] });
  return svg(defs, b);
};

scenes["deep-blue-launch"] = () => {
  seed = 37;
  const defs = lg("sea", [[0, "#02122b"], [0.55, "#05345a"], [1, "#0b6f8a"]])
    + lg("ray", [[0, "#9ff3ff", 0.35], [1, "#9ff3ff", 0]])
    + rg("jelly", [[0, "#ffffff", 0.95], [0.4, "#ff9be8", 0.75], [1, "#7a5cff", 0.15]], 0.5, 0.35, 0.7)
    + rg("jelly2", [[0, "#ffffff", 0.95], [0.4, "#7ff7ff", 0.7], [1, "#2e7bff", 0.15]], 0.5, 0.35, 0.7)
    + lg("stage", [[0, "#0d4b6b"], [1, "#021626"]])
    + lg("bottle", [[0, "#e9fbff"], [0.5, "#9fe7ff"], [1, "#3fb3e6"]], 1, 0);
  let b = `<rect width="${W}" height="${H}" fill="url(#sea)"/>`;
  for (let i = 0; i < 9; i++) { const x = R(100, 1500); b += `<polygon points="${f(x - 30)},0 ${f(x + 30)},0 ${f(x + R(80, 220))},${H} ${f(x - R(80, 220))},${H}" fill="url(#ray)" opacity="${f(R(0.25, 0.6) * 100) / 100}"/>`; }
  b += bokeh(120, { colors: ["#bff8ff", "#ffffff", "#7fe0ff"], r0: 2, r1: 10, op: [0.2, 0.7], blur: "b3" });
  // jellyfish lanterns
  for (let i = 0; i < 11; i++) {
    const x = R(80, 1520), y = R(90, 470), r = R(38, 92), g = rnd() > 0.5 ? "jelly" : "jelly2";
    b += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 1.8)}" fill="${g === "jelly" ? "#ff9be8" : "#7ff7ff"}" opacity="0.18" filter="url(#b20)"/>`;
    b += `<path d="M${f(x - r)},${f(y)} Q${f(x - r)},${f(y - r * 1.1)} ${f(x)},${f(y - r * 1.1)} Q${f(x + r)},${f(y - r * 1.1)} ${f(x + r)},${f(y)} Q${f(x)},${f(y + r * 0.25)} ${f(x - r)},${f(y)} Z" fill="url(#${g})"/>`;
    for (let t = 0; t < 7; t++) { const tx = x - r * 0.8 + t * (r * 1.6) / 6; b += `<path d="M${f(tx)},${f(y + 4)} q${f(R(-14, 14))},${f(r * 0.6)} ${f(R(-6, 6))},${f(r * 1.2)} t${f(R(-10, 10))},${f(r * 1.1)}" stroke="${g === "jelly" ? "#ffc6f2" : "#b4fbff"}" stroke-width="2" fill="none" opacity="0.7"/>`; }
  }
  // stage + bottle
  b += `<ellipse cx="800" cy="780" rx="520" ry="70" fill="#7ff7ff" opacity="0.25" filter="url(#b20)"/>
    <path d="M300,780 L1300,780 L1600,1000 L0,1000 Z" fill="url(#stage)"/>
    <ellipse cx="800" cy="780" rx="500" ry="40" fill="none" stroke="#9ff3ff" stroke-width="3" opacity="0.8"/>
    <circle cx="800" cy="600" r="230" fill="#9ff3ff" opacity="0.28" filter="url(#b60)"/>
    <rect x="745" y="500" width="110" height="260" rx="28" fill="url(#bottle)"/>
    <rect x="770" y="455" width="60" height="55" rx="8" fill="#e9fbff"/><rect x="760" y="430" width="80" height="30" rx="8" fill="#0b2a44"/>
    <rect x="760" y="590" width="80" height="60" rx="6" fill="#ffffff" opacity="0.85"/><rect x="772" y="604" width="56" height="6" rx="3" fill="#2e7bff"/><rect x="772" y="618" width="40" height="4" rx="2" fill="#7aa8d6"/>
    <rect x="760" y="520" width="14" height="210" rx="7" fill="#fff" opacity="0.55"/>`;
  b += crowd(955, 26, { color: "#010a15", s0: 1.1, s1: 1.5, hands: 0.25 });
  return svg(defs, b);
};

scenes["neon-90s"] = () => {
  seed = 51;
  const defs = lg("sky", [[0, "#0b0326"], [0.5, "#3a0b5c"], [0.78, "#ff3d81"], [1, "#ffb15c"]])
    + lg("sunv", [[0, "#ffe46b"], [0.5, "#ff7a59"], [1, "#ff2e88"]])
    + lg("river", [[0, "#2a0a45"], [1, "#07021a"]])
    + `<clipPath id="sunclip"><circle cx="800" cy="560" r="230"/></clipPath>`
    + `<filter id="neon" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>${stars(120, 380)}
    <g clip-path="url(#sunclip)"><rect x="560" y="320" width="480" height="480" fill="url(#sunv)"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="560" y="${600 + i * 26}" width="480" height="${4 + i * 2.6}" fill="#3a0b5c"/>`).join("")}</g>
    <circle cx="800" cy="560" r="300" fill="#ff5c9d" opacity="0.25" filter="url(#b60)"/>
    ${skyline(660, { color: "#16062b", win: "#ff9ad5", h0: 60, h1: 260 })}
    <rect y="660" width="${W}" height="340" fill="url(#river)"/>`;
  for (let i = 0; i < 70; i++) { const y = R(670, 990), x = R(0, W); b += `<rect x="${f(x)}" y="${f(y)}" width="${f(R(30, 160))}" height="${f(R(1.5, 4))}" fill="${pick(["#ff5ca8", "#ffd36b", "#5ce1ff", "#b56bff"])}" opacity="${f(R(0.2, 0.7) * 100) / 100}"/>`; }
  // neon signs
  const sign = (x, y, w, h, color, txt, size) => `<g filter="url(#neon)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="none" stroke="${color}" stroke-width="5"/>
    <text x="${x + w / 2}" y="${y + h / 2 + size * 0.35}" text-anchor="middle" font-family="Leelawadee UI, Tahoma, Noto Sans Thai, sans-serif" font-weight="700" font-size="${size}" fill="${color}">${txt}</text></g>`;
  b += sign(110, 150, 330, 130, "#ff4fa3", "คิดถึงนะ", 64) + sign(1150, 120, 360, 120, "#5ce1ff", "ORCA 1997", 56) + sign(1240, 300, 230, 90, "#ffd36b", "ราตรีสวัสดิ์", 40) + sign(150, 330, 200, 80, "#b56bff", "♥ 90s", 40);
  // rooftop railing + bulbs + crowd
  b += lights(-40, 560, 820, 600, 120, 26, { color: "#ff7ac1", core: "#ffe3f3", wire: "#1a0630" }) + lights(780, 600, 1640, 540, 120, 26, { color: "#ffd36b", core: "#fff6d6", wire: "#1a0630" });
  b += `<rect y="860" width="${W}" height="10" fill="#0e0320"/>${Array.from({ length: 41 }, (_, i) => `<rect x="${i * 40}" y="860" width="6" height="140" fill="#0e0320"/>`).join("")}`;
  b += crowd(900, 22, { color: "#08021a", s0: 1, s1: 1.4, hands: 0.3 });
  b += bokeh(40, { y0: 500, y1: 900, colors: ["#ff5ca8", "#5ce1ff", "#ffd36b"], r0: 8, r1: 26, op: [0.15, 0.4] });
  return svg(defs, b);
};

scenes["quiet-library"] = () => {
  seed = 64;
  const defs = lg("wall", [[0, "#1c0f08"], [1, "#3a2414"]])
    + rg("warm", [[0, "#ffcf7a", 0.6], [1, "#ffcf7a", 0]])
    + lg("tbl", [[0, "#5a3620"], [1, "#2a160b"]]);
  let b = `<rect width="${W}" height="${H}" fill="url(#wall)"/>`;
  // bookshelves
  const books = ["#7a1f1f", "#2d4a3a", "#3b3f6b", "#8a5a2b", "#5e2a4f", "#c39b5a", "#1f3550", "#6b2a1a"];
  for (let row = 0; row < 7; row++) {
    const y = 60 + row * 92;
    b += `<rect x="0" y="${y + 80}" width="${W}" height="12" fill="#2a170b"/>`;
    let x = 0;
    while (x < W) {
      const w = R(10, 24), h = R(52, 78);
      b += `<rect x="${f(x)}" y="${f(y + 80 - h)}" width="${f(w)}" height="${f(h)}" fill="${pick(books)}" opacity="0.9"/>`;
      if (rnd() > 0.6) b += `<rect x="${f(x + 2)}" y="${f(y + 80 - h + 10)}" width="${f(w - 4)}" height="3" fill="#d9b46a" opacity="0.7"/>`;
      x += w + (rnd() > 0.93 ? R(20, 60) : 1);
    }
  }
  for (const x of [380, 800, 1220]) b += `<rect x="${x - 14}" y="0" width="28" height="${H}" fill="#24130a"/>`;
  b += `<rect width="${W}" height="${H}" fill="#120804" opacity="0.35"/><ellipse cx="800" cy="720" rx="900" ry="380" fill="url(#warm)"/>`;
  // floating candles
  for (let i = 0; i < 46; i++) b += candle(R(60, 1540), R(110, 520), R(0.8, 1.5));
  // long table
  b += `<path d="M120,820 L1480,820 L1600,1000 L0,1000 Z" fill="url(#tbl)"/><path d="M220,800 L1380,800 L1480,850 L120,850 Z" fill="#efe4cf"/>`;
  for (let i = 0; i < 26; i++) { const x = 250 + i * 44; b += candle(x, 812, 1.2); if (i % 3 === 0) b += flowers(x + 20, 806, 6, 14, ["#7a1f1f", "#e8d3b0", "#b5523b"], 4, 8); }
  b += crowd(900, 10, { color: "#0d0603", x0: 60, x1: 360, s0: 1.2, s1: 1.4 }) + crowd(900, 10, { color: "#0d0603", x0: 1240, x1: 1560, s0: 1.2, s1: 1.4 });
  b += bokeh(60, { colors: ["#ffcf7a", "#ffe4b0"], r0: 6, r1: 22, op: [0.2, 0.5] });
  return svg(defs, b);
};

scenes["lantern-tide"] = () => {
  seed = 78;
  const defs = lg("sky", [[0, "#10203f"], [0.45, "#3f4f8a"], [0.7, "#d9789a"], [0.86, "#ffb07a"], [1, "#ffd9a0"]])
    + lg("sea", [[0, "#ffb98a"], [0.15, "#a0688a"], [1, "#0d1a33"]])
    + lg("walk", [[0, "#c79a6a"], [1, "#5b3a22"]])
    + rg("lan", [[0, "#fff4d0"], [0.5, "#ffc35c"], [1, "#ff8a3c", 0.2]]);
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>${stars(80, 300)}
    <circle cx="800" cy="545" r="90" fill="#ffe6b0"/><circle cx="800" cy="545" r="260" fill="#ffc890" opacity="0.4" filter="url(#b60)"/>
    <rect y="560" width="${W}" height="440" fill="url(#sea)"/>`;
  for (let i = 0; i < 90; i++) { const y = R(565, 990), w = R(20, 200) * (y / 600); b += `<rect x="${f(R(0, W))}" y="${f(y)}" width="${f(w)}" height="${f(R(1, 3))}" fill="#ffe1b8" opacity="${f(R(0.1, 0.5) * 100) / 100}"/>`; }
  // floating boardwalk in perspective
  b += `<polygon points="770,575 830,575 1180,1000 420,1000" fill="url(#walk)"/>`;
  for (let i = 0; i < 18; i++) { const t = i / 17, y = 575 + 425 * t * t; b += `<line x1="${f(800 - 30 - 350 * t * t)}" y1="${f(y)}" x2="${f(800 + 30 + 350 * t * t)}" y2="${f(y)}" stroke="#3a2414" stroke-width="${f(1 + 3 * t)}" opacity="0.5"/>`; }
  for (let i = 1; i < 9; i++) {
    const t = i / 9, y = 575 + 425 * t * t, h = 30 + 150 * t * t;
    for (const s of [-1, 1]) { const x = 800 + s * (40 + 360 * t * t); b += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x)}" y2="${f(y - h)}" stroke="#2a1a10" stroke-width="${f(2 + 4 * t)}"/><circle cx="${f(x)}" cy="${f(y - h)}" r="${f(6 + 26 * t)}" fill="url(#lan)"/><circle cx="${f(x)}" cy="${f(y - h)}" r="${f(18 + 60 * t)}" fill="#ffc35c" opacity="0.3" filter="url(#b20)"/>`; }
  }
  // flower arch at the end of the walk
  b += `<path d="M760,575 Q760,500 800,495 Q840,500 840,575" stroke="#f7e3d0" stroke-width="5" fill="none"/>${flowers(800, 505, 30, 40, ["#fff", "#ffd1dc", "#ffe6a8"], 3, 6)}`;
  // sky lanterns
  for (let i = 0; i < 60; i++) {
    const x = R(0, W), y = R(40, 520), s = R(6, 22) * (1 - y / 900);
    b += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 2.4)}" fill="#ffb25c" opacity="0.35" filter="url(#b8)"/><path d="M${f(x - s * 0.7)},${f(y - s)} L${f(x + s * 0.7)},${f(y - s)} L${f(x + s * 0.5)},${f(y + s)} L${f(x - s * 0.5)},${f(y + s)} Z" fill="url(#lan)"/>`;
  }
  b += crowd(980, 6, { color: "#120a0a", x0: 600, x1: 1000, s0: 1.3, s1: 1.6 });
  return svg(defs, b);
};

scenes["aurora-summit"] = () => {
  seed = 91;
  const defs = lg("sky", [[0, "#020414"], [0.6, "#071433"], [1, "#0d1f4a"]])
    + lg("aur1", [[0, "#3dffb5", 0], [0.3, "#3dffb5", 0.7], [0.7, "#7a5cff", 0.6], [1, "#ff5cd6", 0]], 1, 0)
    + lg("aur2", [[0, "#5cc8ff", 0], [0.4, "#5cc8ff", 0.6], [1, "#b56bff", 0]], 1, 0)
    + lg("led", [[0, "#3dffb5"], [0.5, "#5cc8ff"], [1, "#b56bff"]], 1, 0)
    + lg("floor", [[0, "#0b1430"], [1, "#01030c"]]);
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>${stars(120, 420)}`;
  // aurora ribbons
  for (let i = 0; i < 5; i++) {
    const y = 120 + i * 55, a = R(40, 110);
    b += `<path d="M-100,${y} C300,${y - a} 600,${y + a} 900,${y} S1400,${y - a} 1700,${y + 20}" stroke="url(#${i % 2 ? "aur2" : "aur1"})" stroke-width="${f(R(50, 110))}" fill="none" opacity="${f(R(0.35, 0.6) * 100) / 100}" filter="url(#b20)"/>`;
  }
  // lasers from the stage
  for (let i = 0; i < 22; i++) {
    const x = R(-200, 1800), col = pick(["#3dffb5", "#5cc8ff", "#ff5cd6", "#b56bff"]);
    b += `<line x1="800" y1="600" x2="${f(x)}" y2="${f(R(-50, 200))}" stroke="${col}" stroke-width="${f(R(1.5, 4))}" opacity="0.5" filter="url(#b3)"/><line x1="800" y1="600" x2="${f(x)}" y2="${f(R(-50, 200))}" stroke="#fff" stroke-width="1" opacity="0.35"/>`;
  }
  // LED arch stage
  b += `<ellipse cx="800" cy="640" rx="620" ry="120" fill="#5cc8ff" opacity="0.18" filter="url(#b60)"/>
    <path d="M300,700 L300,430 Q300,250 800,250 Q1300,250 1300,430 L1300,700" stroke="url(#led)" stroke-width="26" fill="none" filter="url(#b8)" opacity="0.8"/>
    <path d="M300,700 L300,430 Q300,250 800,250 Q1300,250 1300,430 L1300,700" stroke="url(#led)" stroke-width="10" fill="none"/>
    <rect x="420" y="360" width="760" height="300" rx="14" fill="#06102a" stroke="#5cc8ff" stroke-width="3" opacity="0.95"/>
    <path d="M440,560 C560,420 660,600 780,470 S1000,420 1160,520" stroke="url(#led)" stroke-width="8" fill="none" filter="url(#b3)"/>
    <circle cx="800" cy="470" r="70" fill="none" stroke="#3dffb5" stroke-width="4" opacity="0.8"/><circle cx="800" cy="470" r="40" fill="#3dffb5" opacity="0.25" filter="url(#b8)"/>
    <path d="M200,700 L1400,700 L1600,1000 L0,1000 Z" fill="url(#floor)"/>
    <rect x="780" y="620" width="40" height="80" rx="4" fill="#0a1a3a" stroke="#5cc8ff" stroke-width="1.5"/>
    <circle cx="800" cy="575" r="14" fill="#01030c"/><path d="M780,620 Q780,590 800,590 Q820,590 820,620 Z" fill="#01030c"/>`;
  // phone lights + crowd
  b += crowd(880, 30, { color: "#01030c", s0: 0.9, s1: 1.2, hands: 0.15 }) + crowd(960, 26, { color: "#000", s0: 1.3, s1: 1.6, hands: 0.1 });
  for (let i = 0; i < 40; i++) { const x = R(0, W), y = R(780, 900); b += `<rect x="${f(x)}" y="${f(y)}" width="6" height="10" rx="1.5" fill="#e8f6ff"/><circle cx="${f(x + 3)}" cy="${f(y + 5)}" r="14" fill="#9fe7ff" opacity="0.35" filter="url(#b8)"/>`; }
  b += bokeh(40, { y0: 200, y1: 700, colors: ["#3dffb5", "#5cc8ff", "#ff5cd6"], r0: 4, r1: 16, op: [0.2, 0.5], blur: "b3" });
  return svg(defs, b);
};

scenes["umbrella-night"] = () => {
  seed = 105;
  const defs = lg("sky", [[0, "#1a1240"], [0.5, "#6b2a6b"], [0.8, "#e0654f"], [1, "#ffb066"]])
    + lg("ground", [[0, "#3a1d22"], [1, "#120709"]])
    + rg("stall", [[0, "#ffd58a", 0.9], [1, "#ff9a3c", 0]]);
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>${stars(60, 260)}
    <path d="M0,560 Q200,470 420,520 T900,500 T1600,530 L1600,640 L0,640 Z" fill="#2a1430" opacity="0.8"/>
    <rect y="620" width="${W}" height="380" fill="url(#ground)"/>`;
  // food stalls with warm windows
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 180, w = 150;
    b += `<rect x="${x}" y="560" width="${w}" height="120" fill="#1d0c12"/><path d="M${x - 10},560 L${x + w / 2},520 L${x + w + 10},560 Z" fill="${pick(["#8a1f2b", "#a33a1c", "#6b1d4a"])}"/>
      <rect x="${x + 12}" y="585" width="${w - 24}" height="50" rx="4" fill="#ffcf7a" opacity="0.85"/><ellipse cx="${x + w / 2}" cy="610" rx="${w}" ry="70" fill="url(#stall)" opacity="0.6"/>`;
  }
  b += lights(-40, 470, 1640, 470, 90, 50, { color: "#ffcf6b", wire: "#2a1020" });
  // canopy of Bo Sang paper umbrellas, seen from below
  const cols = ["#e63946", "#f4a261", "#ffd166", "#2a9d8f", "#ef476f", "#ff7b54", "#9b5de5", "#06d6a0"];
  for (let i = 0; i < 46; i++) {
    const x = R(-60, 1660), y = R(-40, 420), r = R(50, 120) * (0.6 + y / 900), c = pick(cols);
    let spokes = "";
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; spokes += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + Math.cos(a) * r)}" y2="${f(y + Math.sin(a) * r * 0.62)}" stroke="#fff" stroke-width="1.2" opacity="0.35"/>`; }
    b += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 1.25)}" ry="${f(r * 0.8)}" fill="${c}" opacity="0.35" filter="url(#b20)"/>
      <ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 0.62)}" fill="${c}"/>
      <ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 0.72)}" ry="${f(r * 0.45)}" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.3"/>${spokes}
      <circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.08)}" fill="#3a1d10"/>`;
  }
  // red khom lanterns
  for (let i = 0; i < 14; i++) {
    const x = R(40, 1560), y = R(380, 520);
    b += `<line x1="${f(x)}" y1="${f(y - 60)}" x2="${f(x)}" y2="${f(y - 22)}" stroke="#2a1020" stroke-width="2"/><circle cx="${f(x)}" cy="${f(y)}" r="46" fill="#ff5a3c" opacity="0.4" filter="url(#b20)"/>
      <rect x="${f(x - 18)}" y="${f(y - 24)}" width="36" height="48" rx="14" fill="#e63946"/><rect x="${f(x - 18)}" y="${f(y - 24)}" width="36" height="6" fill="#ffd166"/><rect x="${f(x - 18)}" y="${f(y + 18)}" width="36" height="6" fill="#ffd166"/>`;
  }
  b += crowd(820, 26, { color: "#140608", s0: 0.9, s1: 1.2 }) + crowd(930, 18, { color: "#0a0304", s0: 1.3, s1: 1.6 });
  b += bokeh(50, { y0: 450, y1: 800, colors: ["#ffd166", "#ff7b54", "#ffcf7a"], r0: 6, r1: 22, op: [0.2, 0.5] });
  return svg(defs, b);
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, fn] of Object.entries(scenes)) {
  const out = fn();
  fs.writeFileSync(path.join(OUT, `${name}.svg`), out);
  console.log(`${name}.svg  ${Math.round(out.length / 1024)} KB`);
}
