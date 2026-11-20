# Changelog

## 2026-11-20
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
