"""Bouwt sudoku-uitleg.html (1 bestand) uit index.html + css + js. Optioneel: artifact-versie als argument."""
import re, sys
h = open('index.html').read()
h = h.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + open('css/style.css').read() + '</style>')
h = h.replace('<script src="js/solver.js"></script>', '<script>\n' + open('js/solver.js').read() + '</script>')
h = h.replace('<script src="js/app.js"></script>', '<script>\n' + open('js/app.js').read() + '</script>')
open('sudoku-uitleg.html', 'w').write(h)
if len(sys.argv) > 1:
    css = re.search(r'<style>\n(.*?)</style>', h, re.S).group(1)
    dark = re.search(r'@media \(prefers-color-scheme: dark\) \{\n  :root \{(.*?)\}\n\}', css, re.S)
    v = dark.group(1)
    css = css.replace(dark.group(0), '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {' + v + ' color-scheme: dark; }\n}\n:root[data-theme="dark"] {' + v + ' color-scheme: dark; }')
    css = css.replace('main { max-width: 520px; margin: 0 auto; padding: 12px 16px 40px; }', 'main { max-width: 520px; margin: 0 auto; padding-block: 12px 40px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }')
    body = re.search(r'<body>\n(.*)</body>', h, re.S).group(1)
    open(sys.argv[1], 'w').write('<title>Sudoku Uitleg</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>\n' + css + '</style>\n' + body)
