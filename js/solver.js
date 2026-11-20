/* Sudoku Uitleg: logische stap-voor-stap oplosser.
   Werkt in browser (window.SudokuSolver), in een Web Worker en in Node (module.exports). */
(function (factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { self.SudokuSolver = api; self.SudokuSolverFactory = factory; }
})(function () {
  'use strict';

  // ---------- basis ----------
  const ROW = i => Math.floor(i / 9);
  const COL = i => i % 9;
  const BOX = i => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
  const name = i => 'R' + (ROW(i) + 1) + 'C' + (COL(i) + 1);
  const BIT = d => 1 << d;
  const ALL = 0x3FE; // bits 1..9

  // houses: 0-8 rijen, 9-17 kolommen, 18-26 blokken
  const HOUSES = [];
  for (let r = 0; r < 9; r++) HOUSES.push([...Array(9)].map((_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) HOUSES.push([...Array(9)].map((_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3, h = [];
    for (let k = 0; k < 9; k++) h.push((br + Math.floor(k / 3)) * 9 + bc + (k % 3));
    HOUSES.push(h);
  }
  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const s = new Set([...HOUSES[ROW(i)], ...HOUSES[9 + COL(i)], ...HOUSES[18 + BOX(i)]]);
    s.delete(i);
    PEERS.push([...s]);
  }
  const BOXNAMES = ['linksboven', 'middenboven', 'rechtsboven', 'middenlinks', 'midden',
    'middenrechts', 'linksonder', 'middenonder', 'rechtsonder'];
  const houseType = h => (h < 9 ? 'row' : h < 18 ? 'col' : 'box');
  const houseName = h => h < 9 ? 'rij ' + (h + 1) : h < 18 ? 'kolom ' + (h - 8) : 'blok ' + BOXNAMES[h - 18];
  const houseOf = (type, i) => type === 'row' ? ROW(i) : type === 'col' ? 9 + COL(i) : 18 + BOX(i);
  const digitsOf = m => { const a = []; for (let d = 1; d <= 9; d++) if (m & BIT(d)) a.push(d); return a; };
  const popcount = m => digitsOf(m).length;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' en ' + a[a.length - 1];

  // ---------- controle ----------
  function conflicts(grid) {
    const bad = new Set();
    for (const h of HOUSES) {
      const seen = {};
      for (const i of h) {
        const v = grid[i];
        if (!v) continue;
        if (seen[v] !== undefined) { bad.add(i); bad.add(seen[v]); } else seen[v] = i;
      }
    }
    return [...bad];
  }

  // Telt oplossingen (tot max). Alleen voor controle, nooit voor uitleg.
  function countSolutions(grid, max = 2) {
    const g = Array.from(grid);
    let count = 0, solution = null;
    function cand(i) {
      let m = ALL;
      for (const p of PEERS[i]) if (g[p]) m &= ~BIT(g[p]);
      return m;
    }
    function rec() {
      if (count >= max) return;
      let best = -1, bm = 0, bc = 10;
      for (let i = 0; i < 81; i++) if (!g[i]) {
        const m = cand(i), n = popcount(m);
        if (n < bc) { bc = n; best = i; bm = m; if (n === 0) return; }
      }
      if (best < 0) { count++; if (!solution) solution = g.slice(); return; }
      for (const d of digitsOf(bm)) { g[best] = d; rec(); g[best] = 0; }
    }
    if (conflicts(g).length) return { count: 0, solution: null };
    rec();
    return { count, solution };
  }

  // ---------- state ----------
  class State {
    constructor(grid) {
      this.grid = Array.from(grid);
      this.elim = new Array(81).fill(0);        // weggestreepte kandidaten
      this.elimStep = [...Array(81)].map(() => ({})); // [cel][cijfer] = stapnummer
    }
    clone() {
      const s = new State(this.grid);
      s.elim = this.elim.slice();
      s.elimStep = this.elimStep.map(o => Object.assign({}, o));
      return s;
    }
    seenMask(i) {
      let m = 0;
      for (const p of PEERS[i]) if (this.grid[p]) m |= BIT(this.grid[p]);
      return m;
    }
    cands(i) { return this.grid[i] ? 0 : (ALL & ~this.seenMask(i) & ~this.elim[i]); }
    allCands() { return [...Array(81)].map((_, i) => this.cands(i)); }
  }

  // Vind geplaatste cijfers d die cel i blokkeren, met de eenheid waardoor.
  function blockersFor(state, i, d) {
    const res = [];
    for (const type of ['row', 'col', 'box']) {
      const h = houseOf(type, i);
      for (const p of HOUSES[h]) if (p !== i && state.grid[p] === d) res.push({ src: p, unit: h });
    }
    return res;
  }

  // ---------- techniek 1: verborgen enkele (enige plek voor cijfer in huis) ----------
  function findHiddenSingles(state) {
    const out = [];
    for (let h = 0; h < 27; h++) {
      const cells = HOUSES[h];
      for (let d = 1; d <= 9; d++) {
        if (cells.some(i => state.grid[i] === d)) continue;
        const free = cells.filter(i => !state.grid[i] && (state.cands(i) & BIT(d)));
        if (free.length !== 1) continue;
        out.push(buildHiddenSingle(state, h, d, free[0]));
      }
    }
    return out;
  }

  function buildHiddenSingle(state, h, d, target) {
    const cells = HOUSES[h];
    const occupied = cells.filter(i => state.grid[i]);
    const emptyOthers = cells.filter(i => !state.grid[i] && i !== target);
    // greedy: kies zo weinig mogelijk bron-cijfers
    const opts = new Map();
    const earlier = [];
    for (const i of emptyOthers) {
      const b = blockersFor(state, i, d).filter(x => x.unit !== h);
      if (b.length) opts.set(i, b); else earlier.push(i);
    }
    const chosen = []; // {src, unit, cells:[]}
    let rest = [...opts.keys()];
    while (rest.length) {
      const score = new Map();
      for (const i of rest) for (const b of opts.get(i)) {
        const k = b.src + ':' + b.unit;
        if (!score.has(k)) score.set(k, { src: b.src, unit: b.unit, cells: [] });
        score.get(k).cells.push(i);
      }
      let best = null;
      for (const v of score.values()) if (!best || v.cells.length > best.cells.length) best = v;
      chosen.push(best);
      rest = rest.filter(i => !best.cells.includes(i));
    }
    chosen.sort((a, b) => a.unit - b.unit);
    const blocked = new Set();
    for (const c of chosen) for (const p of HOUSES[c.unit]) blocked.add(p);

    const lines = [];
    for (const c of chosen) {
      lines.push('De ' + d + ' op ' + name(c.src) + ' blokkeert ' + houseName(c.unit) +
        ': ' + list(c.cells.map(name)) + ' ' + (c.cells.length > 1 ? 'vallen' : 'valt') + ' af.');
    }
    for (const i of earlier) {
      const st = state.elimStep[i][d];
      lines.push(name(i) + ' viel af in stap ' + st + ' (kandidaat ' + d + ' weggestreept).');
    }
    if (occupied.length) {
      lines.push('Al bezet: ' + list(occupied.map(i => name(i) + ' (' + state.grid[i] + ')')) + '.');
    }
    lines.push('Alleen ' + name(target) + ' blijft over, dus ' + name(target) + ' = ' + d + '.');

    const t = houseType(h);
    return {
      type: 'hiddenSingle', technique: 'Enige plek in ' + (t === 'box' ? 'blok' : t === 'row' ? 'rij' : 'kolom'),
      title: 'Zoek de ' + d + ' in ' + houseName(h),
      digit: d, place: { cell: target, digit: d }, eliminations: [],
      lines,
      hl: {
        house: cells.slice(), blocked: [...blocked], sources: chosen.map(c => c.src),
        excluded: emptyOthers, occupied, target, digitFocus: d
      },
      score: (t === 'box' ? 0 : 10) + chosen.length * 2 + earlier.length * 5
    };
  }

  // ---------- techniek 2: naakte enkele (cel met maar 1 kandidaat) ----------
  function findNakedSingles(state) {
    const out = [];
    for (let i = 0; i < 81; i++) {
      if (state.grid[i]) continue;
      const m = state.cands(i);
      if (popcount(m) !== 1) continue;
      const d = digitsOf(m)[0];
      const per = { row: [], col: [], box: [] };
      const src = [];
      const used = new Set();
      for (const type of ['row', 'col', 'box']) {
        for (const p of HOUSES[houseOf(type, i)]) {
          const v = state.grid[p];
          if (v && !used.has(v)) { used.add(v); per[type].push(v); src.push(p); }
        }
      }
      const lines = [];
      if (per.row.length) lines.push('Rij ' + (ROW(i) + 1) + ' heeft al: ' + list(per.row.sort()) + '.');
      if (per.col.length) lines.push('Kolom ' + (COL(i) + 1) + ' heeft daarnaast: ' + list(per.col.sort()) + '.');
      if (per.box.length) lines.push('Blok ' + BOXNAMES[BOX(i)] + ' heeft daarnaast: ' + list(per.box.sort()) + '.');
      const el = digitsOf(state.elim[i] & ~state.seenMask(i));
      if (el.length) lines.push('Eerder weggestreept: ' + list(el) + '.');
      lines.push('Het enige cijfer dat overblijft is ' + d + ', dus ' + name(i) + ' = ' + d + '.');
      const house = [...new Set([...HOUSES[ROW(i)], ...HOUSES[9 + COL(i)], ...HOUSES[18 + BOX(i)]])];
      out.push({
        type: 'nakedSingle', technique: 'Enige cijfer in vakje',
        title: 'Welk cijfer past nog in ' + name(i) + '?',
        digit: d, place: { cell: i, digit: d }, eliminations: [], lines,
        hl: { house, blocked: [], sources: src, excluded: [], occupied: [], target: i, digitFocus: 0 },
        score: 30
      });
    }
    return out;
  }

  // ---------- geavanceerd: alleen wegstrepen ----------
  function mkElim(state, list_) {
    return list_.filter(e => !state.grid[e.cell] && (state.cands(e.cell) & BIT(e.digit)));
  }

  function findLocked(state, C) {
    for (let d = 1; d <= 9; d++) {
      // pointing: in blok alle d in 1 rij/kolom
      for (let b = 18; b < 27; b++) {
        const pos = HOUSES[b].filter(i => C[i] & BIT(d));
        if (pos.length < 2) continue;
        for (const type of ['row', 'col']) {
          const u = houseOf(type, pos[0]);
          if (!pos.every(i => houseOf(type, i) === u)) continue;
          const el = mkElim(state, HOUSES[u].filter(i => BOX(i) !== b - 18 && (C[i] & BIT(d))).map(cell => ({ cell, digit: d })));
          if (el.length) return {
            type: 'locked', technique: 'Wijzend paar/drietal',
            title: 'De ' + d + ' in blok ' + BOXNAMES[b - 18] + ' zit vast in ' + houseName(u),
            digit: d, place: null, eliminations: el,
            lines: [
              'In blok ' + BOXNAMES[b - 18] + ' kan de ' + d + ' alleen op ' + list(pos.map(name)) + '.',
              'Die liggen allemaal in ' + houseName(u) + '. De ' + d + ' van ' + houseName(u) + ' moet dus in dit blok staan.',
              'Daarom kan de ' + d + ' niet op ' + list(el.map(e => name(e.cell))) + '.'
            ],
            hl: { house: HOUSES[u].concat(HOUSES[b]), pattern: pos.map(cell => ({ cell, digit: d })), digitFocus: d }
          };
        }
      }
      // claiming: in rij/kolom alle d in 1 blok
      for (let u = 0; u < 18; u++) {
        const pos = HOUSES[u].filter(i => C[i] & BIT(d));
        if (pos.length < 2) continue;
        const b = BOX(pos[0]);
        if (!pos.every(i => BOX(i) === b)) continue;
        const el = mkElim(state, HOUSES[18 + b].filter(i => houseOf(houseType(u), i) !== u && (C[i] & BIT(d))).map(cell => ({ cell, digit: d })));
        if (el.length) return {
          type: 'locked', technique: 'Vergrendeld in blok',
          title: 'De ' + d + ' van ' + houseName(u) + ' zit in blok ' + BOXNAMES[b],
          digit: d, place: null, eliminations: el,
          lines: [
            'In ' + houseName(u) + ' kan de ' + d + ' alleen op ' + list(pos.map(name)) + '.',
            'Die liggen allemaal in blok ' + BOXNAMES[b] + '. De ' + d + ' van dat blok komt dus in ' + houseName(u) + '.',
            'Daarom kan de ' + d + ' niet op ' + list(el.map(e => name(e.cell))) + '.'
          ],
          hl: { house: HOUSES[u].concat(HOUSES[18 + b]), pattern: pos.map(cell => ({ cell, digit: d })), digitFocus: d }
        };
      }
    }
    return null;
  }

  function combos(arr, k, start = 0, pre = [], out = []) {
    if (pre.length === k) { out.push(pre.slice()); return out; }
    for (let j = start; j < arr.length; j++) { pre.push(arr[j]); combos(arr, k, j + 1, pre, out); pre.pop(); }
    return out;
  }
  const WORD = { 2: 'paar', 3: 'drietal', 4: 'viertal' };

  function findNakedSubset(state, C, k) {
    for (let h = 0; h < 27; h++) {
      const empt = HOUSES[h].filter(i => C[i] && popcount(C[i]) <= k);
      if (empt.length < k) continue;
      for (const set of combos(empt, k)) {
        const m = set.reduce((a, i) => a | C[i], 0);
        if (popcount(m) !== k) continue;
        const ds = digitsOf(m);
        const el = [];
        for (const i of HOUSES[h]) if (!set.includes(i) && C[i]) for (const d of ds) if (C[i] & BIT(d)) el.push({ cell: i, digit: d });
        if (!el.length) continue;
        return {
          type: 'nakedSubset', technique: 'Naakt ' + WORD[k],
          title: 'Naakt ' + WORD[k] + ' ' + ds.join('/') + ' in ' + houseName(h),
          digit: 0, place: null, eliminations: el,
          lines: [
            'In ' + houseName(h) + ' kunnen ' + list(set.map(name)) + ' alleen ' + list(ds) + ' bevatten.',
            k + ' vakjes, ' + k + ' cijfers: die cijfers zitten dus zeker in deze vakjes.',
            'Streep ' + list(ds) + ' weg uit de andere vakjes van ' + houseName(h) + ': ' + list([...new Set(el.map(e => name(e.cell)))]) + '.'
          ],
          hl: { house: HOUSES[h].slice(), pattern: set.flatMap(i => digitsOf(C[i]).map(d => ({ cell: i, digit: d }))), digitFocus: 0 }
        };
      }
    }
    return null;
  }

  function findHiddenSubset(state, C, k) {
    for (let h = 0; h < 27; h++) {
      const cells = HOUSES[h];
      const ds = [];
      for (let d = 1; d <= 9; d++) {
        const n = cells.filter(i => C[i] & BIT(d)).length;
        if (n >= 2 && n <= k) ds.push(d);
      }
      for (const dset of combos(ds, k)) {
        const pos = cells.filter(i => dset.some(d => C[i] & BIT(d)));
        if (pos.length !== k) continue;
        const mask = dset.reduce((a, d) => a | BIT(d), 0);
        const el = [];
        for (const i of pos) for (const d of digitsOf(C[i] & ~mask)) el.push({ cell: i, digit: d });
        if (!el.length) continue;
        return {
          type: 'hiddenSubset', technique: 'Verborgen ' + WORD[k],
          title: 'Verborgen ' + WORD[k] + ' ' + dset.join('/') + ' in ' + houseName(h),
          digit: 0, place: null, eliminations: el,
          lines: [
            'In ' + houseName(h) + ' kunnen ' + list(dset) + ' alleen op ' + list(pos.map(name)) + '.',
            k + ' cijfers passen maar in ' + k + ' vakjes: die vakjes zijn dus voor deze cijfers.',
            'Andere kandidaten in die vakjes vallen af.'
          ],
          hl: { house: cells.slice(), pattern: pos.flatMap(i => dset.filter(d => C[i] & BIT(d)).map(d => ({ cell: i, digit: d }))), digitFocus: 0 }
        };
      }
    }
    return null;
  }

  function findFish(state, C, k) {
    const fname = { 2: 'X-wing', 3: 'Swordfish' }[k];
    for (let d = 1; d <= 9; d++) {
      for (const [base, cover] of [['row', 'col'], ['col', 'row']]) {
        const off = base === 'row' ? 0 : 9;
        const lines_ = [];
        for (let u = 0; u < 9; u++) {
          const pos = HOUSES[off + u].filter(i => C[i] & BIT(d));
          if (pos.length >= 2 && pos.length <= k) lines_.push({ u: off + u, pos });
        }
        for (const set of combos(lines_, k)) {
          const covers = new Set();
          set.forEach(s => s.pos.forEach(i => covers.add(houseOf(cover, i))));
          if (covers.size !== k) continue;
          const baseU = set.map(s => s.u);
          const el = [];
          for (const cu of covers) for (const i of HOUSES[cu]) {
            if (!baseU.includes(houseOf(base, i)) && (C[i] & BIT(d))) el.push({ cell: i, digit: d });
          }
          if (!el.length) continue;
          const pos = set.flatMap(s => s.pos);
          const bn = baseU.map(houseName), cn = [...covers].sort((a, b) => a - b).map(houseName);
          return {
            type: 'fish', technique: fname,
            title: fname + ' op de ' + d,
            digit: d, place: null, eliminations: el,
            lines: [
              'In ' + list(bn) + ' kan de ' + d + ' alleen in ' + list(cn) + '.',
              'Elke ' + (base === 'row' ? 'rij' : 'kolom') + ' moet een ' + d + ', dus ' + list(cn) + ' krijgen hun ' + d + ' uit deze ' + k + ' ' + (base === 'row' ? 'rijen' : 'kolommen') + '.',
              'Daarom kan de ' + d + ' niet op ' + list(el.map(e => name(e.cell))) + '.'
            ],
            hl: { house: [...covers].flatMap(u => HOUSES[u]).concat(baseU.flatMap(u => HOUSES[u])), pattern: pos.map(cell => ({ cell, digit: d })), digitFocus: d }
          };
        }
      }
    }
    return null;
  }

  function findXYWing(state, C) {
    const bi = [];
    for (let i = 0; i < 81; i++) if (popcount(C[i]) === 2) bi.push(i);
    for (const p of bi) {
      const [a, b] = digitsOf(C[p]);
      const peersBi = bi.filter(q => q !== p && PEERS[p].includes(q));
      for (const q1 of peersBi) for (const q2 of peersBi) {
        if (q1 >= q2) continue;
        // q1 = a+z, q2 = b+z
        for (const [x, y] of [[a, b], [b, a]]) {
          if (!(C[q1] & BIT(x)) || (C[q1] & BIT(y))) continue;
          if (!(C[q2] & BIT(y)) || (C[q2] & BIT(x))) continue;
          const z1 = C[q1] & ~BIT(x), z2 = C[q2] & ~BIT(y);
          if (z1 !== z2) continue;
          const z = digitsOf(z1)[0];
          const el = [];
          for (let i = 0; i < 81; i++) {
            if (i === q1 || i === q2 || i === p) continue;
            if ((C[i] & BIT(z)) && PEERS[q1].includes(i) && PEERS[q2].includes(i)) el.push({ cell: i, digit: z });
          }
          if (!el.length) continue;
          return {
            type: 'xywing', technique: 'XY-wing',
            title: 'XY-wing met ' + name(p) + ' als spil',
            digit: z, place: null, eliminations: el,
            lines: [
              name(p) + ' is ' + x + ' of ' + y + '.',
              'Is het ' + x + ', dan wordt ' + name(q1) + ' een ' + z + '. Is het ' + y + ', dan wordt ' + name(q2) + ' een ' + z + '.',
              'Hoe dan ook staat er een ' + z + ' op ' + name(q1) + ' of ' + name(q2) + '.',
              'Vakjes die beide zien kunnen geen ' + z + ' zijn: ' + list(el.map(e => name(e.cell))) + '.'
            ],
            hl: { house: [p, q1, q2], pattern: [p, q1, q2].flatMap(i => digitsOf(C[i]).map(d => ({ cell: i, digit: d }))), digitFocus: 0 }
          };
        }
      }
    }
    return null;
  }

  // ---------- volgende stap kiezen ----------
  function nextStep(state) {
    const singles = findHiddenSingles(state).concat(findNakedSingles(state));
    if (singles.length) {
      singles.sort((a, b) => a.score - b.score);
      return singles[0];
    }
    const C = state.allCands();
    // lege cel zonder kandidaten: tegenstrijdig
    for (let i = 0; i < 81; i++) if (!state.grid[i] && !C[i]) return null;
    return findLocked(state, C) || findNakedSubset(state, C, 2) || findHiddenSubset(state, C, 2) ||
      findNakedSubset(state, C, 3) || findHiddenSubset(state, C, 3) || findFish(state, C, 2) ||
      findChain(state, C, 4, { oneDigit: true }) || findXYWing(state, C) || findXYZWing(state, C) ||
      findUR(state, C) || findBUG(state, C) || findFish(state, C, 3) ||
      findChain(state, C, 6, { noGroups: true }) || findFinnedFish(state, C, 2) || findFinnedFish(state, C, 3) ||
      findNakedSubset(state, C, 4) || findHiddenSubset(state, C, 4) ||
      findChain(state, C, 8, { oneDigit: true }) || findALSXZ(state, C) ||
      findChain(state, C, 10) || findChain(state, C, 16) || findLoop(state, C, 12) || findLoop(state, C, 20) ||
      findContradiction(state, 0, 12) || findForcing(state, 0) || findContradiction(state, 0, 40) ||
      findContradiction(state, 1) || findForcing(state, 1) || findContradiction(state, 2) || null;
  }

  // ---------- ketens (AIC): afwisselend sterke en zwakke verbanden ----------
  // node = cel*10 + cijfer, of groep: 10000 + index (cijfer in 2-3 vakjes van blok x rij/kolom)
  const sees = (a, b) => a !== b && PEERS[a].includes(b);
  function makeGraph(C) {
    const groups = [];
    for (let b = 0; b < 9; b++) for (const type of ['row', 'col']) for (let k = 0; k < 3; k++) {
      const line = type === 'row' ? Math.floor(b / 3) * 3 + k : 9 + (b % 3) * 3 + k;
      const inter = HOUSES[18 + b].filter(i => houseOf(type, i) === line);
      for (let d = 1; d <= 9; d++) {
        const cells = inter.filter(i => C[i] & BIT(d));
        if (cells.length >= 2) groups.push({ cells, d, line, box: 18 + b });
      }
    }
    const G = { C, groups };
    G.cells = n => n >= 10000 ? groups[n - 10000].cells : [Math.floor(n / 10)];
    G.dig = n => n >= 10000 ? groups[n - 10000].d : n % 10;
    G.isGroup = n => n >= 10000;
    G.label = n => G.cells(n).map(name).join('/');
    G.findGroup = (cells, d) => {
      const k = groups.findIndex(g => g.d === d && g.cells.length === cells.length && g.cells.every(c => cells.includes(c)));
      return k < 0 ? null : 10000 + k;
    };
    return G;
  }
  function nodeHouses(G, n) {
    const cs = G.cells(n), out = [];
    for (let h = 0; h < 27; h++) if (cs.every(c => HOUSES[h].includes(c))) out.push(h);
    return out;
  }
  function strongLinks(G, n) {
    const C = G.C, d = G.dig(n), cs = G.cells(n), out = [];
    if (!G.isGroup(n) && popcount(C[cs[0]]) === 2) {
      const c = cs[0], o = digitsOf(C[c] & ~BIT(d))[0];
      out.push({ to: c * 10 + o, ht: 'cell', why: name(c) + ' kan alleen ' + d + ' of ' + o + ' zijn' });
    }
    for (const h of nodeHouses(G, n)) {
      const pos = HOUSES[h].filter(i => C[i] & BIT(d));
      const rest = pos.filter(i => !cs.includes(i));
      if (!rest.length || rest.length + cs.length !== pos.length) continue;
      let to = null;
      if (rest.length === 1) to = rest[0] * 10 + d;
      else to = G.findGroup(rest, d);
      if (to === null || out.some(x => x.to === to)) continue;
      out.push({ to, ht: houseType(h), h, why: 'in ' + houseName(h) + ' kan de ' + d + ' alleen in ' + G.label(n) + ' of ' + G.label(to) });
    }
    return out;
  }
  function weakLinks(G, n) {
    const C = G.C, d = G.dig(n), cs = G.cells(n), out = [];
    if (!G.isGroup(n)) for (const o of digitsOf(C[cs[0]] & ~BIT(d))) out.push({ to: cs[0] * 10 + o, ht: 'cell', why: 'zelfde vakje' });
    const seesAll = i => !cs.includes(i) && cs.every(c => sees(c, i));
    const why = i => { const c = cs[0]; return ROW(i) === ROW(c) ? 'rij ' + (ROW(c) + 1) : COL(i) === COL(c) ? 'kolom ' + (COL(c) + 1) : 'blok ' + BOXNAMES[BOX(c)]; };
    for (const p of PEERS[cs[0]]) if ((C[p] & BIT(d)) && seesAll(p)) out.push({ to: p * 10 + d, ht: 'weak', why: 'zelfde ' + why(p) });
    G.groups.forEach((g, k) => {
      if (g.d !== d || 10000 + k === n || !g.cells.every(seesAll)) return;
      out.push({ to: 10000 + k, ht: 'weak', why: 'zelfde ' + why(g.cells[0]) });
    });
    return out;
  }
  function chainElims(state, G, s, e) {
    const C = G.C, x = G.dig(s), y = G.dig(e), A = G.cells(s), Z = G.cells(e), el = [];
    if (x === y) {
      if (A.some(c => Z.includes(c))) return [];
      for (let i = 0; i < 81; i++) if (!A.includes(i) && !Z.includes(i) && (C[i] & BIT(x)) &&
        A.every(c => sees(c, i)) && Z.every(c => sees(c, i))) el.push({ cell: i, digit: x });
    } else if (!G.isGroup(s) && !G.isGroup(e)) {
      const a = A[0], z = Z[0];
      if (a === z) for (const d of digitsOf(C[a] & ~BIT(x) & ~BIT(y))) el.push({ cell: a, digit: d });
      else if (sees(a, z)) {
        if (C[a] & BIT(y)) el.push({ cell: a, digit: y });
        if (C[z] & BIT(x)) el.push({ cell: z, digit: x });
      }
    }
    return mkElim(state, el);
  }
  function onPath(G, f, n) {
    const cs = G.cells(n), d = G.dig(n);
    for (let p = f; p; p = p.par) {
      if (p.n === n) return true;
      if (G.dig(p.n) === d && G.cells(p.n).some(c => cs.includes(c))) return true;
    }
    return false;
  }
  // opts: maxLen, oneDigit, noGroups
  function findChain(state, C, maxLen, opts = {}) {
    const G = makeGraph(C);
    if (opts.noGroups) G.groups.length = 0;
    let best = null;
    const starts = [];
    for (let c = 0; c < 81; c++) for (const d of digitsOf(C[c])) starts.push(c * 10 + d);
    G.groups.forEach((g, k) => starts.push(10000 + k));
    for (const s of starts) {
      let frontier = [{ n: s, par: null, why: '', len: 1 }];
      const seen = new Set([s + ':s']);
      while (frontier.length) {
        const nxt = [];
        for (const f of frontier) {
          const strong = f.len % 2 === 1;
          if (f.len >= maxLen) continue;
          let links = strong ? strongLinks(G, f.n) : weakLinks(G, f.n);
          if (opts.oneDigit) links = links.filter(l => G.dig(l.to) === G.dig(s));
          for (const l of links) {
            const key = l.to + ':' + (strong ? 'w' : 's');
            if (seen.has(key) || onPath(G, f, l.to)) continue;
            seen.add(key);
            const g = { n: l.to, par: f, why: l.why, ht: l.ht, len: f.len + 1, strong };
            if (strong && g.len >= 4) {
              const el = chainElims(state, G, s, l.to);
              const groupsUsed = [s, l.to].filter(G.isGroup).length;
              if (el.length && (!best || g.len < best.g.len)) best = { g, el, s, G };
            }
            nxt.push(g);
          }
        }
        if (best && nxt.length && nxt[0].len >= best.g.len) break;
        frontier = nxt;
      }
      if (best && best.g.len <= 4) break;
    }
    return best ? buildChainStep(best) : null;
  }

  // Discontinue Nice Loop: keten die terugkomt bij het begin en zichzelf tegenspreekt.
  function findLoop(state, C, maxLen) {
    const G = makeGraph(C);
    let best = null;
    for (let c = 0; c < 81; c++) for (const d of digitsOf(C[c])) {
      const s = c * 10 + d;
      for (const startStrong of [true, false]) {
        let frontier = [{ n: s, par: null, len: 1 }];
        const seen = new Set();
        while (frontier.length) {
          const nxt = [];
          for (const f of frontier) {
            if (f.len >= maxLen || (best && f.len + 1 >= best.g.len)) continue;
            const strong = startStrong ? f.len % 2 === 1 : f.len % 2 === 0;
            for (const l of (strong ? strongLinks(G, f.n) : weakLinks(G, f.n))) {
              const g = { n: l.to, par: f, why: l.why, ht: l.ht, len: f.len + 1, strong };
              if (l.to === s) {
                // sterk-start eindigt sterk op s: s waar. zwak-start eindigt zwak op s: s onwaar.
                if (f.len >= 3 && strong === startStrong) best = { g, s, place: startStrong, G };
                continue;
              }
              const key = l.to + ':' + strong;
              if (seen.has(key) || onPath(G, f, l.to)) continue;
              seen.add(key);
              nxt.push(g);
            }
          }
          frontier = nxt;
        }
      }
    }
    if (!best) return null;
    const path = [];
    for (let p = best.g; p; p = p.par) path.unshift(p);
    const G2 = best.G, s0 = best.s, cell = NC0(s0), d = s0 % 10;
    const lab = n => G2.label(n), dg = n => G2.dig(n);
    const lines = [];
    lines.push(best.place ? 'Stel ' + name(cell) + ' is geen ' + d + '.' : 'Stel ' + name(cell) + ' = ' + d + '.');
    for (let k = 1; k < path.length; k++) {
      const p = path[k];
      const t = G2.isGroup(p.n) ? (p.strong ? 'staat de ' + dg(p.n) + ' in ' + lab(p.n) : 'staat de ' + dg(p.n) + ' niet in ' + lab(p.n))
        : (p.strong ? 'is ' + lab(p.n) + ' wel ' + dg(p.n) : 'is ' + lab(p.n) + ' geen ' + dg(p.n));
      lines.push('Dan ' + t + ' (' + p.why + ').');
    }
    lines.push('Tegenspraak met de aanname. Dus ' + (best.place ? name(cell) + ' = ' + d : name(cell) + ' is geen ' + d) + '.');
    const st = {
      type: 'loop', technique: 'Nice Loop', title: 'Nice Loop rond ' + name(cell) + '=' + d,
      digit: d, lines,
      hl: { house: [...new Set(path.flatMap(p => G2.cells(p.n)))], pattern: path.flatMap(p => G2.cells(p.n).map(c2 => ({ cell: c2, digit: dg(p.n) }))), digitFocus: 0 }
    };
    if (best.place) { st.place = { cell, digit: d }; st.eliminations = []; Object.assign(st.hl, { sources: [], excluded: [], occupied: [], blocked: [], target: cell }); }
    else { st.place = null; st.eliminations = [{ cell, digit: d }]; }
    return st;
  }
  const NC0 = n => Math.floor(n / 10);

  function classify(G, path) {
    const links = path.slice(1);
    const strong = links.filter(p => p.strong);
    const one = new Set(path.map(p => G.dig(p.n))).size === 1;
    const hasGroup = path.some(p => G.isGroup(p.n));
    if (one && path.length === 4) {
      const [a, b] = strong.map(p => p.ht);
      if (hasGroup && (a === 'box' || b === 'box')) return 'Empty Rectangle';
      if (!hasGroup && a === b && (a === 'row' || a === 'col')) return 'Skyscraper';
      if (!hasGroup && ((a === 'row' && b === 'col') || (a === 'col' && b === 'row')) && links[1].why.startsWith('zelfde blok')) return '2-String Kite';
      return 'Turbot Fish';
    }
    if (path.length === 6 && strong[0].ht === 'cell' && strong[2].ht === 'cell' && strong[1].ht !== 'cell' &&
        G.dig(path[0].n) === G.dig(path[5].n)) return 'W-wing';
    if (path.length === 6 && strong.every(p => p.ht === 'cell') && G.dig(path[0].n) === G.dig(path[5].n)) return 'XY-wing';
    if (one) return 'X-keten';
    if (strong.every(p => p.ht === 'cell')) return 'XY-keten';
    return 'Keten (AIC)';
  }
  function buildChainStep(best) {
    const G = best.G;
    const path = [];
    for (let p = best.g; p; p = p.par) path.unshift(p);
    const s = path[0].n, e = path[path.length - 1].n;
    const tech = classify(G, path);
    const lab = n => G.label(n), dg = n => G.dig(n);
    const isTrue = n => G.isGroup(n) ? 'staat de ' + dg(n) + ' in ' + lab(n) : 'is ' + lab(n) + ' wel ' + dg(n);
    const isFalse = n => G.isGroup(n) ? 'staat de ' + dg(n) + ' niet in ' + lab(n) : 'is ' + lab(n) + ' geen ' + dg(n);
    const lines = [];
    lines.push('Stel: ' + (G.isGroup(s) ? 'de ' + dg(s) + ' staat niet in ' + lab(s) : lab(s) + ' is geen ' + dg(s)) + '.');
    for (let k = 1; k < path.length; k++) {
      const p = path[k];
      lines.push('Dan ' + (p.strong ? isTrue(p.n) : isFalse(p.n)) + ' (' + p.why + ').');
    }
    const end = n => (G.isGroup(n) ? 'de ' + dg(n) + ' in ' + lab(n) : lab(n) + '=' + dg(n));
    lines.push('Dus: ' + end(s) + ' of ' + end(e) + ' is waar.');
    lines.push('Daarom kan niet: ' + list(best.el.map(x => name(x.cell) + ' (' + x.digit + ')')) + '.');
    return {
      type: 'chain', technique: tech,
      title: tech + ': ' + end(s) + ' of ' + end(e),
      digit: new Set(path.map(p => dg(p.n))).size === 1 ? dg(s) : 0, place: null, eliminations: best.el, lines,
      hl: { house: [...new Set(path.flatMap(p => G.cells(p.n)))], pattern: path.flatMap(p => G.cells(p.n).map(c => ({ cell: c, digit: dg(p.n) }))), digitFocus: 0 }
    };
  }

  // ---------- XYZ-wing ----------
  function findXYZWing(state, C) {
    for (let p = 0; p < 81; p++) {
      if (popcount(C[p]) !== 3) continue;
      const wings = PEERS[p].filter(q => popcount(C[q]) === 2 && (C[q] & ~C[p]) === 0);
      for (let a = 0; a < wings.length; a++) for (let b = a + 1; b < wings.length; b++) {
        const w1 = wings[a], w2 = wings[b];
        if ((C[w1] | C[w2]) !== C[p] || C[w1] === C[w2]) continue;
        const z = digitsOf(C[w1] & C[w2])[0];
        const el = [];
        for (let i = 0; i < 81; i++) if (i !== p && i !== w1 && i !== w2 && (C[i] & BIT(z)) && sees(i, p) && sees(i, w1) && sees(i, w2)) el.push({ cell: i, digit: z });
        if (!el.length) continue;
        return {
          type: 'xyzwing', technique: 'XYZ-wing', title: 'XYZ-wing met spil ' + name(p),
          digit: z, place: null, eliminations: el,
          lines: [
            'Spil ' + name(p) + ' kan ' + list(digitsOf(C[p])) + ' zijn. Vleugels: ' + name(w1) + ' (' + digitsOf(C[w1]).join('/') + ') en ' + name(w2) + ' (' + digitsOf(C[w2]).join('/') + ').',
            'Welk cijfer de spil ook krijgt: de ' + z + ' staat dan in de spil of in een van de vleugels.',
            'Een vakje dat alle drie ziet kan dus geen ' + z + ' zijn: ' + list(el.map(e => name(e.cell))) + '.'
          ],
          hl: { house: [p, w1, w2], pattern: [p, w1, w2].flatMap(i => digitsOf(C[i]).map(d => ({ cell: i, digit: d }))), digitFocus: z }
        };
      }
    }
    return null;
  }

  // ---------- gevinde vis (finned X-wing / Swordfish) ----------
  function findFinnedFish(state, C, k) {
    const fname = { 2: 'Finned X-wing', 3: 'Finned Swordfish' }[k];
    for (let d = 1; d <= 9; d++) for (const [base, cover] of [['row', 'col'], ['col', 'row']]) {
      const off = base === 'row' ? 0 : 9, coff = base === 'row' ? 9 : 0;
      const lines_ = [];
      for (let u = 0; u < 9; u++) {
        const pos = HOUSES[off + u].filter(i => C[i] & BIT(d));
        if (pos.length >= 1 && pos.length <= k + 2) lines_.push({ u: off + u, pos });
      }
      for (const set of combos(lines_, k)) {
        const pos = set.flatMap(s2 => s2.pos);
        const coverAll = [...new Set(pos.map(i => houseOf(cover, i)))];
        for (const cv of combos(coverAll, k)) {
          const fins = pos.filter(i => !cv.includes(houseOf(cover, i)));
          if (!fins.length) continue;
          const fb = BOX(fins[0]);
          if (!fins.every(i => BOX(i) === fb)) continue;
          const baseU = set.map(s2 => s2.u);
          const el = [];
          for (const cu of cv) for (const i of HOUSES[cu]) {
            if (BOX(i) === fb && !baseU.includes(houseOf(base, i)) && (C[i] & BIT(d))) el.push({ cell: i, digit: d });
          }
          if (!el.length) continue;
          const bn = baseU.map(houseName), cn = cv.slice().sort((a, b) => a - b).map(houseName);
          return {
            type: 'fish', technique: fname, title: fname + ' op de ' + d,
            digit: d, place: null, eliminations: el,
            lines: [
              'In ' + list(bn) + ' kan de ' + d + ' bijna alleen in ' + list(cn) + '. Uitzondering (vin): ' + list(fins.map(name)) + '.',
              'Zonder vin is het een ' + (k === 2 ? 'X-wing' : 'Swordfish') + ': dan krijgen ' + list(cn) + ' hun ' + d + ' uit deze ' + (base === 'row' ? 'rijen' : 'kolommen') + '.',
              'Met vin staat de ' + d + ' in de vin. Hoe dan ook: vakjes in ' + list(cn) + ' die ook in het blok van de vin liggen kunnen geen ' + d + ' zijn.',
              'Dus weg: ' + list(el.map(e => name(e.cell))) + '.'
            ],
            hl: { house: cv.flatMap(u => HOUSES[u]).concat(baseU.flatMap(u => HOUSES[u])), pattern: pos.map(cell => ({ cell, digit: d })), digitFocus: d }
          };
        }
      }
    }
    return null;
  }

  // ---------- uniciteit: Unique Rectangle en BUG+1 ----------
  function findUR(state, C) {
    const bi = []; for (let i = 0; i < 81; i++) if (popcount(C[i]) === 2) bi.push(i);
    for (let r1 = 0; r1 < 9; r1++) for (let r2 = r1 + 1; r2 < 9; r2++) for (let c1 = 0; c1 < 9; c1++) for (let c2 = c1 + 1; c2 < 9; c2++) {
      const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
      if (new Set(cells.map(BOX)).size !== 2) continue;
      if (cells.some(i => state.grid[i])) continue;
      const pair = cells.map(i => C[i]).filter(m => popcount(m) === 2);
      if (!pair.length) continue;
      for (const ab of new Set(pair)) {
        if (!cells.every(i => (C[i] & ab) === ab)) continue;
        const floor = cells.filter(i => C[i] === ab), roof = cells.filter(i => C[i] !== ab);
        const [a, b] = digitsOf(ab);
        const intro = 'Vakjes ' + list(cells.map(name)) + ' vormen een rechthoek in 2 blokken met ' + a + '/' + b + '. Als ze alle vier alleen ' + a + ' of ' + b + ' zouden zijn, had de puzzel 2 oplossingen (die cijfers kun je omwisselen). Een goede puzzel heeft er maar 1.';
        const mk = (tech, el, lines2) => ({
          type: 'ur', technique: tech, title: tech + ' ' + a + '/' + b, digit: 0, place: null, eliminations: el,
          lines: [intro].concat(lines2),
          hl: { house: cells, pattern: cells.flatMap(i => [a, b].map(d => ({ cell: i, digit: d }))), digitFocus: 0 }
        });
        if (floor.length === 3) {
          const t = roof[0];
          const el = mkElim(state, [a, b].map(d => ({ cell: t, digit: d })));
          if (el.length) return mk('Unique Rectangle type 1', el, [name(t) + ' is het enige vakje met extra cijfers. Het mag dus geen ' + a + ' of ' + b + ' zijn, anders ontstaat de dubbele oplossing.']);
        }
        if (floor.length === 2 && roof.length === 2) {
          const [p, q] = roof;
          const sameLine = ROW(p) === ROW(q) || COL(p) === COL(q);
          if (!sameLine) continue;
          // type 2: beide daken precies 1 en hetzelfde extra cijfer
          if (C[p] === C[q] && popcount(C[p]) === 3) {
            const x = digitsOf(C[p] & ~ab)[0];
            const el = [];
            for (let i = 0; i < 81; i++) if (i !== p && i !== q && (C[i] & BIT(x)) && sees(i, p) && sees(i, q)) el.push({ cell: i, digit: x });
            if (mkElim(state, el).length) return mk('Unique Rectangle type 2', mkElim(state, el), [name(p) + ' en ' + name(q) + ' hebben allebei de extra ' + x + '. Een van beide moet dus ' + x + ' zijn.', 'Vakjes die beide zien kunnen geen ' + x + ' zijn.']);
          }
          // type 4: in de lijn van het dak kan a alleen in het dak -> b valt weg uit dak
          const line = ROW(p) === ROW(q) ? ROW(p) : 9 + COL(p);
          const hs = [line]; if (BOX(p) === BOX(q)) hs.push(18 + BOX(p));
          for (const h of hs) for (const [x, y] of [[a, b], [b, a]]) {
            const pos = HOUSES[h].filter(i => C[i] & BIT(x));
            if (pos.length === 2 && pos.includes(p) && pos.includes(q)) {
              const el = mkElim(state, [{ cell: p, digit: y }, { cell: q, digit: y }]);
              if (el.length) return mk('Unique Rectangle type 4', el, ['In ' + houseName(h) + ' kan de ' + x + ' alleen op ' + name(p) + ' of ' + name(q) + '. Een van beide is dus ' + x + '.', 'Als het andere vakje dan ' + y + ' werd, ontstaat de dubbele oplossing. Dus ' + y + ' valt weg uit ' + name(p) + ' en ' + name(q) + '.']);
            }
          }
        }
      }
    }
    return null;
  }
  function findBUG(state, C) {
    let tri = -1;
    for (let i = 0; i < 81; i++) {
      if (state.grid[i]) continue;
      const n = popcount(C[i]);
      if (n === 2) continue;
      if (n === 3 && tri < 0) { tri = i; continue; }
      return null;
    }
    if (tri < 0) return null;
    for (const d of digitsOf(C[tri])) {
      const h = HOUSES[ROW(tri)];
      if (h.filter(i => C[i] & BIT(d)).length === 3) {
        return {
          type: 'bug', technique: 'BUG+1', title: 'BUG+1: ' + name(tri) + ' = ' + d,
          digit: d, place: { cell: tri, digit: d }, eliminations: [],
          lines: ['Alle lege vakjes hebben precies 2 kandidaten, behalve ' + name(tri) + ' (' + list(digitsOf(C[tri])) + ').',
            'Zou ' + name(tri) + ' geen ' + d + ' zijn, dan heeft elk vakje 2 kandidaten en elk cijfer 2 plekken per rij/kolom/blok: dan zijn er 2 oplossingen.',
            'De ' + d + ' komt in rij ' + (ROW(tri) + 1) + ' 3 keer voor; dat is het extra cijfer. Dus ' + name(tri) + ' = ' + d + '.'],
          hl: { house: HOUSES[ROW(tri)].slice(), sources: [], excluded: [], occupied: [], blocked: [], target: tri, digitFocus: d }
        };
      }
    }
    return null;
  }

  // ---------- ALS-XZ ----------
  function findALSXZ(state, C, maxSize = 3) {
    const alss = [], seenKey = new Set();
    for (let h = 0; h < 27; h++) {
      const empt = HOUSES[h].filter(i => C[i]);
      for (let n = 1; n <= maxSize; n++) for (const set of combos(empt, n)) {
        const m = set.reduce((a, i) => a | C[i], 0);
        if (popcount(m) !== n + 1) continue;
        const key = set.slice().sort((a, b) => a - b).join(',');
        if (seenKey.has(key)) continue;
        seenKey.add(key);
        alss.push({ cells: set, m, h });
      }
    }
    const xcells = (A, x) => A.cells.filter(i => C[i] & BIT(x));
    let best = null;
    for (let a = 0; a < alss.length; a++) for (let b = a + 1; b < alss.length; b++) {
      const A = alss[a], B = alss[b];
      if (A.cells.some(i => B.cells.includes(i))) continue;
      const common = A.m & B.m;
      if (popcount(common) < 2) continue;
      for (const x of digitsOf(common)) {
        const ax = xcells(A, x), bx = xcells(B, x);
        if (!ax.every(i => bx.every(j => sees(i, j)))) continue;
        for (const z of digitsOf(common & ~BIT(x))) {
          const zc = xcells(A, z).concat(xcells(B, z));
          const el = [];
          for (let i = 0; i < 81; i++) if (!zc.includes(i) && (C[i] & BIT(z)) && zc.every(c => sees(c, i))) el.push({ cell: i, digit: z });
          const e2 = mkElim(state, el);
          if (!e2.length) continue;
          const size = A.cells.length + B.cells.length;
          if (best && best.size <= size) continue;
          best = { A, B, x, z, el: e2, size };
        }
      }
    }
    if (!best) return null;
    const { A, B, x, z, el } = best;
    const desc = S2 => list(S2.cells.map(name)) + ' (' + digitsOf(S2.m).join('/') + ')';
    return {
      type: 'als', technique: 'ALS-XZ', title: 'ALS-XZ met x=' + x + ', z=' + z,
      digit: z, place: null, eliminations: el,
      lines: [
        'ALS A: ' + desc(A) + '. ALS B: ' + desc(B) + '.',
        'De ' + x + ' kan niet in A én B tegelijk (alle ' + x + '-vakjes zien elkaar). Dus in A of in B ontbreekt de ' + x + ', en daar liggen de cijfers vast.',
        'Daardoor staat de ' + z + ' zeker in A of in B. Vakjes die alle ' + z + '-vakjes van A en B zien kunnen geen ' + z + ' zijn: ' + list(el.map(e => name(e.cell))) + '.'
      ],
      hl: { house: A.cells.concat(B.cells), pattern: A.cells.concat(B.cells).flatMap(i => digitsOf(C[i]).filter(d => d === x || d === z).map(d => ({ cell: i, digit: d }))), digitFocus: 0 }
    };
  }

  // ---------- elke mogelijkheid van een vakje geeft hetzelfde gevolg ----------
  // Volg de gevolgen van een aanname. Geeft eindstand + logboek, of null bij tegenspraak.
  function propagate(state, cell, d, level = 0) {
    const st = state.clone();
    st.grid[cell] = d;
    const chain = [];
    for (let k = 0; k < 120; k++) {
      const q = quickSingle(st);
      if (!q) {
        const e = basicElim(st, st.allCands(), level);
        if (!e) break;
        for (const x of e.eliminations) st.elim[x.cell] |= BIT(x.digit);
        chain.push({ elim: e.eliminations, why: e.technique.toLowerCase() });
        continue;
      }
      if (q.bad) return null;
      chain.push(q);
      st.grid[q.cell] = q.digit;
    }
    return { st, chain };
  }
  // Wanneer is (j, e) in deze tak uitgesloten? Index in logboek, -1 = door de aanname zelf.
  function excludedAt(br, j, e) {
    if (br.cell === j) return -1;
    if (br.d === e && sees(br.cell, j)) return -1;
    for (let k = 0; k < br.r.chain.length; k++) {
      const q = br.r.chain[k];
      if (q.elim) { if (q.elim.some(x => x.cell === j && x.digit === e)) return k; continue; }
      if (q.cell === j) return q.digit === e ? null : k;
      if (q.digit === e && sees(q.cell, j)) return k;
    }
    return null;
  }
  function findForcing(state, level) {
    const C = state.allCands();
    const groups = [];
    for (let i = 0; i < 81; i++) {
      const n = popcount(C[i]);
      if (n >= 2 && n <= 3) groups.push({ kind: 'cell', i, opts: digitsOf(C[i]).map(d => ({ cell: i, d })) });
    }
    for (let h = 0; h < 27; h++) for (let d = 1; d <= 9; d++) {
      const pos = HOUSES[h].filter(i => C[i] & BIT(d));
      if (pos.length >= 2 && pos.length <= 3) groups.push({ kind: 'house', h, d, opts: pos.map(cell => ({ cell, d })) });
    }
    let best = null;
    const cache = new Map();
    const run = (cell, d) => {
      const key = cell * 10 + d;
      if (!cache.has(key)) cache.set(key, propagate(state, cell, d, level));
      return cache.get(key);
    };
    for (const g of groups) {
      const brs = g.opts.map(o => ({ cell: o.cell, d: o.d, r: run(o.cell, o.d) }));
      const ok = brs.filter(x => x.r);
      if (ok.length < brs.length) continue; // tak met tegenspraak: dat doet de tegenspraak-techniek
      // gemeenschappelijke plaatsing
      for (let j = 0; j < 81; j++) {
        if (state.grid[j]) continue;
        const v = ok[0].r.st.grid[j];
        if (v && ok.every(x => x.r.st.grid[j] === v)) {
          const idx = ok.map(x => x.cell === j ? -1 : x.r.chain.findIndex(q => q.cell === j));
          const len = idx.reduce((a, b) => a + b + 1, 0);
          if (!best || len < best.len) best = { g, ok, bad: brs.filter(x => !x.r), j, v, idx, len, place: true };
        }
        // gemeenschappelijke wegstreping
        for (const e of digitsOf(C[j])) {
          if (brs.some(x => x.cell === j && x.d === e)) continue;
          const idx = ok.map(x => excludedAt(x, j, e));
          if (idx.some(v2 => v2 === null)) continue;
          const len = idx.reduce((a, b) => a + b + 1, 0) + 2;
          if (!best || len < best.len) best = { g, ok, bad: brs.filter(x => !x.r), j, v: e, idx, len, place: false };
        }
      }
    }
    if (!best) return null;
    const { g, ok, bad, j, v, idx, place } = best;
    const lines = [g.kind === 'cell'
      ? name(g.i) + ' kan alleen ' + list(digitsOf(C[g.i])) + ' zijn. We bekijken elke mogelijkheid.'
      : 'In ' + houseName(g.h) + ' kan de ' + g.d + ' alleen op ' + list(g.opts.map(o => name(o.cell))) + '. We bekijken elke plek.'];
    ok.forEach((x, n) => {
      const upto = x.r.chain.slice(0, idx[n] + 1).map(q => q.elim
        ? q.elim.map(y => name(y.cell) + ' geen ' + y.digit).join(', ')
        : name(q.cell) + '=' + q.digit);
      lines.push('Als ' + name(x.cell) + ' = ' + x.d + (upto.length ? ': ' + upto.join(', ') : '') + '.');
    });
    for (const x of bad) lines.push('Als ' + name(x.cell) + ' = ' + x.d + ': tegenspraak, kan niet.');
    lines.push(place ? 'In elk geval wordt ' + name(j) + ' een ' + v + ', dus ' + name(j) + ' = ' + v + '.'
      : 'In elk geval kan ' + name(j) + ' geen ' + v + ' zijn.');
    const base = {
      type: 'forcing', technique: 'Forcing chain (alle mogelijkheden)',
      title: g.kind === 'cell' ? 'Wat er ook in ' + name(g.i) + ' komt...' : 'Waar de ' + g.d + ' in ' + houseName(g.h) + ' ook komt...',
      digit: v, lines,
      hl: { house: g.opts.map(o => o.cell), pattern: g.opts.map(o => ({ cell: o.cell, digit: o.d })), digitFocus: 0 }
    };
    if (place) {
      base.place = { cell: j, digit: v }; base.eliminations = [];
      Object.assign(base.hl, { sources: [], excluded: [], occupied: [], blocked: [], target: j });
    } else { base.place = null; base.eliminations = [{ cell: j, digit: v }]; }
    return base;
  }

  // ---------- laatste redmiddel: stel dat ... dan tegenspraak ----------
  function quickSingle(st) {
    const C = st.allCands();
    for (let i = 0; i < 81; i++) if (!st.grid[i]) {
      const m = C[i];
      if (!m) return { bad: name(i) + ' heeft geen cijfer meer over', kind: 'empty', i };
      if (!(m & (m - 1))) return { cell: i, digit: digitsOf(m)[0], why: 'enige cijfer in vakje', kind: 'naked' };
    }
    for (let h = 0; h < 27; h++) {
      const cells = HOUSES[h];
      let placed = 0, once = 0, twice = 0;
      for (const i of cells) {
        if (st.grid[i]) { placed |= BIT(st.grid[i]); continue; }
        const m = C[i];
        twice |= once & m; once |= m;
      }
      const missing = ALL & ~placed & ~once;
      if (missing) return { bad: 'de ' + digitsOf(missing)[0] + ' kan nergens meer in ' + houseName(h), kind: 'missing', h, d: digitsOf(missing)[0] };
      const single = once & ~twice & ~placed;
      if (single) {
        const d = digitsOf(single)[0];
        const i = cells.find(c => !st.grid[c] && (C[c] & BIT(d)));
        return { cell: i, digit: d, why: 'enige plek in ' + houseName(h), kind: 'hidden', h };
      }
    }
    return null;
  }
  // level 0: singles + basis; 1: + meer technieken; 2: + tegenspraak binnenin
  function basicElim(st, C, level) {
    let e = findLocked(st, C) || findNakedSubset(st, C, 2) || findHiddenSubset(st, C, 2);
    if (!e && level >= 1) e = findNakedSubset(st, C, 3) || findHiddenSubset(st, C, 3) || findFish(st, C, 2) || findXYWing(st, C);
    return e;
  }
  function tryAssume(state, cell, d, limit, level = 0) {
    const st = state.clone();
    st.grid[cell] = d;
    const chain = [];
    for (let k = 0; k < limit; k++) {
      const q = quickSingle(st);
      if (!q) {
        const C = st.allCands();
        const e = basicElim(st, C, level);
        if (e) {
          for (const x of e.eliminations) st.elim[x.cell] |= BIT(x.digit);
          chain.push({ elim: e.eliminations, why: e.technique.toLowerCase() });
          continue;
        }
        if (level < 2) return null;
        // binnenin: zoek een kandidaat die snel tot tegenspraak leidt
        let inner = null;
        for (let i = 0; i < 81 && !inner; i++) for (const dd of digitsOf(C[i])) {
          const r = tryAssume(st, i, dd, 12, 0);
          if (r) { inner = { i, dd, r }; break; }
        }
        if (!inner) return null;
        st.elim[inner.i] |= BIT(inner.dd);
        chain.push({ elim: [{ cell: inner.i, digit: inner.dd }],
          why: 'want stel ' + name(inner.i) + ' = ' + inner.dd + ': ' +
            inner.r.chain.filter(q2 => !q2.elim).map(q2 => name(q2.cell) + '=' + q2.digit).join(', ') + (inner.r.chain.length ? ', ' : '') + inner.r.bad });
        continue;
      }
      if (q.bad) return { chain, bad: q.bad, badq: q };
      chain.push(q);
      st.grid[q.cell] = q.digit;
    }
    return null;
  }

  // Houd alleen de stappen over die echt nodig zijn voor de tegenspraak.
  function prune(state, cell, d, r) {
    if (r.chain.some(q => q.elim) || !r.badq) return r.chain;
    const C0 = state.allCands();
    const P = [{ cell, digit: d }].concat(r.chain);
    const pos = new Map(P.map((q, k) => [q.cell, k]));
    const need = (i, x, upto) => { for (let p = 0; p < upto; p++) if (P[p].digit === x && sees(P[p].cell, i)) return p; return undefined; };
    const houseDeps = (h, dd, upto, skip) => {
      const out = [];
      for (const c of HOUSES[h]) {
        if (c === skip || state.grid[c] || !(C0[c] & BIT(dd))) continue;
        const pc = pos.get(c);
        out.push(pc !== undefined && pc < upto ? pc : need(c, dd, upto));
      }
      return out;
    };
    const cellDeps = (i, v, upto) => digitsOf(C0[i] & ~BIT(v)).map(x => need(i, x, upto));
    const b = r.badq, n = P.length;
    let start = b.kind === 'empty' ? cellDeps(b.i, 0, n) : houseDeps(b.h, b.d, n, -1);
    const needed = new Set();
    const stack = start.slice();
    while (stack.length) {
      const k = stack.pop();
      if (k === undefined) return r.chain;
      if (needed.has(k)) continue;
      needed.add(k);
      if (k === 0) continue;
      const q = P[k];
      const deps = q.kind === 'naked' ? cellDeps(q.cell, q.digit, k) : houseDeps(q.h, q.digit, k, q.cell);
      stack.push(...deps);
    }
    return r.chain.filter((q, k) => needed.has(k + 1));
  }
  function findContradiction(state, level = 0, maxLen = 40) {
    let best = null;
    const C = state.allCands();
    const order = [];
    for (let i = 0; i < 81; i++) if (C[i]) order.push(i);
    order.sort((a, b) => popcount(C[a]) - popcount(C[b]));
    outer: for (const i of order) for (const d of digitsOf(C[i])) {
      const lim = best ? best.r.chain.length : maxLen;
      const r = tryAssume(state, i, d, lim, level);
      if (r) r.short = prune(state, i, d, r);
      if (r && (!best || r.short.length < best.r.short.length)) best = { i, d, r };
      if (best && best.r.short.length <= 6) break outer;
    }
    if (!best) return null;
    const { i, d, r } = best;
    const lines = ['Stel ' + name(i) + ' = ' + d + '.'];
    for (const q of r.short) lines.push(q.elim
      ? 'Dan vallen weg: ' + list(q.elim.map(x => name(x.cell) + ' (' + x.digit + ')')) + ' (' + q.why + ').'
      : 'Dan ' + name(q.cell) + ' = ' + q.digit + ' (' + q.why + ').');
    lines.push('Maar dan ' + r.bad + '. Tegenspraak!');
    lines.push('Dus ' + name(i) + ' is geen ' + d + '.');
    return {
      type: 'contradiction', technique: 'Proberen (laatste redmiddel)',
      title: 'Kan ' + name(i) + ' een ' + d + ' zijn?',
      digit: d, place: null, eliminations: [{ cell: i, digit: d }], lines,
      hl: { house: [i].concat(r.short.filter(q => !q.elim).map(q => q.cell)), pattern: [{ cell: i, digit: d }].concat(r.short.filter(q => !q.elim).map(q => ({ cell: q.cell, digit: q.digit }))), digitFocus: 0 }
    };
  }

  function apply(state, step, nr) {
    if (step.place) state.grid[step.place.cell] = step.place.digit;
    for (const e of step.eliminations) {
      state.elim[e.cell] |= BIT(e.digit);
      state.elimStep[e.cell][e.digit] = nr;
    }
  }

  // ---------- uitleg per techniek (voor wie de techniek nog niet kent) ----------
  const TECH_INFO = {
    'Enige plek in blok': 'Elk blok moet elk cijfer 1 keer hebben. Kijk waar het cijfer al staat in de rijen en kolommen eromheen: die rijen en kolommen vallen af. Blijft er in het blok maar 1 vakje over, dan moet het cijfer daar.',
    'Enige plek in rij': 'Elke rij moet elk cijfer 1 keer hebben. Vakjes waar het cijfer niet kan (door dezelfde kolom of hetzelfde blok) vallen af. Blijft er 1 vakje over, dan moet het daar.',
    'Enige plek in kolom': 'Elke kolom moet elk cijfer 1 keer hebben. Vakjes waar het cijfer niet kan (door dezelfde rij of hetzelfde blok) vallen af. Blijft er 1 vakje over, dan moet het daar.',
    'Enige cijfer in vakje': 'Kijk welke cijfers al in de rij, kolom en het blok van dit vakje staan. Die kunnen hier niet. Blijft er maar 1 cijfer over, dan is dat het.',
    'Wijzend paar/drietal': 'Kan een cijfer in een blok alleen in 1 rij (of kolom), dan staat het daar zeker in dat blok. Dan kan het nergens anders in die rij (of kolom).',
    'Vergrendeld in blok': 'Kan een cijfer in een rij (of kolom) alleen binnen 1 blok, dan staat het daar. Dan kan het nergens anders in dat blok.',
    'Naakt paar': 'Twee vakjes in dezelfde rij/kolom/blok hebben alleen dezelfde 2 cijfers. Die 2 cijfers zitten dus in die 2 vakjes. Uit de andere vakjes van die rij/kolom/blok vallen ze weg.',
    'Naakt drietal': 'Drie vakjes in dezelfde rij/kolom/blok hebben samen maar 3 cijfers. Die 3 cijfers zitten dus in die vakjes en vallen elders in die rij/kolom/blok weg.',
    'Naakt viertal': 'Vier vakjes in dezelfde rij/kolom/blok hebben samen maar 4 cijfers. Die cijfers vallen elders in die rij/kolom/blok weg.',
    'Verborgen paar': 'Twee cijfers kunnen in een rij/kolom/blok maar in dezelfde 2 vakjes. Die vakjes zijn dus voor die 2 cijfers; andere kandidaten in die vakjes vallen weg.',
    'Verborgen drietal': 'Drie cijfers kunnen in een rij/kolom/blok maar in dezelfde 3 vakjes. Andere kandidaten in die vakjes vallen weg.',
    'Verborgen viertal': 'Vier cijfers kunnen in een rij/kolom/blok maar in dezelfde 4 vakjes. Andere kandidaten in die vakjes vallen weg.',
    'X-wing': 'In 2 rijen kan een cijfer maar in dezelfde 2 kolommen (een rechthoek). Dan krijgen die 2 kolommen hun cijfer uit deze 2 rijen. Elders in die kolommen valt het cijfer weg. (Werkt ook met rijen en kolommen omgedraaid.)',
    'Swordfish': 'Zoals een X-wing, maar met 3 rijen en 3 kolommen. In 3 rijen kan het cijfer alleen in dezelfde 3 kolommen; elders in die kolommen valt het weg.',
    'Finned X-wing': 'Een X-wing met een uitzondering (de vin): een extra plek in een blok. Of de X-wing klopt, of het cijfer staat in de vin. Vakjes die in beide gevallen geen cijfer kunnen krijgen vallen weg.',
    'Finned Swordfish': 'Een Swordfish met een vin (extra plek in een blok). Vakjes die zowel door de Swordfish als door de vin worden uitgesloten vallen weg.',
    'Skyscraper': 'Twee evenwijdige rijen (of kolommen) waarin het cijfer maar op 2 plekken kan. Aan één kant liggen ze in dezelfde kolom. Van de twee andere uiteinden ("toppen") is er zeker één het cijfer.',
    '2-String Kite': 'Een rij en een kolom waarin het cijfer maar op 2 plekken kan, verbonden via één blok. Van de twee losse uiteinden is er zeker één het cijfer.',
    'Empty Rectangle': 'In een blok kan het cijfer alleen in één rij en één kolom (een kruis). Samen met een rij of kolom waar het cijfer maar op 2 plekken kan, volgt een wegstreping.',
    'Turbot Fish': 'Twee plekken-paren voor hetzelfde cijfer (elk: "maar 2 plekken" in een rij, kolom of blok), die elkaar raken. Van de twee losse uiteinden is er zeker één het cijfer.',
    'W-wing': 'Twee vakjes met hetzelfde paar cijfers (bijv. 4/7), die elkaar niet zien. Zijn ze verbonden door een rij/kolom/blok waar een van die cijfers maar op 2 plekken kan, dan is het andere cijfer zeker in een van beide.',
    'XY-wing': 'Drie vakjes met elk 2 cijfers: een spil (xy) en twee vleugels (xz en yz) die de spil zien. Welk cijfer de spil ook krijgt, een vleugel wordt z. Vakjes die beide vleugels zien kunnen geen z zijn.',
    'XYZ-wing': 'Zoals een XY-wing, maar de spil heeft 3 cijfers (xyz). De z staat dan zeker in de spil of een vleugel. Vakjes die alle drie zien kunnen geen z zijn.',
    'Unique Rectangle type 1': 'Een goede sudoku heeft maar 1 oplossing. Vier vakjes in een rechthoek (2 blokken) met hetzelfde paar cijfers zouden 2 oplossingen geven. Dat mag niet, dus dat patroon moet doorbroken worden.',
    'Unique Rectangle type 2': 'Een goede sudoku heeft maar 1 oplossing. Een rechthoek van 4 vakjes met hetzelfde paar zou 2 oplossingen geven. Het extra cijfer in het "dak" moet het patroon doorbreken.',
    'Unique Rectangle type 4': 'Een goede sudoku heeft maar 1 oplossing. Een rechthoek van 4 vakjes met hetzelfde paar zou 2 oplossingen geven. Daarom mag een van de paar-cijfers niet in het "dak".',
    'BUG+1': 'BUG = elk leeg vakje 2 kandidaten. Dat geeft altijd 2 oplossingen. Is er maar 1 vakje met 3 kandidaten, dan moet het extra cijfer daar staan.',
    'ALS-XZ': 'Een ALS is een groep van N vakjes in één rij/kolom/blok met samen N+1 cijfers. Ontbreekt één cijfer, dan liggen de rest vast. Twee ALS-en die een cijfer x "delen" (niet allebei) dwingen een ander gedeeld cijfer z in een van beide.',
    'X-keten': 'Een keten voor één cijfer. Sterk verband: "maar 2 plekken, dus een van beide". Zwak verband: "zien elkaar, dus niet allebei". Afwisselend volgen geeft: een van de uiteinden is zeker waar.',
    'XY-keten': 'Een keten van vakjes met elk 2 cijfers. Is het ene cijfer het niet, dan is het het andere. Zo ga je van vakje naar vakje; een van de uiteinden is zeker waar.',
    'Keten (AIC)': 'Een keten die afwisselt: sterk verband (een van beide is waar) en zwak verband (niet allebei waar). Begin met "stel dit is niet waar" en volg de keten. Het eind is dan waar. Dus een van beide uiteinden is zeker waar.',
    'Nice Loop': 'Een keten die terugkomt bij het begin. Komt hij terug met het tegenovergestelde van de aanname, dan was de aanname fout.',
    'Forcing chain (alle mogelijkheden)': 'Een vakje (of een cijfer in een rij/kolom/blok) heeft maar een paar mogelijkheden. Volg elke mogelijkheid. Gebeurt in elk geval hetzelfde, dan is dat zeker. Dit is een techniek voor zeer moeilijke puzzels.',
    'Proberen (laatste redmiddel)': 'Geen patroon gevonden. Stel een cijfer in en volg de gevolgen. Loopt het vast (tegenspraak), dan was het fout. Dit is eigenlijk proberen; experts gebruiken het alleen als niets anders werkt.',
    'Vastgelopen': ''
  };
  function infoFor(t) {
    return TECH_INFO[t] !== undefined ? TECH_INFO[t] : '';
  }

  // Maakt de volledige lijst stappen. Elke stap krijgt een momentopname ervoor.
  function explain(givens, maxSteps = 400, onStep) {
    let state = new State(givens);
    const steps = [];
    while (steps.length < maxSteps) {
      if (state.grid.every(v => v)) break;
      const step = nextStep(state);
      if (!step) {
        steps.push({ type: 'stuck', technique: 'Vastgelopen', title: 'Geen eenvoudige volgende stap gevonden',
          lines: ['De app kent (nog) geen techniek die hier verder helpt.', 'Er wordt niet gegokt en geen oplossing gebruikt.'],
          place: null, eliminations: [], hl: {}, before: snapshot(state) });
        if (onStep) onStep(steps[steps.length - 1]);
        break;
      }
      step.before = snapshot(state);
      if (step.info === undefined) step.info = infoFor(step.technique);
      steps.push(step);
      apply(state, step, steps.length);
      step.after = snapshot(state);
      if (onStep) onStep(step);
    }
    return { steps, solved: state.grid.every(v => v), final: state.grid.slice() };
  }

  function snapshot(state) {
    return { grid: state.grid.slice(), cands: state.allCands() };
  }

  return { explain, countSolutions, conflicts, digitsOf, name, State, nextStep, HOUSES, BOXNAMES };
});
