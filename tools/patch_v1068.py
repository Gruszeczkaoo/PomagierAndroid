"""Pomagier 1.0.68 / 8.8.75: 5-minute prestige points watcher + explicitly opted-in POST opponent rolls.

Apply after v1067. Does NOT attempt any live game requests while patching.
"""
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
p=root/'app/src/main/assets/pomagier.user.js'
s=p.read_text(encoding='utf8')
def one(old,new,label):
 global s
 n=s.count(old)
 if n!=1:raise SystemExit(f'v1068 {label}: expected 1, got {n}')
 s=s.replace(old,new,1)

one('// @version      8.8.74','// @version      8.8.75','metadata')
one("const VERSION = '8.8.74';","const VERSION = '8.8.75';",'version')
one("const ANDROID_VERSION = '1.0.67';","const ANDROID_VERSION = '1.0.68';",'android')
one('''  prestigeAuto.maxDaily=8;
  prestigeAuto.cooldownMs=30*60*1000;''','''  prestigeAuto.maxDaily=12; // limit asekuracyjny, rzeczywiste punkty okresla serwer
  prestigeAuto.checkMinutes=Math.max(3,Math.min(30,Number(prestigeAuto.checkMinutes||5)));
  prestigeAuto.allowAutoRoll=prestigeAuto.allowAutoRoll===true;
  prestigeAuto.rollCalibration=prestigeAuto.rollCalibration&&typeof prestigeAuto.rollCalibration==='object'?prestigeAuto.rollCalibration:null;
  prestigeAuto.lastAutoRollAt=Number(prestigeAuto.lastAutoRollAt||0);
  prestigeAuto.rollsToday=Array.isArray(prestigeAuto.rollsToday)?prestigeAuto.rollsToday.slice(-30):[];
  prestigeAuto.lastStatus=prestigeAuto.lastStatus&&typeof prestigeAuto.lastStatus==='object'?prestigeAuto.lastStatus:null;
  prestigeAuto.cooldownMs=30*60*1000;''','init')
one("      prestigeAuto.rollMethod='';\n      prestigeAuto.actions=[];", "      prestigeAuto.rollMethod='';\n      prestigeAuto.allowAutoRoll=false;prestigeAuto.rollCalibration=null;prestigeAuto.lastStatus=null;\n      prestigeAuto.actions=[];",'account switch')

# Capture only harmless, manually observed schemas of the game's actual roll request.
one("""      if(['GET','POST'].includes(m)) prestigeAuto.rollMethod=m;
      const arr=Array.isArray(data.opponents)?data.opponents:[];""","""      if(['GET','POST'].includes(m)) prestigeAuto.rollMethod=m;
      if(m==='POST'&&!meta.autoplay){
        const raw=meta.requestBody;
        const body=raw==null||raw===''?null:pvpLabParseRequestBody(raw);
        const allowed=body==null || (body&&typeof body==='object'&&!Array.isArray(body)&&
          Object.keys(body).length<=3 && Object.keys(body).every(k=>['mode','type','duelType','fightMode'].includes(k)&&
            ['string','number','boolean'].includes(typeof body[k])&&String(body[k]).length<=36));
        // Nie kopiujemy zadnych parametrow oplat/walut ani tokenow.
        prestigeAuto.rollCalibration=allowed?{method:'POST',body:body||null,ownId:pvpLabOwnId(),at:Date.now()}:null;
      }
      const arr=Array.isArray(data.opponents)?data.opponents:[];""",'roll schema')

# Require evidence of unused points or explicit permission from server; do not assume based on HTTP 200.
start=s.index('  function prestigeAutoServerReady(d){')
end=s.index('\n  function prestigeAutoStop(status){',start)
s=s[:start]+'''  function prestigeAutoPoints(d){
    if(!d || d.success===false) return {remaining:null,ready:false,keys:[]};
    const scopes=[d?.duels,d?.status,d?.data,d].filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
    const fields=['remainingAttacks','attacksRemaining','duelsRemaining','availableAttacks',
      'dailyAttacksRemaining','remainingFightPoints','fightPoints','combatPoints','duelPoints',
      'pointsRemaining','remainingPoints','fightPointsRemaining','availablePoints',
      'remainingDuels','remainingToday','attacksLeft','duelsLeft'];
    let remaining=null,ready=null,field='';
    for(const scope of scopes){
      for(const k of fields){
        if(remaining!=null || !Object.prototype.hasOwnProperty.call(scope,k))continue;
        const v=scope[k];
        if((typeof v==='number' || typeof v==='string')&&String(v).trim()!=='' && Number.isFinite(Number(v))&&Number(v)>=0){
          remaining=Number(v);field=k;
        }
      }
      for(const k of ['canAttack','canFight','attackAvailable','canDuel']){
        if(scope[k]===false)ready=false;
        else if(ready===null&&scope[k]===true)ready=true;
      }
      for(const k of ['cooldownRemaining','remainingCooldown','attackCooldownRemaining']){
        if(Number.isFinite(Number(scope[k]))&&Number(scope[k])>0)ready=false;
      }
      for(const k of ['nextAttackAt','cooldownEndsAt']){
        const t=typeof scope[k]==='number'?Number(scope[k]):Date.parse(String(scope[k]||''));
        if(Number.isFinite(t)&&(t<1e11?t*1000:t)>Date.now())ready=false;
      }
    }
    const keys=[...new Set(scopes.flatMap(x=>Object.keys(x)))].slice(0,75);
    if(remaining===0)ready=false;
    // Jesli serwer nie poda ani stanu punktow, ani canAttack=true, nie wysylamy POST.
    if(remaining===null&&ready!==true)ready=false;
    return {remaining,field,ready:ready!==false,keys};
  }
  function prestigeAutoStatusCheck(data){
    const pts=prestigeAutoPoints(data);
    prestigeAuto.lastStatus={at:Date.now(),remaining:pts.remaining,field:pts.field||'',
      ready:pts.ready,keys:pts.keys};
    prestigeAutoSave();
    return pts;
  }
  function prestigeAutoServerReady(d){return prestigeAutoStatusCheck(d).ready;}
  function prestigeAutoRollsDay(){
    const day=new Date().toDateString();
    return prestigeAuto.rollsToday.filter(t=>new Date(Number(t)).toDateString()===day).length;
  }
  function prestigeAutoToggleRoll(){
    if(prestigeAuto.allowAutoRoll){prestigeAuto.allowAutoRoll=false;prestigeAuto.status='AUTO LOSOWANIE WYLACZONE';}
    else if(!prestigeAuto.rollCalibration || prestigeAuto.rollCalibration.ownId!==pvpLabOwnId()){
      prestigeAuto.status='ZROB RECZNIE JEDNO LOSOWANIE PRZECIWNIKOW';
    }else if(confirm('Zezwolic na automatyczne LOSOWANIE przeciwnikow przez POST? Nie znamy kosztu tej operacji. Pomagier zrobi najwyzej 12 losowan dziennie, maksymalnie co 30 minut; zatrzyma sie przy bledzie lub podejrzeniu wydania punktu walki.')){
      prestigeAuto.allowAutoRoll=true;prestigeAuto.status='LOSOWANIE AUTO DOZWOLONE';
    }
    prestigeAutoSave();render();
  }
  async function prestigeAutoMaybeRoll(cid,before){
    if(prestigeAuto.rollMethod==='GET'){
      const data=await apiActive(`/api/duels/${cid}/roll-opponents`);
      prestigeAutoObserve('duel_roll',data,{method:'GET',autoplay:true});return;
    }
    if(prestigeAuto.rollMethod!=='POST')return;
    if(!prestigeAuto.allowAutoRoll || !prestigeAuto.rollCalibration||prestigeAuto.rollCalibration.ownId!==cid)return;
    if(Date.now()-prestigeAuto.lastAutoRollAt<30*60000 || prestigeAutoRollsDay()>=12)return;
    // Zapisywanie PRZED POST zapobiega przypadkowemu ponowieniu po ubiciu aplikacji.
    prestigeAuto.lastAutoRollAt=Date.now();prestigeAuto.rollsToday.push(prestigeAuto.lastAutoRollAt);
    prestigeAutoSave();
    const roll=await apiActive(`/api/duels/${cid}/roll-opponents`,{method:'POST',body:prestigeAuto.rollCalibration.body});
    if(!roll || roll.success===false || !Array.isArray(roll.opponents)){
      prestigeAuto.enabled=false;prestigeAuto.allowAutoRoll=false;
      prestigeAuto.status='STOP: NIEROZPOZNANA ODPOWIEDZ LOSOWANIA';return;
    }
    prestigeAutoObserve('duel_roll',roll,{method:'POST',autoplay:true});
    const status=await apiActive(`/api/duels/${cid}/status`);
    const after=prestigeAutoStatusCheck(status);
    if(before.remaining!=null && after.remaining!=null && after.remaining<before.remaining){
      prestigeAuto.enabled=false;prestigeAuto.allowAutoRoll=false;
      prestigeAuto.status='STOP: LOSOWANIE ZUZYLO PUNKTY WALKI';
    }
  }
''' + s[end:]

one('''    if(!manual && now-prestigeAuto.lastCheckAt<60000)return;''','''    if(!manual && now-prestigeAuto.lastCheckAt<prestigeAuto.checkMinutes*60000)return;''','periodic cadence')
one("if(prestigeAutoDayCount()>=prestigeAuto.maxDaily){prestigeAuto.status='LIMIT 8 AUTOMATYCZNYCH ATAKOW NA DZIEN';prestigeAutoSave();return;}",
    "if(prestigeAutoDayCount()>=prestigeAuto.maxDaily){prestigeAuto.status='LIMIT 12 AUTOMATYCZNYCH ATAKOW NA DZIEN';prestigeAutoSave();return;}",'daily cap')
one('''      if(!prestigeAutoServerReady(status)){
        prestigeAuto.status='SERWER: NIE MOZNA JESZCZE ATAKOWAC';return;
      }
      pvpLabIngestDuelStatus(status);
      // Automatyczny roll tylko gdy wczesniej zaobserwowano prawdziwy, bezpieczny GET.
      if(prestigeAuto.rollMethod==='GET'){
        const data=await apiActive(`/api/duels/${cid}/roll-opponents`);
        prestigeAutoObserve('duel_roll',data,{method:'GET',autoplay:true});
      }
      const candidates=prestigeAutoCandidates();''', '''      const pointState=prestigeAutoStatusCheck(status);
      if(!pointState.ready){
        prestigeAuto.status=pointState.remaining===0?'BRAK PUNKTOW WALKI — czekam':
          'SERWER NIE POTWIERDZIL PUNKTOW / GOTOWOSCI DO WALKI';return;
      }
      pvpLabIngestDuelStatus(status);
      // Odwzorowujemy tylko zaobserwowany recznie sposob losowania.
      if(!prestigeAutoCandidates().length || prestigeAuto.rollMethod==='GET'){
        await prestigeAutoMaybeRoll(cid,pointState);
        if(!prestigeAuto.enabled)return;
      }
      const candidates=prestigeAutoCandidates();''','roll in cycle')
one("      if(!choice){\n        prestigeAuto.status=candidates.length?'BRAK PEWNIAKA — zadnego ataku':'BRAK SWIEZEJ LISTY CELOW — otworz prestiz / losuj recznie';",
    "      if(!choice){\n        prestigeAuto.status=candidates.length?'BRAK PEWNIAKA — zadnego ataku':(prestigeAuto.rollMethod==='POST'&&!prestigeAuto.allowAutoRoll?'AUTO LOSOWANIE POST WYLACZONE — wlacz osobno':'BRAK SWIEZEJ LISTY CELOW');",'no choice status')
one('''      pvpLabIngestDuelStatus(status);
      if(prestigeAuto.rollMethod==='GET'){''','''      pvpLabIngestDuelStatus(status);prestigeAutoStatusCheck(status);
      if(prestigeAuto.rollMethod==='GET'){''','manual refresh status')
one("if(kind==='duel_status'){ pvpLabIngestDuelStatus(data); return; }",
    "if(kind==='duel_status'){ pvpLabIngestDuelStatus(data);prestigeAutoStatusCheck(data); return; }",'passive status capture')
one('''      <div class="section"><div class="section-title">Stan automatu</div><b>${esc(prestigeAuto.status)}</b>
        <div class="sub">${prestigeAuto.enabled?'WŁĄCZONY':'WYŁĄCZONY'} • wykonano dziś ${today}/8''','''      <div class="section"><div class="section-title">Stan automatu</div><b>${esc(prestigeAuto.status)}</b>
        <div class="sub">${prestigeAuto.enabled?'WŁĄCZONY':'WYŁĄCZONY'} • kontrola co ${prestigeAuto.checkMinutes} min • punkty walki: ${prestigeAuto.lastStatus?.remaining==null?'nieodczytane':prestigeAuto.lastStatus.remaining} • wykonano dziś ${today}/12''','HTML cadence')
one('''          <button data-act="prestige-auto-check">↻ Sprawdź cele</button><button data-act="prestige-auto-export">Eksport AUTO JSON</button></div>''', '''          <button data-act="prestige-auto-check">↻ Sprawdź cele</button>
          <button data-act="prestige-auto-roll-toggle">${prestigeAuto.allowAutoRoll?'■ Wyłącz losowanie AUTO':'🎲 Zezwól na losowanie AUTO'}</button>
          <button data-act="prestige-auto-export">Eksport AUTO JSON</button></div>
        <div class="sub">Losowanie: ${prestigeAuto.rollMethod||'nieznane'} • schemat POST: ${prestigeAuto.rollCalibration?'poznany':'niepoznany'} • auto losowan dzis: ${prestigeAutoRollsDay()}/12.</div>''','HTML autoRoll toggle')
one('''      <div class="section table-wrap"><div class="section-title">Aktualne cele''','''      <div class="note">Punkty 12/dzien sa wstepnym zalozeniem, nie potwierdzonym limitem gry. AUTO nie atakuje, jesli serwer nie potwierdza pozostalych punktow lub mozliwosci ataku. Gdy lista celow jest losowana przez POST, wymagane osobne zezwolenie — operacja moze miec koszt. Nie ma gwarantowanych wygranych.</div>
      <div class="section table-wrap"><div class="section-title">Aktualne cele''','HTML disclaimer')
one("      calibrated:!!prestigeAuto.calibration,rollMethod:prestigeAuto.rollMethod,",
    "      calibrated:!!prestigeAuto.calibration,rollMethod:prestigeAuto.rollMethod,\n      autoRollAllowed:prestigeAuto.allowAutoRoll,rollCalibrated:!!prestigeAuto.rollCalibration,\n      checkMinutes:prestigeAuto.checkMinutes,lastStatus:prestigeAuto.lastStatus,rollsToday:prestigeAutoRollsDay(),",'export')
one("    if(act==='prestige-auto-stop'){prestigeAutoStop('ZATRZYMANY PRZEZ UZYTKOWNIKA');return;}",
    "    if(act==='prestige-auto-stop'){prestigeAutoStop('ZATRZYMANY PRZEZ UZYTKOWNIKA');return;}\n    if(act==='prestige-auto-roll-toggle'){prestigeAutoToggleRoll();return;}",'actions')
one("Date.now()-prestigeAuto.lastCheckAt>=60000){\n      prestigeAutoCycle({manual:false});",
    "Date.now()-prestigeAuto.lastCheckAt>=prestigeAuto.checkMinutes*60000){\n      prestigeAutoCycle({manual:false});",'scheduler')

p.write_text(s,encoding='utf8')
g=root/'app/build.gradle.kts'
z=g.read_text(encoding='utf8')
if z.count('versionCode = 10067')!=1 or z.count('versionName = "1.0.67"')!=1:raise SystemExit('needs Android 1.0.67 base')
g.write_text(z.replace('versionCode = 10067','versionCode = 10068',1).replace('versionName = "1.0.67"','versionName = "1.0.68"',1),encoding='utf8')
print('OK Android 1.0.68, userscript 8.8.75')