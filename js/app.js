/* Sudoku Uitleg: interface */
(function () {
  'use strict';
  const S = window.SudokuSolver;
  const $ = id => document.getElementById(id);
  const KRANT = '400006000620003000000710480100050900006400100000080570070960030000000000030004000';
  const KEY = 'sudoku-uitleg-invoer';

  let givens = new Array(81).fill(0);
  let sel = 0;
  let mode = 'input';
  let steps = [];
  let k = -1;      // -1 = beginstand
  let phase = 0;   // 0 = redenering, 1 = cijfer geplaatst
  let badCells = [];

  // ---------- rooster ----------
  const cells = [];
  const grid = $('grid');
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9), c = i % 9;
    const el = document.createElement('div');
    el.className = 'cell' + (c % 3 === 2 && c < 8 ? ' br' : '') + (r % 3 === 2 && r < 8 ? ' bb' : '') +
      (c === 8 ? ' c9' : '') + (r === 8 ? ' r9' : '');
    el.addEventListener('click', () => { if (mode === 'input') { sel = i; render(); } });
    grid.appendChild(el);
    cells.push(el);
  }

  // ---------- invoer ----------
  const pad = $('pad');
  for (let d = 1; d <= 9; d++) addPad(String(d), () => setVal(d));
  addPad('Wis', () => setVal(0));
  function addPad(label, fn) {
    const b = document.createElement('button');
    b.textContent = label; b.addEventListener('click', fn); pad.appendChild(b);
  }
  function setVal(d) {
    givens[sel] = d;
    if (d && sel < 80) sel++;
    save(); check(); render();
  }
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA') return;
    if (mode === 'explain') {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') prev();
      return;
    }
    if (/^[1-9]$/.test(e.key)) setVal(+e.key);
    else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') { givens[sel] = 0; if (e.key === 'Backspace' && sel > 0) sel--; save(); check(); render(); }
    else if (e.key === 'ArrowRight') { sel = Math.min(80, sel + 1); render(); }
    else if (e.key === 'ArrowLeft') { sel = Math.max(0, sel - 1); render(); }
    else if (e.key === 'ArrowDown') { sel = Math.min(80, sel + 9); render(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 9); render(); }
  });

  function save() { try { localStorage.setItem(KEY, givens.join('')); } catch (e) { /* geen opslag */ } }
  function load() {
    try { const v = localStorage.getItem(KEY); if (v && /^[0-9]{81}$/.test(v)) givens = v.split('').map(Number); } catch (e) { /* */ }
  }
  function setMsg(t, cls) { const m = $('msg'); m.textContent = t; m.className = 'msg ' + (cls || ''); }
  function check() {
    badCells = S.conflicts(givens);
    if (badCells.length) setMsg('Dubbel cijfer in rij, kolom of blok (rood gemarkeerd).', 'err');
    else setMsg(givens.filter(Boolean).length + ' begincijfers ingevuld.');
  }

  $('btnExample').onclick = () => { givens = KRANT.split('').map(Number); save(); check(); render(); };
  $('btnClear').onclick = () => { givens.fill(0); sel = 0; save(); check(); render(); };
  $('btnLoadTxt').onclick = () => {
    const t = $('txt').value.replace(/[^0-9.]/g, '').replace(/\./g, '0');
    if (t.length !== 81) { setMsg('Tekst heeft ' + t.length + ' cijfers, nodig: 81.', 'err'); return; }
    givens = t.split('').map(Number); save(); check(); render();
  };

  $('btnStart').onclick = () => {
    check();
    if (badCells.length) return;
    if (givens.filter(Boolean).length < 17) { setMsg('Minstens 17 begincijfers nodig.', 'err'); return; }
    const sol = S.countSolutions(givens);
    if (sol.count === 0) { setMsg('Deze puzzel heeft geen oplossing. Controleer de invoer.', 'err'); return; }
    if (sol.count > 1) { setMsg('Let op: meer dan 1 oplossing. Controleer de invoer.', 'err'); return; }
    steps = S.explain(givens).steps;
    k = -1; phase = 0; mode = 'explain';
    $('inputPanel').hidden = true; $('explainPanel').hidden = false;
    $('modeInfo').textContent = 'Druk op Volgende. Eerst de redenering, dan het cijfer.';
    render();
  };
  $('btnEdit').onclick = () => {
    mode = 'input';
    $('inputPanel').hidden = false; $('explainPanel').hidden = true;
    $('modeInfo').textContent = 'Vul de begincijfers in. Daarna leg ik stap voor stap uit.';
    check(); render();
  };

  // ---------- navigatie ----------
  const hasPhase2 = st => st.type !== 'stuck';
  function next() {
    if (k >= 0 && phase === 0 && hasPhase2(steps[k])) phase = 1;
    else if (k < steps.length - 1) { k++; phase = 0; }
    render();
  }
  function prev() {
    if (k < 0) return;
    if (phase === 1) phase = 0;
    else { k--; phase = k >= 0 && hasPhase2(steps[k]) ? 1 : 0; }
    render();
  }
  $('btnNext').onclick = next;
  $('btnPrev').onclick = prev;
  $('btnRestart').onclick = () => { k = -1; phase = 0; render(); };
  $('chkCands').onchange = render;

  // ---------- tekenen ----------
  function render() { mode === 'input' ? renderInput() : renderExplain(); }

  function renderInput() {
    for (let i = 0; i < 81; i++) {
      const el = cells[i];
      el.className = el.className.split(' ').filter(c => ['cell', 'br', 'bb', 'c9', 'r9'].includes(c)).join(' ');
      el.innerHTML = givens[i] ? '<span class="v">' + givens[i] + '</span>' : '';
      if (givens[i]) el.classList.add('given');
      if (i === sel) el.classList.add('sel');
      if (badCells.includes(i)) el.classList.add('bad');
    }
  }

  function renderExplain() {
    const st = k >= 0 ? steps[k] : null;
    const snap = st ? (phase === 1 && st.after ? st.after : st.before) : { grid: givens, cands: null };
    const hl = st ? st.hl || {} : {};
    const showCands = $('chkCands').checked || (st && st.eliminations.length > 0);
    const cands = snap.cands || (showCands ? new S.State(givens).allCands() : null);
    const pat = new Set((hl.pattern || []).map(p => p.cell + ':' + p.digit));
    const elim = new Set(st ? st.eliminations.map(e => e.cell + ':' + e.digit) : []);
    const has = (arr, i) => arr && arr.includes(i);

    for (let i = 0; i < 81; i++) {
      const el = cells[i];
      el.className = el.className.split(' ').filter(c => ['cell', 'br', 'bb', 'c9', 'r9'].includes(c)).join(' ');
      const v = snap.grid[i];
      const isTarget = st && st.place && st.place.cell === i;
      if (has(hl.house, i)) el.classList.add('house');
      if (has(hl.occupied, i)) el.classList.add('occ');
      if (has(hl.blocked, i)) el.classList.add('blocked');
      if (has(hl.sources, i)) el.classList.add('src');
      if (has(hl.excluded, i)) el.classList.add('ex');
      if (isTarget) el.classList.add('tgt');
      if (v) {
        el.classList.add(givens[i] ? 'given' : 'found');
        el.innerHTML = '<span class="v">' + v + '</span>';
      } else if (isTarget) {
        el.classList.add('q');
        el.innerHTML = '<span class="v">?</span>';
      } else if (showCands && cands && !has(hl.excluded, i)) {
        const m = cands[i];
        let h = '<div class="cands">';
        for (let d = 1; d <= 9; d++) {
          const key = i + ':' + d;
          let cls = '';
          if (!(m & (1 << d))) cls = elim.has(key) && phase === 0 ? 'el' : 'gone';
          else if (elim.has(key)) cls = 'el';
          else if (pat.has(key)) cls = 'pat';
          else if (hl.digitFocus === d) cls = 'focus';
          h += '<span class="' + cls + '">' + d + '</span>';
        }
        el.innerHTML = h + '</div>';
      } else el.innerHTML = '';
    }

    // tekstkaart
    const total = steps.length;
    $('counter').textContent = k < 0 ? 'Begin' : 'Stap ' + (k + 1) + ' / ' + total;
    $('btnPrev').disabled = k < 0;
    $('btnNext').disabled = k >= total - 1 && (k < 0 || phase === 1 || !hasPhase2(steps[k]));
    const lines = $('lines');
    lines.innerHTML = '';
    if (!st) {
      $('tech').textContent = 'Beginstand';
      $('title').textContent = 'Alleen de begincijfers';
      addLine('Er staan ' + givens.filter(Boolean).length + ' cijfers. Elke stap zoekt de makkelijkste volgende zet.');
      $('phaseHint').textContent = 'Druk op Volgende.';
      return;
    }
    $('tech').textContent = st.technique;
    $('title').textContent = st.title;
    st.lines.forEach((t, j) => {
      const last = j === st.lines.length - 1 && st.place;
      if (last && phase === 0) return; // conclusie pas bij fase 2
      addLine(t, last ? 'final' : '');
    });
    if (st.type === 'stuck') $('phaseHint').textContent = '';
    else if (phase === 0) $('phaseHint').textContent = st.place ? 'Welk vakje blijft over? Druk op Volgende om het cijfer te plaatsen.' : 'Druk op Volgende om de kandidaten weg te strepen.';
    else $('phaseHint').textContent = k === total - 1 ? 'Klaar! De sudoku is opgelost.' : 'Druk op Volgende voor de volgende stap.';
  }
  function addLine(t, cls) {
    const li = document.createElement('li');
    li.textContent = t; if (cls) li.className = cls;
    $('lines').appendChild(li);
  }

  load(); check(); render();
})();
