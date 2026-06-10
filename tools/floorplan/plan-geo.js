/* ============================================================
   plan-geo.js — floor-plan geometry, traced 1:1 from the
   bestektekening (Kavel 24) dimension chains (cm).

   Footprint is a pinwheel. Key fact: the GARAGE FRONT (south wall)
   is set back 460 cm from the HOUSE FRONT (south wall) — that single
   offset makes both notches (open ground below the garage; open
   ground above the living room).

   Shared coordinate box for all floors: 1150 wide × 1210 deep (cm),
   so floors REGISTER — the living room sits under the master bedroom.

   North (street) is the top (y=0). Bestek numbers:
     • Garage block 350 × 750 outer (322 × 694 interior), top-left
     • House front (south wall) at y=1210 → 1210−750 = 460 setback ✓
     • Main block = 800 × 800 outer, x 350..1150, y 410..1210
     • Ground middle column (287 interior), north→south:
       Bijkeuken 0..410 | Keuken 410..827 | Entree+stairs 827..1087 |
       M.K. + Toilet row (90 interior) at the south wall
     • Keuken↔woonkamer largely OPEN under the stalen balk HE 160 A;
       entree↔woonkamer via 2×83 double doors; front door 93 in the
       entree WEST wall
     • Woonkamer 442 × 744 interior; open haard in the NE corner
     • Verdieping 800 × 800: left col 292 interior (slaapkamer 274 /
       overloop 200 / badkamer 250); right col 442 (slaapkamer 379 /
       slaapkamer 355)
     • Zolder: ONE open space (no divider on the bestek); knee walls
       ±45cm in from east + west; c.v. ketel + boiler closet on the
       west knee wall, mid-depth

   HA entity mapping (names match home.yaml):
     • Bedroom (master) → top-right slaapkamer (379)
     • Study           → bottom-right slaapkamer (355)
     • Bathroom        → badkamer
     • Bedroom 2       → top-left slaapkamer  (HA name TBC)

   Rooms position as a % of the shared box — ONE coordinate system,
   walls/labels/tints/taps can't drift. Labels English; Dutch name
   kept as a tag. Exposes window.FLOORS.
   ============================================================ */
(function () {
  const W = 1150, H = 1210;
  const GAR_R = 350;     // garage right wall (x)
  const MID_R = 680;     // middle column right wall (x) = main-block / woonkamer split
  const GAR_B = 750;     // garage south wall (y)
  const MB_T = 410;      // main-block north wall (y)  (1210 − 800)
  const KIT_B = 827;     // keuken south wall (y)      (750 + 72 + ½·10)
  const ENT_B = 1087;    // entree south wall (y)      (KIT_B + 250 + 10)

  const FLOORS = [
    {
      id: 'ground', label: 'Ground', title: 'Ground Floor', nl: 'Begane grond',
      W, H,
      outline: [[0, 0], [MID_R, 0], [MID_R, MB_T], [W, MB_T], [W, H], [GAR_R, H], [GAR_R, GAR_B], [0, GAR_B]],
      rooms: [
        { id: 'garage', name: 'Garage', nl: 'Garage', x: 0, y: 0, w: GAR_R, h: GAR_B,
          bind: { kind: 'sensor', temp: 'Garage' } },
        { id: 'pantry', name: 'Utility', nl: 'Bijkeuken', x: GAR_R, y: 0, w: MID_R - GAR_R, h: MB_T,
          bind: { kind: 'sensor', temp: 'Utility' } },
        { id: 'kitchen', name: 'Kitchen', nl: 'Keuken', x: GAR_R, y: MB_T, w: MID_R - GAR_R, h: KIT_B - MB_T,
          bind: { kind: 'switch', temp: 'Kitchen', switch: 'Fridge', switchLabel: 'Fridge' } },
        { id: 'hall', name: 'Entrance', nl: 'Entree', x: GAR_R, y: KIT_B, w: MID_R - GAR_R, h: H - KIT_B, stairs: true,
          bind: { kind: 'circ' } },
        { id: 'meter', name: 'Meter', nl: 'Meterkast', x: GAR_R, y: 1125, w: 50, h: H - 1125, mark: true,
          bind: { kind: 'circ' } },
        { id: 'toilet', name: 'Toilet', nl: 'Toilet', x: 530, y: 1110, w: 150, h: H - 1110,
          bind: { kind: 'circ' } },
        { id: 'living', name: 'Living Room', nl: 'Woonkamer', x: MID_R, y: MB_T, w: W - MID_R, h: H - MB_T, hearth: 'right',
          bind: { kind: 'climate', climate: 'Living Room', temp: 'Living Room', light: 'Living Lights' } },
      ],
    },
    {
      id: 'first', label: 'First', title: 'First Floor', nl: 'Verdieping',
      W, H,
      outline: [[GAR_R, MB_T], [W, MB_T], [W, H], [GAR_R, H]],
      ghost: [[0, 0], [GAR_R, 0], [GAR_R, GAR_B], [0, GAR_B]],
      rooms: [
        { id: 'bed2', name: 'Bedroom 2', nl: 'Slaapkamer', x: GAR_R, y: MB_T, w: MID_R - GAR_R, h: 307,
          bind: { kind: 'sensor', temp: null } },
        { id: 'landing', name: 'Landing', nl: 'Overloop', x: GAR_R, y: MB_T + 307, w: MID_R - GAR_R, h: 210, stairs: true,
          bind: { kind: 'circ' } },
        { id: 'bath', name: 'Bathroom', nl: 'Badkamer', x: GAR_R, y: MB_T + 517, w: MID_R - GAR_R, h: H - (MB_T + 517),
          bind: { kind: 'sensor', temp: 'Bathroom' } },
        { id: 'master', name: 'Bedroom', nl: 'Slaapkamer', x: MID_R, y: MB_T, w: W - MID_R, h: 412,
          bind: { kind: 'climate', climate: 'Bedroom', temp: 'Bedroom', co2: true, waterbed: 'Waterbed' } },
        { id: 'study', name: 'Study', nl: 'Slaapkamer', x: MID_R, y: MB_T + 412, w: W - MID_R, h: H - (MB_T + 412),
          bind: { kind: 'climate', climate: 'Study', temp: 'Study' } },
      ],
    },
    {
      id: 'attic', label: 'Attic', title: 'Attic', nl: 'Zolder',
      W, H,
      eaves: { x: GAR_R, y: MB_T, w: W - GAR_R, h: H - MB_T },
      ghost: [[0, 0], [GAR_R, 0], [GAR_R, GAR_B], [0, GAR_B]],
      rooms: [
        // overlay bound to the main room east of the divider wall, so the
        // label doesn't straddle the divider (the west side is the stairhead)
        { id: 'attic', name: 'Attic', nl: 'Zolder', x: MID_R, y: MB_T, w: W - MID_R, h: H - MB_T,
          bind: { kind: 'climate', climate: 'Attic', temp: 'Attic' } },
        { id: 'boiler', name: 'Boiler', nl: 'C.V. ketel', x: 940, y: 470, w: 160, h: 170, mark: true,
          bind: { kind: 'switch', switch: 'Boiler', switchLabel: 'Boiler', power: 'Boiler', tapToggle: 'Boiler' } },
      ],
    },
  ];

  window.FLOORS = FLOORS;
})();
