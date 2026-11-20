/* Sudoku Uitleg: logische stap-voor-stap oplosser.
   Werkt in browser (window.SudokuSolver) en Node (module.exports). */
(function (root) {
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
      findXYWing(state, C) || findFish(state, C, 3) ||
      findNakedSubset(state, C, 4) || findHiddenSubset(state, C, 4) ||
      findChain(state, C, 8) || findChain(state, C, 16) || findContradiction(state) || findCellForcing(state) || null;
  }

  // ---------- ketens (AIC): afwisselend sterke en zwakke verbanden ----------
  // node = cel*10 + cijfer
  const NC = n => Math.floor(n / 10), ND = n => n % 10;
  const nname = n => name(NC(n)) + '=' + ND(n);
  const sees = (a, b) => a !== b && PEERS[a].includes(b);

  function strongLinks(C, n) {
    const c = NC(n), d = ND(n), out = [];
    if (popcount(C[c]) === 2) {
      const o = digitsOf(C[c] & ~BIT(d))[0];
      out.push({ to: c * 10 + o, why: name(c) + ' kan alleen ' + d + ' of ' + o + ' zijn' });
    }
    for (const type of ['row', 'col', 'box']) {
      const h = houseOf(type, c);
      const pos = HOUSES[h].filter(i => C[i] & BIT(d));
      if (pos.length === 2) {
        const o = pos[0] === c ? pos[1] : pos[0];
        if (!out.some(x => x.to === o * 10 + d))
          out.push({ to: o * 10 + d, why: 'in ' + houseName(h) + ' kan de ' + d + ' alleen op ' + name(pos[0]) + ' of ' + name(pos[1]) });
      }
    }
    return out;
  }
  function weakLinks(C, n) {
    const c = NC(n), d = ND(n), out = [];
    for (const o of digitsOf(C[c] & ~BIT(d))) out.push({ to: c * 10 + o, why: 'zelfde vakje' });
    for (const p of PEERS[c]) if (C[p] & BIT(d)) {
      const why = ROW(p) === ROW(c) ? 'rij ' + (ROW(c) + 1) : COL(p) === COL(c) ? 'kolom ' + (COL(c) + 1) : 'blok ' + BOXNAMES[BOX(c)];
      out.push({ to: p * 10 + d, why: 'zelfde ' + why });
    }
    return out;
  }
  function chainElims(state, C, s, e) {
    const a = NC(s), x = ND(s), z = NC(e), y = ND(e), el = [];
    if (x === y && a !== z) {
      for (let i = 0; i < 81; i++) if (i !== a && i !== z && (C[i] & BIT(x)) && sees(i, a) && sees(i, z)) el.push({ cell: i, digit: x });
    } else if (a === z && x !== y) {
      for (const d of digitsOf(C[a] & ~BIT(x) & ~BIT(y))) el.push({ cell: a, digit: d });
    } else if (x !== y && sees(a, z)) {
      if (C[a] & BIT(y)) el.push({ cell: a, digit: y });
      if (C[z] & BIT(x)) el.push({ cell: z, digit: x });
    }
    return mkElim(state, el);
  }

  function findChain(state, C, maxLen) {
    let best = null;
    for (let c = 0; c < 81; c++) for (const d of digitsOf(C[c])) {
      const s = c * 10 + d;
      // BFS: entry = {n, strongNext, parent, why}
      let frontier = [{ n: s, par: null, why: '', len: 1 }];
      const seen = new Set([s + ':s']);
      while (frontier.length) {
        const nxt = [];
        for (const f of frontier) {
          const strong = f.len % 2 === 1; // na start komt sterk, dan zwak, ...
          if (f.len >= maxLen) continue;
          const links = strong ? strongLinks(C, f.n) : weakLinks(C, f.n);
          for (const l of links) {
            const key = l.to + ':' + (strong ? 'w' : 's');
            if (seen.has(key) || onPath(f, l.to)) continue;
            seen.add(key);
            const g = { n: l.to, par: f, why: l.why, len: f.len + 1, strong };
            if (strong && g.len >= 4) {
              const el = chainElims(state, C, s, l.to);
              if (el.length && (!best || g.len < best.g.len)) best = { g, el, s };
            }
            nxt.push(g);
          }
        }
        if (best && nxt.length && nxt[0].len >= best.g.len) break;
        frontier = nxt;
      }
      if (best && best.g.len <= 4) return buildChainStep(best);
    }
    return best ? buildChainStep(best) : null;
  }
  function onPath(f, n) { for (let p = f; p; p = p.par) if (p.n === n) return true; return false; }

  function buildChainStep(best) {
    const path = [];
    for (let p = best.g; p; p = p.par) path.unshift(p);
    const s = path[0].n, e = path[path.length - 1].n;
    const digits = new Set(path.map(p => ND(p.n)));
    const allBi = path.slice(1).every(p => !p.strong || p.why.startsWith('R'));
    const tech = digits.size === 1 ? 'X-keten' : allBi ? 'XY-keten' : 'Keten (AIC)';
    const lines = ['Stel ' + name(NC(s)) + ' is geen ' + ND(s) + '.'];
    for (let k = 1; k < path.length; k++) {
      const p = path[k];
      if (p.strong) lines.push('Dan is ' + name(NC(p.n)) + ' wel ' + ND(p.n) + ' (' + p.why + ').');
      else lines.push('Dan is ' + name(NC(p.n)) + ' geen ' + ND(p.n) + ' (' + p.why + ').');
    }
    lines.push('Dus: ' + nname(s) + ' of ' + nname(e) + ' is waar.');
    lines.push('In beide gevallen kunnen deze kandidaten niet: ' + list(best.el.map(x => name(x.cell) + ' (' + x.digit + ')')) + '.');
    return {
      type: 'chain', technique: tech,
      title: tech + ' van ' + nname(s) + ' naar ' + nname(e),
      digit: digits.size === 1 ? ND(s) : 0, place: null, eliminations: best.el, lines,
      hl: { house: [...new Set(path.map(p => NC(p.n)))], pattern: path.map(p => ({ cell: NC(p.n), digit: ND(p.n) })), digitFocus: 0 }
    };
  }

  // ---------- elke mogelijkheid van een vakje geeft hetzelfde gevolg ----------
  function propagate(state, cell, d) {
    const st = state.clone();
    st.grid[cell] = d;
    const chain = [];
    for (let k = 0; k < 81; k++) {
      if (conflicts(st.grid).length) return null;
      const q = quickSingle(st);
      if (!q) {
        const C = st.allCands();
        const e = findLocked(st, C) || findNakedSubset(st, C, 2) || findHiddenSubset(st, C, 2);
        if (!e) break;
        for (const x of e.eliminations) st.elim[x.cell] |= BIT(x.digit);
        continue;
      }
      if (q.bad) return null;
      chain.push(q);
      st.grid[q.cell] = q.digit;
    }
    return { grid: st.grid, chain };
  }
  function findCellForcing(state) {
    const C = state.allCands();
    let best = null;
    for (let i = 0; i < 81; i++) {
      const n = popcount(C[i]);
      if (n < 2 || n > 3) continue;
      const res = digitsOf(C[i]).map(d => ({ d, r: propagate(state, i, d) }));
      const ok = res.filter(x => x.r);
      if (!ok.length) continue;
      for (let j = 0; j < 81; j++) {
        if (j === i || state.grid[j]) continue;
        const v = ok[0].r.grid[j];
        if (!v || !ok.every(x => x.r.grid[j] === v)) continue;
        const len = ok.reduce((a, x) => a + x.r.chain.findIndex(q => q.cell === j) + 1, 0);
        if (!best || len < best.len) best = { i, j, v, ok, bad: res.filter(x => !x.r).map(x => x.d), len };
      }
    }
    if (!best) return null;
    const { i, j, v, ok, bad } = best;
    const lines = [name(i) + ' kan alleen ' + list(digitsOf(C[i])) + ' zijn. We bekijken elke mogelijkheid.'];
    for (const x of ok) {
      const k = x.r.chain.findIndex(q => q.cell === j);
      const steps = x.r.chain.slice(0, k + 1).map(q => name(q.cell) + '=' + q.digit);
      lines.push('Als ' + name(i) + ' = ' + x.d + ': ' + steps.join(', ') + '.');
    }
    if (bad.length) lines.push('Als ' + name(i) + ' = ' + list(bad) + ': tegenspraak, dus dat kan niet.');
    lines.push('In elk geval wordt ' + name(j) + ' een ' + v + ', dus ' + name(j) + ' = ' + v + '.');
    return {
      type: 'forcing', technique: 'Alle mogelijkheden',
      title: 'Wat er ook in ' + name(i) + ' komt...',
      digit: v, place: { cell: j, digit: v }, eliminations: [], lines,
      hl: { house: [i], sources: [i], excluded: [], occupied: [], blocked: [], target: j, digitFocus: v }
    };
  }

  // ---------- laatste redmiddel: stel dat ... dan tegenspraak ----------
  function quickSingle(st) {
    for (let i = 0; i < 81; i++) if (!st.grid[i]) {
      const m = st.cands(i);
      if (!m) return { bad: name(i) + ' heeft geen cijfer meer over' };
      if (popcount(m) === 1) return { cell: i, digit: digitsOf(m)[0], why: 'enige cijfer in vakje' };
    }
    for (let h = 0; h < 27; h++) for (let d = 1; d <= 9; d++) {
      if (HOUSES[h].some(i => st.grid[i] === d)) continue;
      const pos = HOUSES[h].filter(i => !st.grid[i] && (st.cands(i) & BIT(d)));
      if (!pos.length) return { bad: 'de ' + d + ' kan nergens meer in ' + houseName(h) };
      if (pos.length === 1) return { cell: pos[0], digit: d, why: 'enige plek in ' + houseName(h) };
    }
    return null;
  }
  function tryAssume(state, cell, d, limit) {
    const st = state.clone();
    st.grid[cell] = d;
    const chain = [];
    for (let k = 0; k < limit; k++) {
      if (conflicts(st.grid).length) return { chain, bad: 'dubbel cijfer' };
      const q = quickSingle(st);
      if (!q) {
        const C = st.allCands();
        const e = findLocked(st, C) || findNakedSubset(st, C, 2) || findHiddenSubset(st, C, 2);
        if (!e) return null;
        for (const x of e.eliminations) st.elim[x.cell] |= BIT(x.digit);
        chain.push({ elim: e.eliminations, why: e.technique.toLowerCase() });
        continue;
      }
      if (q.bad) return { chain, bad: q.bad };
      chain.push(q);
      st.grid[q.cell] = q.digit;
    }
    return null;
  }
  function findContradiction(state) {
    let best = null;
    const C = state.allCands();
    const order = [];
    for (let i = 0; i < 81; i++) if (C[i]) order.push(i);
    order.sort((a, b) => popcount(C[a]) - popcount(C[b]));
    for (const i of order) for (const d of digitsOf(C[i])) {
      const lim = best ? best.r.chain.length : 40;
      const r = tryAssume(state, i, d, lim);
      if (r && (!best || r.chain.length < best.r.chain.length)) best = { i, d, r };
    }
    if (!best) return null;
    const { i, d, r } = best;
    const lines = ['Stel ' + name(i) + ' = ' + d + '.'];
    for (const q of r.chain) lines.push(q.elim
      ? 'Dan vallen weg: ' + list(q.elim.map(x => name(x.cell) + ' (' + x.digit + ')')) + ' (' + q.why + ').'
      : 'Dan ' + name(q.cell) + ' = ' + q.digit + ' (' + q.why + ').');
    lines.push('Maar dan ' + r.bad + '. Tegenspraak!');
    lines.push('Dus ' + name(i) + ' is geen ' + d + '.');
    return {
      type: 'contradiction', technique: 'Bewijs uit tegenspraak',
      title: 'Kan ' + name(i) + ' een ' + d + ' zijn?',
      digit: d, place: null, eliminations: [{ cell: i, digit: d }], lines,
      hl: { house: [i].concat(r.chain.filter(q => !q.elim).map(q => q.cell)), pattern: [{ cell: i, digit: d }].concat(r.chain.filter(q => !q.elim).map(q => ({ cell: q.cell, digit: q.digit }))), digitFocus: 0 }
    };
  }

  function apply(state, step, nr) {
    if (step.place) state.grid[step.place.cell] = step.place.digit;
    for (const e of step.eliminations) {
      state.elim[e.cell] |= BIT(e.digit);
      state.elimStep[e.cell][e.digit] = nr;
    }
  }

  // Maakt de volledige lijst stappen. Elke stap krijgt een momentopname ervoor.
  function explain(givens, maxSteps = 400) {
    let state = new State(givens);
    const steps = [];
    while (steps.length < maxSteps) {
      if (state.grid.every(v => v)) break;
      const step = nextStep(state);
      if (!step) {
        steps.push({ type: 'stuck', technique: 'Vastgelopen', title: 'Geen eenvoudige volgende stap gevonden',
          lines: ['De app kent (nog) geen techniek die hier verder helpt.', 'Er wordt niet gegokt en geen oplossing gebruikt.'],
          place: null, eliminations: [], hl: {}, before: snapshot(state) });
        break;
      }
      step.before = snapshot(state);
      steps.push(step);
      apply(state, step, steps.length);
      step.after = snapshot(state);
    }
    return { steps, solved: state.grid.every(v => v), final: state.grid.slice() };
  }

  function snapshot(state) {
    return { grid: state.grid.slice(), cands: state.allCands() };
  }

  const api = { explain, countSolutions, conflicts, digitsOf, name, State, nextStep, HOUSES, BOXNAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SudokuSolver = api;
})(typeof window !== 'undefined' ? window : this);
