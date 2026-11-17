  // ============================================================
  // DIAGNOSTYKA PROFILU PRZECIWNIKA — v8.8.70, GET only.
  // Zapis wyłącznie nazw pól i ścieżek API; żadnych treści, ciasteczek,
  // nagłówków, parametrów query, tokenów, czatu czy prywatnych wiadomości.
  // ============================================================
  function opponentLabDiagState(){
    if(!opponentLab.diag || typeof opponentLab.diag!=='object')
      opponentLab.diag={scanUntil:0,startedAt:0,stoppedAt:0,paths:{},hits:0};
    if(!opponentLab.diag.paths || typeof opponentLab.diag.paths!=='object') opponentLab.diag.paths={};
    return opponentLab.diag;
  }
  function opponentLabDiagActive(){return Number(opponentLabDiagState().scanUntil||0)>Date.now();}
  function opponentLabDiagStart(){
    const d=opponentLabDiagState();
    d.startedAt=Date.now();d.stoppedAt=0;d.scanUntil=Date.now()+5*60*1000;
    d.paths={};d.hits=0;
    opponentLabSave();
    render();
  }
  function opponentLabDiagStop(){
    const d=opponentLabDiagState(); d.scanUntil=0;d.stoppedAt=Date.now();
    opponentLabSave();render();
  }
  function opponentLabDiagShape(data){
    if(!data || typeof data!=='object' || Array.isArray(data)) return {keys:[],nested:[]};
    const keys=Object.keys(data).slice(0,25).map(s=>String(s).slice(0,60));
    const nested=[];
    for(const k of keys.slice(0,12)){
      const val=data[k];
      if(val && typeof val==='object' && !Array.isArray(val))
        nested.push({field:k,keys:Object.keys(val).slice(0,14).map(s=>String(s).slice(0,60))});
      else if(Array.isArray(val)) nested.push({field:k,kind:'array',size:val.length});
    }
    return {keys,nested};
  }
  function opponentLabDiagCapture(url,method='GET',status=200,data=null,source='native'){
    try{
      if(!opponentLabDiagActive() || String(method).toUpperCase()!=='GET') return;
      const u=pvpLabUrl(url);
      if(!u || u.origin!==location.origin || !u.pathname.startsWith('/api/')) return;
      if(/\/(?:auth|login|tokens?|session|messages?|mail|chat|password|password-reset|inbox|notifications?|payments?|billing)(?:\/|$)/i.test(u.pathname)) return;
      const diag=opponentLabDiagState();
      const path=u.pathname.slice(0,160).replace(/\d{2,}/g,':id');
      if(Object.keys(diag.paths).length>=80 && !diag.paths[path]) return;
      const now=Date.now();
      const prev=diag.paths[path]||{};
      const sh=opponentLabDiagShape(data);
      const sel=opponentLabAggregate().find(x=>x.key===opponentLab.selectedKey);
      const opponentId=Number(sel?.id||0);
      const matchesSelected=opponentId>0 && u.pathname.split('/').some(seg=>Number(seg)===opponentId);
      diag.paths[path]={method:'GET',count:Number(prev.count||0)+1,status:Number(status||0),source:String(source).slice(0,30),
        lastAt:now,keys:sh.keys.length?sh.keys:(prev.keys||[]),nested:sh.nested.length?sh.nested:(prev.nested||[]),
        selectedIdInPath:!!(matchesSelected||prev.selectedIdInPath)};
      diag.hits++;
      if(diag.hits%4===1 || (now-Number(diag.lastSavedAt||0)>2500)){
        diag.lastSavedAt=now;opponentLabSave();
      }
      // Jeżeli gra jawnie przekazuje identyfikator przeciwnika razem z
      // kompletnymi statystykami, rozpoznaj go również na nieznanej trasie.
      // NIE wyliczaj atrybutów z samego HP ani z ID właściciela konta.
      const walk=(node,depth=0)=>{
        if(depth>3 || !node || typeof node!=='object' || Array.isArray(node)) return;
        const id=Number(node.id??node.characterId??node.character_id??node.playerId??node.userId??0);
        if(id>0 && opponentLabKnownId(id) && (opponentLabAttrs(node)||opponentLabCode(node))){
          opponentLabUpsertProfile(id,node,'diag:'+path);
        }
        for(const k of ['data','result','profile','character','player','opponent','pvp','stats','summary']){
          if(node[k] && typeof node[k]==='object' && !Array.isArray(node[k])) walk(node[k],depth+1);
        }
      };
      walk(data);
    }catch(e){console.warn('[MG Opponent Lab] diag',e);}
  }