from pathlib import Path
import sys

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
s=js.read_text(encoding="utf-8")

s=s.replace("// @version      8.8.39","// @version      8.8.40",1)
s=s.replace("const VERSION = '8.8.39';","const VERSION = '8.8.40';",1)
s=s.replace("const ANDROID_VERSION = '1.0.32';","const ANDROID_VERSION = '1.0.33';",1)

anchor="  // v8.8.39"
note="""  // v8.8.40 PVP — CAPY MODELU PRZECIWNIKA:
  // - statystyki przeciwnika w optimizerze są ograniczane do tych samych capów co gracz,
  // - naprawia zawyżony model odporności na kryta (np. 57.6% -> efektywne 50%),
  // - obejmuje unik, celność, kryt, CR, pancerz, redukcję, stun, bleed resist, heal reduction, double, counter i lifesteal,
  // - optimizer zapisuje opponentRaw oraz opponentEffective, żeby było widać co zostało przycięte.
"""
if note not in s:
    p=s.find(anchor)
    if p>=0: s=s[:p]+note+s[p:]

old="""  function pvpLabCandidateScore(stats,meta){
    if(!stats) return -Infinity; const c=stats.eff, o=meta.opponent||{}, turns=pvpLabClamp(meta.medianTurns||12,6,15);
"""
new="""  function pvpLabOpponentEffective(meta){
    const r=meta?.opponent||{};
    return {
      ...r,
      evasion:pvpLabClamp(Number(r.evasion||0),0,55),
      accuracy:pvpLabClamp(Number(r.accuracy||0),0,140),
      critResist:pvpLabClamp(Number(r.critResist||0),0,50),
      critChance:pvpLabClamp(Number(r.critChance||0),0,65),
      bleedResist:pvpLabClamp(Number(r.bleedResist||0),0,60),
      stunResist:pvpLabClamp(Number(r.stunResist||0),0,60),
      stunChance:pvpLabClamp(Number(r.stunChance||0),0,35),
      healingReduction:pvpLabClamp(Number(r.healingReduction||0),0,50),
      armorPen:pvpLabClamp(Number(r.armorPen||0),0,50),
      damageReduction:pvpLabClamp(Number(r.damageReduction||0),0,60),
      counterAttack:pvpLabClamp(Number(r.counterAttack||0),0,40),
      doubleStrike:pvpLabClamp(Number(r.doubleStrike||0),0,40),
      lifesteal:pvpLabClamp(Number(r.lifesteal||0),0,30),
      critDamage:pvpLabClamp(Number(r.critDamage||0),0,130),
      execute:pvpLabClamp(Number(r.execute||0),0,18)
    };
  }
  function pvpLabCandidateScore(stats,meta){
    if(!stats) return -Infinity; const c=stats.eff, o=pvpLabOpponentEffective(meta), turns=pvpLabClamp(meta.medianTurns||12,6,15);
"""
if old not in s: raise SystemExit("Nie znaleziono pvpLabCandidateScore start")
s=s.replace(old,new,1)

old2="method:\'REAL_PVP_EQUAL_1TO1_COUNTERFACTUAL_V4_DYNAMIC_POINTS\',totalAttributePoints,realPvpObjective:true,sourceWeights:"
new2="method:\'REAL_PVP_EQUAL_1TO1_COUNTERFACTUAL_V4_DYNAMIC_POINTS\',totalAttributePoints,realPvpObjective:true,opponentRaw:{...(meta.opponent||{})},opponentEffective:pvpLabOpponentEffective(meta),sourceWeights:"
if old2 not in s: raise SystemExit("Nie znaleziono miejsca opponent diagnostics")
s=s.replace(old2,new2,1)

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
t=t.replace("versionCode = 10032","versionCode = 10033")
t=t.replace('versionName = "1.0.32"','versionName = "1.0.33"')
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.33 / userscript 8.8.40" not in r:
        r += """

## v1.0.33 / userscript 8.8.40
- PvP optimizer przycina model przeciwnika do prawdziwych capów statystyk.
- Naprawa: CR przeciwnika >50% nie zaniża już sztucznie wartości krytyka.
- Eksport zawiera opponentRaw i opponentEffective.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.33 patch applied")
