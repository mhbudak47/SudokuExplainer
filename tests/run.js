const S = require('../js/solver.js');
const KRANT = '400006000' + '620003000' + '000710480' + '100050900' + '006400100' + '000080570' + '070960030' + '000000000' + '030004000';
const g = KRANT.split('').map(Number);
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok', m); };
const sol = S.countSolutions(g);
console.log('oplossingen:', sol.count);
const r = S.explain(g);
const tech = {};
r.steps.forEach((s, k) => { tech[s.technique] = (tech[s.technique] || 0) + 1; if (process.argv[2]) console.log(k + 1, s.title, '|', s.lines.join(' ')); });
console.log(tech, 'opgelost:', r.solved, 'stappen:', r.steps.length);
ok(sol.count === 1, 'krant uniek');
ok(r.solved, 'krant logisch opgelost');
ok(r.final.join('') === sol.solution.join(''), 'logische oplossing = controle-oplossing');
// elke plaatsing moet kloppen met de oplossing
ok(r.steps.every(s => !s.place || sol.solution[s.place.cell] === s.place.digit), 'alle plaatsingen juist');
ok(r.steps.every(s => s.eliminations.every(e => sol.solution[e.cell] !== e.digit)), 'alle wegstrepingen juist');
// extra puzzels
const extra = [
 '003020600900305001001806400008102900700000008006708200002609500800203009005010300',
 '000000010400000000020000000000050407008000300001090000300400200050100000000806000',
 '800000000003600000070090200050007000000045700000100030001000068008500010090000400',
 '000008300900500000007000000400000097030200000000000600006470000080000100000890000',
 '100007090030020008009600500005300900010080002600004000300000010040000007007000300',
 '600008940900006100070040000200610000000000200089002000000060005000000030800001600',
 '060007080005030002400900000000400700000008003000020050300000001090050060002700400'
];
const HARD = [extra[2], extra[4], extra[5]];
for (const p of extra) {
  const gg = p.split('').map(Number); const s2 = S.countSolutions(gg); const rr = S.explain(gg);
  ok(rr.steps.every(s => !s.place || s2.solution[s.place.cell] === s.place.digit), 'extra plaatsingen juist (' + rr.steps.length + ' stappen, opgelost=' + rr.solved + ')');
  ok(rr.steps.every(s => s.eliminations.every(e => s2.solution[e.cell] !== e.digit)), 'extra wegstrepingen juist');
  if (!HARD.includes(p)) ok(rr.solved, 'extra opgelost'); else console.log('    (wereldtop-moeilijk, vastlopen toegestaan) opgelost=' + rr.solved);
  const t = {}; rr.steps.forEach(x => t[x.technique] = (t[x.technique] || 0) + 1); console.log('   ', JSON.stringify(t));
}
process.exit(fails ? 1 : 0);
