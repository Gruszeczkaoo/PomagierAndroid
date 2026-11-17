"""Pomagier 1.0.64: PvP opponent observed-fight style and confidence."""
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
p=root/'app/src/main/assets/pomagier.user.js'
s=p.read_text(encoding='utf8')
def one(old,new,what):
 global s
 hits=s.count(old)
 if hits!=1:raise SystemExit(f'{what}: expected once, found {hits}')
 s=s.replace(old,new,1)
one('// @version      8.8.70','// @version      8.8.71','userscript meta')
one("const VERSION = '8.8.70';","const VERSION = '8.8.71';",'version')
one("const ANDROID_VERSION = '1.0.63';","const ANDROID_VERSION = '1.0.64';",'android version')
code=Path(__file__).with_name('opponent_style_v1064.js').read_text(encoding='utf8')
one('  function opponentLabHTML(){',code+'\n  function opponentLabHTML(){','observed opponent style module')
one("<td>${q.confirmed?'POTWIERDZONY':'NIEZNANY'}</td></tr>","<td>${esc(opponentLabStyle(q).type)}</td><td>${q.confirmed?'POTWIERDZONY':'NIEZNANY'}</td></tr>",'style table rows')
one('<th>Walk</th><th>Bilans</th><th>HP</th><th>Build</th>', '<th>Walk</th><th>Bilans</th><th>HP</th><th>Styl</th><th>Build</th>','style header')
one('''      ${(sel?opponentLabExplain(sel):[]).map(x=>`<div class="note" style="margin-top:6px">${esc(x)}</div>`).join('')}
      <div class="sub"''','''      ${(sel?opponentLabExplain(sel):[]).map(x=>`<div class="note" style="margin-top:6px">${esc(x)}</div>`).join('')}
      ${sel?opponentLabStyleHTML(sel):''}
      <div class="sub"''','style detail UI')
one("${list||'<tr><td colspan=\"5\">Brak danych. Otwórz walki w PvP Lab.</td></tr>'}","${list||'<tr><td colspan=\"6\">Brak danych. Otwórz walki w PvP Lab.</td></tr>'}",'empty list')
one('''      evidenceSource:q.profile?.source||null,evidenceAt:q.profile?.capturedAt||null}));''','''      evidenceSource:q.profile?.source||null,evidenceAt:q.profile?.capturedAt||null,
      analysis:opponentLabStyle(q)}));''','style export')
one("type:'pomagier-opponent-lab',schema:2,version:VERSION", "type:'pomagier-opponent-lab',schema:3,version:VERSION",'schema')
p.write_text(s,encoding='utf8')
g=root/'app/build.gradle.kts';z=g.read_text(encoding='utf8')
assert z.count('versionCode = 10063')==1 and z.count('versionName = "1.0.63"')==1
g.write_text(z.replace('versionCode = 10063','versionCode = 10064',1).replace('versionName = "1.0.63"','versionName = "1.0.64"',1),encoding='utf8')
r=root/'README.md'
if r.exists():r.write_text(r.read_text(encoding='utf8')+'''\n\n## v1.0.64 — Analiza stylu przeciwnika PvP\n- Klasyfikacja obserwowanego zachowania z replayów (HP, regen, ciosy, krytyki, uniki, serie, leczenie).\n- Jawne ograniczenie pewności i liczebności prób; nie szacuje dokładnego STR/END/AGI/VIT/PRC.\n- Rekomendacje kontr gry i bilans walk w ataku/obronie.\n- Eksport JSON schema 3 z dowodami i wskaźnikami; zachowana diagnostyka profili.\n''',encoding='utf8')
print('OK 1.0.64 / 8.8.71')