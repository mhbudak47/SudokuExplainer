# Sudoku Uitleg

Vul de begincijfers in. De app lost op **met uitleg per stap**, niet alles tegelijk.

## Gebruik
1. Open `index.html` in de browser (ook mobiel, geen installatie).
2. Tik een vakje, kies cijfer op het toetsenblok. Of "Voorbeeld (krant)" / "Plakken als tekst".
3. Druk "Start uitleg". Per stap:
   - Volgende 1x: redenering. Zoekgebied blauw, blokkerende rij/kolom/blok gearceerd, oorzaak-cijfer omcirkeld, uitgesloten vakjes met X, enige plek rood met "?".
   - Volgende 2x: cijfer verschijnt.
4. Vorige, Begin opnieuw, Invoer wijzigen. Pijltjestoetsen werken ook.

## Hoe het denkt
Steeds de makkelijkste menselijke zet:
1. Enige plek voor een cijfer in blok, rij of kolom (voorkeur blok, minste oorzaken).
2. Enige cijfer dat in een vakje past.
3. Pas als dat niet lukt: kandidaten wegstrepen (wijzend paar, naakt/verborgen paar/drietal, X-wing, XY-wing, Swordfish).

De oplossing wordt nooit gebruikt om een stap te rechtvaardigen. Alleen om te controleren of de invoer 1 oplossing heeft.

## Bestanden
- `index.html`, `css/style.css`, `js/app.js`: interface
- `js/solver.js`: logische oplosser (ook in Node)
- `tests/run.js`: `node tests/run.js` (met `v` erachter: alle stappen tonen)

## Beperking
Zeer moeilijke puzzels kunnen vastlopen ("Vastgelopen"): er wordt niet gegokt.
