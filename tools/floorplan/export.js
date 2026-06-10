#!/usr/bin/env node
/* ============================================================
   export.js — renders the floor-plan underlay SVGs consumed by
   the "Plan" view (dashboards/dos/views/plan.yaml).

   Sources: plan-geo.js (room geometry + entity bindings) and
   floorplan-svg.js (architectural line-work), both vendored from
   the Claude Design handoff bundle. Run after any geometry or
   palette change:

       node tools/floorplan/export.js

   Outputs www/floorplans/<floor>-<theme>.svg:
     - day    walls at full ink (light theme)
     - night  walls recede to putty so live data reads brightest
              (an ivory ink-walls variant was tried 2026-06-10 and
              rejected: it competes with the data at night)
   Palette hexes must stay in sync with the --dos-* tokens in
   themes/dos.yaml (day tokens + the card-mod night flip): the generator bakes
   colors into the files (an <img> cannot inherit page CSS variables),
   and door/window symbols erase wall openings with opaque
   paper-colored strokes, so `paper` must equal --dos-paper exactly.

   Also prints the per-room overlay position table (percentages of
   the padded viewBox) used by the picture-elements elements in
   plan.yaml.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ window: {} });
for (const f of ['plan-geo.js', 'floorplan-svg.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
}
const { buildFloorSVG, FLOORS } = ctx.window;

// Outer walls are stroked centered on the outline (22cm wide), so half a
// stroke falls outside the 1150x1210 box; pad the viewBox so it isn't clipped.
const PAD = 12;
const W = 1150, H = 1210;
const VW = W + 2 * PAD, VH = H + 2 * PAD;

// Hexes mirror themes/dos.yaml; wall/glow values come from the design handoff
// (dir01_dossier.jsx): night walls recede to putty so data stays brightest.
const PALETTES = {
  day: {
    paper: '#f5f5f4', field: '#ececea', ink: '#0d1b2a', text: '#1a1a1a',
    muted: '#4a4a4a', soft: '#6b6b6b', quiet: '#8a8a8a', line: '#d4d4d4',
    accent: '#3e5567', warm: '#8a3f33',
  },
  night: {
    paper: '#17140f', field: '#201c16', ink: '#8d887f', text: '#dcd8d0',
    muted: '#b6b1a8', soft: '#97928a', quiet: '#6e6a62', line: '#38332c',
    accent: '#82a2b6', warm: '#c77b5e',
  },
};

const outDir = path.join(__dirname, '..', '..', 'www', 'floorplans');
fs.mkdirSync(outDir, { recursive: true });

// full ground-floor footprint, faint, behind the upper floors — reads as
// "this floor, stacked on the house below" (landscape mockup, plan.jsx)
const groundOutline = ctx.window.FLOOR_DEFS.ground.outline.map((p) => p.join(',')).join(' ');

for (const floor of FLOORS) {
  for (const [theme, palette] of Object.entries(PALETTES)) {
    let svg = buildFloorSVG(floor.id, { mode: 'underlay', palette });
    if (floor.id !== 'ground') {
      const ghost = `<polygon points="${groundOutline}" fill="${palette.field}" fill-opacity="0.55" stroke="${palette.line}" stroke-width="5" stroke-dasharray="16 11" stroke-linejoin="round"/>`;
      svg = svg.replace(/(<svg [^>]*>)/, `$1${ghost}`);
    }
    // pad the viewBox and give the file intrinsic dimensions so the
    // picture-elements <img> keeps the true aspect ratio
    svg = svg
      .replace(`viewBox="0 0 ${W} ${H}"`, `viewBox="${-PAD} ${-PAD} ${VW} ${VH}"`)
      .replace('width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible"',
        `width="${VW}" height="${VH}"`);
    const file = path.join(outDir, `${floor.id}-${theme}.svg`);
    fs.writeFileSync(file, svg);
    console.log(`wrote ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`);
  }
}

// ---- overlay position table (percentages of the padded viewBox) ----
const pct = (v) => +v.toFixed(3);
console.log('\nRoom overlay positions for plan.yaml (picture-elements,');
console.log('default transform: centered on left/top):\n');
for (const floor of FLOORS) {
  console.log(`# ${floor.id}`);
  for (const r of floor.rooms) {
    const left = pct(((r.x + r.w / 2 + PAD) / VW) * 100);
    const top = pct(((r.y + r.h / 2 + PAD) / VH) * 100);
    const w = pct((r.w / VW) * 100);
    const h = pct((r.h / VH) * 100);
    console.log(`  ${r.id.padEnd(8)} left: ${left}%  top: ${top}%  width: ${w}%  height: ${h}%  bind: ${r.bind.kind}`);
  }
}
