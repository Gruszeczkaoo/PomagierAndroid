from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
js = root / "app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak pomager.user.js")

s = js.read_text(encoding="utf-8")

s = s.replace("// @version      8.8.32", "// @version      8.8.33", 1)
s = s.replace("const VERSION = '8.8.32';", "const VERSION = '8.8.33';", 1)
s = s.replace("const ANDROID_VERSION = '1.0.25';", "const ANDROID_VERSION = '1.0.26';", 1)

anchor = "  // v8.8.32"
note = """  // v8.8.33 STORAGE + BOSS RECOVERY:
  // - naprawa PAMIĘĆ PEŁNA: kompakcja PvP/Boss Lab i ponawianie zapisu,
  // - stare ciężkie replaye PvP są odchudzane bez kasowania eventSummary,
  // - każda walka bossa dostaje kopię awaryjną w IndexedDB,
  // - Boss Lab przy starcie scala archiwum IndexedDB,
  // - Synchronizuj próbuje odzyskać brakujące walki z historii gry,
  // - bieżący boss ma pierwszeństwo w panelu przed ostatnim historycznym.
"""
if note not in s:
    p = s.find(anchor)
    if p >= 0:
        s = s[:p] + note + s[p:]

# Odchudzanie starego PvP.
old = "      if(Array.isArray(c.battles) && c.battles.length>120) c.battles=c.battles.slice().sort((a,b)=>ts(a)-ts(b)).slice(-120);"
new = """      if(Array.isArray(c.battles)){
        c.battles=c.battles.slice().sort((a,b)=>ts(a)-ts(b));
        if(c.battles.length>160) c.battles=c.battles.slice(-160);
        const recent=c.battles.slice().sort((a,b)=>ts(b)-ts(a));
        for(const row of recent.slice(40)){
          if(Array.isArray(row.events)&&row.events.length){ row.events=[]; row.eventsArchived=true; }
          delete row.rawResponse; delete row.rawFighters; delete row.raw;
        }
      }"""
if old not in s:
    raise SystemExit("Brak kompaktora PvP")
s = s.replace(old,new,1)

# Helper kompakcji Boss Lab przed safeLocalStorageSet.
safe_pos = s.find("  function safeLocalStorageSet(key, raw){")
if safe_pos < 0:
    raise SystemExit("Brak safeLocalStorageSet")
helper = """  function __compactBossStorageValue(value){
    try{
      const c=JSON.parse(JSON.stringify(value||{}));
      const ts=x=>Number(x?.capturedAt||x?.createdAt||x?.at||0);
      if(Array.isArray(c.battles)){
        c.battles=c.battles.slice().sort((a,b)=>ts(a)-ts(b));
        if(c.battles.length>60) c.battles=c.battles.slice(-60);
        const recent=c.battles.slice().sort((a,b)=>ts(b)-ts(a));
        for(const row of recent.slice(8)){
          if(Array.isArray(row.events)&&row.events.length){ row.events=[]; row.eventsArchived=true; }
          delete row.rawResponse; delete row.rawFighters;
        }
      }
      if(Array.isArray(c.errors)&&c.errors.length>20) c.errors=c.errors.slice(-20);
      if(c.optimizers&&typeof c.optimizers==='object'){
        for(const opt of Object.values(c.optimizers)){
          if(opt&&Array.isArray(opt.top)&&opt.top.length>5) opt.top=opt.top.slice(0,5);
        }
      }
      c.storageCompactedAt=Date.now();
      c.storageCompacted=true;
      return c;
    }catch(e){ return value; }
  }
  function __tryCompactStoredBoss(){
    try{
      const raw=localStorage.getItem(K.bossLab);
      if(!raw) return false;
      const slim=JSON.stringify(__compactBossStorageValue(JSON.parse(raw)));
      if(!slim || slim.length>=raw.length) return false;
      localStorage.removeItem(K.bossLab);
      localStorage.setItem(K.bossLab,slim);
      __storageCompactions++;
      return true;
    }catch(e){ return false; }
  }
"""
if helper not in s:
    s = s[:safe_pos] + helper + s[safe_pos:]

# Zastąp safeLocalStorageSet wersją quota-aware dla obu Labów.
start = s.find("  function safeLocalStorageSet(key, raw){")
end = s.find("  function saveJSON(key, value) {",start)
if start < 0 or end < 0:
    raise SystemExit("Nie można podmienić safeLocalStorageSet")
safe = """  function safeLocalStorageSet(key, raw){
    const put=value=>{ localStorage.setItem(key,String(value)); __storageLastError=''; return true; };
    try{ return put(raw); }
    catch(e){
      __storageLastError=String(e?.message||e||'Błąd localStorage');
      if(!__isQuotaError(e)) return false;
      try{
        if(key===K.pvpLab){
          localStorage.removeItem(K.pvpLab);
          return put(JSON.stringify(__compactPvpStorageValue(JSON.parse(String(raw)))));
        }
        if(key===K.bossLab){
          localStorage.removeItem(K.bossLab);
          return put(JSON.stringify(__compactBossStorageValue(JSON.parse(String(raw)))));
        }
      }catch(e2){ __storageLastError=String(e2?.message||e2||__storageLastError); }
      __tryCompactStoredPvp();
      __tryCompactStoredBoss();
      try{ return put(raw); }catch(e3){ __storageLastError=String(e3?.message||e3||__storageLastError); }
      console.warn('[Pomagier storage] zapis pominięty',key,__storageLastError);
      return false;
    }
  }
"""
s = s[:start] + safe + s[end:]

# Proaktywne odchudzanie PvP przy zwykłym zapisie.
needle = "    if(pvpLab.errors.length>40) pvpLab.errors=pvpLab.errors.slice(-40);\n    pvpLab.updatedAt=Date.now();"
replace = """    if(pvpLab.errors.length>40) pvpLab.errors=pvpLab.errors.slice(-40);
    const recentPvp=pvpLab.battles.slice().sort((a,b)=>Number(b.capturedAt||b.createdAt||0)-Number(a.capturedAt||a.createdAt||0));
    for(const row of recentPvp.slice(45)){
      if(Array.isArray(row.events)&&row.events.length){ row.events=[]; row.eventsArchived=true; }
      delete row.rawResponse; delete row.rawFighters; delete row.raw;
    }
    pvpLab.updatedAt=Date.now();"""
if needle not in s:
    raise SystemExit("Brak pvpLabSave")
s = s.replace(needle,replace,1)

# Awaryjne archiwum walk bossów w IndexedDB.
clone = "  function bossLabClone(v){ try{return JSON.parse(JSON.stringify(v));}catch{return null;} }\n"
if clone not in s:
    raise SystemExit("Brak bossLabClone")
archive = """  const BOSS_ARCHIVE_DB='pomagier_boss_lab_archive_v1';
  const BOSS_ARCHIVE_STORE='fights';
  let __bossArchiveDbPromise=null;
  function bossLabArchiveOpen(){
    if(__bossArchiveDbPromise) return __bossArchiveDbPromise;
    __bossArchiveDbPromise=new Promise((resolve,reject)=>{
      try{
        const req=indexedDB.open(BOSS_ARCHIVE_DB,1);
        req.onupgradeneeded=()=>{
          const db=req.result;
          if(!db.objectStoreNames.contains(BOSS_ARCHIVE_STORE)){
            const st=db.createObjectStore(BOSS_ARCHIVE_STORE,{keyPath:'battleId'});
            st.createIndex('characterId','archiveCharacterId',{unique:false});
          }
        };
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(req.error||new Error('Boss archive open error'));
      }catch(e){ reject(e); }
    }).catch(e=>{ __bossArchiveDbPromise=null; throw e; });
    return __bossArchiveDbPromise;
  }
  async function bossLabArchivePut(record){
    if(!record?.battleId) return false;
    const db=await bossLabArchiveOpen();
    const row=bossLabClone(record)||{};
    row.archiveCharacterId=Number(pvpLabOwnId()||settings.characterId||0);
    row.archiveSavedAt=Date.now();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(BOSS_ARCHIVE_STORE,'readwrite');
      tx.objectStore(BOSS_ARCHIVE_STORE).put(row);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('Boss archive write error'));
      tx.onabort=()=>reject(tx.error||new Error('Boss archive write aborted'));
    });
  }
  async function bossLabArchiveMerge(){
    try{
      const db=await bossLabArchiveOpen();
      const ownId=Number(pvpLabOwnId()||settings.characterId||0);
      const rows=await new Promise((resolve,reject)=>{
        const out=[];
        const tx=db.transaction(BOSS_ARCHIVE_STORE,'readonly');
        const req=tx.objectStore(BOSS_ARCHIVE_STORE).openCursor();
        req.onsuccess=()=>{ const cur=req.result; if(!cur) return; out.push(cur.value); cur.continue(); };
        tx.oncomplete=()=>resolve(out);
        tx.onerror=()=>reject(tx.error||new Error('Boss archive read error'));
      });
      let added=0;
      for(const raw of rows){
        if(!raw?.battleId) continue;
        const cid=Number(raw.archiveCharacterId||0);
        if(ownId>0&&cid>0&&cid!==ownId) continue;
        if(bossLab.battles.some(x=>String(x.battleId)===String(raw.battleId))) continue;
        const row=bossLabClone(raw); delete row.archiveCharacterId; delete row.archiveSavedAt;
        bossLab.battles.push(row); added++;
      }
      if(added){
        bossLab.archiveRecovered=Number(bossLab.archiveRecovered||0)+added;
        bossLab.archiveLastMergeAt=Date.now();
        bossLab.syncStatus='ARCHIWUM IDB: odzyskano '+added;
        bossLabSave();
      }
      return added;
    }catch(e){ console.warn('[MG Boss Lab] archive merge',e); return 0; }
  }
"""
s = s.replace(clone,clone+archive,1)

# BossLabSave musi sprawdzać wynik saveJSON, bo saveJSON zwraca false zamiast rzucać.
bstart = s.find("  function bossLabSave(){")
bend = s.find("  if(__bossStaleOptimizerIds.length){",bstart)
if bstart < 0 or bend < 0:
    raise SystemExit("Brak bossLabSave")
newsave = """  function bossLabSave(){
    const max=Number(bossLabCfg.maxBattles||50);
    if(bossLab.battles.length>max) bossLab.battles=bossLab.battles.slice().sort((a,b)=>Number(a.createdAt||a.capturedAt||0)-Number(b.createdAt||b.capturedAt||0)).slice(-max);
    const full=Math.max(3,Number(bossLabCfg.fullEventBattles||14));
    const ordered=bossLab.battles.slice().sort((a,b)=>Number(b.createdAt||b.capturedAt||0)-Number(a.createdAt||a.capturedAt||0));
    for(const row of ordered.slice(full)){ if(Array.isArray(row.events)&&row.events.length){ row.events=[]; row.eventsArchived=true; } delete row.rawResponse; }
    if(bossLab.errors.length>40) bossLab.errors=bossLab.errors.slice(-40);
    bossLab.updatedAt=Date.now();
    const runtime=!!bossLab.syncing; bossLab.syncing=false;
    let ok=saveJSON(K.bossLab,bossLab);
    if(!ok){
      for(const row of ordered.slice(6)){ if(Array.isArray(row.events)&&row.events.length){ row.events=[]; row.eventsArchived=true; } delete row.rawResponse; delete row.rawFighters; }
      ok=saveJSON(K.bossLab,bossLab);
    }
    bossLab.syncing=runtime;
    return ok;
  }
"""
s = s[:bstart]+newsave+s[bend:]

# Kopia IDB przed zwykłym zapisem walki.
marker = "    bossLabSave();\n    if(bossLabCfg.autoOptimizeAfterFight"
if marker not in s:
    raise SystemExit("Brak końca bossLabRecordFight")
insert = """    try{ bossLabArchivePut(record).catch(e=>console.warn('[MG Boss Lab] archive write',e)); }catch(e){}
    const bossSaved=bossLabSave();
    if(!bossSaved) bossLab.syncStatus+=' • LOCALSTORAGE PEŁNY — KOPIA IDB';
    if(bossLabCfg.autoOptimizeAfterFight"""
s = s.replace(marker,insert,1)

# Recovery z historii gry.
sync = "  async function bossLabSync({silent=false}={}){\n"
if sync not in s:
    raise SystemExit("Brak bossLabSync")
recover = """  function bossLabHistoryRows(data){
    return Array.isArray(data?.history)?data.history:Array.isArray(data?.battles)?data.battles:Array.isArray(data)?data:[];
  }
  function bossLabIdFromHistoryRow(x){
    const direct=Number(x?.bossId||x?.boss_id||0);
    if(direct&&bossLab.bosses[String(direct)]) return direct;
    const opp=x?.opponent||{};
    const oid=Number(opp?.id??x?.opponentId??x?.opponent_id??0);
    if(oid<0&&bossLab.bosses[String(Math.abs(oid))]) return Math.abs(oid);
    const name=String(opp?.nickname||opp?.name||x?.opponentNickname||x?.opponent_name||x?.bossName||'').trim().toLowerCase();
    if(name){
      for(const b of Object.values(bossLab.bosses||{})){
        if(String(b?.name||'').trim().toLowerCase()===name) return Number(b.id||0);
      }
    }
    return 0;
  }
  async function bossLabRecoverFromHistory(id){
    const feeds=[];
    try{ feeds.push(await apiActive('/api/pvp/'+id+'/battle-history?limit=250')); }catch(e){}
    try{ feeds.push(await apiActive('/api/combat/'+id+'/history')); }catch(e){}
    const candidates=new Map();
    for(const feed of feeds){
      for(const x of bossLabHistoryRows(feed)){
        const battleId=String(x?.battleId||x?.id||'').trim();
        if(!battleId||bossLabFindFight(battleId)) continue;
        const bossId=bossLabIdFromHistoryRow(x);
        if(bossId) candidates.set(battleId,{row:x,bossId});
      }
    }
    let recovered=0;
    for(const [battleId,info] of [...candidates.entries()].slice(0,40)){
      try{
        const detail=await apiActive('/api/pvp/battle/'+encodeURIComponent(battleId));
        if(detail&&bossLabRecordFight(detail,{bossId:info.bossId,kind:'history_recovery',at:Number(info.row?.createdAt||info.row?.date||Date.now())})) recovered++;
      }catch(e){}
      await sleep(35);
    }
    if(recovered){ bossLab.historyRecovered=Number(bossLab.historyRecovered||0)+recovered; bossLab.historyRecoveryAt=Date.now(); }
    return {recovered,candidates:candidates.size};
  }

"""
s = s.replace(sync,recover+sync,1)

needle = "      if(list) bossLabIngestList(list);\n      if(mods) bossLabIngestActiveModifiers(mods);\n      for(const k of Object.keys(bossLab.bosses)){"
replace = """      if(list) bossLabIngestList(list);
      if(mods) bossLabIngestActiveModifiers(mods);
      const idbRecovered=await bossLabArchiveMerge();
      const historyRecovery=await bossLabRecoverFromHistory(id);
      bossLab.lastRecovery={at:Date.now(),idbRecovered,historyRecovered:historyRecovery.recovered,historyCandidates:historyRecovery.candidates};
      for(const k of Object.keys(bossLab.bosses)){"""
if needle not in s:
    raise SystemExit("Brak miejsca recovery w sync")
s = s.replace(needle,replace,1)

# Aktualny boss ma pierwszeństwo w UI.
oldfocus = "    const focusId=Number(latest?.bossId||all.find(x=>x.status==='current')?.id||0),opt=focusId?bossLab.optimizers[String(focusId)]||{}:{};"
newfocus = "    const focusId=Number(all.find(x=>x.status==='current')?.id||latest?.bossId||0),opt=focusId?bossLab.optimizers[String(focusId)]||{}:{};"
if oldfocus in s:
    s = s.replace(oldfocus,newfocus,1)

# Startup merge z IndexedDB.
m = "  if(__bossStaleOptimizerIds.length){"
p = s.find(m)
if p < 0:
    raise SystemExit("Brak miejsca startup merge")
startup = "  setTimeout(()=>{ bossLabArchiveMerge().then(n=>{ if(n){ try{render();}catch(e){} } }).catch(()=>{}); },1200);\n"
s = s[:p]+startup+s[p:]

js.write_text(s,encoding="utf-8")

bg = root / "app/build.gradle.kts"
if bg.exists():
    t=bg.read_text(encoding="utf-8")
    t=t.replace("versionCode = 10025","versionCode = 10026")
    t=t.replace('versionName = "1.0.25"','versionName = "1.0.26"')
    bg.write_text(t,encoding="utf-8")

print("v1.0.26 patch applied")
