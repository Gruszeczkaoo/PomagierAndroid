from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak userscriptu")
s=js.read_text(encoding="utf-8")

if "// @version      8.8.63" not in s:
    raise SystemExit("Oczekiwano JS 8.8.63")
s=s.replace("// @version      8.8.63","// @version      8.8.64",1)
s=s.replace("const VERSION = '8.8.63';","const VERSION = '8.8.64';",1)
s=s.replace("const ANDROID_VERSION = '1.0.56';","const ANDROID_VERSION = '1.0.57';",1)

note="""  // v8.8.64 RAID EXECUTE ENDPOINT FIX:
  // - naprawia AUTO START po uplywie timera: gra uruchamia napad przez POST /raid/execute, nie /raid/start,
  // - body pozostaje {planId}, identycznie jak w oryginalnym przycisku „Rozpocznij napad!”,
  // - odpowiedz bledu czytamy zarowno z error jak i message,
  // - po udanym POST nadal wymagamy potwierdzenia active-raid -> in_progress/running/active,
  // - build przerywa sie, jezeli w funkcji START pozostanie stary endpoint /raid/start.
"""
anchor="  // v8.8.63"
p=s.find(anchor)
if p>=0 and note not in s:
    s=s[:p]+note+s[p:]

old="""    const r=await apiActive(`/api/gangs/${settings.characterId}/raid/start`,{method:'POST',body:{planId}});
    raidAuto.lastStartResponse=String(r?.message??r?.status??r?.success??'').slice(0,280);
    raidAutoSave();
    if(r?.success===false) throw new Error(String(r?.message||`Nie udało się wystartować napadu #${planId}`));
"""
new="""    // Oryginalna gra (przycisk „Rozpocznij napad!”) używa /raid/execute.
    const r=await apiActive(`/api/gangs/${settings.characterId}/raid/execute`,{method:'POST',body:{planId}});
    raidAuto.lastStartResponse=String(r?.message??r?.error??r?.status??r?.success??'').slice(0,280);
    raidAutoSave();
    if(r?.success===false) throw new Error(String(r?.error||r?.message||`Nie udało się wystartować napadu #${planId}`));
"""
if old not in s:
    # fallback for slightly older function shape
    old2="""    const r=await apiActive(`/api/gangs/${settings.characterId}/raid/start`,{method:'POST',body:{planId}});
    if(!r?.success) throw new Error(String(r?.message||`Nie udało się wystartować napadu #${planId}`));
"""
    new2="""    // Oryginalna gra (przycisk „Rozpocznij napad!”) używa /raid/execute.
    const r=await apiActive(`/api/gangs/${settings.characterId}/raid/execute`,{method:'POST',body:{planId}});
    raidAuto.lastStartResponse=String(r?.message??r?.error??r?.status??r?.success??'').slice(0,280);
    raidAutoSave();
    if(r?.success===false) throw new Error(String(r?.error||r?.message||`Nie udało się wystartować napadu #${planId}`));
"""
    if old2 not in s:
        raise SystemExit("Nie znaleziono starego endpointu START napadu")
    s=s.replace(old2,new2,1)
else:
    s=s.replace(old,new,1)

# Twarde testy regresji: sprawdzamy cala funkcje START, a nie tylko globalny tekst.
a=s.find("  async function raidAutoStartPlan(plan")
b=s.find("  async function raidAutoPlanNext()",a)
if a<0 or b<0:
    raise SystemExit("Brak funkcji raidAutoStartPlan")
chunk=s[a:b]

if "/raid/start" in chunk:
    raise SystemExit("REGRESJA: raidAutoStartPlan nadal zawiera /raid/start")
if "/raid/execute" not in chunk:
    raise SystemExit("REGRESJA: brak /raid/execute")
if "body:{planId}" not in chunk:
    raise SystemExit("REGRESJA: brak body {planId}")
if "raidAutoVerifyStarted" not in chunk:
    raise SystemExit("REGRESJA: brak potwierdzenia START po POST")

checks=[
    "// @version      8.8.64",
    "const ANDROID_VERSION = '1.0.57';",
    "/raid/execute",
    "r?.error||r?.message",
]
for x in checks:
    if x not in s:
        raise SystemExit("v1.0.57 NIEKOMPLETNA: "+x)

# Stary endpoint nie moze zostac w wykonawczej sciezce automatu.
print("OK: raid AUTO START endpoint = POST /api/gangs/{id}/raid/execute")
print("OK: request body = {planId}")
print("OK: /raid/start absent from raidAutoStartPlan")
print("OK: active-raid verification preserved")

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
if "versionCode = 10056" not in t or 'versionName = "1.0.56"' not in t:
    raise SystemExit("Oczekiwano Android 1.0.56")
t=t.replace("versionCode = 10056","versionCode = 10057",1)
t=t.replace('versionName = "1.0.56"','versionName = "1.0.57"',1)
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.57 / userscript 8.8.64" not in r:
        r += """

## v1.0.57 / userscript 8.8.64 - Raid execute endpoint fix
- AUTO START napadu używa teraz dokładnie endpointu gry: POST /api/gangs/{id}/raid/execute.
- Body: {planId}, zgodne z ręcznym przyciskiem „Rozpocznij napad!”.
- Usunięto błędny endpoint /raid/start zwracający HTTP 404.
- Zachowano watchdog deadline i weryfikację active-raid po START.
- Build blokuje wydanie, jeśli stary endpoint wróci do raidAutoStartPlan.
"""
        readme.write_text(r,encoding="utf-8")

print("v1.0.57 applied")
