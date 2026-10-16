from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
js=root/'app/src/main/assets/pomagier.user.js'
if not js.exists():
    raise SystemExit('Brak userscriptu')
s=js.read_text(encoding='utf-8')

if '// @version      8.8.61' not in s:
    raise SystemExit('Oczekiwano JS 8.8.61')
s=s.replace('// @version      8.8.61','// @version      8.8.62',1)
s=s.replace("const VERSION = '8.8.61';","const VERSION = '8.8.62';",1)
s=s.replace("const ANDROID_VERSION = '1.0.54';","const ANDROID_VERSION = '1.0.55';",1)

note="""  // v8.8.62 REMOVE WYSYPISKO LAB / STORAGE CLEANUP:
  // - calkowicie usunieta zakladka i rejestrator Wysypisko Lab,
  // - usuniete przechwytywanie fetch/XHR, skanowanie, eksport i timery LAB,
  // - przy pierwszym uruchomieniu kasowany jest stary klucz pomagier_dump_lab_v2 z localStorage,
  // - zwalnia to do ok. 3.5 mln znakow danych LAB i eliminuje jego dalszy wzrost,
  // - zwykle funkcje wysypiska w grze/Pomagierze pozostaja bez zmian; usuwamy tylko laboratorium diagnostyczne.
"""
anchor='  // v8.8.61 RAID DEADLINE WATCHDOG:'
p=s.find(anchor)
if p>=0 and note not in s:
    s=s[:p]+note+s[p:]

# Early migration: free quota before later modules start persisting their state.
needle="""  function saveJSON(key, value) {
    let raw;
    try{ raw=JSON.stringify(value); }catch(e){ __storageLastError=String(e?.message||e); return false; }
    return safeLocalStorageSet(key,raw);
  }
"""
cleanup="""  function saveJSON(key, value) {
    let raw;
    try{ raw=JSON.stringify(value); }catch(e){ __storageLastError=String(e?.message||e); return false; }
    return safeLocalStorageSet(key,raw);
  }

  // v8.8.62: Wysypisko Lab zostalo usuniete. Zwolnij jego stary magazyn natychmiast.
  try{
    if(localStorage.getItem('pomagier_dump_lab_v2')!==null){
      localStorage.removeItem('pomagier_dump_lab_v2');
      __storageLastError='';
      console.info('[Pomagier storage] usunieto stare dane Wysypisko Lab');
    }
  }catch(_){ }
"""
if needle not in s:
    raise SystemExit('Brak miejsca migracji storage')
s=s.replace(needle,cleanup,1)

# Remove entire Wysypisko Lab feature block.
start_marker="""  // ============================================================
  // WYSYPISKO ALL INCLUSIVE LAB v8.8.48
"""
end_marker="""  // ============================================================
  // HISTORIA ZAKUPÓW v8.8.44
"""
a=s.find(start_marker)
b=s.find(end_marker,a+1)
if a<0 or b<0 or b<=a:
    raise SystemExit('Nie znaleziono bloku Wysypisko Lab')
s=s[:a]+end_marker+s[b+len(end_marker):]

# Remove the v8.8.52 auxiliary timer/click branch for LAB.
aux_start="  // v8.8.52: lekkie rozszerzenie LAB bez ingerowania w glowny dispatcher.\n"
aux_end="  panel.dataset.pomagierVersion=VERSION;"
a=s.find(aux_start)
b=s.find(aux_end,a+1)
if a<0 or b<0 or b<=a:
    raise SystemExit('Nie znaleziono dodatkowego timera Wysypisko Lab')
s=s[:a]+aux_end+s[b+len(aux_end):]

# Remove visible tab.
tab="['dumpLab','Wysypisko Lab'],"
if tab not in s:
    raise SystemExit('Brak zakladki Wysypisko Lab')
s=s.replace(tab,'',1)

# Remove router aliases.
for line in [
    "      case 'dumpLab': return dumpLabHTML();\n",
    "      case 'dump': return dumpLabHTML();\n",
    "      case 'wysypisko': return dumpLabHTML();\n",
    "      case 'wysypiskoLab': return dumpLabHTML();\n",
]:
    s=s.replace(line,'')

# Remove main dispatcher actions dedicated to the removed lab.
block="""    if(act==='dump-lab-toggle'){
      dumpLab.enabled=!dumpLab.enabled;
      dumpLab.lastAction=dumpLab.enabled?'Rejestrator wlaczony.':'Rejestrator wylaczony.';
      dumpLabSave(); render(); return;
    }
    if(act==='dump-lab-scan'){
      try{await dumpLabManualScan();}catch(e){dumpLab.lastAction='Skan blad: '+String(e&&e.message||e);dumpLab.errors.push({at:Date.now(),where:'manual-scan',message:String(e&&e.message||e)});dumpLabSave();render();}
      return;
    }
    if(act==='dump-lab-export'){ dumpLabExport(); render(); return; }
    if(act==='dump-lab-copy'){
      try{await dumpLabCopy();}catch(e){dumpLab.lastAction='Kopiowanie blad: '+String(e&&e.message||e);dumpLabSave();}
      render(); return;
    }
    if(act==='dump-lab-clear'){
      if(confirm('Wyczyscic wszystkie dane Wysypisko LAB?')){
        const enabled=dumpLab.enabled; dumpLab=dumpLabDefault(); dumpLab.enabled=enabled; dumpLab.lastAction='Dane LAB wyczyszczone.'; dumpLabSave(); render();
      }
      return;
    }
"""
if block not in s:
    raise SystemExit('Brak dispatcher actions Wysypisko Lab')
s=s.replace(block,'',1)

# If old saved tab pointed to removed page, migrate it to Pomagier.
old="""  const __savedSettings = loadJSON(K.settings, {}) || {};
"""
# activeTab is initialized elsewhere; use localStorage tab migration directly.
insert="""  try{
    const oldTab=String(localStorage.getItem(K.tab)||'');
    if(['dumpLab','dump','wysypisko','wysypiskoLab'].includes(oldTab)) safeLocalStorageSet(K.tab,'autopilot');
  }catch(_){ }

  const __savedSettings = loadJSON(K.settings, {}) || {};
"""
if old not in s:
    raise SystemExit('Brak __savedSettings anchor')
s=s.replace(old,insert,1)

# Build-time regression checks.
for forbidden in [
    'const DUMP_LAB_KEY=',
    'function dumpLabHTML(',
    'function dumpLabInstallNetworkRecorder(',
    "['dumpLab','Wysypisko Lab']",
    "case 'dumpLab': return dumpLabHTML();",
    'data-act="dump-lab-',
    "data-act-v1045=\"dump-digs-",
]:
    if forbidden in s:
        raise SystemExit('REGRESJA: pozostala odnoga Wysypisko Lab: '+forbidden)

for required in [
    '// @version      8.8.62',
    "const ANDROID_VERSION = '1.0.55';",
    "localStorage.removeItem('pomagier_dump_lab_v2')",
    "safeLocalStorageSet(K.tab,'autopilot')",
    "['purchases','🛒 Zakupy']",
    "['payouts','💰 Wypłaty']",
]:
    if required not in s:
        raise SystemExit('v1.0.55 NIEKOMPLETNA: '+required)

js.write_text(s,encoding='utf-8')

bg=root/'app/build.gradle.kts'
t=bg.read_text(encoding='utf-8')
if 'versionCode = 10054' not in t or 'versionName = "1.0.54"' not in t:
    raise SystemExit('Oczekiwano Android 1.0.54')
t=t.replace('versionCode = 10054','versionCode = 10055',1)
t=t.replace('versionName = "1.0.54"','versionName = "1.0.55"',1)
bg.write_text(t,encoding='utf-8')

readme=root/'README.md'
if readme.exists():
    r=readme.read_text(encoding='utf-8')
    if '## v1.0.55 / userscript 8.8.62' not in r:
        r += """

## v1.0.55 / userscript 8.8.62 - Remove Wysypisko Lab / storage cleanup
- Calkowicie usunieto diagnostyczna zakladke Wysypisko Lab wraz z recorderem fetch/XHR, skanem, eksportem i timerami UI.
- Przy starcie automatycznie kasowany jest stary localStorage `pomagier_dump_lab_v2` (LAB mogl zajmowac do ok. 3.5 mln znakow).
- Stara aktywna zakladka Wysypisko Lab jest migrowana do Pomagier.
- Zwykle funkcje wysypiska pozostaja bez zmian; usuniete zostalo tylko laboratorium badawcze.
"""
        readme.write_text(r,encoding='utf-8')

print('v1.0.55 applied')
print('OK: Wysypisko Lab code removed')
print('OK: old dump lab localStorage removed on startup')
print('OK: dump recorder/timers/router/tab removed')
