# Changelog

## 2026-11-20
- [DONE] Fix: puzzel van 20:54 screenshot liep vast na 11 stappen. Nu opgelost in 127 stappen.
  - Nieuw: "alle mogelijkheden" voor vakje en voor cijfer in rij/kolom/blok (zelfde plaatsing of wegstreping in elke tak).
  - "Stel dat" bewijzen: sterkere niveaus, en onnodige tussenstappen worden weggelaten (kortere uitleg).
  - Rekenen gebeurt op de achtergrond (Web Worker): je kunt al lezen terwijl de app verder rekent. Teller toont "(rekent...)".
  - Sneller: max ~0,2 s per stap (was 9 s).
  - Bug gevonden door tests en hersteld: alle-mogelijkheden streepte soms een juist cijfer weg.
  - Tests: 2 van 3 wereldtop-puzzels nu ook opgelost. Volledige test duurt ~2,5 min.
- [DONE] Kleine cijfers (kandidaten) blijven zichtbaar en gekleurd, ook bij conclusie en volgende stappen.
  - Groen = in redenering, rood doorgestreept = valt nu weg, grijs doorgestreept = eerder weggestreept. Legenda uitgebreid.
- [DONE] Fix: "Extreme" puzzel (18 cijfers) liep vast na stap 1. Nu opgelost in 68 stappen.
  - Nieuw: ketens (X-keten, XY-keten, AIC), bewijs uit tegenspraak, alle-mogelijkheden-van-vakje.
  - `build.py` maakt `sudoku-uitleg.html` (1 bestand). Link op mobiel bijgewerkt.
  - Open: 3 wereldtop-puzzels (o.a. AI Escargot) lopen nog vast.

## 2026-11-19
- [DONE] Losse versie `sudoku-uitleg.html` (alles in 1 bestand, makkelijk openen).
- [DONE] Eerste versie Sudoku Uitleg app: invoer begincijfers, stap-voor-stap oplossen met uitleg, arcering, X op uitgesloten vakjes, rode doelcel, Vorige/Volgende/Opnieuw, mobiel.
  - Krantpuzzel (uit chat) opgelost in 57 stappen, alleen "enige plek" zetten. Tests: `node tests/run.js`.
  - Open punt: zeer moeilijke puzzels lopen vast (geen gokken). Later meer technieken mogelijk.
