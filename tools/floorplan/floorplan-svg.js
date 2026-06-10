/* ============================================================
   floorplan-svg.js — generates clean, to-scale architectural SVG
   floor plans for the three levels, traced from the bestektekening
   with the label corrections applied.

   Coordinate system: centimetres, north = top, shared box 1150 × 1210
   (750 garage block + 460 to the house front; main block 800 × 800
   from y=410). Chains read straight off the bestektekening.
   Exposes window.buildFloorSVG(floorId) -> SVG markup string, and
   window.FLOOR_DEFS.
   ============================================================ */
(function () {
  // ---- palette (Dossier, light set) --------------------------------
  const C = {
    paper: '#ffffff', field: '#f5f5f4', ink: '#0d1b2a', text: '#1a1a1a',
    muted: '#4a4a4a', soft: '#6b6b6b', quiet: '#8a8a8a', line: '#cfcabf',
    accent: '#3e5567', warm: '#8a3f33',
  };
  const FONT = "'Nimbus Sans L','Helvetica Neue',Helvetica,Arial,sans-serif";
  const WALL_EXT = 22, WALL_INT = 11, WALL_KNEE = 24;
  // UNDERLAY mode: bare line-work for the dashboard Plan view — no title
  // block, no dimension chains, no text labels; palette can be overridden
  // with CSS variables so the same drawing follows the Dossier day/night theme.
  let UNDERLAY = false;

  // ---- tiny svg helpers --------------------------------------------
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function poly(pts, o = {}) {
    return `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${o.fill || 'none'}" stroke="${o.stroke || 'none'}" stroke-width="${o.w || 0}" stroke-linejoin="${o.join || 'miter'}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} stroke-linecap="round"/>`;
  }
  function line(x1, y1, x2, y2, o = {}) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke || C.ink}" stroke-width="${o.w || WALL_INT}" stroke-linecap="${o.cap || 'butt'}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''}/>`;
  }
  function rect(x, y, w, h, o = {}) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r || 0}" fill="${o.fill || 'none'}" stroke="${o.stroke || 'none'}" stroke-width="${o.w || 0}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''}/>`;
  }
  function circ(cx, cy, r, o = {}) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.fill || 'none'}" stroke="${o.stroke || C.soft}" stroke-width="${o.w || 4}"/>`;
  }
  function txt(x, y, s, o = {}) {
    return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${o.size || 26}" fill="${o.fill || C.muted}" text-anchor="${o.anchor || 'middle'}" font-weight="${o.weight || 400}" letter-spacing="${o.ls || 0}" ${o.style ? `font-style="${o.style}"` : ''} dominant-baseline="${o.base || 'middle'}">${esc(s)}</text>`;
  }
  // door symbol: hinge H=[x,y], along unit dir (toward other opening end),
  // swing unit dir (into the room), len = opening width.
  function door(H, along, swing, len) {
    const O = [H[0] + along[0] * len, H[1] + along[1] * len];   // other opening end
    const L = [H[0] + swing[0] * len, H[1] + swing[1] * len];   // open leaf end
    const cross = along[0] * swing[1] - along[1] * swing[0];
    const sweep = cross > 0 ? 1 : 0;
    return [
      // erase the wall opening
      `<line x1="${H[0]}" y1="${H[1]}" x2="${O[0]}" y2="${O[1]}" stroke="${C.paper}" stroke-width="${WALL_EXT + 4}" stroke-linecap="butt"/>`,
      // jambs
      `<line x1="${H[0]}" y1="${H[1]}" x2="${O[0]}" y2="${O[1]}" stroke="${C.line}" stroke-width="2"/>`,
      // leaf
      `<line x1="${H[0]}" y1="${H[1]}" x2="${L[0]}" y2="${L[1]}" stroke="${C.soft}" stroke-width="4"/>`,
      // swing arc
      `<path d="M ${O[0]} ${O[1]} A ${len} ${len} 0 0 ${sweep} ${L[0]} ${L[1]}" fill="none" stroke="${C.line}" stroke-width="2.5"/>`,
    ].join('');
  }
  function windowSym(S, E) {
    const dx = E[0] - S[0], dy = E[1] - S[1], L = Math.hypot(dx, dy);
    const nx = -dy / L, ny = dx / L, g = 5;
    return [
      `<line x1="${S[0]}" y1="${S[1]}" x2="${E[0]}" y2="${E[1]}" stroke="${C.paper}" stroke-width="${WALL_EXT + 4}" stroke-linecap="butt"/>`,
      `<line x1="${S[0] + nx * g}" y1="${S[1] + ny * g}" x2="${E[0] + nx * g}" y2="${E[1] + ny * g}" stroke="${C.soft}" stroke-width="3"/>`,
      `<line x1="${S[0] - nx * g}" y1="${S[1] - ny * g}" x2="${E[0] - nx * g}" y2="${E[1] - ny * g}" stroke="${C.soft}" stroke-width="3"/>`,
    ].join('');
  }
  // garage gate (sectional door) on a horizontal wall: opening + leaf + dashed track
  // inw: +1 if the garage interior is below the wall, −1 if above
  function gate(S, E, inw = 1) {
    return [
      `<line x1="${S[0]}" y1="${S[1]}" x2="${E[0]}" y2="${E[1]}" stroke="${C.paper}" stroke-width="${WALL_EXT + 4}" stroke-linecap="butt"/>`,
      `<line x1="${S[0]}" y1="${S[1]}" x2="${E[0]}" y2="${E[1]}" stroke="${C.soft}" stroke-width="4.5"/>`,
      `<line x1="${S[0]}" y1="${S[1] + 16 * inw}" x2="${E[0]}" y2="${E[1] + 16 * inw}" stroke="${C.line}" stroke-width="3" stroke-dasharray="14 9"/>`,
    ].join('');
  }

  // ---- fixtures (simple line symbols) ------------------------------
  function wc(cx, cy) {
    return `<g stroke="${C.soft}" stroke-width="3.5" fill="none">
      <ellipse cx="${cx}" cy="${cy + 8}" rx="26" ry="34"/>
      <rect x="${cx - 24}" y="${cy - 34}" width="48" height="20" rx="6"/></g>`;
  }
  function sink(cx, cy) {
    return `<g stroke="${C.soft}" stroke-width="3.5" fill="none">
      <rect x="${cx - 34}" y="${cy - 26}" width="68" height="52" rx="8"/>
      <ellipse cx="${cx}" cy="${cy + 2}" rx="20" ry="15"/></g>`;
  }
  function bath(x, y, w, h) {
    return `<g stroke="${C.soft}" stroke-width="3.5" fill="none">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22"/>
      <rect x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${h - 28}" rx="14"/>
      <circle cx="${x + w - 22}" cy="${y + h / 2}" r="5"/></g>`;
  }
  function cooktop(x, y) {
    let g = `<rect x="${x}" y="${y}" width="78" height="58" rx="6" fill="none" stroke="${C.soft}" stroke-width="3.5"/>`;
    [[26, 20], [56, 20], [26, 42], [56, 42]].forEach(([dx, dy]) => { g += `<circle cx="${x + dx}" cy="${y + dy}" r="9" fill="none" stroke="${C.soft}" stroke-width="3"/>`; });
    return g;
  }
  function hearth(side, x, y, depth, span) {
    // open haard projecting inward from an exterior wall
    if (side === 'east') {
      return `<g stroke="${C.warm}" stroke-width="4" fill="none">
        <rect x="${x - depth}" y="${y}" width="${depth}" height="${span}"/>
        <path d="M ${x - depth + 14} ${y + 16} L ${x - 6} ${y + 16} L ${x - 6} ${y + span - 16} L ${x - depth + 14} ${y + span - 16}"/></g>`;
    }
    return '';
  }
  // stairs: a run of treads with a direction arrow
  function stairs(x, y, w, h, dir, treads, label) {
    let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${C.line}" stroke-width="2"/>`;
    const vertical = (dir === 'up' || dir === 'down');
    const n = treads || 9;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      g += vertical
        ? `<line x1="${x}" y1="${y + t * h}" x2="${x + w}" y2="${y + t * h}" stroke="${C.line}" stroke-width="2.5"/>`
        : `<line x1="${x + t * w}" y1="${y}" x2="${x + t * w}" y2="${y + h}" stroke="${C.line}" stroke-width="2.5"/>`;
    }
    // arrow
    const mx = x + w / 2, ay0 = y + h - 26, ay1 = y + 26;
    g += `<line x1="${mx}" y1="${dir === 'up' ? ay0 : ay1}" x2="${mx}" y2="${dir === 'up' ? ay1 : ay0}" stroke="${C.soft}" stroke-width="4"/>`;
    const tip = dir === 'up' ? ay1 : ay0;
    g += `<path d="M ${mx - 12} ${tip + (dir === 'up' ? 16 : -16)} L ${mx} ${tip} L ${mx + 12} ${tip + (dir === 'up' ? 16 : -16)}" fill="none" stroke="${C.soft}" stroke-width="4"/>`;
    if (label && !UNDERLAY) g += txt(x + w / 2, y - 16, label, { size: 20, fill: C.quiet, weight: 600, ls: 1 });
    return g;
  }

  // quarter-turn (kwartslag) winder stair, traced from the bestektekening:
  // a long flight up the WEST edge of the shaft that winds 90° at the NORTH
  // end into a short top flight running EAST. Box (x,y,w,h); `arm` = flight
  // width. dir 'up' puts the ascent arrow head at the east top; 'down' puts
  // it at the south foot (the overloop view). label shown in sheet mode only.
  function qstairs(x, y, w, h, arm, dir, label) {
    const ink = C.line;
    let g = '';
    // L-shaped shaft outline
    const L = [[x, y], [x + w, y], [x + w, y + arm], [x + arm, y + arm], [x + arm, y + h], [x, y + h]];
    g += poly(L, { stroke: ink, w: 2 });
    // west flight treads (horizontal nosings), below the winder corner
    const wStart = y + arm, wEnd = y + h;
    const nW = Math.max(3, Math.round((wEnd - wStart) / 30));
    for (let i = 1; i < nW; i++) { const ty = wStart + (wEnd - wStart) * i / nW; g += line(x, ty, x + arm, ty, { stroke: ink, w: 2 }); }
    // north (top) flight treads (vertical nosings), east of the winder corner
    const tStart = x + arm, tEnd = x + w;
    const nT = Math.max(2, Math.round((tEnd - tStart) / 30));
    for (let i = 1; i < nT; i++) { const tx = tStart + (tEnd - tStart) * i / nT; g += line(tx, y, tx, y + arm, { stroke: ink, w: 2 }); }
    // winder treads fanning from the inner corner across the NW square
    const ix = x + arm, iy = y + arm;
    g += line(ix, iy, x + arm * 0.46, y, { stroke: ink, w: 2 });
    g += line(ix, iy, x, y + arm * 0.46, { stroke: ink, w: 2 });
    // ascent / descent arrow along the L centreline
    const cx = x + arm / 2, cy = y + arm / 2;
    const foot = y + h - 12, headX = x + w - 13;
    if (dir === 'down') {
      g += `<path d="M ${headX} ${cy} L ${cx} ${cy} L ${cx} ${foot}" fill="none" stroke="${C.soft}" stroke-width="3"/>`;
      g += `<path d="M ${cx - 7} ${foot - 12} L ${cx} ${foot} L ${cx + 7} ${foot - 12}" fill="none" stroke="${C.soft}" stroke-width="3"/>`;
    } else {
      g += `<path d="M ${cx} ${foot} L ${cx} ${cy} L ${headX} ${cy}" fill="none" stroke="${C.soft}" stroke-width="3"/>`;
      g += `<path d="M ${headX - 12} ${cy - 7} L ${headX} ${cy} L ${headX - 12} ${cy + 7}" fill="none" stroke="${C.soft}" stroke-width="3"/>`;
    }
    if (label && !UNDERLAY) g += txt(x + w / 2, y - 16, label, { size: 20, fill: C.quiet, weight: 600, ls: 1 });
    return g;
  }

  // ---- staircase sections, traced from the bestektekening ----------
  // ground→first: straight flight in the entree along the kitchen wall,
  // ascending west→east; dash-dot break where it passes the first-floor slab.
  function entreeStairs() {
    const ink = C.line;
    let g = '';
    g += line(360, 919, 612, 919, { stroke: ink, w: 2 });                  // south stringer
    for (let tx = 382; tx <= 558; tx += 22) g += line(tx, 827, tx, 919, { stroke: ink, w: 2 });
    // looplijn: foot tick + ascent arrowhead (east)
    g += line(366, 866, 380, 880, { stroke: ink, w: 2.5 });
    g += line(374, 862, 388, 876, { stroke: ink, w: 2.5 });
    g += line(382, 873, 570, 873, { stroke: C.soft, w: 3 });
    g += `<path d="M 570 860 L 592 873 L 570 886 Z" fill="${C.soft}"/>`;
    g += `<path d="M 632 821 L 600 925" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="13 6 3 6"/>`;
    if (!UNDERLAY) g += txt(601, 851, 'up', { size: 18, fill: C.quiet, weight: 600 });
    return g;
  }

  // first-floor overloop, per the bestektekening:
  // SE — stairwell where the ground-floor flight arrives (east arrow);
  // NW — foot of the attic flight: winder treads along the north wall,
  // turning south along the west wall (ascent arrow); dash-dot break between.
  function overloopStairs() {
    const ink = C.line;
    let g = '';
    // stairwell of the arriving flight
    g += line(455, 827, 565, 827, { stroke: ink, w: 2 });
    g += line(565, 827, 565, 925, { stroke: ink, w: 2 });
    g += line(405, 925, 565, 925, { stroke: ink, w: 2 });
    for (const tx of [499, 521, 543]) g += line(tx, 827, tx, 925, { stroke: ink, w: 2 });
    g += line(460, 876, 538, 876, { stroke: C.soft, w: 3 });
    g += `<path d="M 538 863 L 560 876 L 538 889 Z" fill="${C.soft}"/>`;
    // attic flight — visible foot below the first-floor ceiling cut
    g += line(452, 722, 452, 812, { stroke: ink, w: 2 });                  // east boundary
    for (const tx of [398, 416, 434]) g += line(tx, 726, tx, 800, { stroke: ink, w: 2 });
    g += line(443, 748, 384, 748, { stroke: C.soft, w: 3 });               // looplijn in…
    g += line(384, 748, 384, 793, { stroke: C.soft, w: 3 });               // …turning south
    g += `<path d="M 371 793 L 384 815 L 397 793 Z" fill="${C.soft}"/>`;
    // foot tick on the break line
    g += line(437, 807, 451, 825, { stroke: ink, w: 2.5 });
    g += line(445, 803, 459, 821, { stroke: ink, w: 2.5 });
    // break line: west wall → tick → south wall
    g += `<path d="M 352 841 L 446 816 L 425 925" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="13 6 3 6"/>`;
    if (!UNDERLAY) {
      g += txt(492, 794, 'up', { size: 17, fill: C.quiet, weight: 600 });
      g += txt(600, 871, 'down', { size: 17, fill: C.quiet, weight: 600 });
    }
    return g;
  }

  // zolder stairhead: the attic flight arrives along the west wall
  function zolderStairs() {
    const ink = C.line;
    let g = '';
    g += line(362, 722, 470, 722, { stroke: ink, w: 2 });
    g += line(470, 722, 470, 925, { stroke: ink, w: 2 });
    g += line(362, 925, 470, 925, { stroke: ink, w: 2 });
    for (let ty = 745; ty <= 903; ty += 22.5) g += line(362, ty, 470, ty, { stroke: ink, w: 2 });
    // looplijn: tick at the head, descent toward the south end
    g += line(409, 760, 423, 774, { stroke: ink, w: 2.5 });
    g += line(417, 756, 431, 770, { stroke: ink, w: 2.5 });
    g += line(416, 768, 416, 880, { stroke: C.soft, w: 3 });
    g += `<path d="M 403 880 L 416 902 L 429 880 Z" fill="${C.soft}"/>`;
    if (!UNDERLAY) g += txt(512, 884, 'down', { size: 18, fill: C.quiet, weight: 600 });
    return g;
  }

  // ---- dimension chains --------------------------------------------
  // side: 'top' (horizontal chain above) or 'left' (vertical chain at left)
  function dimChain(side, offset, ticks, W, H) {
    let g = '';
    const ext = 14;
    if (side === 'top') {
      const y = -offset;
      g += line(ticks[0].p, y, ticks[ticks.length - 1].p, y, { stroke: C.quiet, w: 1.5 });
      ticks.forEach((t) => {
        g += line(t.p, y - 7, t.p, y + 7, { stroke: C.quiet, w: 1.5 });
        g += line(t.p, y + 7, t.p, 0, { stroke: C.line, w: 1, dash: '4 5' });
      });
      for (let i = 0; i < ticks.length - 1; i++) {
        const a = ticks[i].p, b = ticks[i + 1].p;
        g += txt((a + b) / 2, y - 16, ticks[i].seg, { size: 21, fill: C.soft, anchor: 'middle' });
      }
    } else {
      const x = -offset;
      g += line(x, ticks[0].p, x, ticks[ticks.length - 1].p, { stroke: C.quiet, w: 1.5 });
      ticks.forEach((t) => {
        g += line(x - 7, t.p, x + 7, t.p, { stroke: C.quiet, w: 1.5 });
        g += line(x + 7, t.p, 0, t.p, { stroke: C.line, w: 1, dash: '4 5' });
      });
      for (let i = 0; i < ticks.length - 1; i++) {
        const a = ticks[i].p, b = ticks[i + 1].p;
        g += `<text x="${x - 14}" y="${(a + b) / 2}" font-family="${FONT}" font-size="21" fill="${C.soft}" text-anchor="middle" transform="rotate(-90 ${x - 14} ${(a + b) / 2})" dominant-baseline="middle">${ticks[i].seg}</text>`;
      }
    }
    return g;
  }

  // ---- room label block --------------------------------------------
  function roomLabel(r) {
    const cx = r.x + r.w / 2 + (r.lx || 0), cy = r.y + r.h / 2 + (r.ly || 0);
    if (r.vert) {
      return `<text x="${cx}" y="${cy}" font-family="${FONT}" font-size="16" fill="${C.ink}" text-anchor="middle" font-weight="700" letter-spacing="1" dominant-baseline="middle" transform="rotate(-90 ${cx} ${cy})">${esc(r.en)}</text>`;
    }
    if (r.small) {
      let g = txt(cx, cy - 7, r.en, { size: 17, fill: C.ink, weight: 700, ls: 1 });
      if (r.nl) g += txt(cx, cy + 11, r.nl, { size: 13, fill: C.quiet, weight: 400, ls: 2, style: 'italic' });
      return g;
    }
    let g = txt(cx, cy - 13, r.en, { size: 27, fill: C.ink, weight: 700, ls: 1.5 });
    g += txt(cx, cy + 14, r.nl, { size: 19, fill: C.quiet, weight: 400, ls: 3, style: 'italic' });
    if (r.note) g += txt(cx, cy + 40, r.note, { size: 17, fill: C.quiet, weight: 400 });
    return g;
  }

  // ===================================================================
  //  FLOOR DEFINITIONS  (cm)
  // ===================================================================
  const W = 1150, H = 1210;

  const GROUND = {
    id: 'ground', en: 'Ground Floor', nl: 'Begane grond',
    outline: [[0, 0], [680, 0], [680, 410], [1150, 410], [1150, 1210], [350, 1210], [350, 750], [0, 750]],
    intWalls: [
      [350, 0, 350, 750, 1],                             // garage | column — cavity wall, exterior thickness
      [350, 410, 680, 410],                              // bijkeuken | keuken
      [350, 827, 680, 827],                              // keuken | entree
      [680, 410, 680, 431, 1], [680, 686, 680, 827],     // 10cm ext-thickness stub at north + lower stub (open passage)
      [680, 827, 680, 1210],                             // entree | living
      [530, 1110, 680, 1110], [530, 1110, 530, 1210],    // toilet — inner 135×90, right wall 15
      [350, 1125, 400, 1125], [400, 1125, 400, 1210],    // M.K. — inner ≈40×75 on the west wall
    ],
    rooms: [
      { x: 0, y: 0, w: 350, h: 750, en: 'Garage', nl: 'Garage' },
      { x: 350, y: 0, w: 330, h: 410, en: 'Scullery', nl: 'Bijkeuken' },
      { x: 350, y: 410, w: 330, h: 417, en: 'Kitchen', nl: 'Keuken' },
      { x: 350, y: 827, w: 330, h: 260, en: 'Entrance', nl: 'Entree', ly: 25 },
      { x: 350, y: 1125, w: 50, h: 85, en: 'M.K.', nl: '', small: 1, vert: 1, lx: 3 },
      { x: 530, y: 1110, w: 150, h: 100, en: 'WC', nl: 'Toilet', small: 1, lx: -24, ly: 8 },
      { x: 680, y: 410, w: 470, h: 800, en: 'Living Room', nl: 'Woonkamer' },
    ],
    doors: [
      { H: [255, 0], a: [1, 0], s: [0, -1], l: 83 },         // garage pedestrian door — opens OUTWARD, ccw
      { H: [350, 60], a: [0, 1], s: [1, 0], l: 83 },         // garage→scullery (north end)
      { H: [658, 410], a: [-1, 0], s: [0, 1], l: 83 },       // scullery→kitchen
      { H: [688, 410], a: [1, 0], s: [0, 1], l: 83 },        // garden→living, north wall
      { H: [680, 915], a: [0, 1], s: [1, 0], l: 83 },        // entree→living (2×83, A)
      { H: [680, 1081], a: [0, -1], s: [1, 0], l: 83 },      // entree→living (2×83, B)
      { H: [350, 1078], a: [0, -1], s: [1, 0], l: 93 },      // front door (west wall, 93)
      { H: [545, 1110], a: [1, 0], s: [0, 1], l: 73 },       // toilet
      { H: [400, 1130], a: [0, 1], s: [1, 0], l: 68 },       // meter cupboard (68 door, opens to entree)
    ],
    windows: [
      [[680, 150], [680, 300]],       // scullery east
      [[350, 764], [350, 818]],       // kitchen west — full section between the two walls
      [[785, 410], [1110, 410]],      // living north — runs from the garden door
      [[1150, 1112], [1150, 1204]],   // corner window — east return (≈70)
      [[864, 1210], [1146, 1210]],    // corner window — south run
      [[350, 880], [350, 955]],       // entree west sidelight
    ],
    fixtures: () => [
      gate([70, 750], [300, 750], -1),   // gate in the garage SOUTH wall — the front
      hearth('east', 1150, 575, 46, 150),
      // kitchen counter: full bottom wall + 2/3 up the west wall (depth 60)
      poly([[361, 551], [421, 551], [421, 761], [674, 761], [674, 821], [361, 821]], { stroke: C.soft, w: 2.5 }),
      `<g transform="rotate(90 391 620)">${cooktop(352, 591)}</g>`,
      sink(560, 791),
      // wc rotated 90° cw — cistern against the right (east) wall of the toilet
      `<g transform="rotate(90 639 1160)">${wc(639, 1160)}</g>`,
      entreeStairs(),
    ],
    notesBeam: null,
    dimsTop: [{ p: 0, seg: '322' }, { p: 350, seg: '287' }, { p: 680, seg: '442' }, { p: 1150, seg: '' }],
    dimsLeft: [{ p: 0, seg: '750' }, { p: 750, seg: '460' }, { p: 1210, seg: '' }],
  };

  const FIRST = {
    id: 'first', en: 'First Floor', nl: 'Verdieping',
    outline: [[350, 410], [1150, 410], [1150, 1210], [350, 1210]],
    ghost: [[0, 0], [350, 0], [350, 750], [0, 750]],
    afschot: { from: [300, 560], to: [60, 760] },
    intWalls: [
      [675, 410, 675, 1210],                 // column wall: 292 | 10 | 442
      [350, 717, 675, 717],                  // bedroom 2 (274) | landing
      [350, 927, 675, 927],                  // landing (200) | bathroom (250)
      [675, 822, 1150, 822],                 // bedroom (379) | study (355)
    ],
    rooms: [
      { x: 350, y: 410, w: 325, h: 307, en: 'Bedroom 2', nl: 'Slaapkamer' },
      { x: 350, y: 717, w: 325, h: 210, en: 'Landing', nl: 'Overloop', lx: 55, ly: -60 },
      { x: 350, y: 927, w: 325, h: 283, en: 'Bathroom', nl: 'Badkamer', ly: 46 },
      { x: 675, y: 410, w: 475, h: 412, en: 'Bedroom', nl: 'Slaapkamer' },
      { x: 675, y: 822, w: 475, h: 388, en: 'Study', nl: 'Slaapkamer' },
    ],
    doors: [
      { H: [655, 717], a: [-1, 0], s: [0, -1], l: 83 },  // landing→bedroom 2
      { H: [655, 927], a: [-1, 0], s: [0, 1], l: 83 },   // landing→bathroom
      { H: [675, 727], a: [0, 1], s: [1, 0], l: 83 },    // landing→bedroom
      { H: [675, 837], a: [0, 1], s: [1, 0], l: 83 },    // landing→study
    ],
    windows: [
      [[475, 410], [585, 410]],      // bedroom 2 north
      [[845, 410], [1060, 410]],     // bedroom north
      [[1150, 500], [1150, 700]],    // bedroom east
      [[1150, 900], [1150, 1100]],   // study east
      [[850, 1210], [1080, 1210]],   // study south
      [[430, 1210], [560, 1210]],    // bathroom south
    ],
    flue: { x: 1112, y: 772, w: 34, h: 34 },
    fixtures: () => [
      bath(372, 1098, 230, 92),
      wc(615, 988),
      sink(430, 962),
      // overloop stair section per the bestektekening
      overloopStairs(),
    ],
    dimsTop: [{ p: 350, seg: '292' }, { p: 675, seg: '442' }, { p: 1150, seg: '' }],
    dimsLeft: [{ p: 410, seg: '274' }, { p: 717, seg: '200' }, { p: 927, seg: '250' }, { p: 1210, seg: '' }],
  };

  const ATTIC = {
    id: 'attic', en: 'Attic', nl: 'Zolder',
    eaves: [[350, 410], [1150, 410], [1150, 1210], [350, 1210]],
    knee: [[350, 410, 350, 1210], [1150, 410, 1150, 1210]],   // side walls — 800 apart outside, full 800 long
    divider: [675, 410, 675, 1210],                           // 10cm wall above the 1st-floor column wall — full 800 long
    rooms: [
      { x: 350, y: 410, w: 800, h: 800, en: 'Attic', nl: 'Zolder', ly: -150 },
    ],
    doors: [
      { H: [675, 768], a: [0, 1], s: [1, 0], l: 83 },         // divider — door in the middle, opens east
    ],
    boiler: { x: 975, y: 470, w: 160, h: 170 },               // C.V. ketel — top-right, against the east wall
    flue: { x: 1080, y: 645, w: 55, h: 55 },                  // chimney stub — under the ketel
    vent: [750, 1160],
    fixtures: () => [
      zolderStairs(),                                         // stairhead arriving from the first floor
    ],
    dimsTop: [{ p: 350, seg: '800' }, { p: 1150, seg: '' }],
    dimsLeft: [{ p: 410, seg: '800' }, { p: 1210, seg: '' }],
  };

  const FLOOR_DEFS = { ground: GROUND, first: FIRST, attic: ATTIC };

  // ===================================================================
  //  RENDER
  // ===================================================================
  function buildFloorSVG(id, opts = {}) {
    const F = FLOOR_DEFS[id];
    const saved = { ...C };
    if (opts.palette) Object.assign(C, opts.palette);
    UNDERLAY = opts.mode === 'underlay';
    const ML = 215, MT = 150, MR = 70, MB = 120;
    const vb = UNDERLAY ? `0 0 ${W} ${H}` : `${-ML} ${-MT} ${W + ML + MR} ${H + MT + MB}`;
    let g = '';

    // title block (sheet mode only)
    if (!UNDERLAY) {
      g += txt(-ML + 8, -MT + 34, F.en, { size: 40, fill: C.ink, weight: 700, anchor: 'start', ls: 0.5 });
      g += txt(-ML + 10, -MT + 64, F.nl.toUpperCase(), { size: 19, fill: C.quiet, weight: 600, anchor: 'start', ls: 4 });
      g += line(-ML + 10, -MT + 80, -ML + 10 + 150, -MT + 80, { stroke: C.ink, w: 2 });
      g += txt(W + MR - 6, -MT + 34, 'SCALE 1:100', { size: 16, fill: C.quiet, weight: 600, anchor: 'end', ls: 2 });
      g += txt(W + MR - 6, -MT + 56, 'cm · north ↑', { size: 15, fill: C.quiet, anchor: 'end', ls: 1 });
    }

    // ghost footprint below (upper floors)
    if (F.ghost) g += poly(F.ghost, { stroke: C.line, w: 2.5, dash: '10 9' });
    if (F.afschot && !UNDERLAY) g += `<line x1="${F.afschot.from[0]}" y1="${F.afschot.from[1]}" x2="${F.afschot.to[0]}" y2="${F.afschot.to[1]}" stroke="${C.line}" stroke-width="2"/>` +
      txt((F.ghost[1][0] + F.ghost[3][0]) / 2 - 40, (F.ghost[1][1] + F.ghost[3][1]) / 2, 'afschot', { size: 17, fill: C.quiet, style: 'italic' });

    // interior floor fill (define the inside)
    const fillPoly = F.outline || F.eaves;
    if (F.outline) g += poly(F.outline, { fill: C.field });

    // attic: roof eaves (thin dashed) + knee walls + divider
    if (F.eaves) {
      g += poly(F.eaves, { fill: C.field, stroke: C.line, w: 3, dash: '12 8' });
      // inner eave line
      const e = F.eaves;
      g += rect(e[0][0] + 70, e[0][1] + 70, (e[1][0] - e[0][0]) - 140, (e[2][1] - e[1][1]) - 140, { stroke: C.line, w: 2, dash: '6 7' });
      F.knee.forEach((k) => g += line(k[0], k[1], k[2], k[3], { stroke: C.ink, w: WALL_KNEE }));
      if (F.divider) g += line(F.divider[0], F.divider[1], F.divider[2], F.divider[3], { stroke: C.ink, w: WALL_INT });
    }

    // interior partitions (5th element = 1 → cavity wall at exterior thickness)
    if (F.intWalls) F.intWalls.forEach((w) => g += line(w[0], w[1], w[2], w[3], { stroke: C.ink, w: w[4] ? WALL_EXT : WALL_INT }));

    // exterior wall (heavy) — drawn over fill
    if (F.outline) g += poly(F.outline, { stroke: C.ink, w: WALL_EXT, join: 'miter' });

    // fixtures
    if (F.fixtures) g += (typeof F.fixtures === 'function' ? F.fixtures() : F.fixtures).join('');
    if (F.boiler) {
      const b = F.boiler;
      g += rect(b.x, b.y, b.w, b.h, { stroke: C.warm, w: 4 });
      g += `<g stroke="${C.warm}" stroke-width="3" fill="none"><circle cx="${b.x + b.w / 2}" cy="${b.y + 52}" r="22"/><rect x="${b.x + b.w / 2 - 16}" y="${b.y + 110}" width="32" height="50" rx="6"/></g>`;
      if (!UNDERLAY) {
        g += txt(b.x - 16, b.y + b.h / 2 - 10, 'C.V. ketel', { size: 19, fill: C.warm, weight: 600, anchor: 'end' });
        g += txt(b.x - 16, b.y + b.h / 2 + 12, '+ boiler', { size: 19, fill: C.warm, weight: 600, anchor: 'end' });
      }
    }
    if (F.chimney) g += rect(F.chimney.x, F.chimney.y, F.chimney.w, F.chimney.h, { stroke: C.soft, w: 2.5, dash: '8 7' });
    if (F.flue) g += rect(F.flue.x, F.flue.y, F.flue.w, F.flue.h, { fill: C.ink });
    if (F.vent) g += circ(F.vent[0], F.vent[1], 10, { stroke: C.soft, w: 3 }) + (UNDERLAY ? '' : txt(F.vent[0], F.vent[1] + 30, 'vent.', { size: 17, fill: C.quiet, style: 'italic' }));

    // windows + doors (cut into walls)
    if (F.windows) F.windows.forEach((wd) => g += windowSym(wd[0], wd[1]));
    if (F.doors) F.doors.forEach((d) => g += door(d.H, d.a, d.s, d.l));

    // steel beam note (ground)
    if (F.notesBeam) {
      const n = F.notesBeam;
      g += line(n.x1, n.y1, n.x2, n.y2, { stroke: C.accent, w: 6, cap: 'round' });
      g += `<text x="${n.x2 + 12}" y="${(n.y1 + n.y2) / 2}" font-family="${FONT}" font-size="17" fill="${C.accent}" transform="rotate(90 ${n.x2 + 12} ${(n.y1 + n.y2) / 2})" dominant-baseline="middle">${n.label}</text>`;
    }

    // room labels + dimension chains (sheet mode only)
    if (!UNDERLAY) {
      F.rooms.forEach((r) => g += roomLabel(r));
      g += dimChain('top', 70, F.dimsTop, W, H);
      g += dimChain('left', 90, F.dimsLeft, W, H);
    }

    const bg = UNDERLAY ? '' : `<rect x="${-ML}" y="${-MT}" width="${W + ML + MR}" height="${H + MT + MB}" fill="${C.paper}"/>`;
    const sizing = UNDERLAY
      ? 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible"'
      : 'width="100%" style="display:block"';
    const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ${sizing}>${bg}${g}</svg>`;
    UNDERLAY = false;
    Object.assign(C, saved);
    return out;
  }

  window.FLOOR_DEFS = FLOOR_DEFS;
  window.buildFloorSVG = buildFloorSVG;
  window.FLOOR_PALETTE = C;
})();
