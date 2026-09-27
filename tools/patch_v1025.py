from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
js = root / "app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit(f"Brak pliku: {js}")

s = js.read_text(encoding="utf-8")

# Version bump.
s = s.replace("// @version      8.8.31", "// @version      8.8.32", 1)
s = s.replace("const VERSION = '8.8.31';", "const VERSION = '8.8.32';", 1)
s = s.replace("const ANDROID_VERSION = '1.0.24';", "const ANDROID_VERSION = '1.0.25';", 1)

# Changelog note near the script header.
anchor = "  // v8.8.31"
note = """  // v8.8.32 SIMPLE UI MENEL SWITCH + GARDEN STATUS FIX:
  // - szybki przełącznik MenelMode/dzielnice jest widoczny na głównym prostym ekranie Pomagiera,
  // - OFF nie zatrzymuje Pomagiera; blokuje tylko nowe MenelMode i nowe przejazdy/sweep dzielnic,
  // - istniejący wynik MenelMode i trwająca podróż mogą zostać bezpiecznie domknięte,
  // - Ogród nie pokazuje błędnie NIEDOSTĘPNY, jeśli mamy realne sloty/ostatnią akcję,
  // - status ogrodu i opisy UI uwzględniają 6 grządek i priorytet Młodych ziemniaków.
"""
if note not in s:
    pos = s.find(anchor)
    if pos >= 0:
        s = s[:pos] + note + s[pos:]

# Main SIMPLE UI: place the switch right next to STOP/START and Refresh.
old_simple = '''          <button data-act="market-refresh">↻ Odśwież</button>
        </div>
      </div>

      ${notices.map'''
new_simple = '''          <button data-act="market-refresh">↻ Odśwież</button>
          <button class="${autoCfg.localAiMenelMode?'btn-main':'btn-stop'}" data-act="menel-master-toggle">🧭 MenelMode / dzielnice: ${autoCfg.localAiMenelMode?'ON':'OFF'}</button>
        </div>
        <div class="sub" style="margin-top:8px">MenelMode/dzielnice ${autoCfg.localAiMenelMode?'włączone — Pomagier może czyścić dzielnice':'wyłączone — reszta Pomagiera nadal działa'}</div>
      </div>

      ${notices.map'''
if old_simple not in s:
    raise SystemExit("Nie znaleziono miejsca przycisku w SIMPLE UI")
s = s.replace(old_simple, new_simple, 1)

# Button handler.
handler_anchor = "    if(act==='auto-live'){"
handler = """    if(act==='menel-master-toggle'){
      autoCfg.localAiMenelMode=!autoCfg.localAiMenelMode;
      state.localAI.nextAt=0;
      state.localAI.worldNextAt=0;
      state.localAI.worldActionGate=autoCfg.localAiMenelMode
        ? 'MENELMODE/DZIELNICE ON'
        : 'MENELMODE/DZIELNICE OFF — reszta Pomagiera działa';
      state.localAI.worldActionGateAt=Date.now();
      autoSaveCfg();
      render();
      return;
    }

"""
if handler not in s:
    if handler_anchor not in s:
        raise SystemExit("Nie znaleziono handlera auto-live")
    s = s.replace(handler_anchor, handler + handler_anchor, 1)

# Hard runtime gate: OFF blocks only NEW district work. Existing result/arrival may still be closed safely.
type_anchor = "    const type=String(action.type||'none');
"
gate = """    const type=String(action.type||'none');
    if(!autoCfg.localAiMenelMode && ['menel_start','menel_complete_now','travel'].includes(type)){
      return gate('MENELMODE/DZIELNICE OFF',3000);
    }
"""
if gate not in s:
    if type_anchor not in s:
        raise SystemExit("Nie znaleziono world-action type")
    s = s.replace(type_anchor, gate, 1)

# Tell Brain that the whole district lane is disabled while the master switch is OFF.
s = s.replace(
"""        menel:!!autoCfg.localAiMenelMode,
        hustling:!!autoCfg.localAiHustling,
        npc:!!(NPC_AUTO_ENABLED && autoCfg.localAiNpc),
        travel:!!autoCfg.localAiTravel,
        districtSweep:!!autoCfg.localAiDistrictSweep,""",
"""        menel:!!autoCfg.localAiMenelMode,
        hustling:!!autoCfg.localAiHustling,
        npc:!!(NPC_AUTO_ENABLED && autoCfg.localAiNpc),
        travel:!!autoCfg.localAiTravel && !!autoCfg.localAiMenelMode,
        districtSweep:!!autoCfg.localAiDistrictSweep && !!autoCfg.localAiMenelMode,""",
1
)
s = s.replace(
"        exploreDistricts:!!autoCfg.localAiExploreDistricts",
"        exploreDistricts:!!autoCfg.localAiExploreDistricts && !!autoCfg.localAiMenelMode",
1
)

# Garden internal status: unlocked flag from the endpoint is not authoritative when real slots/actions exist.
old_gstatus = """    const growing=g.slots.filter(x=>x.status==='growing').length;
    const ready=g.slots.filter(x=>x.status==='ready').length;
    g.status=g.unlocked
      ? `${growing}/4 rośnie${ready?` • ${ready} gotowe`:''} • nasiona ${g.availableSeeds}`
      : 'OGRÓD NIEDOSTĘPNY';"""
new_gstatus = """    const growing=g.slots.filter(x=>x.status==='growing').length;
    const ready=g.slots.filter(x=>x.status==='ready').length;
    const gardenHasRealData=g.slots.length>0 || /zasiano|zebrano/i.test(String(g.lastAction||''));
    g.status=(g.unlocked!==false || gardenHasRealData)
      ? `${growing}/${Math.max(6,g.slots.length||6)} rośnie${ready?` • ${ready} gotowe`:''} • nasiona ${g.availableSeeds}`
      : 'OGRÓD NIEDOSTĘPNY';"""
if old_gstatus not in s:
    raise SystemExit("Nie znaleziono statusu ogrodu")
s = s.replace(old_gstatus, new_gstatus, 1)

# SIMPLE UI garden card: do not show NIEDOSTEPNY when we already sowed/read slots.
old_gtext = """    const gardenSlots = Array.isArray(garden.slots) ? garden.slots : [];
    const gardenGrowing = gardenSlots.filter(s=>String(s.status)==='growing').length;
    const gardenReady = gardenSlots.filter(s=>String(s.status)==='ready').length;
    const gardenText = garden.unlocked===false ? 'NIEDOSTĘPNY'
      : gardenSlots.length ? `${gardenGrowing} rośnie${gardenReady?` • ${gardenReady} gotowe`:''} • nasiona ${Number(garden.availableSeeds||0)}`
      : esc(garden.status||'—');"""
new_gtext = """    const gardenSlots = Array.isArray(garden.slots) ? garden.slots : [];
    const gardenGrowing = gardenSlots.filter(s=>String(s.status)==='growing').length;
    const gardenReady = gardenSlots.filter(s=>String(s.status)==='ready').length;
    const gardenHasRealData = gardenSlots.length>0 || /zasiano|zebrano/i.test(String(garden.lastAction||''));
    const gardenText = (garden.unlocked===false && !gardenHasRealData) ? 'NIEDOSTĘPNY'
      : gardenSlots.length ? `${gardenGrowing}/${Math.max(6,gardenSlots.length||6)} rośnie${gardenReady?` • ${gardenReady} gotowe`:''} • nasiona ${Number(garden.availableSeeds||0)}`
      : gardenHasRealData ? 'AKTYWNY'
      : esc(garden.status||'—');"""
if old_gtext not in s:
    raise SystemExit("Nie znaleziono gardenText w SIMPLE UI")
s = s.replace(old_gtext, new_gtext, 1)

# Text cleanups after moving to six plots/potato priority.
s = s.replace("OGRÓD AI: obserwuj 4 grządki i ucz się realnego tempa wzrostu", "OGRÓD AI: obserwuj 6 grządek i ucz się realnego tempa wzrostu")
s = s.replace("<div><span>Badanie cebuli</span><b>", "<div><span>Badanie ziemniaków</span><b>")

js.write_text(s, encoding="utf-8")

# Android version.
bg = root / "app/build.gradle.kts"
if bg.exists():
    t = bg.read_text(encoding="utf-8")
    t = t.replace("versionCode = 10024", "versionCode = 10025")
    t = t.replace('versionName = "1.0.24"', 'versionName = "1.0.25"')
    bg.write_text(t, encoding="utf-8")

# README.
readme = root / "README.md"
if readme.exists():
    r = readme.read_text(encoding="utf-8")
    r = r.replace("1.0.24", "1.0.25", 1)
    r = r.replace("8.8.31", "8.8.32", 1)
    if "## v1.0.25 / userscript 8.8.32" not in r:
        r += """

## v1.0.25 / userscript 8.8.32
- Widoczny przełącznik MenelMode/dzielnice ON/OFF na głównym ekranie.
- OFF blokuje nowe MenelMode i nowe przejazdy po dzielnicach, ale nie zatrzymuje pozostałych modułów Pomagiera.
- Naprawiony mylący status Ogród NIEDOSTĘPNY przy aktywnych grządkach.
- Status i opisy ogrodu uwzględniają 6 grządek oraz Młode ziemniaki.
"""
    readme.write_text(r, encoding="utf-8")

print("v1.0.25 patch applied")
