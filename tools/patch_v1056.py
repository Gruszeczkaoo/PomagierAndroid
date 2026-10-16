from pathlib import Path
import sys,re
root=Path(sys.argv[1]); js=root/'app/src/main/assets/pomagier.user.js'; s=js.read_text(encoding='utf-8')
if '// @version      8.8.62' not in s: raise SystemExit('expected 8.8.62')
s=s.replace('// @version      8.8.62','// @version      8.8.63',1).replace("const VERSION = '8.8.62';","const VERSION = '8.8.63';",1).replace("const ANDROID_VERSION = '1.0.55';","const ANDROID_VERSION = '1.0.56';",1)

old='''  function safeLocalStorageSet(key, raw){
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
'''
new=r'''  let __storageJanitorRuns=0;
  let __storageLastJanitorAt=0;
  const __STORAGE_SOFT_CHARS=650000;
  function __storageOwnedChars(){
    let n=0; try{ for(let i=0;i<localStorage.length;i++){ const k=String(localStorage.key(i)||''); if(k.startsWith('pomagier_')||k.startsWith('mg_mp_')) n+=k.length+String(localStorage.getItem(k)||'').length; } }catch(_){} return n;
  }
  function __storageTrimArray(key,max){
    try{ const raw=localStorage.getItem(key); if(!raw) return; const a=JSON.parse(raw); if(Array.isArray(a)&&a.length>max) localStorage.setItem(key,JSON.stringify(a.slice(-max))); }catch(_){}
  }
  function __storageTrimObject(key,max){
    try{ const raw=localStorage.getItem(key); if(!raw) return; const o=JSON.parse(raw); if(!o||typeof o!=='object'||Array.isArray(o)) return; const e=Object.entries(o).sort((a,b)=>Number(b[1]?.ts||0)-Number(a[1]?.ts||0)); if(e.length>max) localStorage.setItem(key,JSON.stringify(Object.fromEntries(e.slice(0,max)))); }catch(_){}
  }
  function __storageJanitor(aggressive=false){
    __storageJanitorRuns++; __storageLastJanitorAt=Date.now();
    for(const k of [K.alcoholDiag,K.menelDiag,K.raidDiag,K.diagnostics,'pomagier_pvp_engine_scan_v2']) try{ localStorage.removeItem(k); }catch(_){}
    __storageTrimArray(K.history,aggressive?180:400); __storageTrimArray(K.actionHistory,aggressive?100:180); __storageTrimArray(K.autoLog,aggressive?80:120); __storageTrimArray(K.localAiEvents,aggressive?60:100); __storageTrimArray(K.purchaseHistory,aggressive?60:100);
    try{ const r=localStorage.getItem(K.learner); if(r){ const o=JSON.parse(r); if(Array.isArray(o.events)&&o.events.length>120){ o.events=o.events.slice(-120); localStorage.setItem(K.learner,JSON.stringify(o)); } } }catch(_){}
    __storageTrimObject(K.lastSeenPrices,aggressive?180:350);
    try{ const r=localStorage.getItem(K.pvpLab); if(r){ const x=JSON.stringify(__compactPvpStorageValue(JSON.parse(r))); if(x.length<r.length){ localStorage.removeItem(K.pvpLab); localStorage.setItem(K.pvpLab,x); } } }catch(_){}
    try{ const r=localStorage.getItem(K.bossLab); if(r){ const x=JSON.stringify(__compactBossStorageValue(JSON.parse(r))); if(x.length<r.length){ localStorage.removeItem(K.bossLab); localStorage.setItem(K.bossLab,x); } } }catch(_){}
    if(aggressive||__storageOwnedChars()>__STORAGE_SOFT_CHARS) try{ localStorage.removeItem(K.nativeCache); }catch(_){}
    __storageLastError='';
  }
  function safeLocalStorageSet(key, raw){
    const put=v=>{ localStorage.setItem(key,String(v)); __storageLastError=''; return true; };
    try{ const ok=put(raw); if(Date.now()-__storageLastJanitorAt>60000&&__storageOwnedChars()>__STORAGE_SOFT_CHARS) __storageJanitor(false); return ok; }
    catch(e){
      __storageLastError=String(e?.message||e||'Błąd localStorage');
      if(!__isQuotaError(e)) return false;
      __storageJanitor(true);
      try{
        if(key===K.pvpLab){ localStorage.removeItem(K.pvpLab); return put(JSON.stringify(__compactPvpStorageValue(JSON.parse(String(raw))))); }
        if(key===K.bossLab){ localStorage.removeItem(K.bossLab); return put(JSON.stringify(__compactBossStorageValue(JSON.parse(String(raw))))); }
        if([K.alcoholDiag,K.menelDiag,K.raidDiag,K.diagnostics,'pomagier_pvp_engine_scan_v2'].includes(key)){ __storageLastError=''; return false; }
        return put(raw);
      }catch(e2){ __storageLastError=String(e2?.message||e2); console.warn('[Pomagier storage] zapis pominięty',key,__storageLastError); return false; }
    }
  }
'''
if old not in s: raise SystemExit('safeLocalStorageSet not found')
s=s.replace(old,new,1)

anchor="""  try{
    const oldTab=String(localStorage.getItem(K.tab)||'');
    if(['dumpLab','dump','wysypisko','wysypiskoLab'].includes(oldTab)) safeLocalStorageSet(K.tab,'autopilot');
  }catch(_){ }

  const __savedSettings = loadJSON(K.settings, {}) || {};
"""
repl=anchor.replace("\n\n  const __savedSettings", "\n  try{ __storageJanitor(true); }catch(_){}\n\n  const __savedSettings")
if anchor not in s: raise SystemExit('startup anchor not found')
s=s.replace(anchor,repl,1)

s=s.replace('try{ saveJSON(K.pvpLab,pvpLab); } finally { pvpLab.syncing=runtimeSync; }','try{ saveJSON(K.pvpLab,__compactPvpStorageValue(pvpLab)); } finally { pvpLab.syncing=runtimeSync; }',1)
s=s.replace('let ok=saveJSON(K.bossLab,bossLab);','let ok=saveJSON(K.bossLab,__compactBossStorageValue(bossLab));',1)
s=s.replace('ok=saveJSON(K.bossLab,bossLab);','ok=saveJSON(K.bossLab,__compactBossStorageValue(bossLab));',1)

for a,b in [('const ALCOHOL_DIAG_MAX_EVENTS=500;','const ALCOHOL_DIAG_MAX_EVENTS=80;'),('const ALCOHOL_DIAG_MAX_BODY=24000;','const ALCOHOL_DIAG_MAX_BODY=4000;'),('const ALCOHOL_DIAG_MAX_RESPONSE=48000;','const ALCOHOL_DIAG_MAX_RESPONSE=8000;'),('const MENEL_DIAG_MAX_EVENTS=900;','const MENEL_DIAG_MAX_EVENTS=100;'),('const RAID_DIAG_MAX_EVENTS=1600;','const RAID_DIAG_MAX_EVENTS=100;')]: s=s.replace(a,b,1)
for name in ['alcoholDiag','menelDiag','raidDiag']:
    s=s.replace(f'  {name}.active=!!{name}.active;',f'  {name}.active=false;',1)

s=s.replace('saveJSON(K.alcoholDiag,alcoholDiag);',"saveJSON(K.alcoholDiag,{schemaVersion:ALCOHOL_DIAG_SCHEMA,active:!!alcoholDiag.active,startedAt:Number(alcoholDiag.startedAt||0),stoppedAt:Number(alcoholDiag.stoppedAt||0),events:alcoholDiag.events.slice(-20)});",1)
s=s.replace('saveJSON(K.menelDiag,menelDiag);',"saveJSON(K.menelDiag,{schemaVersion:MENEL_DIAG_SCHEMA,active:!!menelDiag.active,startedAt:Number(menelDiag.startedAt||0),stoppedAt:Number(menelDiag.stoppedAt||0),events:menelDiag.events.slice(-20)});",1)
s=s.replace('saveJSON(K.raidDiag,raidDiag);',"saveJSON(K.raidDiag,{schemaVersion:RAID_DIAG_SCHEMA,active:!!raidDiag.active,startedAt:Number(raidDiag.startedAt||0),stoppedAt:Number(raidDiag.stoppedAt||0),events:raidDiag.events.slice(-20)});",1)

s=s.replace("if (history.length > Number(settings.maxHistoryRows||5000)) history = history.slice(-Number(settings.maxHistoryRows||5000));","const historyCap=Math.max(100,Math.min(800,Number(settings.maxHistoryRows||800))); if(history.length>historyCap) history=history.slice(-historyCap);",1)
s=s.replace('if(actionHistory.length>600) actionHistory=actionHistory.slice(-600);','if(actionHistory.length>250) actionHistory=actionHistory.slice(-250);',1)
s=s.replace('if (autoLog.length > 300) autoLog = autoLog.slice(-300);','if (autoLog.length > 120) autoLog = autoLog.slice(-120);',1)
s=s.replace('if(localAiEvents.length>250) localAiEvents=localAiEvents.slice(-250);','if(localAiEvents.length>120) localAiEvents=localAiEvents.slice(-120);',1)
s=s.replace('if(purchaseHistory.length>200) purchaseHistory=purchaseHistory.slice(-200);','if(purchaseHistory.length>120) purchaseHistory=purchaseHistory.slice(-120);',1)
s=s.replace("const max=Math.max(50,Number(autoCfg.learningMaxEvents||400));","const max=Math.max(50,Math.min(250,Number(autoCfg.learningMaxEvents||250)));",1)

old="""    window.__MG_PVP_ENGINE_SCAN_ACTIVE__=!!pvpEngineScan.enabled;
    saveJSON(PVP_ENGINE_SCAN_KEY,pvpEngineScan);
  }
"""
new="""    window.__MG_PVP_ENGINE_SCAN_ACTIVE__=!!pvpEngineScan.enabled;
    const compact={schema:2,enabled:!!pvpEngineScan.enabled,startedAt:Number(pvpEngineScan.startedAt||0),endsAt:Number(pvpEngineScan.endsAt||0),updatedAt:Number(pvpEngineScan.updatedAt||0),status:String(pvpEngineScan.status||''),entries:{},errors:pvpEngineScan.errors.slice(-10)};
    for(const [k,row] of Object.entries(pvpEngineScan.entries||{}).slice(-15)) compact.entries[k]={method:row?.method,path:row?.path,kind:row?.kind,lastAt:row?.lastAt,count:row?.count,responseBytes:row?.responseBytes};
    saveJSON(PVP_ENGINE_SCAN_KEY,compact);
  }
"""
if old not in s: raise SystemExit('pvp scan save not found')
s=s.replace(old,new,1)

for x in ["// @version      8.8.63","const ANDROID_VERSION = '1.0.56';",'function __storageJanitor(','const ALCOHOL_DIAG_MAX_EVENTS=80;','const RAID_DIAG_MAX_EVENTS=100;',"saveJSON(K.pvpLab,__compactPvpStorageValue(pvpLab))",'historyCap=Math.max(100,Math.min(800']:
    if x not in s: raise SystemExit('missing '+x)
js.write_text(s,encoding='utf-8')

bg=root/'app/build.gradle.kts'; t=bg.read_text(encoding='utf-8')
if 'versionCode = 10055' not in t: raise SystemExit('expected Android 1.0.55')
bg.write_text(t.replace('versionCode = 10055','versionCode = 10056',1).replace('versionName = "1.0.55"','versionName = "1.0.56"',1),encoding='utf-8')
print('v1.0.56 applied')
print('OK: startup/quota storage janitor')
print('OK: diagnostic logs bounded and no auto-resume')
print('OK: PvP/Boss compact persistence')
