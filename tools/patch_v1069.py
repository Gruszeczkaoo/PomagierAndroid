"""Pomagier 1.0.69: confirmed prestige opponent first, otherwise lowest level on the current list."""
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
p=root/'app/src/main/assets/pomagier.user.js'
s=p.read_text(encoding='utf-8')
def change(a,b,label):
    global s
    n=s.count(a)
    if n!=1: raise SystemExit(f'{label}: expected one anchor, found {n}')
    s=s.replace(a,b,1)
change('// @version      8.8.75','// @version      8.8.76','metadata')
change("const VERSION = '8.8.75';","const VERSION = '8.8.76';",'script version')
change("const ANDROID_VERSION = '1.0.68';","const ANDROID_VERSION = '1.0.69';",'Android version')
change('  function prestigeAutoBusyElsewhere(){', '''  // Verified target has priority; only then fall back to the smallest reported level.
  // Never guess missing levels or choose outside the fresh roll list.
  function prestigeAutoChoose(candidates){
    const rows=Array.isArray(candidates)?candidates:[];
    const verified=rows.find(x=>x?.history?.eligible && Number(x.expectedGain)>0);
    if(verified)return {choice:verified,rule:'history'};
    const ranked=rows.filter(x=>Number.isInteger(Number(x?.level))&&Number(x.level)>0&&
      Number.isSafeInteger(Number(x?.id))&&Number(x.id)>0)
      .slice().sort((a,b)=>Number(a.level)-Number(b.level)||Number(a.id)-Number(b.id));
    return ranked.length?{choice:ranked[0],rule:'lowest_level'}:{choice:null,rule:'none'};
  }
  function prestigeAutoBusyElsewhere(){''','selection helper')
change("    if(!confirm('Wlaczyc automatyczne ATAKI O PRESTIZ? Pomagier wykona prawdziwe pojedynki w grze tylko gdy historia z aktualnym buildem: min. 4 wygrane, 0 porazek, dolny limit Wilsona >=50%. Pojedyncza porazka wylaczy automat. Brak pewnego celu = brak ataku.'))return;",
       "    if(!confirm('Wlaczyc PRESTIZ AUTO? Najpierw atakuje rywala z co najmniej 4 zwyciestwami bez porazki. Gdy nie ma takiego na aktualnej liscie, wybiera NAJNIZSZY LVL. Niski poziom NIE gwarantuje wygranej; po porazce AUTO sie zatrzyma.'))return;",'consent wording')
change("    prestigeAuto.status='AUTO WLACZONE • czekam na bezpiecznych przeciwnikow';",
       "    prestigeAuto.status='AUTO WLACZONE • 4 wygrane lub najnizszy LVL';",'start status')
change('''      const candidates=prestigeAutoCandidates();
      const choice=candidates.find(x=>x.history.eligible && Number(x.expectedGain)>0);
      if(!choice){
        prestigeAuto.status=candidates.length?'BRAK PEWNIAKA — zadnego ataku':(prestigeAuto.rollMethod==='POST'&&!prestigeAuto.allowAutoRoll?'AUTO LOSOWANIE POST WYLACZONE — wlacz osobno':'BRAK SWIEZEJ LISTY CELOW');
        return;
      }''','''      const candidates=prestigeAutoCandidates();
      const selection=prestigeAutoChoose(candidates);
      const choice=selection.choice;
      if(!choice){
        prestigeAuto.status=candidates.length?'BRAK PRZECIWNIKA ZE ZNANYM LVL — bez ataku':
          (prestigeAuto.rollMethod==='POST'&&!prestigeAuto.allowAutoRoll?'AUTO LOSOWANIE POST WYLACZONE — wlacz osobno':'BRAK SWIEZEJ LISTY CELOW');
        return;
      }''','cycle selection')
change("      prestigeAuto.actions.push({at:prestigeAuto.lastAttackAt,targetId:choice.id,origin:'auto',status:'wyslano'});",
       "      prestigeAuto.actions.push({at:prestigeAuto.lastAttackAt,targetId:choice.id,origin:'auto',status:'wyslano',selectionRule:selection.rule,targetLevel:Number(choice.level)||null});",'audit trail')
change("      prestigeAuto.status='ATAKUJE ID '+choice.id+' • po '+choice.history.wins+' zwyciestwach';",
       "      prestigeAuto.status='ATAKUJE ID '+choice.id+(selection.rule==='history'?' • potwierdzone zwyciestwa':' • MIN LVL '+choice.level+' (ryzyko)');",'attack status')
change("h.total>0&&h.n===0?'INNY BUILD':'POMIN'","h.total>0&&h.n===0?'INNY BUILD':'WG LVL'",'UI candidate label')
start=s.find('        <div class="note">AUTO wybiera wyłącznie cele z aktualnej listy losowania,')
if start<0:raise SystemExit('UI note: missing')
end=s.find('</div>',start)
if end<0:raise SystemExit('UI note: not closed')
s=s[:start]+'''        <div class="note">AUTO najpierw wybiera cele z min. 4 wygranymi bez porazki przy tym samym buildzie i dodatnia nagroda. Gdy brak takiego celu, <b>atakuje najnizszy LVL z aktualnej listy</b> (ryzyko porazki). Gdy nie ma swiezej listy lub znanego LVL, NIE atakuje. Zostaja kontrola punktow walki, 30-minutowy odstep, limit 12 autoatakow i stop po porazce.</div>'''+s[end+6:]
p.write_text(s,encoding='utf-8')
g=root/'app/build.gradle.kts'
z=g.read_text(encoding='utf-8')
if z.count('versionCode = 10068')!=1 or z.count('versionName = "1.0.68"')!=1:raise SystemExit('requires Android v1.0.68')
g.write_text(z.replace('versionCode = 10068','versionCode = 10069',1).replace('versionName = "1.0.68"','versionName = "1.0.69"',1),encoding='utf-8')
print('OK v1.0.69 / 8.8.76')
