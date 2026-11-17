  // ============================================================
  // LIGA MENELI LAB v8.8.67 — oddzielny archiwum walk gangow (READ-ONLY)
  // ============================================================
  const LEAGUE_LAB_KEY='pomagier_league_meneli_lab_v1';
  let leagueLab=loadJSON(LEAGUE_LAB_KEY,null);
  if(!leagueLab || typeof leagueLab!=='object') leagueLab={};
  leagueLab.schema=1;
  leagueLab.characterId=Number(leagueLab.characterId||pvpLabOwnId()||0);
  leagueLab.startedAt=Number(leagueLab.startedAt||Date.now());
  leagueLab.lastCaptureAt=Number(leagueLab.lastCaptureAt||0);
  leagueLab.lastSyncAt=Number(leagueLab.lastSyncAt||0);
  leagueLab.scanUntil=Number(leagueLab.scanUntil||0);
  leagueLab.status=String(leagueLab.status||'CZEKAM NA DANE Z LIGI');
  leagueLab.matches=Array.isArray(leagueLab.matches)?leagueLab.matches:[];
  leagueLab.endpoints=leagueLab.endpoints&&typeof leagueLab.endpoints==='object'?leagueLab.endpoints:{};
  leagueLab.errors=Array.isArray(leagueLab.errors)?leagueLab.errors:[];
  leagueLab.syncing=false;

  function leagueLabAccountGuard(){
    const id=pvpLabOwnId();
    if(!id) return;
    if(leagueLab.characterId && leagueLab.characterId!==id){
      // Nie mieszaj danych pomiedzy kontami przy zmianie uzytkownika w tej samej WebView.
      leagueLab={schema:1,characterId:id,startedAt:Date.now(),lastCaptureAt:0,lastSyncAt:0,scanUntil:0,
        status:'NOWE KONTO — ODDZIELNY REJESTR',matches:[],endpoints:{},errors:[],syncing:false};
    }
    leagueLab.characterId=id;
  }
  function leagueLabSafePath(url){
    const u=pvpLabUrl(url);
    if(!u || u.origin!==location.origin || !u.pathname.startsWith('/api/')) return '';
    const qp=new URLSearchParams();
    for(const [k,v] of u.searchParams.entries()){
      if(/^(?:season|seasonId|week|weekId|round|roundId|page|limit|offset|tab|year|day|date|status)$/i.test(k)) qp.append(k,String(v).slice(0,80));
    }
    return u.pathname+(qp.toString()?'?'+qp.toString():'');
  }
  function leagueLabPathMatches(url){
    const p=leagueLabSafePath(url).split('?')[0].toLowerCase();
    if(!p) return false;
    // Nazwy API ligi nie sa z gory zakladane jako jeden konkretny endpoint.
    if(/(?:^|\/|[-_])(?:league|leagues|liga|ligameneli|gangleague|gangliga|gang-war|gangwar)(?:\/|$|[-_])/.test(p)) return true;
    if(/^\/api\/gangs\//.test(p) && /\/(?:season|seasons|standings|fixtures|matchups|league-matches|league-results|match-results)(?:\/|$)/.test(p)) return true;
    return false;
  }
  function leagueLabShapeMatches(data){
    if(!data || typeof data!=='object') return false;
    const keys=['league','leagueData','leagueMatches','leagueResults','leagueSeason','leagueSchedule','leagueRanking',
      'leagueStandings','leagueTable','gangLeague','gangLeagueMatches','leagueFixtures','leagueArchive'];
    const has=x=>!!(x&&typeof x==='object'&&keys.some(k=>Object.prototype.hasOwnProperty.call(x,k)));
    if(has(data)||has(data.data)||has(data.result)) return true;
    const tag=String(data.type||data.category||data.eventType||data.name||data.data?.name||'');
    return /(?:liga meneli|gang.?(?:league|liga))|(?:meneli league)/i.test(tag);
  }
  function leagueLabPageVisible(){
    try{
      const root=document.querySelector('#root')||document.querySelector('#app')||document.querySelector('[data-reactroot]');
      const visible=String(root?.innerText||root?.textContent||'').slice(0,120000);
      return /(?:Gang\s*[-–]\s*)?Liga Meneli/i.test(visible);
    }catch(_){return false;}
  }
  function leagueLabSanitize(x,depth=0){
    if(x==null||typeof x==='boolean'||typeof x==='number') return x;
    if(typeof x==='string') return x.slice(0,700);
    if(depth>8) return '[MAX_DEPTH]';
    if(Array.isArray(x)) return x.slice(0,120).map(a=>leagueLabSanitize(a,depth+1));
    if(typeof x!=='object') return null;
    const r={};
    for(const [k,v] of Object.entries(x).slice(0,100)){
      if(/(?:token|authorization|cookie|password|secret|credential|sessionkey|apikey|refresh|csrf|jwt|email|phone|address)/i.test(k)) continue;
      r[k]=leagueLabSanitize(v,depth+1);
    }
    return r;
  }
  function leagueLabReadKey(o,keys){
    if(!o||typeof o!=='object') return undefined;
    for(const k of keys) if(o[k]!==undefined&&o[k]!==null) return o[k];
    return undefined;
  }
  function leagueLabTeamName(v){
    if(typeof v==='string') return v.trim().slice(0,100);
    if(v&&typeof v==='object'){
      const x=leagueLabReadKey(v,['gangName','name','teamName','clanName','title','nickname','tag']);
      return typeof x==='string'?x.trim().slice(0,100):'';
    }
    return '';
  }
  function leagueLabNumber(v){
    if(v==null||v===''||typeof v==='boolean') return null;
    const n=Number(v);return Number.isFinite(n)?n:null;
  }
  function leagueLabNormalizeMatches(value,source){
    const out=[],seen=new Set();let examined=0;
    const visit=(node,ctx={},depth=0)=>{
      if(depth>7 || examined>1600 || !node || typeof node!=='object') return;
      examined++;
      if(Array.isArray(node)){for(const x of node.slice(0,240)) visit(x,ctx,depth+1);return;}
      const season=String(leagueLabReadKey(node,['seasonId','season','seasonName'])||ctx.season||'').slice(0,70);
      const week=String(leagueLabReadKey(node,['week','weekNo','weekNumber','round','roundNumber'])||ctx.week||'').slice(0,30);
      const home=leagueLabTeamName(leagueLabReadKey(node,['homeGang','homeGangName','homeTeam','home','gangA','gang1','teamA','team1','leftGang','attackerGang','firstGang']));
      const away=leagueLabTeamName(leagueLabReadKey(node,['awayGang','awayGangName','awayTeam','away','gangB','gang2','teamB','team2','rightGang','defenderGang','secondGang']));
      const resultHome=leagueLabNumber(leagueLabReadKey(node,['homeXpChange','homeXp','homeXP','homeChange','gangAXp','gang1Xp','team1Xp','leftXp','xpA','homeScore']));
      const resultAway=leagueLabNumber(leagueLabReadKey(node,['awayXpChange','awayXp','awayXP','awayChange','gangBXp','gang2Xp','team2Xp','rightXp','xpB','awayScore']));
      const date=String(leagueLabReadKey(node,['playedAt','finishedAt','matchDate','scheduledAt','date','startTime','endedAt'])||'').slice(0,70);
      const state=String(leagueLabReadKey(node,['status','state','resultStatus'])||'').slice(0,45);
      const winnerValue=leagueLabReadKey(node,['winnerGang','winnerGangName','winnerTeam','winner','winningGang']);
      const winner=leagueLabTeamName(winnerValue)||(typeof winnerValue==='number'?String(winnerValue):'');
      const matchId=leagueLabReadKey(node,['matchId','leagueMatchId','fixtureId','id']);
      if(home && away && home!==away && (resultHome!==null||resultAway!==null||date||state||winner||matchId!=null)){
        const key=(matchId!=null&&String(matchId)!=='')?'id:'+season+':'+String(matchId).slice(0,70):
          'names:'+season+':'+week+':'+date+':'+home.toLowerCase()+':'+away.toLowerCase();
        if(!seen.has(key)){
          seen.add(key);
          out.push({key,season,week,date,home,away,homeXp:resultHome,awayXp:resultAway,
            winner,status:state,source:String(source||'').slice(0,220),lastSeenAt:Date.now()});
        }
      }
      for(const [k,v] of Object.entries(node)){
        if(!v||typeof v!=='object') continue;
        if(/(?:token|auth|cookie|password|secret|profile|inventory|equipment|market|shop|skill)/i.test(k)) continue;
        if(Array.isArray(v)||/^(?:data|result|matches|results|fixtures|games|battles|rounds|weeks|today|schedule|calendar|archive|history|league|leagueMatches|leagueResults|matchups)$/i.test(k)){
          visit(v,{season,week},depth+1);
        }
      }
    };
    visit(value);
    return out.slice(0,500);
  }
  function leagueLabSave(){
    leagueLabAccountGuard();
    if(leagueLab.matches.length>1000) leagueLab.matches=leagueLab.matches.slice(-1000);
    if(leagueLab.errors.length>20) leagueLab.errors=leagueLab.errors.slice(-20);
    const e=Object.entries(leagueLab.endpoints).sort((a,b)=>Number(b[1]?.lastAt||0)-Number(a[1]?.lastAt||0)).slice(0,25);
    leagueLab.endpoints=Object.fromEntries(e);
    const busy=!!leagueLab.syncing; leagueLab.syncing=false;
    try{saveJSON(LEAGUE_LAB_KEY,leagueLab);}finally{leagueLab.syncing=busy;}
  }
  function leagueLabCapture(url,data,meta={}){
    leagueLabAccountGuard();
    const path=leagueLabSafePath(url);
    if(!path || data==null || data?.success===false) return false;
    // Przechwytywanie tylko ligi; inne PvP, ekonomia, magazyn i dane konta pozostaja osobne.
    const method=String(meta.method||'GET').toUpperCase();
    const contextScan=Number(leagueLab.scanUntil||0)>Date.now() && method==='GET' &&
      /^\/api\/gangs\//.test(path) && leagueLabPageVisible() &&
      !/\/(?:treasury|company|payout|inventory|storage|settings|members|chat|messages|permissions)(?:\/|$)/i.test(path);
    if(!leagueLabPathMatches(url) && !leagueLabShapeMatches(data) && !contextScan) return false;
    const key=method+' '+path;
    const prev=leagueLab.endpoints[key]||{};
    const clean=leagueLabSanitize(data);
    const raw=JSON.stringify(clean);
    const matchRows=leagueLabNormalizeMatches(data,path);
    for(const m of matchRows){
      const index=leagueLab.matches.findIndex(x=>x.key===m.key);
      if(index>=0) leagueLab.matches[index]={...leagueLab.matches[index],...m};
      else leagueLab.matches.push(m);
    }
    leagueLab.endpoints[key]={method,path,firstAt:Number(prev.firstAt||Date.now()),lastAt:Date.now(),
      count:Number(prev.count||0)+1,source:String(meta.source||'native'),
      keys:Object.keys(clean&&typeof clean==='object'?clean:{}).slice(0,70),
      bytes:raw.length,truncated:raw.length>20000,
      // Bez danych uwierzytelniajacych. Zachowuj skrocony payload dla poznania prawdziwego schematu API.
      sample:raw.length>20000?{truncated:true,bytes:raw.length,keys:Object.keys(clean||{}).slice(0,70)}:clean};
    leagueLab.lastCaptureAt=Date.now();
    leagueLab.status='ZEBRANO • '+leagueLab.matches.length+' meczow • '+Object.keys(leagueLab.endpoints).length+' endpointow';
    leagueLabSave();
    return true;
  }
  async function leagueLabSync({silent=false}={}){
    if(leagueLab.syncing) return;
    leagueLabAccountGuard();
    if(!__mgSessionTemplate) tryHydrateSessionFromGameAuth();
    if(!__mgSessionTemplate){leagueLab.status='CZEKA NA SESJE GRY';leagueLabSave();if(!silent) alert('Liga: otworz gre i zaloguj sie.');return;}
    const paths=Object.values(leagueLab.endpoints).filter(x=>x?.method==='GET' && leagueLabPathMatches(x.path))
      .sort((a,b)=>Number(b.lastAt||0)-Number(a.lastAt||0))
      .map(x=>x.path).filter((x,i,a)=>a.indexOf(x)===i).slice(0,12);
    if(!paths.length){leagueLab.status='BRAK POZNANYCH ENDPOINTOW — WLACZ SKAN I OTWORZ LIGE W GRZE';leagueLabSave();if(!silent) alert('Wlacz skan Ligi i otworz zakladki Dzis, Terminarz, Ranking oraz Archiwum w grze.');try{render();}catch{}return;}
    leagueLab.syncing=true;let ok=0,failed=0;
    try{
      for(const path of paths){
        try{const result=await apiActive(path);if(result && leagueLabCapture(path,result,{method:'GET',source:'league-readonly-sync'})) ok++;}
        catch(e){failed++;leagueLab.errors.push({at:Date.now(),path,error:String(e?.message||e).slice(0,180)});
          if(Number(e?.status||0)===401||Number(e?.status||0)===403) break;}
        await sleep(120);
      }
      leagueLab.lastSyncAt=Date.now();leagueLab.status='SYNCHRONIZACJA GET '+ok+'/'+paths.length+(failed?' • bledy '+failed:'');
    }finally{leagueLab.syncing=false;leagueLabSave();try{render();}catch{}}
  }
  function leagueLabStart(){
    leagueLabAccountGuard();leagueLab.scanUntil=Date.now()+10*60*1000;
    leagueLab.status='NASLUCH 10 MIN — WEJDZ DO GANG -> LIGA MENELI';leagueLabSave();render();
  }
  function leagueLabStop(){leagueLab.scanUntil=0;leagueLab.status='NASLUCH ZATRZYMANY';leagueLabSave();render();}
  function leagueLabClear(){
    if(!confirm('Usunac lokalna historie Ligi Meneli? Nie zmienia danych w grze.')) return;
    leagueLab={schema:1,characterId:pvpLabOwnId(),startedAt:Date.now(),lastCaptureAt:0,lastSyncAt:0,scanUntil:0,
      status:'WYCZYSZCZONO',matches:[],endpoints:{},errors:[],syncing:false};leagueLabSave();render();
  }
  async function leagueLabExport(){
    leagueLabAccountGuard();
    const out={type:'liga-meneli-lab',schema:1,exportedAt:nowIso(),androidVersion:ANDROID_VERSION,
      userscriptVersion:VERSION,characterId:leagueLab.characterId,readOnly:true,
      separateFromPvp1v1:true,lab:{...leagueLab,syncing:false}};
    const raw=JSON.stringify(out,null,2);
    const fileName='pomagier_liga_meneli_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    try{
      const native=await pomagierSaveJsonNative(fileName,raw);
      if(!native) pomagierBrowserDownload(fileName,raw);
      leagueLab.status=(native?'ZAPISANO W POBRANE/PomagierByDon: ':'EKSPORT: ')+fileName;
    }catch(e){leagueLab.status='BLAD EKSPORTU: '+String(e?.message||e);}
    leagueLabSave();try{render();}catch{}
  }
  function leagueLabHTML(){
    const rows=leagueLab.matches.slice().sort((a,b)=>Number(b.lastSeenAt||0)-Number(a.lastSeenAt||0)).slice(0,90)
      .map(m=>`<tr><td>${esc(m.date||m.week||'—')}</td><td class="left">${esc(m.home)}<br><span class="sub">vs ${esc(m.away)}</span></td><td>${m.homeXp==null?'—':(m.homeXp>0?'+':'')+m.homeXp}</td><td>${m.awayXp==null?'—':(m.awayXp>0?'+':'')+m.awayXp}</td><td>${esc(m.winner||m.status||'—')}</td></tr>`).join('');
    const eps=Object.values(leagueLab.endpoints).slice().sort((a,b)=>Number(b.lastAt||0)-Number(a.lastAt||0));
    const epsRows=eps.map(e=>`<tr><td>${esc(e.method||'GET')}</td><td class="left">${esc(e.path||'—')}</td><td>${e.count||0}</td><td>${e.bytes||0}</td></tr>`).join('');
    const scanLeft=Math.max(0,Math.ceil((Number(leagueLab.scanUntil||0)-Date.now())/60000));
    return `<div class="helper-hero"><div><div class="helper-name">🏆 Liga Meneli — rejestr walk gangów</div>
      <div class="sub">Wyniki, XP, terminarz i archiwum. <b>Oddzielny od PvP 1 na 1.</b> Żadnych automatycznych walk, zakupów ani POST.</div></div></div>
      <div class="section"><div class="section-title">Stan zbierania danych</div><b>${esc(leagueLab.status)}</b>
      <div class="sub">Zapisanych meczów: ${leagueLab.matches.length} • źródeł API: ${eps.length} • ostatni zapis: ${leagueLab.lastCaptureAt?new Date(leagueLab.lastCaptureAt).toLocaleString('pl-PL'):'brak'} ${scanLeft?'• nasłuch '+scanLeft+' min':''}</div>
      <div class="helper-actions" style="margin-top:10px">${scanLeft?'<button data-act="league-stop">■ Zatrzymaj skan</button>':'<button data-act="league-start">▶ Skanuj Ligę (10 min)</button>'}
      <button data-act="league-sync">↻ Synchronizuj znane GET</button><button data-act="league-export">Eksport Liga JSON</button><button data-act="league-clear">Wyczyść</button></div>
      <div class="note" style="margin-top:10px">Pierwszy raz: uruchom skan, przejdź w grze do <b>Gang → Liga Meneli</b> i otwórz kolejno <b>Dziś, Terminarz, Ranking, Archiwum</b> oraz szczegóły wybranej potyczki. Pomagier rozpoznaje rzeczywiste endpointy gry i zapamiętuje je. W przyszłości znane odczyty GET mogą być ponawiane automatycznie. Jeśli serwer przesyła inne pola niż oczekiwane, eksport zachowa bezpieczną próbkę do rozszerzenia parsera.</div></div>
      <div class="section table-wrap"><div class="section-title">Zebrane mecze (${leagueLab.matches.length})</div><table><thead><tr><th>Data / kolejka</th><th>Gangi</th><th>XP 1</th><th>XP 2</th><th>Zwycięzca / status</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Brak rozpoznanych meczów. Otwórz ekran ligi w grze, następnie wykonaj eksport JSON.</td></tr>'}</tbody></table></div>
      <div class="section table-wrap"><div class="section-title">Rozpoznane źródła danych API</div><table><thead><tr><th>Metoda</th><th>Ścieżka</th><th>Liczba</th><th>Rozmiar</th></tr></thead><tbody>${epsRows||'<tr><td colspan="4">Brak danych — uruchom skan i przejdź do Ligi Meneli.</td></tr>'}</tbody></table></div>
      <div class="section note">Liga to rozgrywki gangów: jej XP, wyniki i statystyki nie zmieniają rankingu walk o prestiż ani optymalizatora indywidualnego PvP. Uwierzytelnianie gry pozostaje tylko w RAM i nie trafia do eksportu.</div>`;
  }
