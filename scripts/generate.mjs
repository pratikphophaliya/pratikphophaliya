#!/usr/bin/env node
/* =========================================================================
   Redraws the profile README from live GitHub data.

   - Languages and stars come from the GitHub REST API.
   - The contribution calendar is read from the public contributions page.
   - Animals are the procedural samplers from ascii-animals-screensaver,
     baked into pixel frames and animated with SMIL (README images can't
     run JavaScript, but animated SVG plays).
   - Each run picks one look for the day: "blue" (butterflies) or
     "white" (cranes). Force one with LOOK=blue or LOOK=white.

   Usage: node scripts/generate.mjs        (GITHUB_TOKEN optional)
   ========================================================================= */

import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USER = "pratikphophaliya";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "assets");
const TOKEN = process.env.GITHUB_TOKEN;
const REPO_URL = (name) => `https://github.com/${USER}/${name}`;

/* ---------- content you might want to edit ---------- */

const LEDE =
  "I like knowing how things work underneath. So far that's meant a **[CPU ray tracer](" + REPO_URL("ray-tracer-cpp") +
  ")** and a **[spinning ASCII donut](" + REPO_URL("rotating-donut") + ")** in C++, a **[pixel-animal screensaver](" +
  REPO_URL("ascii-animals-screensaver") + ")** for Windows, a **[Codeforces note-taking extension](" + REPO_URL("NoteForces") +
  ")**, and a **[risk engine for India's crude oil supply](" + REPO_URL("Krude") + ")**.";

const FEATURED = [
  { repo: "ascii-animals-screensaver", desc: "Pixel animals wander across your desktop when you step away. A calm screensaver for Windows.", icons: ["javascript", "electron"] },
  { repo: "NoteForces", desc: "Highlight, draw and keep notes on Codeforces problems. Works offline, no account, no server.", icons: ["javascript", "chrome"] },
  { repo: "Krude", desc: "Live geopolitical risk scoring, disruption simulation and procurement rerouting for India's crude supply.", icons: ["python", "fastapi", "pandas"] },
  { repo: "ray-tracer-cpp", desc: "A CPU ray tracer built entirely from scratch in C++.", icons: ["cplusplus", "cmake"] },
];

const TOOLS = [
  { n: "Electron", i: "electron", p: "screensaver" },
  { n: "Chrome extensions", i: "chrome", p: "NoteForces" },
  { n: "Three.js", i: "threejs", p: "portfolio" },
  { n: "FastAPI", i: "fastapi", p: "Krude" },
  { n: "DuckDB", mk: "D", p: "Krude" },
  { n: "pandas", i: "pandas", p: "Krude" },
  { n: "PuLP", mk: "LP", p: "Krude" },
  { n: "Streamlit", i: "streamlit", p: "Chitthi" },
  { n: "CMake", i: "cmake", p: "ray tracer" },
  { n: "Win32 API", i: "windows11", p: "pong" },
  { n: "Git", i: "git", p: "everything" },
];

const LANG_ICON = { JavaScript: "javascript", Python: "python", HTML: "html5", CSS: "css3", TypeScript: "typescript", "C++": "cplusplus", Java: "java" };
const HIDE_LANGS = new Set(["CMake", "Makefile", "Batchfile", "PowerShell", "Shell", "Dockerfile"]);

/* ---------- looks ---------- */

const LOOKS = {
  blue: {
    name: "butterflies",
    page: "#0b1020", card: "#10172b", line: "#1f2c4d", text: "#e7eeff", muted: "#a6b3d4", faint: "#6f7fa6",
    accent: "#3287ff", title: "#8cc3ff",
    heroTop: [11, 16, 32], heroBot: [20, 34, 70], dots: "#4664aa",
    graphBg: "#10172b", empty: [24, 33, 60], lv: [[26, 56, 140], [36, 92, 206], [50, 135, 255], [150, 200, 255]],
    monoFilter: true,
  },
  white: {
    name: "cranes",
    page: "#f7f8fb", card: "#ffffff", line: "#e1e4ea", text: "#23262e", muted: "#5b606c", faint: "#8d929e",
    accent: "#de2a2a", title: "#de2a2a",
    heroTop: [236, 240, 246], heroBot: [250, 251, 253], dots: "#aab2c2",
    graphBg: "#ffffff", empty: [235, 238, 243], lv: [[204, 209, 220], [156, 163, 180], [96, 103, 120], [40, 43, 52]],
    monoFilter: false,
  },
};

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

/* ---------- small helpers ---------- */

const TAU = Math.PI * 2;
const sq = (x) => x * x;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const ell = (u, v, cu, cv, ru, rv) => sq((u - cu) / ru) + sq((v - cv) / rv);
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const rgb = (c) => "#" + c.map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, "0")).join("");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f1 = (x) => (Math.round(x * 10) / 10).toString();
const WHITE = [240, 244, 255];

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const today = new Date();
const DAY_KEY = today.toISOString().slice(0, 10);
const rng = mulberry(Number(DAY_KEY.replace(/-/g, "")));
const rand = (a = 0, b = 1) => a + rng() * (b - a);

function hash2(i, j, s) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi, s), hash2(xi + 1, yi, s), sx), lerp(hash2(xi, yi + 1, s), hash2(xi + 1, yi + 1, s), sx), sy);
}

/* ---------- samplers (from ascii-animals-screensaver/app/animals.js) ---------- */

const out = { r: 0, g: 0, b: 0, a: 1 };
function hit(c, a = 1, k = 1) { out.r = c[0] * k; out.g = c[1] * k; out.b = c[2] * k; out.a = a; return true; }

const SPECIES = {
  butterfly: {
    radius: 10, frames: 8,
    variants: [
      { wing: [50, 135, 255], inner: [24, 64, 170], edge: [12, 22, 56] },
      { wing: [92, 176, 255], inner: [38, 92, 200], edge: [16, 30, 70] },
      { wing: [42, 96, 236], inner: [20, 46, 140], edge: [10, 15, 46] },
    ],
    prep(e) { const c = 0.5 + 0.5 * Math.cos(e.phase); e.f = 0.14 + 0.86 * Math.pow(c, 0.75); },
    sample(u, v, e) {
      const av = Math.abs(v), P = e.pal;
      if (ell(u, v, 5.0, 0, 1.15, 1.0) < 1) return hit([44, 58, 100]);
      if (av < 0.7 && u > -5.2 && u < 4.4) return hit([52, 66, 112]);
      if (u > 5.8 && u < 9.3) { const cv = 0.45 + (u - 5.8) * 0.5; if (Math.abs(av - cv) < 0.5) return hit([150, 180, 240], 0.7); }
      if (av < 0.6) return false;
      const w = (av - 0.6) / e.f;
      const d1 = sq((u - 0.8 - 0.42 * w) / 3.7) + sq((w - 4.4) / 4.7);
      const d2 = sq((u + 3.1 + 0.15 * w) / 3.1) + sq((w - 3.3) / 3.7);
      const d = Math.min(d1, d2);
      if (d >= 1) return false;
      const shade = 0.58 + 0.42 * e.f;
      if (d > 0.7) { if (vnoise(u * 1.1 + 3, w * 1.1, e.seed) > 0.7) return hit(WHITE, 1, shade); return hit(P.edge, 1, shade); }
      const c = w < 1.3 ? P.inner : mix(P.inner, P.wing, clamp((w - 1.3) / 2.4, 0, 1));
      return hit(c, 1, Math.min(1.1, shade * 1.1));
    },
  },
  crane: {
    radius: 15, frames: 8,
    variants: [
      { white: [206, 212, 226], black: [36, 38, 46], feather: [70, 74, 88], crown: [222, 42, 42] },
      { white: [196, 203, 218], black: [40, 43, 52], feather: [78, 82, 96], crown: [210, 52, 52] },
      { white: [214, 219, 231], black: [48, 52, 62], feather: [88, 92, 106], crown: [200, 56, 56] },
    ],
    prep(e) { e.f = 0.55 + 0.45 * Math.cos(e.phase); e.span = 3.5 + 9.5 * e.f; },
    sample(u, v, e) {
      const av = Math.abs(v), P = e.pal;
      if (u > 9.0 && u < 10.8 && av < 0.4) return hit([196, 176, 110]);
      if (ell(u, v, 8.3, 0, 0.95, 0.78) < 1) return u > 8.3 && av < 0.5 ? hit(P.crown) : hit(P.black);
      if (u > 2.3 && u <= 8.3 && av < 0.55) return hit(u > 4.6 ? P.black : P.white);
      if (ell(u, v, -1, 0, 3.8, 1.45) < 1) return hit(P.white);
      if (u < -4.4 && u > -6.0 && av < 0.9) return hit(P.black);
      if (u <= -5.6 && u > -10.5 && Math.abs(av - 0.45) < 0.4) return hit([110, 110, 118], 0.8);
      if (av >= 1.1 && av < 1.1 + e.span) {
        const w = av - 1.1, s = w / e.span;
        const uf = 1.5 - 1.7 * s - (s > 0.82 ? sq((s - 0.82) * 9) * 0.5 : 0);
        const ub = -2.5 - 1.0 * s + (s > 0.74 ? sq((s - 0.74) * 6.5) : 0);
        if (u < uf && u > ub) {
          if (u - ub < 0.55 && ((w * 1.4) | 0) & 1) return false;
          const shade = 0.86 + 0.14 * e.f;
          if (s > 0.84 || (s < 0.74 && u - ub < (uf - ub) * 0.4)) return hit(P.feather, 1, shade);
          return hit(P.white, 1, shade);
        }
      }
      return false;
    },
  },
};

/* ---------- baking sprites into pixel frames ---------- */

// Each SVG document gets its own Sprites instance, which collects <defs>.
class Sprites {
  constructor(prefix) { this.prefix = prefix; this.defs = new Map(); }
  // returns the ids of the n flap frames for this species/variant/scale
  frames(sp, vi, k, shadow = null) {
    const A = SPECIES[sp];
    const ids = [];
    for (let fi = 0; fi < A.frames; fi++) {
      const id = `${this.prefix}${sp[0]}${vi}${Math.round(k * 100)}${shadow ? "s" : ""}f${fi}`;
      ids.push(id);
      if (this.defs.has(id)) continue;
      const e = { pal: A.variants[vi], phase: (fi / A.frames) * TAU, seed: 11 + vi };
      A.prep(e);
      const R = Math.ceil(A.radius * k) + 1;
      const groups = new Map();
      for (let py = -R; py <= R; py++) for (let px = -R; px <= R; px++) {
        if (!A.sample((px + 0.5) / k, (py + 0.5) / k, e)) continue;
        const key = shadow ? `${shadow}|0.2` : `${rgb([out.r, out.g, out.b])}|${out.a.toFixed(2)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push([px, py]);
      }
      let g = `<g id="${id}">`;
      for (const [key, pts] of groups) {
        const [fill, a] = key.split("|");
        pts.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
        let d = "";
        for (let i = 0; i < pts.length; ) {
          let j = i;
          while (j + 1 < pts.length && pts[j + 1][1] === pts[i][1] && pts[j + 1][0] === pts[j][0] + 1) j++;
          const n = j - i + 1;
          d += `M${pts[i][0]} ${pts[i][1]}h${n}v1h-${n}z`;
          i = j + 1;
        }
        g += `<path fill="${fill}"${a !== "1.00" ? ` fill-opacity="${+a}"` : ""} d="${d}"/>`;
      }
      this.defs.set(id, g + "</g>");
    }
    return ids;
  }
  toString() { return [...this.defs.values()].join(""); }
}

/* ---------- motion: sampled at a fixed rate, played with SMIL ---------- */

const FPS = 12;

// samples: [{x, y, h (radians), fi (frame index)}] at 1/FPS spacing; dur = samples.length / FPS
function entity(spr, { sp, vi, k, samples, begin = 0, opacity = 1, shadow = null, shadowOffset = [2, 3] }) {
  const dur = (samples.length / FPS).toFixed(3) + "s";
  const beginAttr = begin ? ` begin="${(-begin).toFixed(2)}s"` : "";
  const rep = `dur="${dur}"${beginAttr} repeatCount="indefinite"`;
  const loop = [...samples, samples[0]];
  const motion = loop.map((s) => `${f1(s.x)},${f1(s.y)}`).join(";");
  // unwrap the heading so rotation never spins the long way round
  const deg = [];
  let prev = null;
  for (const s of loop) {
    let a = (s.h * 180) / Math.PI;
    if (prev !== null) { while (a - prev > 180) a -= 360; while (a - prev < -180) a += 360; }
    deg.push(a); prev = a;
  }
  const rotate = deg.map((a) => Math.round(a)).join(";");
  const still = deg.every((a) => Math.round(a) === Math.round(deg[0]));
  const rot = still ? `<g transform="rotate(${Math.round(deg[0])})">` : `<g><animateTransform attributeName="transform" type="rotate" values="${rotate}" ${rep}/>`;
  const sprite = (ids) => {
    const hrefs = samples.map((s) => "#" + ids[s.fi]).join(";");
    return `<use href="#${ids[samples[0].fi]}"><animate attributeName="href" values="${hrefs}" calcMode="discrete" ${rep}/></use>`;
  };
  let body = "";
  if (shadow) body += `<g transform="translate(${shadowOffset[0]} ${shadowOffset[1]})">${rot}${sprite(spr.frames(sp, vi, k, shadow))}</g></g>`;
  body += `${rot}${sprite(spr.frames(sp, vi, k))}</g>`;
  return `<g${opacity < 1 ? ` opacity="${opacity}"` : ""}><animateMotion values="${motion}" ${rep}/>${body}</g>`;
}

// A butterfly flying a closed loop through `points`, optionally resting at each.
function butterflyPath(points, { speed, rest = () => 0, wob = 5 }) {
  const n = points.length;
  const segs = [];
  let T = 0;
  for (let i = 0; i < n; i++) {
    const A = points[i], B = points[(i + 1) % n];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
    const Tf = L / speed;
    const r = rest(i, B);
    segs.push({ A, B, L, Tf, r, t0: T, m: Math.max(1, Math.round(L / 28)), amp: wob * rand(0.6, 1.3) * (rng() < 0.5 ? -1 : 1) });
    T += Tf + r;
  }
  const N = Math.ceil(T * FPS);
  segs[n - 1].r += N / FPS - T;
  const samples = [];
  let phase = rand(0, TAU), h = 0, si = 0;
  const visits = segs.map((s) => ({ at: s.B, from: s.t0 + s.Tf, to: s.t0 + s.Tf + s.r }));
  for (let j = 0; j < N; j++) {
    const t = j / FPS;
    while (si < n - 1 && t >= segs[si + 1].t0) si++;
    const s = segs[si];
    const dt = t - s.t0;
    let x, y, flying = dt < s.Tf;
    if (flying) {
      const u = dt / s.Tf;
      const dx = (s.B[0] - s.A[0]) / s.L, dy = (s.B[1] - s.A[1]) / s.L;
      const off = s.amp * Math.sin(Math.PI * s.m * u);
      x = lerp(s.A[0], s.B[0], u) - dy * off;
      y = lerp(s.A[1], s.B[1], u) + dx * off;
      const doff = s.amp * Math.PI * s.m * Math.cos(Math.PI * s.m * u) / s.L;
      h = Math.atan2(dy + dx * doff, dx - dy * doff);
    } else { x = s.B[0]; y = s.B[1]; }
    phase += (flying ? 9 : 2.2) / FPS;
    samples.push({ x, y, h, fi: Math.floor((((phase % TAU) + TAU) % TAU) / TAU * SPECIES.butterfly.frames) });
  }
  return { samples, dur: N / FPS, visits };
}

// A V-formation of cranes crossing from left to right once per loop.
function craneFlock({ n, k, W, yMid, amp, speed, startAt = 0.5 }) {
  const R = SPECIES.crane.radius * k;
  const back = Math.ceil(n / 2) * 24 * k;
  const xLo = -R - 6, xHi = W + back + R + 6;
  const dur = Math.round(((xHi - xLo) / speed) * FPS) / FPS;
  const N = Math.round(dur * FPS);
  const v = (xHi - xLo) / dur;
  const ph = rand(0, TAU);
  const birds = [];
  for (let i = 0; i < n; i++) {
    const row = Math.ceil(i / 2), side = i === 0 ? 0 : i % 2 ? -1 : 1;
    const sx = -row * 24 * k, sy = side * row * 25 * k;
    const samples = [];
    let phase = i * 0.7;
    for (let j = 0; j < N; j++) {
      const t = j / FPS, w = (TAU * t) / dur;
      const y = yMid + amp * Math.sin(w + ph) + sy;
      const vy = amp * Math.cos(w + ph) * (TAU / dur);
      phase += 3.4 / FPS;
      samples.push({ x: xLo + v * t + sx, y, h: Math.atan2(vy, v), fi: Math.floor((((phase % TAU) + TAU) % TAU) / TAU * SPECIES.crane.frames) });
    }
    birds.push({ samples, vi: i % 3 });
  }
  // start the loop with the leader partway across the image
  const begin = clamp(((startAt * W - xLo) / v), 0, dur - 0.1);
  return { birds, dur, begin, xLo, v };
}

/* ---------- data ---------- */

// Responses are cached in scripts/.cache (gitignored) so local runs without a
// token can fall back to them when the anonymous rate limit (60/hour) runs out.
const CACHE = path.join(HERE, ".cache");
const cacheFile = (p) => path.join(CACHE, p.replace(/[^a-z0-9]+/gi, "_") + ".json");
async function api(p) {
  try {
    const r = await fetch("https://api.github.com" + p, {
      headers: { "User-Agent": "profile-readme-redraw", Accept: "application/vnd.github+json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    });
    if (!r.ok) throw new Error(`GitHub API ${p}: ${r.status} ${await r.text()}`);
    const data = await r.json();
    await mkdir(CACHE, { recursive: true });
    await writeFile(cacheFile(p), JSON.stringify(data));
    return data;
  } catch (err) {
    if (TOKEN) throw err;
    try { return JSON.parse(await readFile(cacheFile(p), "utf8")); } catch { throw err; }
  }
}

async function loadRepos() {
  const repos = (await api(`/users/${USER}/repos?per_page=100&type=owner`)).filter((r) => !r.fork && r.name !== USER);
  for (const r of repos) r.langs = await api(`/repos/${USER}/${r.name}/languages`);
  return repos;
}

async function loadCalendar() {
  const r = await fetch(`https://github.com/users/${USER}/contributions`, { headers: { "User-Agent": "profile-readme-redraw" } });
  if (!r.ok) throw new Error(`contributions page: ${r.status}`);
  const html = await r.text();
  const tips = new Map();
  for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) tips.set(m[1], m[2].trim());
  const cells = [];
  for (const m of html.matchAll(/<td\b([^>]*\bdata-date="[^"]+"[^>]*)>/g)) {
    const a = m[1];
    const date = a.match(/data-date="([^"]+)"/)[1];
    const id = (a.match(/\bid="([^"]+)"/) || [])[1] || "";
    const lv = +((a.match(/data-level="(\d)"/) || [])[1] || 0);
    const pos = id.match(/-(\d+)-(\d+)$/);
    if (!pos) continue;
    const tip = tips.get(id) || "";
    const n = /^No /.test(tip) ? 0 : parseInt(tip.replace(/,/g, ""), 10) || 0;
    cells.push({ date, d: +pos[1], c: +pos[2], lv, n });
  }
  if (!cells.length) throw new Error("could not read the contribution calendar");
  const weeks = Math.max(...cells.map((k) => k.c)) + 1;
  const total = cells.reduce((s, k) => s + k.n, 0);
  const last = cells.reduce((a, k) => (k.date > a.date ? k : a));
  return { cells, weeks, total, last };
}

async function loadIcons() {
  const dir = path.join(HERE, "icons");
  const icons = {};
  for (const f of await readdir(dir)) if (f.endsWith(".svg")) icons[f.slice(0, -4)] = "data:image/svg+xml;base64," + (await readFile(path.join(dir, f))).toString("base64");
  return icons;
}

/* ---------- SVG documents ---------- */

const svgDoc = (w, h, vw, vh, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${body}</svg>\n`;

// rough text widths for layout (no font metrics available in a README image)
const sansW = (s, px) => s.length * px * 0.56;
const monoW = (s, px) => s.length * px * 0.6;

function heroSVG(look) {
  const L = LOOKS[look];
  const W = 400, H = 100;
  const spr = new Sprites("h");
  let animals = "";
  if (look === "blue") {
    const bs = [];
    for (let i = 0; i < 9; i++) {
      const k = rand(0.6, 1.25);
      const pts = Array.from({ length: 4 }, () => [rand(14, W - 14), rand(10, H - 10)]);
      const { samples } = butterflyPath(pts, { speed: 15 * k, wob: 6 });
      bs.push({ k, samples, vi: i % 3 });
    }
    bs.sort((a, b) => a.k - b.k);
    for (const b of bs) animals += entity(spr, { sp: "butterfly", vi: b.vi, k: +b.k.toFixed(2), samples: b.samples, opacity: b.k < 0.85 ? 0.6 : 1 });
  } else {
    const far = craneFlock({ n: 3, k: 0.5, W, yMid: 22, amp: 4, speed: 7, startAt: 0.3 });
    const near = craneFlock({ n: 5, k: 0.8, W, yMid: 50, amp: 5, speed: 11, startAt: 0.75 });
    for (const F of [far, near]) for (const b of F.birds)
      animals += entity(spr, { sp: "crane", vi: b.vi, k: F === far ? 0.5 : 0.8, samples: b.samples, begin: F.begin, opacity: F === far ? 0.6 : 1, shadow: "#3c465f" });
  }
  let dots = "";
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash2(i, 1, 7) * W), y = Math.floor(hash2(i, 2, 7) * H);
    const a = (0.15 + 0.5 * hash2(i, 4, 7)).toFixed(2);
    dots += `<rect x="${x}" y="${y}" width="1" height="1" fill="${L.dots}" opacity="${a}"><animate attributeName="opacity" values="${a};0.05;${a}" dur="${(2 + hash2(i, 3, 7) * 4).toFixed(1)}s" repeatCount="indefinite"/></rect>`;
  }
  const body =
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rgb(L.heroTop)}"/><stop offset="1" stop-color="${rgb(L.heroBot)}"/></linearGradient>${spr}</defs>` +
    `<rect width="${W}" height="${H}" rx="4" fill="url(#sky)"/>` +
    `<g shape-rendering="crispEdges">${dots}${animals}</g>` +
    `<text x="13" y="73" font-family="${MONO}" font-size="6.5" fill="${L.muted}">${look === "blue" ? "~/pratik $ whoami" : "~/pratik $ uptime --flock"}</text>` +
    `<text x="12" y="91" font-family="${SANS}" font-size="20" font-weight="700" letter-spacing="-0.5" fill="${L.text}">Pratik <tspan fill="${L.accent}">builds from scratch</tspan></text>`;
  return svgDoc(800, 200, W, H, body, "Pratik builds from scratch");
}

function panel(L, w, h) { return `<rect width="${w}" height="${h}" rx="8" fill="${L.page}"/>`; }
function header(L, w, title, aside) {
  return `<text x="20" y="30" font-family="${MONO}" font-size="12" letter-spacing="1.2" fill="${L.faint}">${esc(title.toUpperCase())}</text>` +
    `<text x="${w - 20}" y="30" text-anchor="end" font-family="${MONO}" font-size="11.5" fill="${L.faint}">${esc(aside)}</text>`;
}
const monoDefs = (L) => (L.monoFilter ? `<filter id="inv"><feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0"/></filter><filter id="lift"><feColorMatrix type="matrix" values="1.9 0 0 0 0.05  0 1.9 0 0 0.05  0 0 1.9 0 0.05  0 0 0 1 0"/></filter>` : "");
const INVERT = new Set(["threejs", "pandas"]), LIFT = new Set(["electron"]);
const logoFilter = (L, name) => (!L.monoFilter ? "" : INVERT.has(name) ? ` filter="url(#inv)"` : LIFT.has(name) ? ` filter="url(#lift)"` : "");

function languagesSVG(look, repos, icons) {
  const L = LOOKS[look];
  const totals = {}, used = {};
  for (const r of repos) for (const [k, v] of Object.entries(r.langs)) {
    if (HIDE_LANGS.has(k)) continue;
    totals[k] = (totals[k] || 0) + v;
    (used[k] = used[k] || []).push(r.name);
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]).filter(([, v]) => v / sum >= 0.005);
  const W = 800, gap = 10, cw = (W - 40 - gap) / 2, ch = 80;
  const H = 46 + Math.ceil(rows.length / 2) * (ch + gap) + 10;
  const maxShare = rows.length ? rows[0][1] / sum : 1;
  let body = panel(L, W, H) + header(L, W, "Languages", `share of code across ${repos.length} public repos`);
  rows.forEach(([k, v], i) => {
    const x = 20 + (i % 2) * (cw + gap), y = 46 + Math.floor(i / 2) * (ch + gap);
    const share = v / sum, filled = Math.max(1, Math.round((share / maxShare) * 20));
    const lv = share > 0.25 ? 4 : share > 0.12 ? 3 : share > 0.04 ? 2 : 1;
    let bar = "";
    for (let b = 0; b < 20; b++) bar += `<rect x="${x + 56 + b * 10}" y="${y + 40}" width="8" height="8" rx="1.5" fill="${b < filled ? rgb(L.lv[lv - 1]) : L.line}"/>`;
    let usedTxt = `${used[k].length} repo${used[k].length > 1 ? "s" : ""} · ${used[k].join(", ")}`;
    if (usedTxt.length > 58) usedTxt = usedTxt.slice(0, 57) + "…";
    const icon = LANG_ICON[k] && icons[LANG_ICON[k]]
      ? `<image href="${icons[LANG_ICON[k]]}" x="${x + 14}" y="${y + 16}" width="30" height="30"/>`
      : `<rect x="${x + 14}" y="${y + 16}" width="30" height="30" rx="4" fill="${L.accent}"/><text x="${x + 29}" y="${y + 36}" text-anchor="middle" font-family="${MONO}" font-size="12" font-weight="600" fill="${L.page}">${esc(k.slice(0, 2))}</text>`;
    body += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="6" fill="${L.card}" stroke="${L.line}"/>` + icon +
      `<text x="${x + 56}" y="${y + 30}" font-family="${SANS}" font-size="15" font-weight="600" fill="${L.text}">${esc(k)}</text>` +
      `<text x="${x + cw - 14}" y="${y + 30}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${L.muted}">${(share * 100).toFixed(1)}%</text>` +
      bar + `<text x="${x + 14}" y="${y + 68}" font-family="${MONO}" font-size="11" fill="${L.faint}">${esc(usedTxt)}</text>`;
  });
  const alt = "Languages: " + rows.map(([k, v]) => `${k} ${((v / sum) * 100).toFixed(1)}%`).join(", ");
  return { svg: svgDoc(W, H, W, H, monoDefs(L) + body, alt), alt };
}

function toolsSVG(look, icons) {
  const L = LOOKS[look];
  const W = 800, chipH = 32, gap = 8;
  const chips = TOOLS.map((t) => ({ ...t, w: 8 + 18 + 8 + sansW(t.n, 13) + 8 + monoW(t.p, 11) + 12 }));
  let x = 20, y = 46, items = "";
  for (const c of chips) {
    if (x + c.w > W - 20) { x = 20; y += chipH + gap; }
    const logo = c.i && icons[c.i]
      ? `<image href="${icons[c.i]}" x="${x + 8}" y="${y + 7}" width="18" height="18"${logoFilter(L, c.i)}/>`
      : `<rect x="${x + 8}" y="${y + 7}" width="18" height="18" rx="3" fill="${L.accent}"/><text x="${x + 17}" y="${y + 20}" text-anchor="middle" font-family="${MONO}" font-size="9" font-weight="700" fill="${L.page}">${esc(c.mk)}</text>`;
    items += `<rect x="${x}" y="${y}" width="${c.w.toFixed(1)}" height="${chipH}" rx="6" fill="${L.card}" stroke="${L.line}"/>${logo}` +
      `<text x="${x + 34}" y="${y + 21}" font-family="${SANS}" font-size="13" fill="${L.text}">${esc(c.n)}</text>` +
      `<text x="${(x + 34 + sansW(c.n, 13) + 8).toFixed(1)}" y="${y + 21}" font-family="${MONO}" font-size="11" fill="${L.faint}">${esc(c.p)}</text>`;
    x += c.w + gap;
  }
  const H = y + chipH + 20;
  const alt = "Tools and frameworks: " + TOOLS.map((t) => t.n).join(", ");
  return { svg: svgDoc(W, H, W, H, monoDefs(L) + panel(L, W, H) + header(L, W, "Tools & frameworks", "read from each repo's dependencies") + items, alt), alt };
}

function wrap(text, max) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if ((line + " " + word).trim().length > max) { lines.push(line); line = word; } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}

function projectSVG(look, p, stars, icons) {
  const L = LOOKS[look];
  const W = 400, H = 132;
  let lines = wrap(p.desc, 52);
  if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = lines[2].replace(/.?$/, "…"); }
  const desc = lines.map((l, i) => `<tspan x="16" dy="${i ? 18 : 0}">${esc(l)}</tspan>`).join("");
  const ic = p.icons.map((n, i) => (icons[n] ? `<image href="${icons[n]}" x="${16 + i * 24}" y="${H - 30}" width="16" height="16"${logoFilter(L, n)}/>` : "")).join("");
  const body = monoDefs(L) +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="7" fill="${L.card}" stroke="${L.line}"/>` +
    `<text x="16" y="30" font-family="${SANS}" font-size="15" font-weight="600" fill="${L.title}">${esc(p.repo)}</text>` +
    `<text x="${W - 16}" y="30" text-anchor="end" font-family="${MONO}" font-size="12" fill="${L.muted}">★ ${stars}</text>` +
    `<text x="16" y="56" font-family="${SANS}" font-size="13" fill="${L.muted}">${desc}</text>` + ic;
  return svgDoc(W, H, W, H, body, `${p.repo}: ${p.desc}`);
}

function graphSVG(look, cal) {
  const L = LOOKS[look];
  const PITCH = 7, SQ = 6, PADX = 8, TOP = 28;
  const W = PADX * 2 + cal.weeks * PITCH - 1, H = TOP + 7 * PITCH - 1 + 16;
  const cellXY = (k) => [PADX + k.c * PITCH + SQ / 2, TOP + k.d * PITCH + SQ / 2];
  const spr = new Sprites("g");
  const anims = new Map(); // cell -> <animate> markup
  let animals = "";

  if (look === "blue") {
    const pool = cal.cells.filter((k) => k.lv >= 1);
    const pickFrom = pool.length >= 6 ? pool : cal.cells.filter((k) => k.lv >= 0);
    const taken = new Set();
    const pick = () => {
      let tot = 0;
      const free = pickFrom.filter((k) => !taken.has(k));
      for (const k of free) tot += (k.lv + 1) ** 2;
      let r = rng() * tot;
      for (const k of free) { r -= (k.lv + 1) ** 2; if (r <= 0) { taken.add(k); return k; } }
      return free[free.length - 1] || cal.cells[0];
    };
    const count = clamp(Math.round(cal.total / 60) + 3, 4, 9);
    for (let i = 0; i < count; i++) {
      const stops = [pick(), pick(), pick()];
      const pts = stops.map((k) => { const [x, y] = cellXY(k); return [x, y - 1]; });
      const { samples, dur, visits } = butterflyPath(pts, { speed: 15, wob: 5, rest: () => rand(1.6, 3.6) });
      animals += entity(spr, { sp: "butterfly", vi: i % 3, k: 0.72, samples });
      visits.forEach((v, j) => {
        const k = stops[(j + 1) % stops.length];
        const base = rgb(k.lv === 0 ? L.empty : L.lv[k.lv - 1]);
        const lit = rgb(mix(k.lv === 0 ? L.empty : L.lv[k.lv - 1], WHITE, 0.45));
        const kt = [0, v.from, v.from + 0.25, v.to, v.to + 1].map((t) => clamp(t / dur, 0, 1));
        for (let q = 1; q < kt.length; q++) kt[q] = Math.max(kt[q], kt[q - 1]);
        anims.set(k, `<animate attributeName="fill" values="${base};${base};${lit};${lit};${base};${base}" keyTimes="${[...kt, 1].map((t) => t.toFixed(4)).join(";")}" dur="${dur.toFixed(3)}s" repeatCount="indefinite"/>`);
      });
    }
  } else {
    let best = 0, run = 0;
    for (const k of [...cal.cells].sort((a, b) => (a.date < b.date ? -1 : 1))) { run = k.n ? run + 1 : 0; best = Math.max(best, run); }
    const F = craneFlock({ n: clamp(Math.round(best / 2) + 3, 3, 5), k: 0.66, W, yMid: TOP + 3 * PITCH, amp: 4, speed: 13, startAt: 0.35 });
    for (const b of F.birds) animals += entity(spr, { sp: "crane", vi: b.vi, k: 0.66, samples: b.samples, begin: F.begin, shadow: "#3c465f" });
    for (const k of cal.cells) {
      if (k.lv < 1 || k === cal.last) continue;
      const [cx] = cellXY(k);
      const tc = (cx - F.xLo) / F.v;
      const base = rgb(L.lv[k.lv - 1]), red = rgb(mix(L.lv[k.lv - 1], [222, 42, 42], 0.8));
      const kt = [0, tc, tc + 0.3, tc + 2.8].map((t) => clamp(t / F.dur, 0, 1));
      for (let q = 1; q < kt.length; q++) kt[q] = Math.max(kt[q], kt[q - 1]);
      anims.set(k, `<animate attributeName="fill" values="${base};${base};${red};${base};${base}" keyTimes="${[...kt, 1].map((t) => t.toFixed(4)).join(";")}" dur="${F.dur.toFixed(3)}s" begin="${(-F.begin).toFixed(2)}s" repeatCount="indefinite"/>`);
    }
  }

  let cells = "";
  for (const k of cal.cells) {
    const [x, y] = [PADX + k.c * PITCH, TOP + k.d * PITCH];
    let fill = rgb(k.lv === 0 ? L.empty : L.lv[k.lv - 1]);
    if (look === "white" && k === cal.last) fill = "#de2a2a";
    const a = anims.get(k);
    cells += a ? `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" rx="1" fill="${fill}">${a}</rect>` : `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" rx="1" fill="${fill}"/>`;
  }

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let months = "", lastM = -1;
  for (let c = 0; c < cal.weeks; c++) {
    const first = cal.cells.filter((k) => k.c === c).sort((a, b) => a.d - b.d)[0];
    if (!first) continue;
    const dt = new Date(first.date + "T00:00:00Z");
    const m = dt.getUTCMonth();
    if (m !== lastM && dt.getUTCDate() <= 7 && c < cal.weeks - 2) { months += `<text x="${PADX + c * PITCH}" y="${TOP - 4}" font-family="${SANS}" font-size="5" fill="${L.faint}">${MONTHS[m]}</text>`; lastM = m; }
  }
  const swatches = [L.empty, ...L.lv];
  const lx = W - PADX - 5 * 7 - 18;
  const legend = `<text x="${lx - 3}" y="${H - 6}" text-anchor="end" font-family="${SANS}" font-size="5" fill="${L.faint}">Less</text>` +
    swatches.map((c, i) => `<rect x="${lx + i * 7}" y="${H - 10}" width="5" height="5" rx="1" fill="${rgb(c)}"/>`).join("") +
    `<text x="${lx + 5 * 7 + 1}" y="${H - 6}" font-family="${SANS}" font-size="5" fill="${L.faint}">More</text>`;
  const note = look === "blue" ? "butterflies land on the busiest days" : "the flock lights up the days I shipped";
  const caption = `${cal.total.toLocaleString("en-US")} contributions in the last year`;
  const body =
    `<defs>${spr}</defs><rect width="${W}" height="${H}" rx="4" fill="${L.graphBg}" stroke="${L.line}" stroke-width="0.5"/>` +
    `<text x="${PADX}" y="11" font-family="${SANS}" font-size="6.5" fill="${L.text}">${caption}</text>` +
    `<text x="${W - PADX}" y="11" text-anchor="end" font-family="${MONO}" font-size="5.5" fill="${L.faint}">${note}</text>` +
    months + `<g shape-rendering="crispEdges">${cells}${animals}</g>` + legend;
  return { svg: svgDoc(W * 2, H * 2, W, H, body, caption), alt: caption };
}

/* ---------- main ---------- */

async function main() {
  const look = process.env.LOOK === "blue" || process.env.LOOK === "white" ? process.env.LOOK : rng() < 0.5 ? "blue" : "white";
  const [repos, cal, icons] = await Promise.all([loadRepos(), loadCalendar(), loadIcons()]);
  await mkdir(OUT, { recursive: true });
  for (const f of await readdir(OUT)) if (f.endsWith(".svg")) await unlink(path.join(OUT, f));

  const byName = Object.fromEntries(repos.map((r) => [r.name, r]));
  const featured = FEATURED.filter((p) => byName[p.repo]);
  const write = (name, svg) => writeFile(path.join(OUT, name), svg);

  const hero = heroSVG(look);
  const langs = languagesSVG(look, repos, icons);
  const tools = toolsSVG(look, icons);
  const graph = graphSVG(look, cal);
  await write("hero.svg", hero);
  await write("languages.svg", langs.svg);
  await write("tools.svg", tools.svg);
  await write("graph.svg", graph.svg);
  for (const p of featured) await write(`project-${p.repo}.svg`, projectSVG(look, p, byName[p.repo].stargazers_count, icons));

  const v = `?v=${DAY_KEY.replace(/-/g, "")}${look[0]}`;
  const others = repos.filter((r) => !FEATURED.some((p) => p.repo === r.name)).sort((a, b) => b.pushed_at.localeCompare(a.pushed_at));
  const heroAlt = look === "blue" ? "Pratik builds from scratch: pixel butterflies drifting across a night sky" : "Pratik builds from scratch: a flock of pixel cranes crossing a pale sky";
  const md = [
    "<!-- Generated by scripts/generate.mjs. Edit the script, not this file: the nightly workflow rewrites it. -->",
    "",
    `<img src="assets/hero.svg${v}" width="100%" alt="${heroAlt}">`,
    "",
    LEDE,
    "",
    `<img src="assets/languages.svg${v}" width="100%" alt="${esc(langs.alt)}">`,
    "",
    `<img src="assets/tools.svg${v}" width="100%" alt="${esc(tools.alt)}">`,
    "",
    featured.map((p) => `<a href="${REPO_URL(p.repo)}"><img src="assets/project-${p.repo}.svg${v}" width="49%" alt="${esc(p.repo)}: ${esc(p.desc)}"></a>`).join("\n"),
    "",
    others.length ? `<sub>also: ${others.map((r) => `<a href="${r.html_url}">${esc(r.name)}</a>`).join(" · ")}</sub>` : "",
    "",
    `<img src="assets/graph.svg${v}" width="100%" alt="${esc(graph.alt)}">`,
    "",
    `<sub>today's sky: ${LOOKS[look].name} · redrawn every night with the sprites from <a href="${REPO_URL("ascii-animals-screensaver")}">ascii-animals-screensaver</a></sub>`,
    "",
  ].join("\n");
  await writeFile(path.join(ROOT, "README.md"), md);
  console.log(`look: ${look} · ${repos.length} repos · ${cal.total} contributions`);
}

main().catch((e) => { console.error(e); process.exit(1); });
