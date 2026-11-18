"""Pomagier 1.0.70: remove artificial 30-minute wait between prestige attacks.

The game server's points / cooldown status remains authoritative. The scheduler
still checks every configured 5 minutes (default), never retries uncertain POSTs.
Automatic POST opponent *rerolls* retain their independent 30-minute throttle.
Apply on top of v1.0.69.
"""
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
p=root/'app/src/main/assets/pomagier.user.js'
s=p.read_text(encoding='utf8')
def one(before,after,label):
    global s
    count=s.count(before)
    if count!=1: raise SystemExit(f'v1070 {label}: expected once, got {count}')
    s=s.replace(before,after,1)

one('// @version      8.8.76','// @version      8.8.77','script metadata')
one("const VERSION = '8.8.76';", "const VERSION = '8.8.77';",'script version')
one("const ANDROID_VERSION = '1.0.69';", "const ANDROID_VERSION = '1.0.70';",'android version')
one('  prestigeAuto.cooldownMs=30*60*1000;', '''  // Nie blokuj kolejnych atakow sztucznym limitem 30 min.
  // Serwer decyduje o punktach walki i ewentualnym cooldownie.
  prestigeAuto.cooldownMs=0;''','local cooldown')
one('''    if(now-prestigeAuto.lastAttackAt<prestigeAuto.cooldownMs){
      prestigeAuto.status='ODSTEP 30 MIN — czekam';prestigeAutoSave();return;
    }
''', '', 'remove 30 minute block')
one('''Zostaja kontrola punktow walki, 30-minutowy odstep, limit 12 autoatakow i stop po porazce.''',
    '''Zostaja kontrola punktow walki i limit 12 autoatakow. Nie ma sztucznej przerwy miedzy walkami, ale AUTO sprawdza stan co 5 minut i respektuje ograniczenia serwera. Osobne automatyczne losowania POST nadal maja limit co 30 minut (mozliwy koszt). Stop po porazce.''',
    'UI explanation')
p.write_text(s,encoding='utf8')
g=root/'app/build.gradle.kts'; z=g.read_text(encoding='utf8')
if z.count('versionCode = 10069')!=1 or z.count('versionName = "1.0.69"')!=1:
    raise SystemExit('v1070: requires Android 1.0.69')
z=z.replace('versionCode = 10069','versionCode = 10070',1).replace('versionName = "1.0.69"','versionName = "1.0.70"',1)
g.write_text(z,encoding='utf8')
r=root/'README.md'
if r.exists():r.write_text(r.read_text(encoding='utf8')+'''\n\n## v1.0.70 / userscript 8.8.77\n- Usunieto sztuczny 30-minutowy odstep pomiedzy automatycznymi atakami o prestiz.\n- Pozostaje automatyczna kontrola punktow walki co 5 min (standardowo), ograniczenia serwera, limit 12 autoatakow i stop po porazce / niepewnym POST.\n- Oddzielna kalibracja i limit 30 min automatycznych losowan POST pozostaja bez zmian (mozliwy koszt losowania).\n''',encoding='utf8')
print('OK v1.0.70 / 8.8.77; no arbitrary 30-minute prestige attack delay')