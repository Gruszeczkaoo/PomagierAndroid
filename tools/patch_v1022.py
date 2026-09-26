from pathlib import Path
import sys
ROOT=Path(sys.argv[1]).resolve()
p=ROOT/'app/src/main/assets/pomagier.user.js'
s=p.read_text(encoding='utf-8')

# version + changelog
s=s.replace('// @version      8.8.28','// @version      8.8.29',1)
s=s.replace("const VERSION = '8.8.28';", "const VERSION = '8.8.29';\n  const ANDROID_VERSION = '1.0.22';\n  const BRAIN_VERSION = '3.2.9';",1)
anchor="  // v8.8.28 UI + STORAGE HOTFIX:\n"
insert="""  // v8.8.29 DIAGNOSTICS + ACTION HISTORY + PVP ADVISOR + RAID TIMER:\n  // - nowa Autodiagnostyka: wersje Android/userscript/Brain, sesja, storage, ostatni błąd i szybki test API,\n  // - nowy Dziennik działań: trwała historia mutujących requestów Pomagiera i kluczowych decyzji modułów,\n  // - PvP Lab dostał Doradcę PvP, który opisuje najczęstsze przyczyny porażek na podstawie realnych replayów,\n  // - Napady: wybieralny timer 30/60/90 min lub własny, dokładnie jedno ogłoszenie „Napad start za X minut”,\n  // - po końcu timera Pomagier sprawdza ten sam plan i minimalną liczbę uczestników, a następnie automatycznie wywołuje START.\n"""
s=s.replace(anchor,insert+anchor,1)

# storage keys
s=s.replace("    gangPayout:'pomagier_gang_payout_v1'\n", "    gangPayout:'pomagier_gang_payout_v1',\n    actionHistory:'pomagier_action_history_v1',\n    diagnostics:'pomagier_diagnostics_v1'\n",1)

# auto defaults raid timer
s=s.replace("    raidAutoPollSeconds: 15,\n", "    raidAutoPollSeconds: 15,\n    raidAutoStartDelayMinutes: 30,\n",1)

# raid state fields
s=s.replace("  raidAuto.lastCycleAt=Number(raidAuto.lastCycleAt||0);\n", "  raidAuto.lastCycleAt=Number(raidAuto.lastCycleAt||0);\n  raidAuto.startPlanId=Number(raidAuto.startPlanId||0);\n  raidAuto.startDueAt=Number(raidAuto.startDueAt||0);\n  raidAuto.startDelayMinutes=Number(raidAuto.startDelayMinutes||0);\n  raidAuto.lastStartedPlanId=Number(raidAuto.lastStartedPlanId||0);\n  raidAuto.startAttemptedAt=Number(raidAuto.startAttemptedAt||0);\n",1)

# insert action history + diagnostics helpers before RAID AUTO section
marker="  // ============================================================\n  // NAPADY AUTO v8.8.24 — plan -> ogłoszenie -> RĘCZNY START -> koniec -> odbiór\n"
block=r'''  // ============================================================
  // DIAGNOSTYKA + DZIENNIK DZIAŁAŃ v8.8.29
  // ============================================================
  let actionHistory=loadJSON(K.actionHistory,[]);
  if(!Array.isArray(actionHistory)) actionHistory=[];
  let diagnosticsState=loadJSON(K.diagnostics,{})||{};
  if(typeof diagnosticsState!=='object') diagnosticsState={};

  function actionHistorySave(){
    if(actionHistory.length>600) actionHistory=actionHistory.slice(-600);
    saveJSON(K.actionHistory,actionHistory);
  }
  function actionHistoryAdd(module,action,status='OK',detail=''){
    const row={ts:Date.now(),iso:nowIso(),module:String(module||'Pomagier'),action:String(action||''),status:String(status||'OK'),detail:String(detail||'')};
    const last=actionHistory[actionHistory.length-1];
    if(last && last.module===row.module && last.action===row.action && last.status===row.status && last.detail===row.detail && row.ts-Number(last.ts||0)<2500) return;
    actionHistory.push(row); actionHistorySave();
  }
  function diagnosticsStorage(){
    let chars=0,keys=0;
    try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(!k) continue; keys++; chars+=String(k).length+String(localStorage.getItem(k)||'').length; } }catch{}
    return {keys,bytes:chars*2};
  }
  async function diagnosticsRun(){
    const out={at:Date.now(),session:!!__mgSessionTemplate,online:navigator.onLine!==false,storage:diagnosticsStorage(),api:null,error:''};
    try{
      if(!__mgSessionTemplate) tryHydrateSessionFromGameAuth();
      if(__mgSessionTemplate){
        const r=await apiActive(`/api/pvp/${Number(settings.characterId||0)}/attributes`);
        out.api=!!(r && r.success!==false);
      }else out.api=false;
    }catch(e){ out.api=false; out.error=String(e?.message||e); }
    diagnosticsState.last=out; saveJSON(K.diagnostics,diagnosticsState);
    actionHistoryAdd('Diagnostyka','Szybki test',out.api?'OK':'BŁĄD',out.error||`sesja=${out.session?'tak':'nie'} • API=${out.api?'OK':'brak'}`);
    return out;
  }
  function diagnosticsHTML(){
    const st=diagnosticsStorage(), last=diagnosticsState.last||{};
    const quota=__storageLastError?`<span class="bad">${esc(__storageLastError)}</span>`:'brak';
    const apiTxt=last.at?(last.api?'OK':'BŁĄD / BRAK'):'nie testowano';
    return `<div class="helper-hero"><div><div class="helper-name">🩺 Autodiagnostyka</div><div class="sub">Szybki podgląd stanu Pomagiera bez grzebania w logach.</div></div><div class="helper-actions"><button data-act="diagnostics-run">Uruchom test</button></div></div>
      <div class="cards mini">
        <div class="card"><div class="label">Android</div><div class="big">${esc(ANDROID_VERSION)}</div><div>build aplikacji</div></div>
        <div class="card"><div class="label">Userscript</div><div class="big">${esc(VERSION)}</div><div>aktywny skrypt</div></div>
        <div class="card"><div class="label">Brain</div><div class="big">${esc(BRAIN_VERSION)}</div><div>Python</div></div>
        <div class="card"><div class="label">Sesja gry</div><div class="big ${__mgSessionTemplate?'ok':'warn'}">${__mgSessionTemplate?'OK':'BRAK'}</div><div>ID ${Number(settings.characterId||0)||'—'}</div></div>
      </div>
      <div class="section"><div class="section-title">Stan techniczny</div>
        <div class="sub">localStorage: <b>${Math.round(st.bytes/1024)} KB</b> • klucze ${st.keys} • kompaktowania PvP: ${Number(__storageCompactions||0)}</div>
        <div class="sub">Ostatni błąd pamięci: ${quota}</div>
        <div class="sub">Szybki test API: <b class="${last.api?'ok':last.at?'bad':'muted'}">${apiTxt}</b>${last.at?` • ${new Date(last.at).toLocaleString('pl-PL')}`:''}${last.error?` • ${esc(last.error)}`:''}</div>
        <div class="sub">Napady: <b>${autoCfg.raidAutoEnabled?'ON':'OFF'}</b> • Alkohol: <b>${autoCfg.alcoholAutoEnabled?'ON':'OFF'}</b> • Główny Pomagier: <b>${autoCfg.enabled?'ON':'OFF'}</b></div>
      </div>`;
  }
  function actionHistoryHTML(){
    const rows=actionHistory.slice(-250).reverse().map(x=>`<tr><td>${new Date(Number(x.ts||Date.now())).toLocaleString('pl-PL')}</td><td>${esc(x.module)}</td><td class="left">${esc(x.action)}${x.detail?`<div class="sub">${esc(x.detail)}</div>`:''}</td><td class="${x.status==='OK'?'ok':x.status==='BŁĄD'?'bad':'warn'}">${esc(x.status)}</td></tr>`).join('');
    return `<div class="helper-hero"><div><div class="helper-name">📜 Historia działań Pomagiera</div><div class="sub">Co Pomagier zrobił, kiedy i z jakim wynikiem.</div></div><div class="helper-actions"><button data-act="action-history-clear">Wyczyść historię</button></div></div>
      <div class="section table-wrap"><table><thead><tr><th>Czas</th><th>Moduł</th><th class="left">Akcja</th><th>Wynik</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Brak zapisanych działań.</td></tr>'}</tbody></table></div>`;
  }

'''
s=s.replace(marker,block+marker,1)

# announcement finder and sender text logic
s=s.replace("        if(msg!=='napad') return false;", "        const wanted=`napad start za ${Number(raidAuto.startDelayMinutes||autoCfg.raidAutoStartDelayMinutes||30)} minut`;\n        if(msg!==wanted) return false;",1)
s=s.replace("        body:{message:'Napad'}", "        body:{message:`Napad start za ${Number(raidAuto.startDelayMinutes||autoCfg.raidAutoStartDelayMinutes||30)} minut`}",1)
s=s.replace("      if(!r?.success) throw new Error(String(r?.message||'Nie udało się wysłać ogłoszenia Napad'));", "      if(!r?.success) throw new Error(String(r?.message||'Nie udało się wysłać ogłoszenia o starcie napadu'));",1)

# add raid start helpers before raidAutoPlanNext
marker2="  async function raidAutoPlanNext(){\n"
raid_helpers=r'''  function raidAutoArmStart(planId){
    const delay=Math.max(1,Math.min(1440,Math.round(Number(autoCfg.raidAutoStartDelayMinutes||30))));
    raidAuto.startPlanId=Number(planId||0);
    raidAuto.startDelayMinutes=delay;
    raidAuto.startDueAt=Date.now()+delay*60000;
    raidAutoSave();
  }

  async function raidAutoStartPlan(plan){
    const planId=Number(plan?.id||0);
    if(!planId) throw new Error('Brak planId napadu do START-u');
    if(Number(raidAuto.lastStartedPlanId||0)===planId) return true;
    const participants=Array.isArray(plan?.participants)?plan.participants.length:0;
    const minPeople=Number(plan?.min_participants??plan?.minParticipants??0);
    if(minPeople>0 && participants<minPeople){
      raidAutoSetAction(`NAPADY: timer minął, ale brakuje graczy • ${participants}/${minPeople}`,{error:true});
      actionHistoryAdd('Napady','Automatyczny START','WSTRZYMANO',`plan #${planId} • gracze ${participants}/${minPeople}`);
      raidAuto.startDueAt=Date.now()+60000; raidAutoSave();
      return false;
    }
    raidAuto.startAttemptedAt=Date.now(); raidAutoSave();
    const r=await apiActive(`/api/gangs/${settings.characterId}/raid/start`,{method:'POST',body:{planId}});
    if(!r?.success) throw new Error(String(r?.message||`Nie udało się wystartować napadu #${planId}`));
    raidAuto.lastStartedPlanId=planId;
    raidAuto.startDueAt=0;
    raidAuto.startPlanId=0;
    raidAutoSetAction(`NAPADY: automatycznie wystartowano ${String(plan.location_name??plan.locationName??`plan #${planId}`)}`);
    actionHistoryAdd('Napady','Automatyczny START','OK',`plan #${planId}`);
    return true;
  }

'''
s=s.replace(marker2,raid_helpers+marker2,1)

# plan arm + action text
s=s.replace("    await raidAutoAnnouncePlan(planId);\n    raidAutoSetAction(`NAPADY: zaplanowano ${locationName} • wysłano 📢 Napad • czekam na RĘCZNY START`);", "    raidAutoArmStart(planId);\n    await raidAutoAnnouncePlan(planId);\n    raidAutoSetAction(`NAPADY: zaplanowano ${locationName} • ogłoszono start za ${raidAuto.startDelayMinutes} min • timer działa`);\n    actionHistoryAdd('Napady','Zaplanowano napad','OK',`${locationName} • start za ${raidAuto.startDelayMinutes} min`);",1)

# planning branch replacement
old="""        if(status==='planning'){
          // Nigdy nie wywołujemy endpointu START. Liderzy uruchamiają napad ręcznie.
          if(Number(raidAuto.lastPlannedPlanId||0)===planId && Number(raidAuto.lastAnnouncedPlanId||0)!==planId){
            await raidAutoAnnouncePlan(planId);
            raidAutoSetAction(`NAPADY: ${name} zaplanowany • odzyskano/wysłano ogłoszenie 📢 Napad • START ręczny`);
          }else{
            raidAutoSetAction(`NAPADY: ${name} czeka na ręczny START • ${participants}${minPeople?` / min. ${minPeople}`:''} osób`);
          }
          raidAuto.nextAt=Date.now()+Math.max(10,Number(autoCfg.raidAutoPollSeconds||15))*1000;
          raidAutoSave();
          return true;
        }
"""
new="""        if(status==='planning'){
          if(Number(raidAuto.startPlanId||0)!==planId || !Number(raidAuto.startDueAt||0)){
            raidAutoArmStart(planId);
          }
          if(Number(raidAuto.lastAnnouncedPlanId||0)!==planId){
            await raidAutoAnnouncePlan(planId);
          }
          const due=Number(raidAuto.startDueAt||0);
          if(due>0 && Date.now()>=due){
            await raidAutoStartPlan(plan);
            raidAuto.nextAt=Date.now()+3000;
            raidAutoSave();
            return true;
          }
          const sec=Math.max(0,Math.ceil((due-Date.now())/1000));
          raidAutoSetAction(`NAPADY: ${name} • START za ${Math.ceil(sec/60)} min • ${participants}${minPeople?` / min. ${minPeople}`:''} osób`);
          raidAuto.nextAt=Math.min(due||Infinity,Date.now()+Math.max(10,Number(autoCfg.raidAutoPollSeconds||15))*1000);
          raidAutoSave();
          return true;
        }
"""
if old not in s: raise SystemExit('planning block not found')
s=s.replace(old,new,1)

# when in progress clear pending timer
s=s.replace("        if(status==='in_progress' || status==='running' || status==='active'){\n", "        if(status==='in_progress' || status==='running' || status==='active'){\n          if(Number(raidAuto.startPlanId||0)===planId){ raidAuto.startPlanId=0; raidAuto.startDueAt=0; raidAutoSave(); }\n",1)

# raid UI strings & timer control
s=s.replace("            <small>Pomagier planuje napad, wysyła „Napad” na czat jako powiadomienie, ale <b>NIGDY nie uruchamia START-u</b>.</small>", "            <small>Pomagier planuje napad, wysyła jedno ogłoszenie z czasem i po odliczeniu sam uruchamia START, jeřli plan i liczba graczy nadal się zgadzają.</small>",1)
s=s.replace("          <label>Sprawdzanie stanu co (s)<input data-auto=\"raidAutoPollSeconds\" type=\"number\" min=\"10\" max=\"300\" value=\"${Number(autoCfg.raidAutoPollSeconds||15)}\"></label>", "          <label>Start napadu za (min)<select data-auto=\"raidAutoStartDelayMinutes\"><option value=\"30\" ${Number(autoCfg.raidAutoStartDelayMinutes)===30?'selected':''}>30 minut</option><option value=\"60\" ${Number(autoCfg.raidAutoStartDelayMinutes)===60?'selected':''}>60 minut</option><option value=\"90\" ${Number(autoCfg.raidAutoStartDelayMinutes)===90?'selected':''}>90 minut</option><option value=\"15\" ${Number(autoCfg.raidAutoStartDelayMinutes)===15?'selected':''}>15 minut</option><option value=\"120\" ${Number(autoCfg.raidAutoStartDelayMinutes)===120?'selected':''}>120 minut</option></select></label>\n          <label>Sprawdzanie stanu co (s)<input data-auto=\"raidAutoPollSeconds\" type=\"number\" min=\"10\" max=\"300\" value=\"${Number(autoCfg.raidAutoPollSeconds||15)}\"></label>",1)
s=s.replace("<div>${p?'START tylko ręczny':`kandydat: ${esc(nextName)}`}</div>", "<div>${p?(raidAuto.startDueAt?`AUTO START: ${new Date(raidAuto.startDueAt).toLocaleTimeString('pl-PL')}`:'timer nieuzbrojony'):`kandydat: ${esc(nextName)}`}</div>",1)
s=s.replace("<b>Automatyczny przebieg:</b> brak planu → zaplanuj dozwolony napad → <b>POST chat/announce „Napad”</b> (wiadomość na czacie + powiadomienie) → czekaj na ręczny START lidera → obserwuj czas → po zakończeniu odbierz/zamknij wynik → zaplanuj kolejny → ponownie ogłoś „Napad”.", "<b>Automatyczny przebieg:</b> brak planu → zaplanuj dozwolony napad → <b>jedno ogłoszenie „Napad start za X minut”</b> → odliczanie → ponowna kontrola planu i uczestników → automatyczny START → obserwuj czas → odbierz wynik → zaplanuj kolejny.",1)

# raid snapshot extra fields
s=s.replace("config:{enabled:!!autoCfg.raidAutoEnabled,pollSeconds:Number(autoCfg.raidAutoPollSeconds||15),excludedLocationIds:[20,21,22]}", "config:{enabled:!!autoCfg.raidAutoEnabled,pollSeconds:Number(autoCfg.raidAutoPollSeconds||15),startDelayMinutes:Number(autoCfg.raidAutoStartDelayMinutes||30),excludedLocationIds:[20,21,22]}",1)
s=s.replace("lastCycleAt:Number(raidAuto.lastCycleAt||0)}", "lastCycleAt:Number(raidAuto.lastCycleAt||0),startPlanId:Number(raidAuto.startPlanId||0),startDueAt:Number(raidAuto.startDueAt||0),lastStartedPlanId:Number(raidAuto.lastStartedPlanId||0)}",1)

# add PVP advisor before pvpLabHTML
marker3="  function pvpLabHTML(){\n"
advisor=r'''  function pvpAdvisorSummary(){
    const rows=pvpLab.battles.filter(b=>['prestige','normal'].includes(b.source) && typeof b.won==='boolean' && b.detailLoaded && b.eventSummary);
    const losses=rows.filter(b=>b.won===false), wins=rows.filter(b=>b.won===true);
    const agg=arr=>{
      const o={n:arr.length,attacks:0,hits:0,misses:0,enemyAttacks:0,enemyHits:0,evades:0,crits:0,enemyCrits:0,damageDealt:0,damageTaken:0,doubles:0,enemyDoubles:0,counters:0,enemyCounters:0,bleedDamageDealt:0,bleedDamageTaken:0,stunsGiven:0,stunsTaken:0};
      for(const b of arr){ for(const k of Object.keys(o)){ if(k!=='n') o[k]+=Number(b.eventSummary?.[k]||0); } }
      o.hitRate=o.attacks?100*o.hits/o.attacks:null; o.evadeRate=o.enemyAttacks?100*o.evades/o.enemyAttacks:null; o.critRate=o.hits?100*o.crits/o.hits:null; return o;
    };
    const L=agg(losses), W=agg(wins), notes=[];
    if(!losses.length) return {rows:rows.length,losses:0,wins:wins.length,notes:[rows.length?'Brak porażek z pełnym replayem — za mało danych, by wskazać słaby punkt.':'Brak pełnych replayów REAL PvP. Uruchom synchronizację.'],L,W};
    if(L.hitRate!=null && (L.hitRate<72 || (W.hitRate!=null && L.hitRate+8<W.hitRate))) notes.push(`Celność w porażkach jest niska: ${L.hitRate.toFixed(1)}% trafień. Najczęściej tracisz tury na pudła/uniki przeciwnika.`);
    if(L.evadeRate!=null && L.evadeRate<12 && (W.evadeRate==null || L.evadeRate+6<W.evadeRate)) notes.push(`Za mało unikasz w przegranych: ${L.evadeRate.toFixed(1)}% wrogich ataków unikniętych. Obrona/evasion nie zatrzymuje presji.`);
    if(L.damageTaken>L.damageDealt*1.15) notes.push(`Bilans obrażeń w porażkach jest wyraźnie ujemny: zadajesz ${Math.round(L.damageDealt/L.n)} vs przyjmujesz ${Math.round(L.damageTaken/L.n)} średnio na walkę.`);
    if(L.enemyCrits>L.crits*1.35) notes.push(`Przeciwnicy mają przewagę krytyków w porażkach: ${L.enemyCrits} do ${L.crits}.`);
    if(L.enemyDoubles>L.doubles*1.35) notes.push(`Przeciwnicy częściej odpalają double strike: ${L.enemyDoubles} do ${L.doubles}.`);
    if(L.enemyCounters>L.counters*1.35) notes.push(`Przeciwnicy częściej korzystają z kontr: ${L.enemyCounters} do ${L.counters}.`);
    if(L.bleedDamageTaken>L.bleedDamageDealt*1.25 && L.bleedDamageTaken>0) notes.push(`Krwawienie działa przeciw Tobie mocniej: ${Math.round(L.bleedDamageTaken)} dmg przyjęte vs ${Math.round(L.bleedDamageDealt)} zadane.`);
    if(!notes.length) notes.push('Nie ma jednego dominującego problemu. Porażki są mieszane — zbieraj dalej replaye, a doradca zawęzi przyczynę.');
    return {rows:rows.length,losses:losses.length,wins:wins.length,notes:notes.slice(0,5),L,W};
  }

'''
s=s.replace(marker3,advisor+marker3,1)

# inject advisor in pvp HTML after hero/cards maybe before BEST BUILD section
needle="      <div class=\"cards mini\">${statCard('Prestiż • WAGA 1',sum.by.prestige)}${statCard('Ataki + obrony • WAGA 1',sum.by.normal)}${statCard('Arena • WAGA 0',sum.by.arena)}${statCard('Arena TEST • WAGA 0',sum.by.arena_test)}</div>\n"
replace=needle+"      ${(()=>{const a=pvpAdvisorSummary();return `<div class=\"section pvp-best\"><div class=\"section-title\">🧭 Doradca PvP — przyczyny porażek</div><div class=\"sub\">Analiza ${a.rows} pełnych replayów REAL PvP • ${a.wins} wygranych / ${a.losses} porażek.</div><div style=\"margin-top:8px\">${a.notes.map((n,i)=>`<div class=\"note\" style=\"margin-top:${i?6:0}px\"><b>${i+1}.</b> ${esc(n)}</div>`).join('')}</div></div>`;})()}\n"
if needle not in s: raise SystemExit('pvp inject needle missing')
s=s.replace(needle,replace,1)

# router tabs and render
s=s.replace("if (state.activeTab==='history') html = historyHTML();", "if (state.activeTab==='history') html = historyHTML();\n      if (state.activeTab==='actions') html = actionHistoryHTML();\n      if (state.activeTab==='diagnostics') html = diagnosticsHTML();",1)
s=s.replace("['sessions','Sesje'],['history','Historia cen'],['settings','Ustawienia']", "['sessions','Sesje'],['actions','📜 Dziennik'],['diagnostics','🩺 Diagnostyka'],['history','Historia cen'],['settings','Ustawienia']",1)

# click actions
needle_click="    if(act==='ui-recover-main'){ state.activeTab='autopilot'; safeLocalStorageSet(K.tab,state.activeTab); render(); return; }\n"
add_click=needle_click+"    if(act==='diagnostics-run'){ await diagnosticsRun(); render(); return; }\n    if(act==='action-history-clear'){ if(confirm('Wyczyścić historię działań Pomagiera?')){ actionHistory=[]; actionHistorySave(); render(); } return; }\n"
s=s.replace(needle_click,add_click,1)

# auto config change should reset timer when start delay changed; select values become strings currently, but raid helper Number handles it.
s=s.replace("if(k==='raidAutoEnabled' || k==='raidAutoPollSeconds'){", "if(k==='raidAutoEnabled' || k==='raidAutoPollSeconds' || k==='raidAutoStartDelayMinutes'){",1)
s=s.replace("        if(k==='raidAutoEnabled') raidAuto.lastAction=autoCfg.raidAutoEnabled?'NAPADY: automat włączony • sprawdzam stan':'NAPADY: automat wyłączony';", "        if(k==='raidAutoEnabled') raidAuto.lastAction=autoCfg.raidAutoEnabled?'NAPADY: automat włączony • sprawdzam stan':'NAPADY: automat wyłączony';\n        if(k==='raidAutoStartDelayMinutes' && raidAuto.lastStatus==='planning' && raidAuto.lastPlanId){ raidAuto.lastAction='NAPADY: nowy czas obowiązuje od następnego planu'; }",1)

# Hook history in autoLogMsg
s=s.replace("    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[MG AUTO]', row.msg, extra || '');", "    actionHistoryAdd('Pomagier',row.msg,level==='error'?'BŁĄD':level==='warn'?'UWAGA':'OK',extra?String(typeof extra==='string'?extra:JSON.stringify(extra)).slice(0,300):'');\n    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[MG AUTO]', row.msg, extra || '');",1)
# raid actions history lightweight
s=s.replace("    raidAutoSave();\n  }\n\n  async function raidAutoAnnouncementAlreadyExists", "    raidAutoSave();\n    actionHistoryAdd('Napady',raidAuto.lastAction,error?'BŁĄD':'OK');\n  }\n\n  async function raidAutoAnnouncementAlreadyExists",1)

# Hook mutating api requests after success check, before return
needle_api="""    if (j && j.success === false) {
      throw new MgApiError(
        j.message || j.error || 'API success=false',
        {status:r.status,path,method}
      );
    }

    return j;
"""
repl_api="""    if (j && j.success === false) {
      throw new MgApiError(
        j.message || j.error || 'API success=false',
        {status:r.status,path,method}
      );
    }

    if(method!=='GET') actionHistoryAdd('API',`${method} ${String(path).replace(/\\d+/g,'#')}`,'OK',j?.message||'');
    return j;
"""
if needle_api not in s: raise SystemExit('api needle missing')
s=s.replace(needle_api,repl_api,1)

# settings footer versions
s=s.replace("<div class=\"sub\">Wersja ${VERSION} • katalog demontażu", "<div class=\"sub\">Android ${ANDROID_VERSION} • userscript ${VERSION} • Brain ${BRAIN_VERSION} • katalog demontażu",1)

p.write_text(s,encoding='utf-8')

# gradle version
bg=ROOT/'app/build.gradle.kts'
t=bg.read_text(encoding='utf-8').replace('versionCode = 10021','versionCode = 10022').replace('versionName = "1.0.21"','versionName = "1.0.22"')
bg.write_text(t,encoding='utf-8')

# readme minimal
rd=ROOT/'README.md'
r=rd.read_text(encoding='utf-8')
r=r.replace('1.0.21','1.0.22').replace('8.8.28','8.8.29')
r += '\n\n## v1.0.22 / userscript 8.8.29\n- Autodiagnostyka.\n- Historia działań Pomagiera.\n- Doradca PvP oparty o realne replaye.\n- Timer napadu 30/60/90 min (oraz 15/120), jedno ogłoszenie na czacie i automatyczny START po weryfikacji planu/uczestników.\n'
rd.write_text(r,encoding='utf-8')
print('patched',len(s))
