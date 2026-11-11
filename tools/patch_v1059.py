from pathlib import Path
import re,sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
js=root/'app/src/main/assets/pomagier.user.js'
if not js.exists():raise SystemExit('Brak pelnego projektu Android')
s=js.read_text(encoding='utf-8')
if '// @version      8.8.65' not in s or "const ANDROID_VERSION = '1.0.58';" not in s:
    raise SystemExit('Oczekiwano pelnego 1.0.58 / JS 8.8.65')
s=s.replace('// @version      8.8.65','// @version      8.8.66',1)
s=s.replace("const VERSION = '8.8.65';","const VERSION = '8.8.66';",1)
s=s.replace("const ANDROID_VERSION = '1.0.58';","const ANDROID_VERSION = '1.0.59';",1)
anchor="  const VERSION = '8.8.66';"
note="""  // v8.8.66 PVP ENGINE v3 — REPLAY EVIDENCE / FINITE 15T:
  // - nie podstawia wlasnego ATK i DEF jako statystyk przeciwnika,
  // - estymacja 5 scenariuszy przeciwnika z replayow, jawnie oznacza brak obserwacji,
  // - modeluje max 15 rund, smierc i timeout z absolutnym HP,
  // - uwzglednia aktualne limity, bleed, healing, double, crit, execute, sustain,
  // - zachowuje alternatywy Sila 30+ i Sila 40+,
  // - zaden build nie jest automatycznie wdrazany ani resetowany.
"""
if anchor not in s:raise SystemExit('Brak kotwicy wersji')
s=s.replace(anchor,note+anchor,1)

def replace_span(source,start,stop,new):
    a=source.find(start);b=source.find(stop,a+len(start))
    if a<0 or b<0 or b<=a:raise SystemExit('Brak bloku '+start+' -> '+stop)
    return source[:a]+new+'\n'+source[b:]

# Detailed replay does not include attack or defense of opponents. Never use our own stats as observed enemy data.
old="attack:wmed('attack',Number(pvpLab.current?.summary?.combatStats?.attack||700)),"
new="attack:wmed('attack',null),"
if s.count(old)!=1:raise SystemExit('Nie znaleziono podstawienia enemy attack')
s=s.replace(old,new,1)
old="defense:wmed('defense',Number(pvpLab.current?.summary?.combatStats?.defense||650)),"
new="defense:wmed('defense',null),"
if s.count(old)!=1:raise SystemExit('Nie znaleziono podstawienia enemy defense')
s=s.replace(old,new,1)
old='      opponentModelN:modelRows.length,'
new="""      opponentModelN:modelRows.length,
      combatEvidence:{observedAttackN:fieldItems('attack').length,observedDefenseN:fieldItems('defense').length},"""
if s.count(old)!=1:raise SystemExit('Brak opponentModelN')
s=s.replace(old,new,1)
# Correct the misleading name: current comparable fights cannot equal ALL fights when build matches only one.
old='currentComparableN:use.length,wins,'
new='currentComparableN:curRows.length,wins,'
if s.count(old)!=1:raise SystemExit('Brak currentComparableN')
s=s.replace(old,new,1)

s=replace_span(s,'  function pvpLabCandidateScore(', '  function pvpLabBuildCode(', "  // v8.8.66 — real PvP matchup proxy. NOT a server simulator: enemy ATK/DEF are not exposed by existing replays.\n  // Only read-only calculations, with explicit evidence and multiple opponent scenarios.\n  function pvpLabV3PrepareMeta(meta){\n    const all=pvpLab.battles.filter(b=>['prestige','normal'].includes(b?.source) && b?.eventSummary && typeof b?.won==='boolean');\n    const vals=(fn)=>all.map(fn).filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);\n    const median=(a,def)=>a.length ? (a.length%2 ? a[(a.length-1)/2] : (a[a.length/2-1]+a[a.length/2])/2) : def;\n    const incoming=vals(b=>Number(b.eventSummary?.damageTaken||0)/Number(b.eventSummary?.enemyHits||0));\n    const outgoing=vals(b=>Number(b.eventSummary?.damageDealt||0)/Number(b.eventSummary?.hits||0));\n    const enemyLs=vals(b=>Number(b.eventSummary?.enemyLifesteal||0)/Math.max(1,Number(b.eventSummary?.damageTaken||0)));\n    const enemyRegen=vals(b=>Number(b.opponentObserved?.hpRegen||0));\n    const s=pvpLab.current?.summary||{}, cs=s.combatStats||{}, c=s.combinedStats||{};\n    const bound=(x,lo,hi)=>Math.max(lo,Math.min(hi,Number(x)||0));\n    // Effective per-hit damage inversion is approximate; fights may predate the current equipment.\n    const myDefense=Number(cs.defense||0), myAttack=Number(cs.attack||0),\n          myDr=bound(Number(c.damage_taken_reduction_percent||0),0,60)/100,\n          myEvDr=bound(Number(c.evasion_percent||0)/350,0,.25),\n          myArmorPen=bound(Number(c.armor_pen_percent||0),0,50)/100;\n    const observedReceived=median(incoming,0), observedDealt=median(outgoing,0);\n    const enemyPen=.28, enemyDr=.20;\n    const hitFactor=(1000/(1000+myDefense*(1-enemyPen)))*(1-myDr)*(1-myEvDr)*(2/3);\n    const estimatedAttack=hitFactor>0 && observedReceived>0 ? observedReceived/hitFactor : 0;\n    const estDefense=observedDealt>0 && myAttack>0\n      ? (Math.max(.1,myAttack*(2/3)*(1-enemyDr)*1.10/observedDealt)-1)*1000/Math.max(.1,1-myArmorPen) : 0;\n    const directAttack=Number(meta.opponent?.attack);\n    const directDefense=Number(meta.opponent?.defense);\n    const haveAttack=Number.isFinite(directAttack) && directAttack>0 && Number(meta.combatEvidence?.observedAttackN||0)>0;\n    const haveDefense=Number.isFinite(directDefense) && directDefense>0 && Number(meta.combatEvidence?.observedDefenseN||0)>0;\n    const attack=bound(haveAttack?directAttack:estimatedAttack,400,5000)||1700;\n    const defense=bound(haveDefense?directDefense:estDefense,300,4000)||1300;\n    const hp=bound(Number(meta.medianOpponentHp||meta.opponent?.maxHp||2000),350,15000);\n    const regen=bound(median(enemyRegen,Number(meta.opponent?.regen||3)),0,300);\n    const lifesteal=bound(median(enemyLs,0.15)*100,0,30);\n    const variants=[\n      {attack:.75,defense:.80,hp:.85,weight:.12},\n      {attack:.90,defense:1.0,hp:1.00,weight:.23},\n      {attack:1.00,defense:1.0,hp:1.00,weight:.30},\n      {attack:1.18,defense:1.20,hp:1.12,weight:.25},\n      {attack:1.38,defense:1.30,hp:1.18,weight:.10}\n    ];\n    meta.combatEvidence={\n      sampledBattles:all.length,receivedPerHit:observedReceived,dealtPerHit:observedDealt,\n      observedAttackN:Number(meta.combatEvidence?.observedAttackN||0),\n      observedDefenseN:Number(meta.combatEvidence?.observedDefenseN||0),\n      currentBuildFightN:all.filter(x=>x.buildCode===pvpLabCurrentBuild()).length,\n      quality:(haveAttack&&haveDefense && all.length>=30)?'SREDNIA':'NISKA',\n      warning:'ATK/DEF przeciwnikow nie wystepuja w starych replayach. Porownanie jest ESTYMACJA, nie wyliczeniem wyniku z serwera.'\n    };\n    meta.pvpV3Scenarios=variants.map(v=>({\n      attack:attack*v.attack,defense:defense*v.defense,maxHp:hp*v.hp,weight:v.weight,\n      accuracy:Number(meta.opponent?.accuracy||125),evasion:Number(meta.opponent?.evasion||45),\n      critResist:bound(Number(meta.opponent?.critResist||45),0,50),critChance:30,critDamage:65,\n      armorPen:28,damageReduction:20,doubleStrike:30,counterAttack:25,\n      bleedChance:35,bleedResist:22,healingReduction:25,\n      lifesteal:lifesteal,regen,execute:0,stunChance:10,stunResist:20,initiative:3,\n      critResistBypass:0,critBonusReduction:0\n    }));\n    return meta;\n  }\n\n  function pvpLabV3ExpectedDuel(stats,opp){\n    const c=stats.eff||{},raw=stats.raw||{}, cond=stats.conditional||{};\n    const cap=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)||0));\n    const p=k=>cap(c[k],0,100)/100;\n    const myMax=Math.max(1,Number(stats.maxHp||1)),oppMax=Math.max(1,Number(opp.maxHp||1));\n    let myHp=myMax,oppHp=oppMax, myBleed=0,oppBleed=0;\n    const myHit=cap((Number(c.accuracy_percent||0)-Number(opp.evasion||0))/100,.05,1);\n    const oppHit=cap((Number(opp.accuracy||0)-Number(c.evasion_percent||0))/100,.05,1);\n    const myDouble=p('double_strike_percent'),oppDouble=cap(Number(opp.doubleStrike||0)/100,0,.55);\n    const myCounter=p('counter_attack_percent'),oppCounter=cap(Number(opp.counterAttack||0)/100,0,.4);\n    const myCrit=cap((Number(c.crit_chance_percent||0)-Number(opp.critResist||0)*(1-cap(Number(stats.critResistBypassPercent||0)/100,0,.25)))/100,0,.8);\n    const oppCrit=cap((Number(opp.critChance||0)-Number(c.crit_resist_percent||0))/100,0,.8);\n    const myCritBonus=1+myCrit*cap(Number(c.crit_damage_percent||0)/100,0,1.3)*(1-cap(Number(opp.critBonusReduction||0)/100,0,.25));\n    const oppCritBonus=1+oppCrit*cap(Number(opp.critDamage||0)/100,0,1.3)*(1-cap(Number(stats.critBonusReductionPercent||0)/100,0,.25));\n    const myEvasionDR=cap(Number(c.evasion_percent||0)/350,0,.25);\n    const oppEvasionDR=cap(Number(opp.evasion||0)/350,0,.25);\n    const direct=(attack,defense,pen,dr,evdr)=>Math.max(1,attack)*(1000/(1000+Math.max(0,defense)*(1-cap(pen,0,.6))))*(1-cap(dr,0,.7))*(1-cap(evdr,0,.25))*(2/3);\n    const outBleedChance=cap((Number(c.bleed_chance_percent||0)-Number(opp.bleedResist||0))/100,0,.95);\n    const inBleedChance=cap((Number(opp.bleedChance||0)-Number(c.bleed_resist_percent||0))/100,0,.95);\n    const myStun=cap(Number(c.stun_chance_percent||0)/100,0,.35)*myHit*(1-cap(Number(opp.stunResist||0)/100,0,.6));\n    const oppStun=cap(Number(opp.stunChance||0)/100,0,.35)*oppHit*(1-cap(Number(c.stun_resist_percent||0)/100,0,.6));\n    const myLifesteal=p('lifesteal_percent')*(1-cap(Number(opp.healingReduction||0)/100,0,.5));\n    const oppLifesteal=cap(Number(opp.lifesteal||0)/100,0,.3)*(1-p('healing_reduction_percent'));\n    const oppRegen=Number(opp.regen||0)*(1-p('healing_reduction_percent'));\n    const myExecute=p('execute_threshold_percent'),oppExecute=cap(Number(opp.execute||0)/100,0,.18);\n    let terminal=false,lastTurn=15;\n    for(let turn=1;turn<=15;turn++){\n      lastTurn=turn;\n      if(myHp<=0||oppHp<=0){terminal=true;break;}\n      // Bleed applies before attacks; probability is accumulated instead of inventing random results.\n      myHp-=myMax*.02*myBleed;\n      oppHp-=oppMax*.02*oppBleed;\n      if(myHp<=0||oppHp<=0){terminal=true;break;}\n      if(oppHp/oppMax<myExecute) {oppHp=0;terminal=true;break;}\n      if(myHp/myMax<oppExecute) {myHp=0;terminal=true;break;}\n      let atkF=1,lowDr=1,lowRegen=0;\n      for(const x of (cond.attackLow||[])) if(myHp/myMax*100<Number(x.threshold||0)) atkF*=1+Number(x.value||0)/100;\n      for(const x of (cond.damageReductionLow||[])) if(myHp/myMax*100<Number(x.threshold||0)) lowDr*=1-Number(x.value||0)/100;\n      for(const x of (cond.regenLow||[])) if(myHp/myMax*100<Number(x.threshold||0)) lowRegen+=Number(x.value||0);\n      const momentum=1+Math.max(0,Number(raw.attack_per_turn_percent||0))*(turn-1)/100;\n      const first=turn===1?1+Number(c.first_strike_percent||0)/100:1;\n      const mine=direct(Number(stats.attack||1)*atkF*momentum,Number(opp.defense||0),p('armor_pen_percent'),Number(opp.damageReduction||0)/100,oppEvasionDR);\n      const theirs=direct(Number(opp.attack||1),Number(stats.defense||0),Number(opp.armorPen||0)/100,p('damage_taken_reduction_percent'),myEvasionDR)*lowDr;\n      const myDamage=(mine*myHit*myCritBonus*(first+myDouble*myHit)+mine*.75*(1-oppHit)*myCounter*myCritBonus)*(1-oppStun/15);\n      const oppDamage=theirs*oppHit*oppCritBonus*(1+oppDouble*oppHit)*(1-myStun*Math.min(1,1/Math.max(1,turn)))+theirs*.75*(1-myHit)*oppCounter*oppCritBonus;\n      // Lifesteal heals after a direct hit, not bleed or execute. Cap healing at actual missing HP.\n      const oldMyHp=myHp,oldOppHp=oppHp;\n      oppHp=Math.max(0,oppHp-myDamage);\n      myHp=Math.max(0,myHp-oppDamage);\n      if(oppHp>0 && myHp>0) myHp=Math.min(myMax,myHp+Math.min(myDamage,oldOppHp)*myLifesteal);\n      if(myHp>0 && oppHp>0) oppHp=Math.min(oppMax,oppHp+Math.min(oppDamage,oldMyHp)*oppLifesteal);\n      if(myHp<=0||oppHp<=0){terminal=true;break;}\n      const outContact=cap(myHit*(1+myDouble*myHit),0,2);\n      const inContact=cap(oppHit*(1+oppDouble*oppHit)*(1-myStun/15),0,2);\n      oppBleed=1-(1-oppBleed)*Math.pow(1-outBleedChance,outContact);\n      myBleed=1-(1-myBleed)*Math.pow(1-inBleedChance,inContact);\n      // PvP regen runs only at the end of a completed round if both fighters survive.\n      myHp=Math.min(myMax,myHp+Math.min(Number(stats.roundCap||144),Number(stats.regen||0)+lowRegen)*(1-cap(Number(opp.healingReduction||0)/100,0,.5)));\n      oppHp=Math.min(oppMax,oppHp+oppRegen);\n    }\n    // For 15-turn timeout server compares remaining absolute HP (not percentages).\n    // Smooth margin to avoid ranking discontinuities from deterministic scenario thresholds.\n    const margin=myHp-oppHp;\n    if(terminal && myHp<=0 && oppHp>0) return .4*(1-cap(oppHp/oppMax,0,1));\n    if(terminal && oppHp<=0 && myHp>0) return .6+.35*cap(myHp/myMax,0,1)+.05*(15-lastTurn)/15;\n    return cap(1/(1+Math.exp(-margin/Math.max(180,.16*(myMax+oppMax)))),.02,.98);\n  }\n\n  function pvpLabCandidateScore(stats,meta,includeBreakthrough=false){\n    if(!stats) return -Infinity;\n    const cases=meta?.pvpV3Scenarios;\n    if(!Array.isArray(cases)||cases.length<5) return -Infinity;\n    // Broad 3-case screening; full 5-case evaluation for all finalists.\n    const pool=includeBreakthrough?cases:[cases[1],cases[2],cases[3]];\n    let score=0,sum=0;\n    for(const opp of pool){\n      const weight=Math.max(0,Number(opp.weight||0));\n      score+=pvpLabV3ExpectedDuel(stats,opp)*weight;\n      sum+=weight;\n    }\n    if(!sum) return -Infinity;\n    // Breakthrough impact cannot be reconstructed precisely from legacy replay aggregates.\n    // Deliberately score no unverified one-off skill value; expose its eligibility separately.\n    return score/sum*100;\n  }\n")
old='const meta=pvpLabRealPvpMeta(), currentAttrs=pvpLabCurrentAttrs(), external=pvpLabExternalVector();'
new='const meta=pvpLabV3PrepareMeta(pvpLabRealPvpMeta()), currentAttrs=pvpLabCurrentAttrs(), external=pvpLabExternalVector();'
if s.count(old)!=1:raise SystemExit('Brak bootstrap nowego meta')
s=s.replace(old,new,1)

old="""      const pre=pvpLabPrecomputedSkillPlans(meta), top=[];
      const pushTop=x=>{
        if(!x || !Number.isFinite(x.score)) return;
        top.push(x); top.sort((a,b)=>b.score-a.score); if(top.length>80) top.length=80;
      };"""
new="""      const pre=pvpLabPrecomputedSkillPlans(meta), top=[], strengthBands=Array.from({length:5},()=>[]),balanced=[];
      const pushTop=x=>{
        if(!x || !Number.isFinite(x.score)) return;
        top.push(x); top.sort((a,b)=>b.score-a.score); if(top.length>70) top.length=70;
        // Do not lose promising STR 30-50 candidates if the TOP list favors passive HP builds.
        const band=Math.min(4,Math.floor(Number(x.attrs.str||0)/10));
        const xs=strengthBands[band]; xs.push(x); xs.sort((a,b)=>b.score-a.score); if(xs.length>12) xs.length=12;
        if(x.attrs.str>=30 && x.attrs.end>=20 && x.attrs.vit>=20){balanced.push(x);balanced.sort((a,b)=>b.score-a.score);if(balanced.length>20) balanced.length=20;}
      };"""
if s.count(old)!=1:raise SystemExit('Brak seed ranking')
s=s.replace(old,new,1)
old="""      const refine=(cand)=>{
        let best={...cand,score:pvpLabCandidateScore(cand.stats,meta,true)};"""
new="""      const refine=(cand,minStrength=0,minEndurance=0)=>{
        let best={...cand,score:pvpLabCandidateScore(cand.stats,meta,true)};"""
if s.count(old)!=1:raise SystemExit('Brak refine')
s=s.replace(old,new,1)
old="""if(from===to||best.attrs[from]<=0||best.attrs[to]>=50) continue;"""
new="""if(from===to||best.attrs[from]<=0||best.attrs[to]>=50||(from==='str' && best.attrs.str<=minStrength)||(from==='end' && best.attrs.end<=minEndurance)) continue;"""
if s.count(old)<1:raise SystemExit('Brak guard refine')
s=s.replace(old,new,1)
old="""      const refinedRaw=top.slice(0,30).map(refine).sort((a,b)=>b.score-a.score);"""
new="""      const seedGroups=[
        ...top.slice(0,22).map(c=>({c,minStrength:0})),
        ...strengthBands[3].slice(0,5).map(c=>({c,minStrength:30})),
        ...strengthBands[4].slice(0,5).map(c=>({c,minStrength:40})),
        ...strengthBands[2].slice(0,3).map(c=>({c,minStrength:20})),
        ...balanced.slice(0,8).map(c=>({c,minStrength:30,minEndurance:20})),
      ];
      const refinedRaw=seedGroups.map(x=>refine(x.c,x.minStrength,x.minEndurance||0)).sort((a,b)=>b.score-a.score);"""
if s.count(old)!=1:raise SystemExit('Brak refinedRaw')
s=s.replace(old,new,1)
old="""relativeIndex:x.score/Math.max(1e-9,curScore)*100,"""
new="""relativeIndex:100+x.score-curScore,"""
if s.count(old)!=1:raise SystemExit('Brak relativeIndex')
s=s.replace(old,new,1)
old="""        method:'PVP_ENGINE_V2_V6_MECHANICS_REALPVP_V1',"""
new="""        method:'PVP_ENGINE_V3_V6_EVIDENCE_15T_PROXY_V1',
        modelConfidence:meta.combatEvidence?.quality||'NISKA',
        modelWarning:meta.combatEvidence?.warning||'',
        scoreMeaning:'punktacja scenariuszy /100, nie realny win rate; bez potwierdzonych ATK/DEF przeciwnikow',
        currentModelScore:curScore,"""
if s.count(old)!=1:raise SystemExit('Brak method')
s=s.replace(old,new,1)
# Abort optimisation if legacy replay data has no observations on direct damage.
evidence_anchor='      const totalPoints=pvpLabMaxAttributePoints();'
evidence_guard="""      if(meta.combatEvidence?.sampledBattles<8 || !(Number(meta.combatEvidence?.receivedPerHit||0)>0) || !(Number(meta.combatEvidence?.dealtPerHit||0)>0)){
        pvpLab.optimizer={status:'ZA MALO SZCZEGOLÓW WALK DO WERYFIKACJI (min. 8 replayow z obrazeniami)',at:Date.now(),meta};
        pvpLabSave();return pvpLab.optimizer;
      }

"""
if s.count(evidence_anchor)!=1:raise SystemExit('Brak totalPoints do guardu')
s=s.replace(evidence_anchor,evidence_guard+evidence_anchor,1)
old="""        best:ranked[0]||null,top:ranked,"""
new="""        best:ranked[0]||null,top:ranked,
        alternatives:[{name:'ATAK / STR 40+',minStrength:40,minEndurance:0},{name:'BALANS / STR 30+ END 20+',minStrength:30,minEndurance:20}].map(limit=>{
          const {minStrength,minEndurance}=limit;
          const x=refined.find(c=>c.attrs.str>=minStrength && c.attrs.end>=minEndurance);
          return x?{name:limit.name,minStrength,minEndurance,build:pvpLabBuildCode(x.attrs,x.plan),score:x.score,
            combat:{attack:Math.round(x.stats.attack),defense:Math.round(x.stats.defense),maxHp:Math.round(x.stats.maxHp)}}:null;
        }).filter(Boolean),"""
if s.count(old)!=1:raise SystemExit('Brak best top')
s=s.replace(old,new,1)
old="""searchNote:`V6 live mechanics • ${totalPoints} pkt • dynamic capy 41-50 • low-HP/bleed/stun/execute/lifesteal • Przelamania max ${Number(pvpLabBreakthroughData()?.maxSlots??3)} • PRESTIZ i zwykle PvP 1:1 • Arena=0`"""
new="""searchNote:`V3 proxy na replayach • ${totalPoints} pkt • 5 scenariuszy • do 15T • timeout absolutne HP • brak prawdziwych enemy ATK/DEF => niepewność`"""
if s.count(old)!=1:raise SystemExit('Brak searchNote')
s=s.replace(old,new,1)

# UI must never present an approximate recommendation as a proven win-rate gain.
old="""indeks ${Number(opt.best.relativeIndex||0).toFixed(1)} vs obecny 100 • prognoza ATK"""
new="""ocena scenariuszy ${Number(opt.best.metaScore||0).toFixed(1)}/100 (obecnie ${Number(opt.currentModelScore||0).toFixed(1)}/100) • szacowane ATK"""
if s.count(old)!=1:raise SystemExit('Brak UI best')
s=s.replace(old,new,1)
old="""<div class="sub">CEL: REALNE PvP 1:1"""
new="""<div class="note"><b>MODEL v3 • pewność ${esc(opt.modelConfidence||'NISKA')}.</b> ${esc(opt.modelWarning||'')}
         <div class="sub">Ranking to estymacja — nie udowodniony procent wygranych. Aktualny build: ${Number(opt.current?.realFightN||0)} rozegranych walk. Nie resetuj punktow bez sprawdzenia w realnym PvP.</div>
         <div class="sub"><b>Alternatywy z Siłą:</b> ${(opt.alternatives||[]).map(a=>`${esc(a.name||'Sila')} • ${esc(a.build)} • wynik ${Number(a.score||0).toFixed(1)}/100 • ATK ${a.combat.attack} / DEF ${a.combat.defense} / HP ${a.combat.maxHp}`).join('<div></div>')||'brak'}</div></div>
         <div class="sub">CEL: REALNE PvP 1:1"""
if s.count(old)!=1:raise SystemExit('Brak UI evidence anchor')
s=s.replace(old,new,1)
old="""<div class="section-title">🧠 BEST BUILD — MODEL V6 NA DANYCH REAL PvP</div>"""
new="""<div class="section-title">🧠 BUILD DO TESTU — MODEL V3 / 15 RUND (ESTYMACJA)</div>"""
if s.count(old)!=1:raise SystemExit('Brak UI title')
s=s.replace(old,new,1)

required=[
    '// @version      8.8.66',"const ANDROID_VERSION = '1.0.59';",
    'function pvpLabV3PrepareMeta(', 'function pvpLabV3ExpectedDuel(',
    "method:'PVP_ENGINE_V3_V6_EVIDENCE_15T_PROXY_V1'",
    "attack:wmed('attack',null)", "defense:wmed('defense',null)",
    'strengthBands', 'currentModelScore:curScore', 'modelWarning:', 'minEndurance:20',
    'MODEL V3 / 15 RUND',
]
for needle in required:
    if needle not in s:raise SystemExit('Brak '+needle)
if "attack:wmed('attack',Number(pvpLab.current" in s:raise SystemExit('Stary fallback ATK pozostal')
if "defense:wmed('defense',Number(pvpLab.current" in s:raise SystemExit('Stary fallback DEF pozostal')
js.write_text(s,encoding='utf-8')

build=root/'app/build.gradle.kts'
g=build.read_text(encoding='utf-8')
if 'versionCode = 10058' not in g or 'versionName = "1.0.58"' not in g:raise SystemExit('Nieprawidlowa wersja Gradle')
g=g.replace('versionCode = 10058','versionCode = 10059',1).replace('versionName = "1.0.58"','versionName = "1.0.59"',1)
build.write_text(g,encoding='utf-8')
readme=root/'README.md'
if readme.exists():
    r=readme.read_text(encoding='utf-8')+"""

## v1.0.59 / userscript 8.8.66 - PvP v3: evidence-aware 15-round scenario proxy
- Naprawiono falszywe podstawianie statystyk naszej postaci jako nieznanych statystyk przeciwnika.
- Dla nieznanego ATK/DEF stosuje 5 zakresow niepewnosci wywiedzionych z zagregowanych replayow.
- Wyniki sa punktacja scenariuszy 0-100, a NIE prognoza procentu wygranych.
- Modelowany terminator 15 rund i absolutna liczba HP; eskalacja, leczenie, limity i przebicia.
- Alternatywy Sila 30+ i 40+ sa zawsze testowane osobno, a nie gubione po pierwszym rankingu.
- Brak automatycznego resetu/zakupu/zmiany buildu.
"""
    readme.write_text(r,encoding='utf-8')
print('OK v1.0.59 PvP evidence-aware build')