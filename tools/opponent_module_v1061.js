  // ============================================================
  // ANALIZATOR PRZECIWNIKOW PvP — v8.8.68 (tylko odczyt)
  // Nie dopowiada STR/END/AGI/VIT/PRC z samych obrazen.
  // ============================================================
  const OPPONENT_LAB_KEY='pomagier_pvp_opponents_v1';
  let opponentLab=loadJSON(OPPONENT_LAB_KEY,null);
  if(!opponentLab || typeof opponentLab!=='object') opponentLab={};
  opponentLab.schema=1;
  opponentLab.characterId=Number(opponentLab.characterId||pvpLabOwnId()||0);
  opponentLab.profiles=opponentLab.profiles && typeof opponentLab.profiles==='object' && !Array.isArray(opponentLab.profiles)?opponentLab.profiles:{};
  opponentLab.selectedKey=String(opponentLab.selectedKey||'');
  opponentLab.filter=String(opponentLab.filter||'').slice(0,60);
  opponentLab.lastCapturedAt=Number(opponentLab.lastCapturedAt||0);

  function opponentLabGuard(){
    const id=pvpLabOwnId();
    if(!id) return;
    if(opponentLab.characterId && opponentLab.characterId!==id){
      opponentLab={schema:1,characterId:id,profiles:{},selectedKey:'',filter:'',lastCapturedAt:0};
    }
    opponentLab.characterId=id;
  }
  function opponentLabSave(){
    opponentLabGuard();
    const entries=Object.entries(opponentLab.profiles||{}).sort((a,b)=>Number(b[1]?.capturedAt||0)-Number(a[1]?.capturedAt||0)).slice(0,250);
    opponentLab.profiles=Object.fromEntries(entries);
    saveJSON(OPPONENT_LAB_KEY,opponentLab);
  }
  function opponentLabKey(id,name=''){
    const n=Number(id||0);
    if(Number.isSafeInteger(n) && n>0 && n!==pvpLabOwnId()) return 'id:'+n;
    const nick=String(name||'').trim().toLowerCase().replace(/\s+/g,' ').slice(0,80);
    return nick && nick!=='?' && nick!=='unknown'?'name:'+nick:'';
  }
  function opponentLabCode(raw){
    const t=typeof raw==='string'?raw:String(raw?.build ?? raw?.buildCode ?? raw?.pvpBuild ?? '');
    const m=t.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})(?::([AB]{0,10}\/[AB]{0,10}\/[AB]{0,10}\/[AB]{0,10}\/[AB]{0,10}))?$/i);
    if(!m) return '';
    const pts=m.slice(1,6).map(Number);
    return pts.some(x=>x>50)?'':pts.join('/')+(m[6]?':'+m[6].toUpperCase():'');
  }
  function opponentLabAttrs(raw){
    if(!raw || typeof raw!=='object') return null;
    const attr=raw?.attributes || raw?.pvpAttributes || raw;
    if(!attr || typeof attr!=='object') return null;
    const out={};
    for(const [k,keys] of Object.entries({str:['str'],end:['end','endurance'],agi:['agi'],vit:['vit'],prc:['prc']})){
      const key=keys.find(k=>Object.prototype.hasOwnProperty.call(attr,k));
      if(key==null) return null;
      const v=attr[key];
      const n=Number(v && typeof v==='object'?v.level:v);
      if(!Number.isInteger(n)||n<0||n>50) return null;
      out[k]=n;
    }
    // Brak niejawnego uzupełniania brakujących pól zerami.
    return out;
  }
  function opponentLabProfilePath(url){
    const u=pvpLabUrl(url);
    if(!u || u.origin!==location.origin || !u.pathname.startsWith('/api/')) return null;
    const p=u.pathname;
    // Wyłącznie GET-y profilu/statystyk przeciwnika już otwierane przez grę.
    let m=p.match(/^\/api\/(?:characters?|players?|profiles?|users?)\/(\d+)(?:\/(?:profile|pvp|stats|attributes|build|summary))?\/?$/i);
    if(!m) m=p.match(/^\/api\/pvp\/(\d+)\/(?:summary|attributes|build|skill-tree\/(?:str|end|agi|vit|prc))$/i);
    if(!m) return null;
    const id=Number(m[1]);
    return Number.isSafeInteger(id)&&id>0&&id!==pvpLabOwnId()?{id,path:p}:null;
  }
  function opponentLabKnownId(id){
    const n=Number(id);
    if(!n || n===pvpLabOwnId()) return false;
    if(opponentLab.profiles['id:'+n]) return true;
    return (pvpLab.battles||[]).some(b=>Number(b.opponent?.id)===n) ||
      (pvpLab.opponentRolls||[]).some(r=>(r.opponents||[]).some(x=>Number(x.id)===n));
  }
  function opponentLabUpsertProfile(id,raw,source){
    opponentLabGuard();
    const k=opponentLabKey(id);if(!k || !raw || typeof raw!=='object') return false;
    const prev=opponentLab.profiles[k]||{};
    const attrs=opponentLabAttrs(raw) || opponentLabAttrs(raw?.pvp) || null;
    const code=opponentLabCode(raw) || opponentLabCode(raw?.pvp) || '';
    const nickname=String(raw.nickname||raw.name||raw.characterName||prev.nickname||'').slice(0,90);
    const skills=(Array.isArray(raw?.pvpSkills)?raw.pvpSkills:Array.isArray(raw?.chosenSkills)?raw.chosenSkills:[])
      .filter(x=>x && typeof x==='object' && ['str','end','agi','vit','prc'].includes(String(x.attribute||'').toLowerCase()) && ['A','B'].includes(String(x.option||'').toUpperCase()))
      .slice(0,50).map(x=>({attribute:String(x.attribute).toLowerCase(),tier:Number(x.tier)||null,option:String(x.option).toUpperCase(),name:String(x.name||'').slice(0,80)}));
    if(!attrs && !code && !skills.length) return false;
    const record={...prev,id:Number(id),nickname,source:String(source||'').slice(0,140),capturedAt:Date.now()};
    if(attrs) record.attributes=attrs;
    if(code) record.buildCode=code;
    if(skills.length) record.skills=skills;
    opponentLab.profiles[k]=record;
    opponentLab.lastCapturedAt=Date.now();
    opponentLabSave();
    return true;
  }
  function opponentLabObserveProfile(url,data,meta={}){
    try{
      if(String(meta.method||'GET').toUpperCase()!=='GET') return;
      const info=opponentLabProfilePath(url);
      if(!info || !opponentLabKnownId(info.id) || !data || typeof data!=='object' || data.success===false) return;
      const seen=new Set();
      const visit=(node,depth=0)=>{
        if(!node || typeof node!=='object' || seen.has(node) || depth>3) return;
        seen.add(node);
        const nodeId=node.id??node.characterId??node.character_id??node.playerId??node.userId;
        if(nodeId!=null && Number(nodeId)!==info.id) return;
        opponentLabUpsertProfile(info.id,node,info.path);
        for(const k of ['character','player','profile','opponent','pvp','data','result','summary','stats']){
          if(node[k] && typeof node[k]==='object' && !Array.isArray(node[k])) visit(node[k],depth+1);
        }
      };
      visit(data);
    }catch(e){ console.warn('[MG Analizator przeciwnikow] capture',e); }
  }
  function opponentLabObserveBattleFighter(f){
    if(!f || !opponentLabKnownId(f.id)) return;
    opponentLabUpsertProfile(f.id,f,'pvp-replay');
  }
  function opponentLabAggregate(){
    opponentLabGuard();
    const groups=new Map();
    for(const b of (pvpLab.battles||[])){
      const f=b?.opponent||{};
      const key=opponentLabKey(f.id,f.nickname);
      if(!key) continue; // Nie łącz różnych anonimowych wrogów w jedną postać.
      if(!groups.has(key)) groups.set(key,{key,id:Number(f.id||0),nickname:String(f.nickname||''),n:0,wins:0,losses:0,hps:[],regen:[],dealt:0,taken:0,enemyHits:0,enemyCrits:0,enemyDoubles:0,enemyCounters:0,enemyAttacks:0,evades:0,detailN:0,lastAt:0});
      const q=groups.get(key);
      q.n++;
      if(b.won===true) q.wins++;
      else if(b.won===false) q.losses++;
      if(f.nickname) q.nickname=f.nickname;
      const hp=Number(f.maxHp??b.opponentObserved?.maxHp);
      if(Number.isFinite(hp) && hp>0) q.hps.push(hp);
      const regen=Number(f.hpRegen??b.opponentObserved?.hpRegen);
      if(Number.isFinite(regen)&&regen>=0) q.regen.push(regen);
      const e=b.eventSummary||{};
      if(b.detailLoaded && b.eventSummary){
        q.detailN++;
        q.dealt+=Number(e.damageDealt||0);q.taken+=Number(e.damageTaken||0);
        q.enemyHits+=Number(e.enemyHits||0);q.enemyCrits+=Number(e.enemyCrits||0);
        q.enemyDoubles+=Number(e.enemyDoubles||0);q.enemyCounters+=Number(e.enemyCounters||0);
        q.enemyAttacks+=Number(e.enemyAttacks||0);q.evades+=Number(e.evades||0);
      }
      q.lastAt=Math.max(q.lastAt,Number(b.createdAt||b.capturedAt||0));
    }
    for(const p of Object.values(opponentLab.profiles||{})){
      const k=opponentLabKey(p.id,p.nickname);
      if(!k) continue;
      if(!groups.has(k)) groups.set(k,{key:k,id:p.id,nickname:p.nickname||'',n:0,wins:0,losses:0,hps:[],regen:[],dealt:0,taken:0,enemyHits:0,enemyCrits:0,enemyDoubles:0,enemyCounters:0,enemyAttacks:0,evades:0,detailN:0,lastAt:0});
    }
    return [...groups.values()].map(q=>{
      const profile=opponentLab.profiles[q.key]||{};
      const attr=profile.attributes||null;
      const code=profile.buildCode||'';
      const confirmed=!!attr || !!code;
      return {...q,profile,code,attributes:attr,confirmed,
        medianHp:pvpLabMedian(q.hps,null),medianRegen:pvpLabMedian(q.regen,null),
        enemyCritRate:q.enemyHits?100*q.enemyCrits/q.enemyHits:null,
        enemyEvadeAgainstMe:q.enemyAttacks?100*q.evades/q.enemyAttacks:null};
    }).sort((a,b)=>b.n-a.n || b.lastAt-a.lastAt);
  }
  function opponentLabExplain(q){
    const notes=[];
    if(q.medianHp!=null) notes.push('Widziane maksymalne HP: mediana '+Math.round(q.medianHp)+'. To nie jest dowód na konkretny poziom VIT.');
    if(q.medianRegen!=null) notes.push('Widziana regeneracja: mediana '+q.medianRegen.toFixed(1)+' HP/rundę.');
    if(q.enemyHits) notes.push('Krytyki przeciwnika w replayach: '+q.enemyCrits+'/'+q.enemyHits+' trafień ('+q.enemyCritRate.toFixed(1)+'%).');
    if(q.enemyDoubles || q.enemyCounters) notes.push('Zaobserwowane double strike: '+q.enemyDoubles+'; kontrataki: '+q.enemyCounters+'.');
    if(q.detailN && q.losses) notes.push('Przy porażkach warto porównać obrażenia na cios, uniki i regenerację. Same replaye nie ujawniają jednak pełnego drzewka A/B.');
    if(!q.confirmed) notes.push('Dokładne STR/END/AGI/VIT/PRC i A/B są nieznane. Otwórz profil przeciwnika w grze; analizator sprawdzi odpowiedzi API, bez zgadywania.');
    return notes;
  }
  function opponentLabHTML(){
    const all=opponentLabAggregate();const txt=String(opponentLab.filter||'').trim().toLowerCase();
    const rows=all.filter(q=>!txt || String(q.nickname||'').toLowerCase().includes(txt) || String(q.id||'').includes(txt));
    const sel=all.find(q=>q.key===opponentLab.selectedKey) || rows[0] || null;
    const code=sel?.code||'';
    const a=sel?.attributes||null;
    const attrText=a?`${a.str}/${a.end}/${a.agi}/${a.vit}/${a.prc}`:(code?code.split(':')[0]:'? / ? / ? / ? / ?');
    const list=rows.slice(0,40).map((q,i)=>`<tr><td class="left"><button data-act="opp-select" data-opp-key="${esc(q.key)}">${esc(q.nickname||'ID '+q.id)}</button><div class="sub">${q.id?'ID '+q.id:'Nick z replaya'}</div></td><td>${q.n}</td><td>${q.wins}W / ${q.losses}P</td><td>${q.medianHp==null?'—':Math.round(q.medianHp)}</td><td>${q.confirmed?'POTWIERDZONY':'NIEZNANY'}</td></tr>`).join('');
    return `<div class="helper-hero"><div><div class="helper-name">🔎 Analizator przeciwnika PvP</div><div class="sub">Dane z replayów i profili otwieranych w grze • tylko odczyt. Liczby A/B pokazujemy tylko po potwierdzeniu przez API.</div></div><div class="helper-actions"><button data-act="opp-sync">↻ Synchronizuj replaye</button><button data-act="opp-filter">Szukaj nicku / ID</button><button data-act="opp-export">Eksport przeciwników JSON</button></div></div>
      <div class="section pvp-best"><div class="section-title">${sel?esc(sel.nickname||'Przeciwnik ID '+sel.id):'Brak rozpoznanych przeciwników'}</div>
      <div><b>Build: ${esc(attrText)}</b> • ${sel?.confirmed?'potwierdzone atrybuty/kod z odpowiedzi API':'brak dokładnego buildu'}</div>
      <div class="sub">${sel?`ID ${sel.id||'brak'} • walk ${sel.n} • wygrane ${sel.wins} • przegrane ${sel.losses} • replaye z danymi ${sel.detailN}`:'Uruchom synchronizację PvP Lab, a następnie otwórz profil wybranego przeciwnika w grze.'}</div>
      ${sel?.profile?.skills?.length?`<div class="note">Potwierdzone umiejętności A/B: ${esc(sel.profile.skills.map(s=>`${s.attribute.toUpperCase()}${s.tier||'?'}:${s.option}`).join(' • '))}</div>`:''}
      ${sel?.code?`<div class="note">Kod buildu z API: <b>${esc(code)}</b></div>`:''}
      ${(sel?opponentLabExplain(sel):[]).map(x=>`<div class="note" style="margin-top:6px">${esc(x)}</div>`).join('')}
      <div class="sub" style="margin-top:8px">Skąd informacje: ${esc(sel?.profile?.source||'replay PvP')} • potwierdzonych profili ${Object.keys(opponentLab.profiles||{}).length}. Brak atrybutów przeciwnika w starych replayach nie jest błędem eksportu.</div></div>
      <div class="section table-wrap"><div class="section-title">Przeciwnicy (${rows.length})${txt?' • filtr: '+esc(opponentLab.filter):''}</div><table><thead><tr><th>Gracz</th><th>Walk</th><th>Bilans</th><th>HP</th><th>Build</th></tr></thead><tbody>${list||'<tr><td colspan="5">Brak danych. Otwórz walki w PvP Lab.</td></tr>'}</tbody></table></div>
      <div class="section note">Nie ma żadnego automatycznego podglądu ukrytych statystyk. Analizator używa wyłącznie informacji pokazanych przez grę i replayów, nie odpytuje zgadywanych endpointów ani nie zmienia postaci.</div>`;
  }
  async function opponentLabExport(){
    const rows=opponentLabAggregate().map(q=>({id:q.id,nickname:q.nickname,n:q.n,wins:q.wins,losses:q.losses,
      medianHp:q.medianHp,medianRegen:q.medianRegen,enemyCritRate:q.enemyCritRate,
      exactAttributes:q.attributes||null,exactBuildCode:q.code||null,skills:q.profile?.skills||[],
      evidenceSource:q.profile?.source||null,evidenceAt:q.profile?.capturedAt||null}));
    const data=JSON.stringify({type:'pomagier-opponent-lab',schema:1,version:VERSION,androidVersion:ANDROID_VERSION,
      exportedAt:nowIso(),characterId:pvpLabOwnId(),readOnly:true,rows},null,2);
    const fileName='pomagier_przeciwnicy_pvp_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    const saved=await pomagierSaveJsonNative(fileName,data);
    if(!saved) pomagierBrowserDownload(fileName,data);
  }