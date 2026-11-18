  // ============================================================
  // PRESTIZ AUTO v8.8.72: konserwatywne wybieranie celow + osobny rejestr pojedynkow Ligi Meneli.
  // Nie gwarantuje zwyciestwa. ZERO automatycznych rerolli POST i ZERO slepych zapisow.
  // ============================================================
  const PRESTIGE_AUTO_KEY='pomagier_prestige_auto_v1';
  let prestigeAuto=loadJSON(PRESTIGE_AUTO_KEY,null);
  if(!prestigeAuto||typeof prestigeAuto!=='object') prestigeAuto={};
  prestigeAuto.characterId=Number(prestigeAuto.characterId||pvpLabOwnId()||0);
  prestigeAuto.enabled=prestigeAuto.enabled===true;
  prestigeAuto.minMatches=4;
  prestigeAuto.minLower=0.50;
  prestigeAuto.lookbackDays=45;
  prestigeAuto.maxDaily=8;
  prestigeAuto.cooldownMs=30*60*1000;
  prestigeAuto.lastAttackAt=Number(prestigeAuto.lastAttackAt||0);
  prestigeAuto.lastCheckAt=Number(prestigeAuto.lastCheckAt||0);
  prestigeAuto.lastRollAt=Number(prestigeAuto.lastRollAt||0);
  prestigeAuto.rollMethod=String(prestigeAuto.rollMethod||'');
  prestigeAuto.rollCandidates=Array.isArray(prestigeAuto.rollCandidates)?prestigeAuto.rollCandidates.slice(0,10):[];
  prestigeAuto.calibration=prestigeAuto.calibration&&typeof prestigeAuto.calibration==='object'?prestigeAuto.calibration:null;
  prestigeAuto.actions=Array.isArray(prestigeAuto.actions)?prestigeAuto.actions.slice(-150):[];
  if(prestigeAuto.actions.some(a=>a.origin==='auto'&&a.status==='wyslano')){
    prestigeAuto.enabled=false;
    prestigeAuto.status='STOP — NIERozstrzygniety POST sprzed restartu; sprawdz historie walk';
  }
  prestigeAuto.status=String(prestigeAuto.status||'WYLACZONY');
  prestigeAuto.runtimeBusy=false;
  prestigeAuto.lastResultId=String(prestigeAuto.lastResultId||'');
  prestigeAuto.lastSeenResultAt=Number(prestigeAuto.lastSeenResultAt||0);

  function prestigeAutoSave(){
    prestigeAuto.actions=prestigeAuto.actions.slice(-150);
    const busy=prestigeAuto.runtimeBusy;
    prestigeAuto.runtimeBusy=false;
    try{ saveJSON(PRESTIGE_AUTO_KEY,prestigeAuto); }finally{ prestigeAuto.runtimeBusy=busy; }
  }
  function prestigeAutoGuard(){
    const id=pvpLabOwnId();
    if(id && prestigeAuto.characterId && id!==prestigeAuto.characterId){
      prestigeAuto.enabled=false;
      prestigeAuto.calibration=null;
      prestigeAuto.rollCandidates=[];
      prestigeAuto.rollMethod='';
      prestigeAuto.actions=[];
      prestigeAuto.lastAttackAt=0;
      prestigeAuto.status='ZMIANA KONTA — AUTO WYLACZONE';
      prestigeAuto.lastResultId='';
    }
    if(id) prestigeAuto.characterId=id;
  }
  function prestigeAutoReadBody(raw){
    const b=pvpLabParseRequestBody(raw);
    if(!b || typeof b!=='object' || Array.isArray(b)) return null;
    const keys=Object.keys(b);
    if(keys.length<1||keys.length>6) return null;
    for(const k of keys){
      if(!/^[a-z][a-zA-Z0-9_]{0,39}$/.test(k)) return null;
      if(/(?:auth|secret|token|pass|cookie|csrf|money|coin|premium|cost|price|purchase)/i.test(k)) return null;
      if(!['opponentId','targetId','enemyId','defenderId','selectedOpponentId','opponent_id','target_id',
        'opponentIndex','selectedIndex','index','mode','type','duelType','fightMode'].includes(k)) return null;
      if(!['string','number','boolean'].includes(typeof b[k])) return null;
      if(typeof b[k]==='string' && b[k].length>40) return null;
    }
    return b;
  }
  function prestigeAutoTargetInBody(b){
    if(!b) return null;
    for(const k of ['opponentId','targetId','enemyId','defenderId','selectedOpponentId','opponent_id','target_id']){
      const v=Number(b[k]);
      if(Object.prototype.hasOwnProperty.call(b,k) && Number.isSafeInteger(v) && v>0 && v!==pvpLabOwnId())
        return {field:k,id:v};
    }
    // Identyfikator indeksu jest dopuszczalny dopiero po potwierdzeniu rezultatu i listy roll.
    for(const k of ['opponentIndex','selectedIndex','index']){
      const v=Number(b[k]);
      if(Object.prototype.hasOwnProperty.call(b,k) && Number.isInteger(v) && v>=0 && v<10)
        return {field:k,index:v};
    }
    return null;
  }
  function prestigeAutoObserve(kind,data,meta={}){
    prestigeAutoGuard();
    if(!data || data.success===false) return;
    if(kind==='duel_roll'){
      const m=String(meta.method||'GET').toUpperCase();
      if(['GET','POST'].includes(m)) prestigeAuto.rollMethod=m;
      const arr=Array.isArray(data.opponents)?data.opponents:[];
      {
        prestigeAuto.lastRollAt=Date.now();
        prestigeAuto.rollCandidates=arr.slice(0,10).map(x=>({id:Number(x.id||x.characterId||0),
          nickname:String(x.nickname||x.name||'').slice(0,65),level:Number(x.level||0),
          expectedGain:Number(x.expectedGain??0),expectedLoss:Number(x.expectedLoss??0)}))
          .filter(x=>Number.isSafeInteger(x.id)&&x.id>0);
      }
      prestigeAutoSave();return;
    }
    if(kind!=='duel_fight') return;
    const body=prestigeAutoReadBody(meta.requestBody);
    const info=prestigeAutoTargetInBody(body);
    let targetId=info?.id||0;
    if(!targetId && info?.index!=null){
      // Nie zakladamy 0-/1-based indeksu bez weryfikacji po ID zwroconym przez serwer.
      const reported=Number(data?.opponent?.id||data?.opponent?.characterId||0);
      if(reported>0) targetId=reported;
    }
    const fromResponse=Number(data?.opponent?.id||data?.opponent?.characterId||0);
    if(fromResponse>0 && targetId>0 && fromResponse!==targetId){
      prestigeAuto.enabled=false;
      prestigeAuto.status='NIEZGODNY ID CELU — AUTO WYLACZONE';
      prestigeAutoSave(); return;
    }
    const resultKnown=typeof data.won==='boolean';
    const validBattle=!!data.battleId;
    const chosen=prestigeAuto.rollCandidates.find(o=>o.id===targetId);
    const rollMatched=!!chosen;
    if(resultKnown&&validBattle){
      // Utrwalanie ID z wyslanego zadania, jezeli sam replay je pominal.
      if(targetId>0) pvpLabMetaRecord({battleId:data.battleId,source:'prestige',direction:'attack',won:data.won,
        opponent:{id:targetId,nickname:String(data?.opponent?.nickname||chosen?.nickname||''),level:data?.opponent?.level||chosen?.level||null}});
      const id=String(data.battleId);
      if(prestigeAuto.lastResultId!==id){
        const pending=meta.autoplay?prestigeAuto.actions.findLast(a=>a.origin==='auto'&&a.status==='wyslano'&&a.targetId===targetId):null;
        const entry=pending||{at:Date.now(),targetId,origin:meta.autoplay?'auto':'manual'};
        Object.assign(entry,{battleId:id,won:data.won,status:data.won?'wygrana':'przegrana',
          prestigeChange:Number.isFinite(Number(data.prestigeChange))?Number(data.prestigeChange):null});
        if(!pending)prestigeAuto.actions.push(entry);
        prestigeAuto.lastResultId=id;
      }
      prestigeAuto.lastAttackAt=Date.now();
      prestigeAuto.lastSeenResultAt=Date.now();
      prestigeAuto.lastRollAt=0;prestigeAuto.rollCandidates=[];
      if(!data.won && prestigeAuto.enabled){prestigeAuto.enabled=false;prestigeAuto.status='STOP — PRZEGRANA: wymagany nowy przeglad';}
      else if(prestigeAuto.enabled){prestigeAuto.status='ZAPISANO '+(data.won?'WYGRANA':'PRZEGRANA')+' • czekam na nastepny bezpieczny cel';}
    }
    // Kalibracja tylko po potwierdzonej recznej, udanej transakcji.
    if(!meta.autoplay && String(meta.method||'').toUpperCase()==='POST' && resultKnown && validBattle && info && body){
      const match=targetId>0 && (fromResponse===targetId || rollMatched);
      if(match && info.id>0){
        prestigeAuto.calibration={field:info.field,base:Object.fromEntries(Object.entries(body).filter(([k])=>k!==info.field)),
          at:Date.now(),method:'POST',ownId:pvpLabOwnId(),type:'target-id'};
      } else if(match && info.index!=null){
        // Nie automatyzujemy indeksu: zmiana kolejnosci celow moglaby uderzyc w zla osobe.
        prestigeAuto.status='KALIBRACJA: gra wysyla indeks celu, wymagane dalsze dopracowanie';
      }
    }
    prestigeAutoSave();
  }
  function prestigeAutoWilson(w,n){
    if(n<=0) return 0;
    const z=1.96,p=w/n,t=z*z/n;
    return Math.max(0,(p+t/2-z*Math.sqrt(p*(1-p)/n+t/(4*n)))/(1+t));
  }
  function prestigeAutoHistory(id,now=Date.now()){
    const build=pvpLabCurrentBuild();
    const valid=(pvpLab.battles||[]).filter(b=>b?.source==='prestige'&&b.direction==='attack'&&
      Number(b.opponent?.id||0)===Number(id)&&typeof b.won==='boolean'&&
      now-Number(b.createdAt||b.capturedAt||0)<=prestigeAuto.lookbackDays*86400000&&
      Number(b.createdAt||b.capturedAt||0)<=now+86400000);
    const matches=valid.filter(b=>build&&String(b.buildCode||'').trim()===build);
    const wins=matches.filter(b=>b.won).length,losses=matches.length-wins;
    const recentLoss=valid.some(b=>!b.won && now-Number(b.createdAt||0)<14*86400000);
    const lower=prestigeAutoWilson(wins,matches.length);
    const eligible=!!build&&matches.length>=prestigeAuto.minMatches&&losses===0&&!recentLoss&&lower>=prestigeAuto.minLower;
    return {n:matches.length,wins,losses,total:valid.length,recentLoss,lower,
      posteriorMean:(wins+1)/(matches.length+2),eligible,buildKnown:!!build};
  }
  function prestigeAutoCandidates(now=Date.now()){
    const fresh=now-prestigeAuto.lastRollAt<=180000;
    if(!fresh) return [];
    return prestigeAuto.rollCandidates.map(x=>({...x,history:prestigeAutoHistory(x.id,now)}))
      .filter(x=>x.id>0&&x.id!==pvpLabOwnId())
      .sort((a,b)=>Number(b.history.eligible)-Number(a.history.eligible)||
        b.history.lower-a.history.lower||Number(b.expectedGain||0)-Number(a.expectedGain||0));
  }
  function prestigeAutoBusyElsewhere(){
    return !!(pvpLab.syncing||leagueLab.syncing||state?.localAI?.busy||state?.auto?.inCycle||
      state?.manual?.semi?.inCycle||raidAuto?.runtimeBusy||alcoholAuto?.runtimeBusy||
      (typeof companyAuto!=='undefined'&&companyAuto.runtimeBusy));
  }
  function prestigeAutoDayCount(){
    const today=new Date().toDateString();
    return prestigeAuto.actions.filter(a=>a.origin==='auto'&&new Date(Number(a.at)||0).toDateString()===today).length;
  }
  function prestigeAutoServerReady(d){
    if(!d || d.success===false) return false;
    const v=d?.duels||d?.status||d;
    for(const k of ['canAttack','canFight','attackAvailable','canDuel'])
      if(v[k]===false) return false;
    for(const k of ['remainingAttacks','attacksRemaining','duelsRemaining','availableAttacks'])
      if(v[k]!==undefined&&v[k]!==null&&Number(v[k])<=0) return false;
    for(const k of ['cooldownRemaining','remainingCooldown','attackCooldownRemaining'])
      if(v[k]!==undefined&&v[k]!==null&&Number(v[k])>0) return false;
    for(const k of ['nextAttackAt','cooldownEndsAt']){
      const t=Date.parse(String(v[k]||''));if(Number.isFinite(t)&&t>Date.now())return false;
    }
    return true;
  }
  function prestigeAutoStop(status){
    prestigeAuto.enabled=false;prestigeAuto.status=String(status||'AUTO WYLACZONE');prestigeAutoSave();render();
  }
  function prestigeAutoStart(){
    prestigeAutoGuard();
    if(!prestigeAuto.calibration){
      prestigeAuto.status='BRAK KALIBRACJI — wykonaj recznie 1 atak o prestiz';
      prestigeAutoSave();render();return;
    }
    if(!confirm('Wlaczyc automatyczne ATAKI O PRESTIZ? Pomagier wykona prawdziwe pojedynki w grze tylko gdy historia z aktualnym buildem: min. 4 wygrane, 0 porazek, dolny limit Wilsona >=50%. Pojedyncza porazka wylaczy automat. Brak pewnego celu = brak ataku.'))return;
    prestigeAuto.enabled=true;
    prestigeAuto.status='AUTO WLACZONE • czekam na bezpiecznych przeciwnikow';
    prestigeAuto.lastCheckAt=0;prestigeAutoSave();render();
  }
  async function prestigeAutoCycle({manual=false}={}){
    prestigeAutoGuard();
    if(!prestigeAuto.enabled || prestigeAuto.runtimeBusy || prestigeAutoBusyElsewhere())return;
    if(!__mgSessionTemplate) tryHydrateSessionFromGameAuth();
    if(!__mgSessionTemplate){prestigeAuto.status='CZEKAM NA SESJE GRY';prestigeAutoSave();return;}
    const now=Date.now();
    if(!manual && now-prestigeAuto.lastCheckAt<60000)return;
    prestigeAuto.lastCheckAt=now;
    if(!prestigeAuto.calibration||prestigeAuto.calibration.type!=='target-id'||
       prestigeAuto.calibration.ownId!==pvpLabOwnId()){
      prestigeAutoStop('AUTO STOP — brak potwierdzonego formatu ataku');return;
    }
    if(prestigeAutoDayCount()>=prestigeAuto.maxDaily){prestigeAuto.status='LIMIT 8 AUTOMATYCZNYCH ATAKOW NA DZIEN';prestigeAutoSave();return;}
    if(now-prestigeAuto.lastAttackAt<prestigeAuto.cooldownMs){
      prestigeAuto.status='ODSTEP 30 MIN — czekam';prestigeAutoSave();return;
    }
    prestigeAuto.runtimeBusy=true;
    try{
      const cid=pvpLabOwnId();
      const status=await apiActive(`/api/duels/${cid}/status`);
      if(!prestigeAutoServerReady(status)){
        prestigeAuto.status='SERWER: NIE MOZNA JESZCZE ATAKOWAC';return;
      }
      pvpLabIngestDuelStatus(status);
      // Automatyczny roll tylko gdy wczesniej zaobserwowano prawdziwy, bezpieczny GET.
      if(prestigeAuto.rollMethod==='GET'){
        const data=await apiActive(`/api/duels/${cid}/roll-opponents`);
        prestigeAutoObserve('duel_roll',data,{method:'GET',autoplay:true});
      }
      const candidates=prestigeAutoCandidates();
      const choice=candidates.find(x=>x.history.eligible && Number(x.expectedGain)>0);
      if(!choice){
        prestigeAuto.status=candidates.length?'BRAK PEWNIAKA — zadnego ataku':'BRAK SWIEZEJ LISTY CELOW — otworz prestiz / losuj recznie';
        return;
      }
      const call=prestigeAuto.calibration;
      if(!prestigeAuto.enabled||prestigeAuto.characterId!==cid) return;
      const body={...call.base,[call.field]:choice.id};
      prestigeAuto.lastAttackAt=Date.now();
      prestigeAuto.actions.push({at:prestigeAuto.lastAttackAt,targetId:choice.id,origin:'auto',status:'wyslano'});
      prestigeAuto.status='ATAKUJE ID '+choice.id+' • po '+choice.history.wins+' zwyciestwach';
      prestigeAutoSave();
      const result=await apiActive(`/api/duels/${cid}/fight`,{method:'POST',body});
      // Wewnętrzne apiActive nie trafia do bridge, więc zapisujemy wynik jawnie.
      if(result?.success===false||typeof result?.won!=='boolean'||!result?.battleId){
        prestigeAutoStop('STOP — serwer nie potwierdzil wyniku (bez ponawiania POST)');return;
      }
      pvpLabObserveApi(`/api/duels/${cid}/fight`,result,{method:'POST',requestBody:body,autoplay:true});
      prestigeAuto.status=result.won?'WYGRANA — wynik zapisany':'PRZEGRANA — automat zatrzymany';
      if(!result.won)prestigeAuto.enabled=false;

    }catch(e){
      // Nawet przy timeoutie API moglo wykonac POST. Zatrzymaj, nie ponawiaj.
      prestigeAuto.enabled=false;
      prestigeAuto.status='STOP — BLAD/STATUS NIEPEWNY: '+String(e?.message||e).slice(0,120);
    }finally{
      prestigeAuto.runtimeBusy=false;prestigeAutoSave();try{render();}catch(_){ }
    }
  }
  async function prestigeAutoRefreshTargets(){
    if(!__mgSessionTemplate) tryHydrateSessionFromGameAuth();
    if(!__mgSessionTemplate){prestigeAuto.status='CZEKAM NA SESJE GRY';prestigeAutoSave();render();return;}
    try{
      const cid=pvpLabOwnId();
      const status=await apiActive(`/api/duels/${cid}/status`);
      pvpLabIngestDuelStatus(status);
      if(prestigeAuto.rollMethod==='GET'){
        const roll=await apiActive(`/api/duels/${cid}/roll-opponents`);
        prestigeAutoObserve('duel_roll',roll,{method:'GET'});
      } else prestigeAuto.status='Otworz liste przeciwnikow w grze (losowanie wymaga obslugi recznej)';
    }catch(e){prestigeAuto.status='BLAD ODCZYTU: '+String(e?.message||e).slice(0,110);}
    prestigeAutoSave();render();
  }
  function prestigeAutoHTML(){
    const today=prestigeAutoDayCount();
    const rows=prestigeAutoCandidates().slice(0,10).map(o=>{
      const h=o.history;
      return `<tr><td class="left">${esc(o.nickname||'ID '+o.id)}<div class="sub">ID ${o.id} • ${o.level||'—'} lvl</div></td>
        <td>${h.wins}/${h.n}</td><td>${Math.round(h.lower*100)}%</td>
        <td>${h.eligible&&o.expectedGain>0?'KANDYDAT':h.total>0&&h.n===0?'INNY BUILD':'POMIN'}</td>
        <td>${Number(o.expectedGain)>0?'+'+o.expectedGain:'—'}</td></tr>`;
    }).join('');
    const ac=prestigeAuto.actions.slice(-12).reverse().map(a=>`<tr><td>${new Date(a.at).toLocaleString('pl-PL')}</td><td>${a.targetId||'—'}</td><td>${esc(a.status|| (a.won===true?'W':a.won===false?'P':'—'))}</td></tr>`).join('');
    return `<div class="helper-hero"><div><div class="helper-name">🎯 Prestiż AUTO — pewniejsze cele</div>
      <div class="sub">Osobny rejestr o prestiż • ranking na podstawie realnych ataków przy obecnym buildzie • bez gwarancji zwycięstwa</div></div></div>
      <div class="section"><div class="section-title">Stan automatu</div><b>${esc(prestigeAuto.status)}</b>
        <div class="sub">${prestigeAuto.enabled?'WŁĄCZONY':'WYŁĄCZONY'} • wykonano dziś ${today}/8 • ostatni atak: ${prestigeAuto.lastAttackAt?new Date(prestigeAuto.lastAttackAt).toLocaleString('pl-PL'):'brak'}
        • format POST: ${prestigeAuto.calibration?'potwierdzony':'BRAK — potrzebny 1 reczny atak'} • losowanie: ${esc(prestigeAuto.rollMethod||'nieznane')}</div>
        <div class="helper-actions">${prestigeAuto.enabled?'<button data-act="prestige-auto-stop">■ STOP</button>':'<button data-act="prestige-auto-start">▶ Włącz AUTO</button>'}
          <button data-act="prestige-auto-check">↻ Sprawdź cele</button><button data-act="prestige-auto-export">Eksport AUTO JSON</button></div>
        <div class="note">AUTO wybiera wyłącznie cele z aktualnej listy losowania, dla których w ostatnich 45 dniach zanotowano min. 4 zwycięstwa bez porażki <b>z dokładnie tym samym buildem, którego używasz teraz</b>. Dodatkowo odrzuca cel po niedawnej porażce, wymaga dolnej granicy Wilsona ≥ 50%, dodaje 30-minutowy odstęp i limit 8 autoataków/dobę. Gdy nie ma pewnego celu, NIE atakuje. 100% skuteczności nie można zagwarantować.</div>
        <div class="note">Pierwsze uruchomienie: wykonaj w grze <b>jedną ręczną walkę o prestiż</b>, aby Pomagier potwierdził format wywołania. Jeśli gra losuje cele poprzez POST, losowanie pozostaje ręczne — automat niczego nie kupuje ani nie zużywa na ślepo.</div></div>
      <div class="section table-wrap"><div class="section-title">Aktualne cele (${prestigeAutoCandidates().length})</div><table><thead><tr><th>Przeciwnik</th><th>Wygrane</th><th>Dolny próg</th><th>Ocena</th><th>Prestiż</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Brak świeżych celów z ostatnich 3 minut — otwórz ekran prestiżu.</td></tr>'}</tbody></table></div>
      <div class="section table-wrap"><div class="section-title">Dziennik autoataków i kalibracji</div><table><thead><tr><th>Kiedy</th><th>ID celu</th><th>Wynik</th></tr></thead><tbody>${ac||'<tr><td colspan="3">Brak prób.</td></tr>'}</tbody></table></div>`;
  }
  async function prestigeAutoExport(){
    const data={type:'pomagier-prestige-auto',schema:1,androidVersion:ANDROID_VERSION,version:VERSION,
      exportedAt:nowIso(),characterId:pvpLabOwnId(),config:{enabled:prestigeAuto.enabled,minMatches:prestigeAuto.minMatches,
        minLower:prestigeAuto.minLower,lookbackDays:prestigeAuto.lookbackDays,maxDaily:prestigeAuto.maxDaily},
      calibrated:!!prestigeAuto.calibration,rollMethod:prestigeAuto.rollMethod,
      candidates:prestigeAutoCandidates(),actions:prestigeAuto.actions,status:prestigeAuto.status};
    const raw=JSON.stringify(data,null,2),name='pomagier_prestiz_auto_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    if(!await pomagierSaveJsonNative(name,raw)) pomagierBrowserDownload(name,raw);
    prestigeAuto.status='ZAPISANO: '+name;prestigeAutoSave();render();
  }

  // Liga Meneli: pojedyncze potyczki "Pokaż dominację" to NIE osobne mecze gangow.
  // Przechwytujemy tylko jednoznacznie oznaczone walki; nie oznaczamy zwyklych kradziezy jako ligi.
  leagueLab.individualFights=Array.isArray(leagueLab.individualFights)?leagueLab.individualFights:[];
  function leagueLabIsIndividualFight(url,data={},meta={}){
    const u=pvpLabUrl(url),path=String(u?.pathname||'');
    if(!/\/api\//.test(path) || /(?:\bduels\b|\bpvp\/battle\b)/.test(path)) return false;
    const body=typeof pvpLabParseRequestBody==='function'?(pvpLabParseRequestBody(meta.requestBody)||{}):{};
    const tokens=[path, data?.mode,data?.fightMode,data?.fightType,data?.leagueMode,data?.action,
      data?.result?.mode,body?.mode,body?.fightMode,body?.action,body?.type].map(x=>String(x??''));
    const explicit=tokens.some(x=>/(?:league|liga|dominat|pokaz.?dominacj)/i.test(x))||
      [data?.isLeagueFight,data?.leagueFight,data?.isDomination,body?.isLeagueFight,body?.showDomination]
        .some(x=>x===true) ||
      ['leagueXp','leagueXP','leagueXpChange','dominationXp','dominationResult'].some(k=>Object.prototype.hasOwnProperty.call(data,k));
    return explicit && (data?.battleId||data?.fightId||data?.result?.battleId||data?.won!==undefined);
  }
  function leagueLabCaptureIndividual(url,data,meta={}){
    if(!leagueLabIsIndividualFight(url,data,meta)) return false;
    leagueLabAccountGuard();
    leagueLab.individualFights=Array.isArray(leagueLab.individualFights)?leagueLab.individualFights:[];
    const id=String(data.battleId||data.fightId||data.result?.battleId||'');
    if(!id || data.success===false) return false;
    const opp=data.opponent||data.result?.opponent||{};
    const body=pvpLabParseRequestBody(meta.requestBody)||{};
    const opponentId=Number(opp.id||opp.characterId||body.targetId||body.opponentId||data.opponentId||0);
    const won=typeof data.won==='boolean'?data.won:typeof data.result?.won==='boolean'?data.result.won:null;
    const xp=leagueLabNumber(data.leagueXpChange??data.leagueXp??data.dominationXp??data.result?.leagueXpChange);
    const entry={battleId:id,at:Date.now(),opponentId:Number.isSafeInteger(opponentId)?opponentId:0,
      opponent:String(opp.nickname||opp.name||data.opponentNickname||'').slice(0,100),
      direction:data.wasAttacker===false?'defense':'attack',won,leagueXpChange:xp,
      source:String(pvpLabUrl(url)?.pathname||'').slice(0,140)};
    const ix=leagueLab.individualFights.findIndex(x=>x.battleId===id);
    if(ix>=0)leagueLab.individualFights[ix]={...leagueLab.individualFights[ix],...entry};
    else leagueLab.individualFights.push(entry);
    leagueLab.individualFights=leagueLab.individualFights.slice(-1200);
    leagueLab.lastCaptureAt=Date.now();
    leagueLab.status='LIGA: pojedynki '+leagueLab.individualFights.length;
    leagueLabSave();
    return true;
  }
  function leagueLabIndividualHTML(){
    const arr=leagueLab.individualFights||[],resolved=arr.filter(x=>typeof x.won==='boolean');
    const wins=resolved.filter(x=>x.won).length;
    const rows=arr.slice(-30).reverse().map(x=>`<tr><td>${new Date(x.at).toLocaleString('pl-PL')}</td><td>${esc(x.opponent||'ID '+x.opponentId)}</td><td>${x.won===true?'WYGRANA':x.won===false?'PRZEGRANA':'brak wyniku'}</td><td>${x.leagueXpChange==null?'—':x.leagueXpChange}</td></tr>`).join('');
    return `<div class="section table-wrap"><div class="section-title">Liga Meneli — walki indywidualne (${resolved.length})</div>
      <div class="sub">Bilans: ${wins} wygranych / ${resolved.length-wins} przegranych. Wpis tylko gdy odpowiedź gry potwierdza tryb ligi / dominacji. Liga nie miesza się z prestiżem.</div>
      <table><thead><tr><th>Data</th><th>Rywal</th><th>Wynik</th><th>XP</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Brak ligowych pojedynkow. Wykonaj w grze Okradnij → Pokaż dominację i otwórz eksport.</td></tr>'}</tbody></table></div>`;
  }