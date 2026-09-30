from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
if not js.exists(): raise SystemExit("Brak userscriptu")
s=js.read_text(encoding="utf-8")

# versions
if "// @version      8.8.51" not in s: raise SystemExit("Oczekiwano JS 8.8.51")
s=s.replace("// @version      8.8.51","// @version      8.8.52",1)
s=s.replace("const VERSION = '8.8.51';","const VERSION = '8.8.52';",1)
s=s.replace("const ANDROID_VERSION = '1.0.44';","const ANDROID_VERSION = '1.0.45';",1)

note="""  // v8.8.52 BATCH BUY + ANDROID EXPORT:
  // - zakupy bazarowe ilosciowe: jedna transakcja moze kupic wiele sztuk (oszczedza dzienny limit zakupow),
  // - kolekcje kupuja brakujaca ilosc paczka zamiast 1 szt. na transakcje,
  // - Drozdze winiarskie #222: zakup surowcowy moze pobrac paczke do 50 szt. w jednej transakcji,
  // - zachowane limity cen, wydatkow i dziennego limitu bazaru,
  // - Wysypisko LAB: natywny zapis JSON przez AndroidBridge/MediaStore do Pobrane/PomagierByDon,
  // - dodatkowy eksport/kopiowanie tylko rekordow kopniec.
"""
anchor="  // v8.8.51"
if note not in s:
    p=s.find(anchor)
    if p>=0: s=s[:p]+note+s[p:]

def func_bounds(text,name):
    m=re.search(r"^  (?:async )?function "+re.escape(name)+r"\(",text,re.M)
    if not m: raise SystemExit("Brak funkcji "+name)
    start=m.start()
    n=re.search(r"^  (?:async )?function [A-Za-z0-9_]+\(",text[m.end():],re.M)
    end=(m.end()+n.start()) if n else len(text)
    return start,end

def replace_func(text,name,code):
    a,b=func_bounds(text,name)
    return text[:a]+code.rstrip()+"\n\n"+text[b:]

# -----------------------------------------------------------------
# Shared safe multi-quantity bazaar helper.
# Insert before collectionShopBuyOne, where apiActive/state already exist.
# -----------------------------------------------------------------
a,_=func_bounds(s,"collectionShopBuyOne")
helper="""  function bazaarListingAvailableQty(row){
    const raw=row?.quantity ?? row?.available_quantity ?? row?.remaining_quantity ?? row?.quantity_remaining ?? row?.available ?? null;
    const n=Number(raw);
    return Number.isFinite(n)&&n>0?Math.floor(n):null;
  }

  function bazaarBatchQuote(listings,requested,{maxUnit=0}={}){
    let left=Math.max(1,Math.floor(Number(requested)||1));
    let total=0,qty=0,maxSeen=0,known=false;
    const rows=(Array.isArray(listings)?listings:[]).slice().sort((a,b)=>Number(a?.price_per_unit||0)-Number(b?.price_per_unit||0));
    for(const row of rows){
      const price=Number(row?.price_per_unit||0);
      if(!(price>0)) continue;
      if(Number(maxUnit||0)>0 && price>Number(maxUnit)) break;
      let avail=bazaarListingAvailableQty(row);
      if(avail==null){
        // Starsze odpowiedzi API czasem nie wystawiaja ilosci per oferta.
        // Wtedy serwer nadal przyjmuje quantity w /buy; traktujemy pierwszy dopuszczalny poziom ceny jako quote.
        if(qty===0){
          const take=left;
          total+=take*price; qty+=take; maxSeen=Math.max(maxSeen,price); left=0;
        }
        break;
      }
      known=true;
      const take=Math.min(left,avail);
      if(take<=0) continue;
      total+=take*price; qty+=take; maxSeen=Math.max(maxSeen,price); left-=take;
      if(left<=0) break;
    }
    return {requested:Math.max(1,Math.floor(Number(requested)||1)),qty,total,maxUnitSeen:maxSeen,complete:left<=0,knownQuantities:known};
  }

  async function bazaarBuyBatch(itemId,enhancementLevel,quantity,{maxUnit=0,orderbook=null}={}){
    const id=Number(settings.characterId||0);
    const qty=Math.max(1,Math.floor(Number(quantity)||1));
    const rem=typeof purchaseRemaining==='function'?purchaseRemaining():null;
    if(rem!=null&&rem<=0) return {manualWait:true,reason:'daily_limit',quantity:0,paid:0};

    const ob=orderbook||await apiActive('/api/bazaar/'+id+'/queue/'+Number(itemId)+'/'+Number(enhancementLevel||0));
    const listings=Array.isArray(ob?.listings)?ob.listings:[];
    const quote=bazaarBatchQuote(listings,qty,{maxUnit});
    if(!quote.complete || quote.qty<qty){
      throw new Error('Brak '+qty+' szt. w dopuszczalnej cenie na bazarze (dostepne: '+quote.qty+').');
    }

    const buy=await apiActive('/api/bazaar/'+id+'/buy',{
      method:'POST',
      body:{itemId:Number(itemId),enhancementLevel:Number(enhancementLevel||0),quantity:qty}
    });
    if(!buy||buy.success===false){
      const msg=String(buy?.error||buy?.message||'Zakup na bazarze nieudany.');
      return {manualWait:/limit.*zakup|dzienny.*limit/i.test(msg),reason:msg,quantity:0,paid:0,response:buy||null};
    }
    if(buy?.purchaseLimit) state.purchaseLimit=buy.purchaseLimit;
    const paid=Number(buy?.totalCost??quote.total);
    return {manualWait:false,quantity:qty,paid,quote,response:buy};
  }

"""
if "async function bazaarBuyBatch(" not in s:
    s=s[:a]+helper+s[a:]

# Collections: buy quantity in one transaction.
s=replace_func(s,"collectionShopBuyOne","""  async function collectionShopBuyOne(itemId,maxUnit,qty=1){
    const id=Number(settings.characterId||0);
    const wanted=Math.max(1,Math.floor(Number(qty)||1));
    if(typeof purchaseRemaining==='function'){
      const rem=purchaseRemaining();
      if(rem!=null&&rem<=0) return {manualWait:true,reason:'daily_limit',quantity:0,paid:0};
    }
    if(typeof localAiGuardInventory==='function'){
      const bag=await localAiGuardInventory({reason:'zakup do kolekcji',processLoot:false,minimumReserve:1});
      if(bag&&!bag.ok) throw new Error('Brak bezpiecznego miejsca w plecaku na zakup do kolekcji.');
    }
    const ob=await collectionShopOrderbook(itemId);
    const best=ob.listings[0];
    if(!best) throw new Error('Brak oferty na bazarze dla item '+itemId+'.');
    const live=Number(best.price_per_unit||0);
    if(!(live>0)) throw new Error('Nieprawidlowa cena bazaru dla item '+itemId+'.');
    if(Number(maxUnit||0)>0 && live>Number(maxUnit||0)){
      throw new Error('Cena wzrosla do '+money(live)+' (potwierdzony limit '+money(maxUnit)+'). Zakup zatrzymany.');
    }

    const r=await bazaarBuyBatch(itemId,0,wanted,{maxUnit:Number(maxUnit||0),orderbook:ob});
    if(r?.manualWait) return r;
    return {manualWait:false,paid:Number(r?.paid||0),quantity:Number(r?.quantity||wanted)};
  }""")

old="""          collectionShop.lastAction='Kupuję: '+row.name;
          try{render();}catch(e){}
          const buyResult=await collectionShopBuyOne(row.itemId,pre.maxByItem[String(row.itemId)]);
          if(buyResult?.manualWait){
            const waited=await collectionShopWaitForBazaarUnlock(collectionId,row);
            if(waited==='stopped') return;
            continue;
          }
          spent+=Number(buyResult?.paid||0); bought++;
          await sleep(450);"""
new="""          const batchNeed=Math.max(1,collectionShopNeed(req));
          collectionShop.lastAction='Kupuję paczkę: '+row.name+' ×'+batchNeed+' (1 transakcja bazaru)';
          try{render();}catch(e){}
          const buyResult=await collectionShopBuyOne(row.itemId,pre.maxByItem[String(row.itemId)],batchNeed);
          if(buyResult?.manualWait){
            const waited=await collectionShopWaitForBazaarUnlock(collectionId,row);
            if(waited==='stopped') return;
            continue;
          }
          spent+=Number(buyResult?.paid||0); bought+=Math.max(1,Number(buyResult?.quantity||batchNeed));
          await sleep(450);"""
if old not in s: raise SystemExit("Brak petli collectionShop zakupu")
s=s.replace(old,new,1)

# Wine yeast source purchase: up to 50 in ONE bazaar purchase, preserving spend cap.
# Do not batch arbitrary unstackable items.
old="""    const spendGate=profitAwarePurchaseDecision(target,live,planned,cycleSpent);
    if(!spendGate.ok) return {ok:false,reason:spendGate.reason};
    if(Number(autoSpend.amount||0)+live>Number(autoCfg.maxSpendPerDay||0)) return {ok:false,reason:'limit wydatku dziennego'};

    if(spendGate.override){"""
new="""    const spendGate=profitAwarePurchaseDecision(target,live,planned,cycleSpent);
    if(!spendGate.ok) return {ok:false,reason:spendGate.reason};

    let batchQty=1;
    let batchQuote={qty:1,total:live,complete:true};
    if(isWineYeastItem(source.itemId,source.name)){
      const spendLeft=Math.max(0,Number(autoCfg.maxSpendPerDay||0)-Number(autoSpend.amount||0));
      const byBudget=live>0?Math.floor(spendLeft/live):0;
      batchQty=Math.max(1,Math.min(50,byBudget||1));
      const priceCeiling=planned>0?planned*maxDrift:live;
      batchQuote=bazaarBatchQuote(listings,batchQty,{maxUnit:priceCeiling});
      batchQty=Math.max(1,Math.min(batchQty,Number(batchQuote.qty||1)));
      batchQuote=bazaarBatchQuote(listings,batchQty,{maxUnit:priceCeiling});
    }
    const estimatedBatchCost=Math.max(live,Number(batchQuote.total||live*batchQty));
    if(Number(autoSpend.amount||0)+estimatedBatchCost>Number(autoCfg.maxSpendPerDay||0)) return {ok:false,reason:'limit wydatku dziennego'};

    if(spendGate.override){"""
# only replace occurrence in buyResourceSourceOne by slicing function
fa,fb=func_bounds(s,"buyResourceSourceOne")
chunk=s[fa:fb]
if old not in chunk: raise SystemExit("Brak spendGate w buyResourceSourceOne")
chunk=chunk.replace(old,new,1)

old2="""    const buy=await apiActive(`/api/bazaar/${settings.characterId}/buy`,{
      method:'POST',
      body:{itemId:Number(source.itemId),enhancementLevel:0,quantity:1}
    });
    const paid=Number(buy?.totalCost??live);"""
new2="""    const buyResult=await bazaarBuyBatch(source.itemId,0,batchQty,{
      maxUnit:planned>0?planned*maxDrift:live,
      orderbook:ob
    });
    if(buyResult?.manualWait) return {ok:false,waitManual:true,reason:buyResult.reason||'limit zakupów wyczerpany'};
    const buy=buyResult?.response||{};
    const paid=Number(buyResult?.paid??live*batchQty);"""
if old2 not in chunk: raise SystemExit("Brak buy quantity=1 w buyResourceSourceOne")
chunk=chunk.replace(old2,new2,1)
chunk=chunk.replace(
"autoLogMsg('info',`SUROWIEC: ${source.name} za ${money(paid)} → demontaż (${dismantleYieldText(staticDismantleById(source.itemId))}).`);",
"autoLogMsg('info',`SUROWIEC: ${source.name} ×${batchQty} za ${money(paid)} • 1 zakup bazaru → demontaż (${dismantleYieldText(staticDismantleById(source.itemId))}).`);",
1)
s=s[:fa]+chunk+s[fb:]

# -----------------------------------------------------------------
# Wysypisko native Android export.
# -----------------------------------------------------------------
a,b=func_bounds(s,"dumpLabExportObject")
# Insert helpers after dumpLabExportObject, before next function, only once.
if "async function dumpLabSaveJsonNative(" not in s:
    insert_at=b
    exporthelper="""  function dumpLabDigsExportObject(){
    return {
      exportedAt:new Date().toISOString(),
      androidVersion:typeof ANDROID_VERSION!=='undefined'?ANDROID_VERSION:null,
      userscriptVersion:typeof VERSION!=='undefined'?VERSION:null,
      type:'wysypisko-digs-only',
      characterId:dumpLab.characterId||null,
      stats:dumpLabClone(dumpLab.stats||{}),
      digs:dumpLabClone(dumpLab.digs||[]),
      errors:dumpLabClone(dumpLab.errors||[])
    };
  }

  async function dumpLabSaveJsonNative(fileName,raw){
    const bridge=window.AndroidBridge;
    if(ANDROID_APP && bridge){
      if(typeof bridge.beginTextFile==='function' && typeof bridge.appendTextFileChunk==='function' && typeof bridge.finishTextFile==='function'){
        let begun=false;
        try{
          begun=!!bridge.beginTextFile(String(fileName));
          if(!begun) throw new Error('Android nie rozpoczal zapisu pliku.');
          const size=24000;
          for(let i=0;i<raw.length;i+=size){
            if(!bridge.appendTextFileChunk(raw.slice(i,i+size))) throw new Error('Android przerwal zapis JSON.');
            await sleep(0);
          }
          if(!bridge.finishTextFile()) throw new Error('Android nie zakonczyl zapisu JSON.');
          return true;
        }catch(e){
          try{if(begun&&typeof bridge.abortTextFile==='function') bridge.abortTextFile();}catch(_){}
          throw e;
        }
      }
      if(typeof bridge.saveTextFile==='function'){
        bridge.saveTextFile(String(fileName),String(raw));
        return true;
      }
    }
    return false;
  }

  function dumpLabBrowserDownload(fileName,raw){
    const blob=new Blob([raw],{type:'application/json;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=fileName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }

"""
    s=s[:insert_at]+exporthelper+s[insert_at:]

s=replace_func(s,"dumpLabExport","""  async function dumpLabExport(){
    const raw=JSON.stringify(dumpLabExportObject(),null,2);
    const fileName='pomagier_wysypisko_lab_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    try{
      const nativeSaved=await dumpLabSaveJsonNative(fileName,raw);
      if(!nativeSaved) dumpLabBrowserDownload(fileName,raw);
      dumpLab.lastAction=(nativeSaved?'Zapisano w Pobrane/PomagierByDon: ':'Eksport JSON przygotowany: ')+fileName+' ('+raw.length+' znakow).';
    }catch(e){
      dumpLab.lastAction='BLAD zapisu JSON: '+String(e?.message||e);
      throw e;
    }finally{
      dumpLabSave(); try{render();}catch(_){}
    }
  }""")

# Add only-digs export/copy funcs before dumpLabHTML
ha,_=func_bounds(s,"dumpLabHTML")
extra="""  async function dumpLabExportDigs(){
    const raw=JSON.stringify(dumpLabDigsExportObject(),null,2);
    const fileName='pomagier_wysypisko_digs_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    const nativeSaved=await dumpLabSaveJsonNative(fileName,raw);
    if(!nativeSaved) dumpLabBrowserDownload(fileName,raw);
    dumpLab.lastAction=(nativeSaved?'Zapisano kopniecia: ':'Eksport kopniec: ')+fileName+' • rekordow '+(dumpLab.digs||[]).length;
    dumpLabSave(); try{render();}catch(_){}
  }

  async function dumpLabCopyDigs(){
    const raw=JSON.stringify(dumpLabDigsExportObject(),null,2);
    if(navigator.clipboard&&navigator.clipboard.writeText) await navigator.clipboard.writeText(raw);
    else{
      const ta=document.createElement('textarea');ta.value=raw;ta.style.position='fixed';ta.style.left='-9999px';
      document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
    }
    dumpLab.lastAction='Skopiowano tylko kopniecia ('+(dumpLab.digs||[]).length+' rekordow).';
    dumpLabSave(); try{render();}catch(_){}
  }

"""
if "async function dumpLabExportDigs(" not in s:
    s=s[:ha]+extra+s[ha:]

# Add extra UI + handlers right after panel is created. This avoids dependency on older main click dispatcher.
panel_anchor="  const panel = makePanel();"
if panel_anchor not in s: raise SystemExit("Brak const panel")
uihook="""  const panel = makePanel();

  // v8.8.52: lekkie rozszerzenie LAB bez ingerowania w glowny dispatcher.
  setInterval(()=>{
    try{
      if(state.activeTab!=='dumpLab') return;
      const content=panel.querySelector('.content');
      if(!content || content.querySelector('[data-v1045-dig-export]')) return;
      const box=document.createElement('div');
      box.setAttribute('data-v1045-dig-export','1');
      box.className='helper-actions';
      box.style.margin='8px 0';
      box.innerHTML='<button data-act-v1045="dump-digs-export">Eksportuj tylko kopniecia</button><button data-act-v1045="dump-digs-copy">Kopiuj tylko kopniecia</button>';
      content.prepend(box);
    }catch(_){}
  },700);

  panel.addEventListener('click',async e=>{
    const btn=e.target&&e.target.closest?e.target.closest('[data-act-v1045]'):null;
    if(!btn) return;
    e.preventDefault(); e.stopPropagation();
    try{
      const act=btn.getAttribute('data-act-v1045');
      if(act==='dump-digs-export') await dumpLabExportDigs();
      if(act==='dump-digs-copy') await dumpLabCopyDigs();
    }catch(err){
      dumpLab.lastAction='BLAD: '+String(err?.message||err); dumpLabSave(); try{render();}catch(_){}
    }
  },true);"""
if "data-v1045-dig-export" not in s:
    s=s.replace(panel_anchor,uihook,1)

# Sanity checks
checks=[
 "// @version      8.8.52",
 "const ANDROID_VERSION = '1.0.45';",
 "async function bazaarBuyBatch(",
 "quantity:qty",
 "Kupuję paczkę:",
 "isWineYeastItem(source.itemId,source.name)",
 "Math.min(50",
 "async function dumpLabSaveJsonNative(",
 "beginTextFile",
 "appendTextFileChunk",
 "async function dumpLabExportDigs(",
 "Kopiuj tylko kopniecia"
]
missing=[x for x in checks if x not in s]
if missing: raise SystemExit("v1.0.45 NIEKOMPLETNA: "+", ".join(missing))

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
if "versionCode = 10044" not in t or 'versionName = "1.0.44"' not in t:
    raise SystemExit("Oczekiwano Android 1.0.44")
t=t.replace("versionCode = 10044","versionCode = 10045",1)
t=t.replace('versionName = "1.0.44"','versionName = "1.0.45"',1)
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.45 / userscript 8.8.52" not in r:
        r += """

## v1.0.45 / userscript 8.8.52 - Batch Buy + Android JSON Export
- Zakupy ilosciowe na bazarze: wiele sztuk w jednej transakcji tam, gdzie znamy potrzebna ilosc.
- Kolekcje kupuja brakujaca ilosc paczka zamiast sztuka po sztuce.
- Drozdze winiarskie #222: przy zakupie surowca paczka do 50 sztuk w jednej transakcji, z zachowaniem limitu ceny i budzetu.
- Wysypisko LAB zapisuje JSON natywnie na Androidzie do Pobrane/PomagierByDon przez AndroidBridge.
- Dodane eksport/kopiowanie tylko rekordow kopniec.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.45 Batch Buy + Android Export applied")
for x in checks: print("OK",x)
