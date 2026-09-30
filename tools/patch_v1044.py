from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
if not js.exists(): raise SystemExit("Brak userscriptu")
s=js.read_text(encoding="utf-8")

# --- wersje ---
if "// @version      8.8.50" not in s: raise SystemExit("Oczekiwano JS 8.8.50")
s=s.replace("// @version      8.8.50","// @version      8.8.51",1)
s=s.replace("const VERSION = '8.8.50';","const VERSION = '8.8.51';",1)
s=s.replace("const ANDROID_VERSION = '1.0.43';","const ANDROID_VERSION = '1.0.44';",1)

note="""  // v8.8.51 FULL STORAGE + DUMP LAB 2.0:
  // - wspolny resolver przedmiotow: PLECAK -> RUPIECIARNIA -> dopiero ZAKUP,
  // - ogrod wyjmuje Sadzeniaczek #804 z rupieciarni zanim kupi brakujace sztuki,
  // - Wysypisko Lab rejestruje All Inclusive, zwykle gangowe i SOLO,
  // - skan GET obejmuje wszystkie dostepne typy wysypisk bez zuzywania kopniec,
  // - BEFORE/DIG/AFTER dostaje jawny scope, dayId/wysypiskoId i osobne klucze stref,
  // - eksport JSON zachowuje wspolny format badawczy dla wszystkich trzech trybow.
"""
anchor="  // v8.8.50"
if note not in s:
    p=s.find(anchor)
    if p>=0: s=s[:p]+note+s[p:]

def replace_top_func(text,name,new_code):
    m=re.search(r"^  (?:async )?function "+re.escape(name)+r"\(",text,re.M)
    if not m: raise SystemExit("Brak funkcji "+name)
    start=m.start()
    n=re.search(r"^  (?:async )?function [A-Za-z0-9_]+\(",text[m.end():],re.M)
    end=(m.end()+n.start()) if n else len(text)
    return text[:start]+new_code.rstrip()+"\n\n"+text[end:]

# ============================================================
# ITEM RESOLVER: PLECAK -> RUPIECIARNIA -> ZAKUP
# ============================================================
needle="  async function localAiTakeInventoryFromMelina(inventoryId){"
p=s.find(needle)
if p<0: raise SystemExit("Brak kotwicy melina resolver")

resolver="""  function localAiItemQuantity(rows,itemId){
    const id=Number(itemId||0);
    return (Array.isArray(rows)?rows:[]).reduce((sum,row)=>{
      const rid=Number(row?.id||row?.item_id||row?.itemId||0);
      if(rid!==id) return sum;
      return sum+Math.max(1,Number(row?.quantity||1));
    },0);
  }

  async function localAiEnsureItemAvailable(itemId,required,{reason='potrzebny przedmiot',useMelina=true}={}){
    const id=Number(itemId||0);
    const need=Math.max(0,Number(required||0));
    if(!id || need<=0) return {ok:true,itemId:id,required:need,backpack:0,movedFromMelina:0,missing:0,source:'none'};

    let inv=await localAiFreshInventory();
    let bagQty=localAiItemQuantity(inv?.inventory,id);
    if(bagQty>=need){
      return {ok:true,itemId:id,required:need,backpack:bagQty,movedFromMelina:0,missing:0,source:'backpack'};
    }

    let moved=0;
    if(useMelina){
      try{
        const storage=await localAiFreshMelina();
        const rows=(storage.storageItems||[])
          .filter(x=>Number(x?.id||x?.item_id||0)===id && Number(x?.inventory_id||0)>0)
          .sort((a,b)=>Number(b?.quantity||1)-Number(a?.quantity||1));

        for(const row of rows){
          if(bagQty>=need) break;
          const qty=Math.max(1,Number(row?.quantity||1));
          const take=await localAiReplayMelinaRemove(Number(row.inventory_id));
          if(take?.ok){
            moved+=qty;
            inv=await localAiFreshInventory();
            bagQty=localAiItemQuantity(inv?.inventory,id);
          }
        }
      }catch(e){
        autoLogMsg('warn','RESOLVER '+reason+': rupieciarnia: '+String(e?.message||e));
      }
    }

    const missing=Math.max(0,need-bagQty);
    const result={
      ok:missing===0,itemId:id,required:need,backpack:bagQty,
      movedFromMelina:moved,missing,
      source:missing===0?(moved>0?'melina':'backpack'):(moved>0?'melina+missing':'missing')
    };
    try{localAiPushEvent('item_resolver',{reason,...result});}catch(_e){}
    return result;
  }

"""
if "async function localAiEnsureItemAvailable(" not in s:
    s=s[:p]+resolver+s[p:]

# garden_buy_seeds: przed zakupem wyciagnij z rupieciarni.
old="""      const currentSeed=localAiGardenPrioritySeed(fresh);
      const owned=Math.max(0,Number(currentSeed?.quantity||0));
      const needed=Math.max(0,emptyCount-owned);
      if(needed<=0){
        g.nextAt=0;
        return false;
      }

      const itemId=Number(action.seedItemId||currentSeed?.seedItemId||currentSeed?.seed_item_id||LOCAL_AI_GARDEN_PRIORITY_SEED_ITEM_ID);
      let shopType='';"""
new="""      let currentSeed=localAiGardenPrioritySeed(fresh);
      let owned=Math.max(0,Number(currentSeed?.quantity||0));
      let needed=Math.max(0,emptyCount-owned);
      if(needed<=0){
        g.nextAt=0;
        return false;
      }

      const itemId=Number(action.seedItemId||currentSeed?.seedItemId||currentSeed?.seed_item_id||LOCAL_AI_GARDEN_PRIORITY_SEED_ITEM_ID);

      // v8.8.51: wspolna zasada PLECAK -> RUPIECIARNIA -> ZAKUP.
      // Najpierw probujemy miec w plecaku tyle sadzeniakow, ile jest pustych grzadek.
      let resolved=null;
      try{
        resolved=await localAiEnsureItemAvailable(itemId,emptyCount,{reason:'ogrod: Sadzeniaczek #'+itemId,useMelina:true});
        if(Number(resolved?.movedFromMelina||0)>0){
          const afterPull=await apiActive('/api/character/'+id+'/garden');
          localAiGardenObserve(afterPull,{source:'melina-seeds'});
          currentSeed=localAiGardenPrioritySeed(afterPull);
          owned=Math.max(0,Number(currentSeed?.quantity||0));
          needed=Math.max(0,emptyCount-owned);
          g.lastAction='Rupieciarnia -> plecak: Sadzeniaczek x'+Number(resolved.movedFromMelina||0)+' • brakuje '+needed;
          g.lastActionAt=Date.now();
          localAiSavePersistent();
          if(needed<=0){
            g.nextAt=0;
            state.localAI.worldNextAt=0;
            return true;
          }
        }
      }catch(e){
        autoLogMsg('warn','OGROD: nie udalo sie sprawdzic rupieciarni: '+String(e?.message||e));
      }

      let shopType='';"""
if old not in s: raise SystemExit("Brak bloku garden_buy_seeds do podmiany")
s=s.replace(old,new,1)

# ============================================================
# WYSYPISKO LAB 2.0
# ============================================================

s=replace_top_func(s,"dumpLabZoneKey","""  function dumpLabZoneKey(runId,zoneIndex,scope='gang'){
    return String(scope||'gang')+':'+String(runId==null?'?':runId)+':'+String(zoneIndex==null?'?':zoneIndex);
  }""")

s=replace_top_func(s,"dumpLabPrepareRequest","""  function dumpLabPrepareRequest(url,method,body){
    const u=dumpLabUrlParts(url), m=String(method||'GET').toUpperCase(), b=dumpLabParseBody(body);

    const gang=u.path.match(/\\/api\\/gangs\\/(\\d+)\\/wysypisko\\/dig\\/?$/i);
    if(gang){
      const cid=Number(gang[1]||0);
      const leaseId=b&&b.leaseId!=null?b.leaseId:null;
      const zoneIndex=b&&b.zoneIndex!=null?Number(b.zoneIndex):null;
      const fieldIndex=b&&b.fieldIndex!=null?Number(b.fieldIndex):null;
      const scope=(dumpLab.activeAiLeaseId!=null&&String(leaseId)===String(dumpLab.activeAiLeaseId))?'all-inclusive':'gang';
      const zk=dumpLabZoneKey(leaseId,zoneIndex,scope), z=dumpLab.latestByZone[zk]||null;
      const before=z&&Array.isArray(z.fields)?z.fields.find(f=>Number(f&&f.field_index)===fieldIndex):null;
      return {
        url:u.href,path:u.path,method:m,body:b,characterId:cid,scope,leaseId,runId:leaseId,zoneIndex,fieldIndex,
        beforeField:dumpLabClone(before),beforeDigsRemaining:z&&z.digsRemaining!=null?Number(z.digsRemaining):null,
        beforeZoneHash:z&&z.hash||null
      };
    }

    const solo=u.path.match(/\\/api\\/solo-wysypisko\\/(\\d+)\\/dig\\/?$/i);
    if(solo){
      const cid=Number(solo[1]||0);
      const wysypiskoId=b&&b.wysypiskoId!=null?Number(b.wysypiskoId):null;
      const dayId=b&&b.dayId!=null?b.dayId:null;
      const zoneIndex=b&&b.zoneIndex!=null?Number(b.zoneIndex):null;
      const fieldIndex=b&&b.fieldIndex!=null?Number(b.fieldIndex):null;
      const runId='solo:'+String(wysypiskoId==null?'?':wysypiskoId)+':'+String(dayId==null?'?':dayId);
      const zk=dumpLabZoneKey(runId,zoneIndex,'solo'), z=dumpLab.latestByZone[zk]||null;
      const before=z&&Array.isArray(z.fields)?z.fields.find(f=>Number(f&&f.field_index)===fieldIndex):null;
      return {
        url:u.href,path:u.path,method:m,body:b,characterId:cid,scope:'solo',leaseId:runId,runId,
        wysypiskoId,dayId,zoneIndex,fieldIndex,
        beforeField:dumpLabClone(before),beforeDigsRemaining:z&&z.digsRemaining!=null?Number(z.digsRemaining):null,
        beforeZoneHash:z&&z.hash||null
      };
    }

    return {url:u.href,path:u.path,method:m,body:b};
  }""")

s=replace_top_func(s,"dumpLabCaptureZone","""  function dumpLabCaptureZone(data,meta){
    if(!dumpLab.enabled||!data||!Array.isArray(data.fields)) return;
    const leaseId=meta&&meta.leaseId!=null?meta.leaseId:(dumpLab.activeAiLeaseId!=null?dumpLab.activeAiLeaseId:null);
    const zoneIndex=meta&&meta.zoneIndex!=null?Number(meta.zoneIndex):null;
    const scope=String(meta?.scope||((dumpLab.activeAiLeaseId!=null&&String(leaseId)===String(dumpLab.activeAiLeaseId))?'all-inclusive':'gang'));
    const fields=dumpLabClone(data.fields)||[];
    const raw=JSON.stringify(fields), hash=dumpLabHashText(raw), key=dumpLabZoneKey(leaseId,zoneIndex,scope);
    const unknown=new Set(), signals=new Set();
    let undug=0,peek=0,preRevealed=0;
    fields.forEach(f=>{
      dumpLabUnknownKeys(f).forEach(k=>unknown.add(k));
      const sig=dumpLabFieldSignal(f); if(sig&&sig!=='{}') signals.add(sig);
      if(f&&f.dug_by_character_id==null){
        undug++;
        if(f.peek) peek++;
        if(f.item_id!=null) preRevealed++;
      }
    });
    const snap={
      at:Date.now(),scope,leaseId,runId:meta?.runId??leaseId,
      wysypiskoId:meta?.wysypiskoId??null,dayId:meta?.dayId??null,sourceName:meta?.sourceName||'',
      zoneIndex,digsRemaining:data.digsRemaining!=null?Number(data.digsRemaining):null,
      fieldCount:fields.length,undug,peek,preRevealed,hash,
      unknownKeys:Array.from(unknown).sort(),signalCount:signals.size,
      responseKeys:Object.keys(data).sort(),headers:meta&&meta.headers||{},httpStatus:meta&&meta.status||null
    };
    dumpLab.latestByZone[key]={...snap,fields};
    const last=dumpLab.snapshots[dumpLab.snapshots.length-1];
    if(!(last&&last.scope===scope&&String(last.leaseId)===String(leaseId)&&last.zoneIndex===zoneIndex&&last.hash===hash&&Date.now()-Number(last.at||0)<5000)) dumpLab.snapshots.push(snap);
    dumpLab.stats.zoneSeen=Number(dumpLab.stats.zoneSeen||0)+1;
    dumpLab.lastAction='Zapisano '+scope+': strefa '+zoneIndex+' ('+fields.length+' pol).';
    dumpLabSave();
  }""")

s=replace_top_func(s,"dumpLabCaptureDig","""  function dumpLabCaptureDig(data,meta,ok){
    if(!dumpLab.enabled||!meta) return;
    const b=meta.body||{};
    const scope=String(meta.scope||'gang');
    const leaseId=meta.leaseId!=null?meta.leaseId:(b.leaseId!=null?b.leaseId:null);
    const zoneIndex=meta.zoneIndex!=null?Number(meta.zoneIndex):Number(b.zoneIndex);
    const fieldIndex=meta.fieldIndex!=null?Number(meta.fieldIndex):Number(b.fieldIndex);
    const after=data&&data.field?dumpLabClone(data.field):null;
    const before=meta.beforeField||null;
    const outcome=after&&after.item_id!=null?String(after.item_name||('ID '+after.item_id)):'PUSTE';
    const row={
      at:Date.now(),iso:new Date().toISOString(),ok:ok!==false,characterId:Number(meta.characterId||dumpLab.characterId||0),
      scope,leaseId,runId:meta.runId??leaseId,wysypiskoId:meta.wysypiskoId??null,dayId:meta.dayId??null,
      zoneIndex,fieldIndex,
      digsRemainingBefore:meta.beforeDigsRemaining!=null?Number(meta.beforeDigsRemaining):null,
      digsRemainingAfter:data&&data.digsRemaining!=null?Number(data.digsRemaining):null,
      beforeField:dumpLabClone(before),beforeSignal:dumpLabFieldSignal(before),beforeUnknownKeys:dumpLabUnknownKeys(before),
      beforeZoneHash:meta.beforeZoneHash||null,afterField:after,outcome,
      itemId:after&&after.item_id!=null?Number(after.item_id):null,quantity:after&&after.quantity!=null?Number(after.quantity):null,
      responseKeys:data&&typeof data==='object'?Object.keys(data).sort():[],rawResponse:dumpLabClone(data),headers:meta.headers||{},httpStatus:meta.status||null
    };
    const last=dumpLab.digs[dumpLab.digs.length-1];
    if(last&&last.scope===row.scope&&String(last.leaseId)===String(row.leaseId)&&last.zoneIndex===row.zoneIndex&&last.fieldIndex===row.fieldIndex&&last.outcome===row.outcome&&Date.now()-Number(last.at||0)<5000) return;
    dumpLab.digs.push(row);
    dumpLab.stats.digSeen=Number(dumpLab.stats.digSeen||0)+1;
    dumpLab.lastAction='Kopniecie ['+scope+'] strefa '+zoneIndex+', pole '+fieldIndex+' -> '+outcome+'.';
    dumpLabSave();
  }""")

s=replace_top_func(s,"dumpLabObserveHttp","""  function dumpLabObserveHttp(url,method,requestBody,status,data,headers,ctx,transport){
    if(!dumpLab.enabled) return;
    try{
      const u=dumpLabUrlParts(url), path=u.path, m=String(method||'GET').toUpperCase();
      if(!/\\/api\\/(?:gangs|solo-wysypisko)\\//i.test(path)||!/wysypisko/i.test(path)) return;
      dumpLab.stats.httpSeen=Number(dumpLab.stats.httpSeen||0)+1;
      dumpLab.statusByScope=dumpLab.statusByScope||{};
      dumpLab.soloById=dumpLab.soloById||{};

      const ai=path.match(/\\/api\\/gangs\\/(\\d+)\\/wysypisko-ai\\/status\\/?$/i);
      if(ai){
        dumpLabCaptureStatus(data,{characterId:Number(ai[1]),status,headers,transport});
        dumpLab.statusByScope['all-inclusive']={at:Date.now(),raw:dumpLabClone(data)};
        return;
      }

      const gs=path.match(/\\/api\\/gangs\\/(\\d+)\\/wysypisko\\/status\\/?$/i);
      if(gs){
        dumpLab.characterId=Number(gs[1]||dumpLab.characterId||0);
        dumpLab.statusByScope.gang={at:Date.now(),raw:dumpLabClone(data)};
        dumpLab.lastAction='Status zwyklego wysypiska zapisany.';
        dumpLabSave();
        return;
      }

      const gz=path.match(/\\/api\\/gangs\\/(\\d+)\\/wysypisko\\/zone\\/(\\d+)/i);
      if(gz){
        const leaseId=u.params.get('leaseId');
        const scope=(dumpLab.activeAiLeaseId!=null&&String(leaseId)===String(dumpLab.activeAiLeaseId))?'all-inclusive':'gang';
        dumpLab.characterId=Number(gz[1]||dumpLab.characterId||0);
        dumpLabCaptureZone(data,{characterId:Number(gz[1]),scope,leaseId,runId:leaseId,zoneIndex:Number(gz[2]),status,headers,transport});
        return;
      }

      const gd=path.match(/\\/api\\/gangs\\/(\\d+)\\/wysypisko\\/dig\\/?$/i);
      if(gd&&m==='POST'){
        const c=ctx||dumpLabPrepareRequest(url,m,requestBody);
        c.characterId=Number(gd[1]||0); c.status=status; c.headers=headers||{}; c.transport=transport||'';
        dumpLabCaptureDig(data,c,status>=200&&status<300&&(!data||data.success!==false));
        return;
      }

      const ss=path.match(/\\/api\\/solo-wysypisko\\/(\\d+)\\/status\\/?$/i);
      if(ss){
        dumpLab.characterId=Number(ss[1]||dumpLab.characterId||0);
        const rows=Array.isArray(data?.wysypiska)?data.wysypiska:[];
        rows.forEach(w=>{if(w&&w.id!=null) dumpLab.soloById[String(w.id)]=dumpLabClone(w);});
        dumpLab.statusByScope.solo={at:Date.now(),raw:dumpLabClone(data)};
        dumpLab.lastAction='Status SOLO zapisany: '+rows.length+' wysypisk.';
        dumpLabSave();
        return;
      }

      const sz=path.match(/\\/api\\/solo-wysypisko\\/(\\d+)\\/(\\d+)\\/zone\\/(\\d+)\\/?$/i);
      if(sz){
        const cid=Number(sz[1]||0), wid=Number(sz[2]||0), zi=Number(sz[3]||0);
        const w=dumpLab.soloById[String(wid)]||{};
        const dayId=w.dayId!=null?w.dayId:null;
        const runId='solo:'+wid+':'+String(dayId==null?'?':dayId);
        dumpLabCaptureZone(data,{characterId:cid,scope:'solo',leaseId:runId,runId,wysypiskoId:wid,dayId,sourceName:String(w.name||''),zoneIndex:zi,status,headers,transport});
        return;
      }

      const sd=path.match(/\\/api\\/solo-wysypisko\\/(\\d+)\\/dig\\/?$/i);
      if(sd&&m==='POST'){
        const c=ctx||dumpLabPrepareRequest(url,m,requestBody);
        c.characterId=Number(sd[1]||0); c.status=status; c.headers=headers||{}; c.transport=transport||'';
        dumpLabCaptureDig(data,c,status>=200&&status<300&&(!data||data.success!==false));
        return;
      }

      dumpLabSave();
    }catch(e){
      dumpLab.errors.push({at:Date.now(),where:'observe-v3',message:String(e&&e.message||e)}); dumpLabSave();
    }
  }""")

s=replace_top_func(s,"dumpLabManualScan","""  async function dumpLabManualScan(){
    const cid=Number((settings&&settings.characterId)||dumpLab.characterId||0);
    if(!cid) throw new Error('Brak ID postaci. Otworz gre i odswiez Pomagiera.');
    dumpLab.statusByScope=dumpLab.statusByScope||{};
    dumpLab.soloById=dumpLab.soloById||{};
    const result={allInclusive:{zones:0,active:false},gang:{zones:0,active:false},solo:{zones:0,wysypiska:0},errors:[]};

    dumpLab.lastAction='LAB 2.0: skanuje All Inclusive + gang + SOLO (tylko GET)...';
    dumpLabSave(); try{render();}catch(_){}

    // 1) All Inclusive
    try{
      const st=await apiActive('/api/gangs/'+cid+'/wysypisko-ai/status');
      dumpLabCaptureStatus(st,{characterId:cid,status:200,headers:{},transport:'manual-v3'});
      dumpLab.statusByScope['all-inclusive']={at:Date.now(),raw:dumpLabClone(st)};
      const lease=dumpLabFindLease(st);
      if(lease&&lease.id!=null){
        result.allInclusive.active=true;
        const count=dumpLabInferZoneCount(st,lease);
        for(let i=0;i<count;i++){
          const z=await apiActive('/api/gangs/'+cid+'/wysypisko/zone/'+i+'?leaseId='+encodeURIComponent(lease.id));
          if(z&&Array.isArray(z.fields)){
            dumpLabCaptureZone(z,{characterId:cid,scope:'all-inclusive',leaseId:lease.id,runId:lease.id,zoneIndex:i,status:200,headers:{},transport:'manual-v3'});
            result.allInclusive.zones++;
          }
          await sleep(90);
        }
      }
    }catch(e){result.errors.push('AI: '+String(e?.message||e));}

    // 2) Zwykle gangowe
    try{
      const st=await apiActive('/api/gangs/'+cid+'/wysypisko/status');
      dumpLab.statusByScope.gang={at:Date.now(),raw:dumpLabClone(st)};
      const lease=st&&st.lease&&typeof st.lease==='object'?st.lease:null;
      if(lease&&lease.id!=null){
        result.gang.active=true;
        let count=0;
        if(Array.isArray(lease.zones)) count=lease.zones.length;
        else if(Array.isArray(st.zoneStats)) count=st.zoneStats.length;
        else if(Array.isArray(lease.zoneStats)) count=lease.zoneStats.length;
        else count=Number(lease.zonesCount||st.zonesCount||0);
        for(let i=0;i<count;i++){
          const z=await apiActive('/api/gangs/'+cid+'/wysypisko/zone/'+i+'?leaseId='+encodeURIComponent(lease.id));
          if(z&&Array.isArray(z.fields)){
            dumpLabCaptureZone(z,{characterId:cid,scope:'gang',leaseId:lease.id,runId:lease.id,sourceName:String(lease.name||''),zoneIndex:i,status:200,headers:{},transport:'manual-v3'});
            result.gang.zones++;
          }
          await sleep(90);
        }
      }
    }catch(e){result.errors.push('GANG: '+String(e?.message||e));}

    // 3) SOLO
    try{
      const st=await apiActive('/api/solo-wysypisko/'+cid+'/status');
      dumpLab.statusByScope.solo={at:Date.now(),raw:dumpLabClone(st)};
      const list=(Array.isArray(st?.wysypiska)?st.wysypiska:[]).filter(w=>w&&w.hasAccess!==false);
      result.solo.wysypiska=list.length;
      for(const w of list){
        if(w.id==null || w.dayId==null) continue;
        dumpLab.soloById[String(w.id)]=dumpLabClone(w);
        const count=Array.isArray(w.zones)?w.zones.length:(Array.isArray(w.zoneStats)?w.zoneStats.length:Number(w.zonesCount||0));
        const runId='solo:'+Number(w.id)+':'+String(w.dayId);
        for(let i=0;i<count;i++){
          const z=await apiActive('/api/solo-wysypisko/'+cid+'/'+Number(w.id)+'/zone/'+i);
          if(z&&Array.isArray(z.fields)){
            dumpLabCaptureZone(z,{characterId:cid,scope:'solo',leaseId:runId,runId,wysypiskoId:Number(w.id),dayId:w.dayId,sourceName:String(w.name||''),zoneIndex:i,status:200,headers:{},transport:'manual-v3'});
            result.solo.zones++;
          }
          await sleep(90);
        }
      }
    }catch(e){result.errors.push('SOLO: '+String(e?.message||e));}

    dumpLab.lastAction='Skan GET: AI '+result.allInclusive.zones+' stref • gang '+result.gang.zones+' • SOLO '+result.solo.zones+' ('+result.solo.wysypiska+' wysypisk). 0 kopniec.'+(result.errors.length?' Bledy: '+result.errors.join(' | '):'');
    dumpLabSave(); try{render();}catch(_){}
    return result;
  }""")

# UI: nazwa i czytelniejszy opis / scope w historii.
s=s.replace("Wysypisko All Inclusive LAB","Wysypisko LAB 2.0",1)
s=s.replace("Pasywny rejestrator odpowiedzi serwera. Sam NIE kopie i nie zuzywa limitu.","All Inclusive + zwykle gangowe + SOLO. Pasywny rejestrator; sam NIE kopie i nie zuzywa limitu.",1)
s=s.replace(">Skanuj strefy (GET)<",">Skanuj wszystko (GET)<",1)
s=s.replace("'<div class=\"sub\">przed: '","'<div class=\"sub\">'+esc(String(d.scope||'?'))+' • przed: '",1)

# Recorder marker V3, by przy hot-reloadzie nie zostac na starej wersji wrappera.
s=s.replace("__pomagierDumpLabRecorderV2","__pomagierDumpLabRecorderV3")

# --- twarda walidacja funkcjonalna ---
checks=[
 "async function localAiEnsureItemAvailable(",
 "localAiEnsureItemAvailable(itemId,emptyCount",
 "/api/solo-wysypisko/",
 "scope:'solo'",
 "scope:'all-inclusive'",
 "scope:'gang'",
 "Skanuj wszystko (GET)",
 "function dumpLabPrepareRequest(",
 "function dumpLabObserveHttp(",
 "async function dumpLabManualScan("
]
missing=[x for x in checks if x not in s]
if missing: raise SystemExit("v1.0.44 NIEKOMPLETNA: "+", ".join(missing))

# Upewnij sie, ze stare skanowanie tylko-AI nie pozostalo jako jedyna sciezka.
if "Pobieram status All Inclusive..." in s:
    raise SystemExit("Pozostala stara funkcja dumpLabManualScan")

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
if "versionCode = 10043" not in t or 'versionName = "1.0.43"' not in t:
    raise SystemExit("Oczekiwano Android 1.0.43")
t=t.replace("versionCode = 10043","versionCode = 10044",1)
t=t.replace('versionName = "1.0.43"','versionName = "1.0.44"',1)
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.44 / userscript 8.8.51" not in r:
        r += """

## v1.0.44 / userscript 8.8.51 - Full Storage Resolver + Wysypisko Lab 2.0
- Wspolny resolver: plecak -> rupieciarnia -> zakup.
- Ogrod wyjmuje Sadzeniaczek #804 z rupieciarni przed zakupem.
- Wysypisko Lab obsluguje All Inclusive, zwykle gangowe i SOLO.
- Jeden skan GET zbiera wszystkie dostepne strefy bez zuzywania kopniec.
- Rejestr BEFORE/DIG/AFTER zapisuje scope, runId/leaseId, dayId i wysypiskoId.
- Eksport JSON pozostaje wspolnym materialem badawczym dla wszystkich trybow.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.44 FULL UPDATE applied")
for x in checks: print("OK",x)
