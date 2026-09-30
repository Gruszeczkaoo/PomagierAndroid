from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
s=js.read_text(encoding="utf-8")

if "// @version      8.8.53" not in s:
    raise SystemExit("Oczekiwano JS 8.8.53")
s=s.replace("// @version      8.8.53","// @version      8.8.54",1)
s=s.replace("const VERSION = '8.8.53';","const VERSION = '8.8.54';",1)
s=s.replace("const ANDROID_VERSION = '1.0.46';","const ANDROID_VERSION = '1.0.47';",1)

note="""  // v8.8.54 BATCH BUY 2:
  // - pozostale zakupy skladnikow nie ida juz po 1 sztuce,
  // - Obierki po jablkach #220, Zgnile/Sfermentowane jablko #144 i inne stackowalne skladniki kat. 2
  //   moga byc kupione paczka w jednej transakcji bazaru,
  // - zrodla do demontazu kupujemy maks. do liczby wolnych miejsc kolejki i od razu kolejkuejemy caly zakup,
  // - dodatkowe skladniki receptury kupuja od razu brakujaca ilosc, a magazyn strategiczny uzupelnia do celu,
  // - limity ceny, zysku, budzetu i dzienny limit zakupow pozostaja aktywne.
"""
anchor="  // v8.8.53"
p=s.find(anchor)
if p>=0 and note not in s:
    s=s[:p]+note+s[p:]

def bounds(name):
    m=re.search(r"^  async function "+re.escape(name)+r"\(",s,re.M)
    if not m: raise SystemExit("Brak "+name)
    n=re.search(r"^  (?:async )?function [A-Za-z0-9_]+\(",s[m.end():],re.M)
    return m.start(), (m.end()+n.start()) if n else len(s)

def put(name,code):
    global s
    a,b=bounds(name)
    s=s[:a]+code.rstrip()+"\n\n"+s[b:]

# Helper: only known stackables / category 2 when the item is used as a dismantle source.
a,_=bounds("buyExtraIngredientOne")
helper=r"""  const BULK_STACK_DISMANTLE_IDS=new Set([144,219,220,222]);
  function isBulkStackDismantleItem(itemId,name=''){
    const id=Number(itemId||0);
    if(BULK_STACK_DISMANTLE_IDS.has(id)) return true;
    try{
      const p=getPrice(id,0);
      if(Number(p?.category_id??p?.categoryId??0)===2) return true;
    }catch(_){}
    return /obierki|drożdże|drozdze|zgniłe\s+jabłko|zgnile\s+jablko|sfermentowan\w*\s+jabł/i.test(String(name||''));
  }
"""
if "function isBulkStackDismantleItem(" not in s:
    s=s[:a]+helper+s[a:]

put("buyExtraIngredientOne",r"""  async function buyExtraIngredientOne(target,extra,cycleSpent){
    resetAutoSpendIfNeeded();

    if(autoCfg.localAiMelinaFirst && autoCfg.localAiMelinaReturnForCraft){
      try{
        const storage=await localAiFreshMelina();
        const stored=(storage.storageItems||[]).find(x=>Number(x.id||x.item_id||0)===Number(extra.id));
        if(stored){
          state.auto.stage='RUPIECIARNIA → CRAFT';
          state.auto.stageDetail=`Wyjmuję ${extra.name} zamiast kupować`;
          const take=await localAiReplayMelinaRemove(Number(stored.inventory_id));
          if(take.ok){
            state.auto.lockedRecipeId=Number(target.recipe.id);
            clearRecipePurchaseStall(target.recipe.id);
            autoLogMsg('info',`SKŁADNIK Z RUPIECIARNI: ${extra.name} — bez zakupu.`);
            return {ok:true,spent:0,fromMelina:true};
          }
        }
      }catch(e){ autoLogMsg('warn',`RUPIECIARNIA → CRAFT: ${String(e?.message||e)}`); }
    }

    const rem=purchaseRemaining();
    if(rem!=null && rem<=0) return {ok:false,reason:'limit zakupów wyczerpany'};

    const ob=await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(extra.id)}/${Number(extra.minEnhancement||0)}`);
    const listings=(ob?.listings||[]).slice().sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit));
    const first=listings[0];
    if(!first) return {ok:false,reason:`brak ofert: ${extra.name}`};

    const live=Number(first.price_per_unit);
    const planned=Number(extra.unit||live);
    const maxDrift=1+Number(autoCfg.maxInputPriceDriftPct||0)/100;
    const maxUnit=planned>0?planned*maxDrift:live*maxDrift;
    if(planned>0 && live>maxUnit) return {ok:false,reason:`${extra.name}: cena wzrosła z ${money(planned)} do ${money(live)}`};

    const dayLeft=Math.max(0,Number(autoCfg.maxSpendPerDay||0)-Number(autoSpend.amount||0));
    let batchQty=Math.max(1,Math.min(50,Math.floor(Number(extra.miss||1))));
    let batchQuote=null,spendGate=null,lastReason='brak paczki w limitach';
    for(;batchQty>=1;batchQty--){
      const q=bazaarBatchQuote(listings,batchQty,{maxUnit});
      if(!q.complete || Number(q.qty||0)<batchQty) continue;
      if(Number(q.total||0)>dayLeft){ lastReason='limit wydatku dziennego'; continue; }
      const g=profitAwarePurchaseDecision(target,Number(q.total||0),planned*batchQty,cycleSpent);
      if(!g.ok){ lastReason=g.reason||lastReason; continue; }
      batchQuote=q; spendGate=g; break;
    }
    if(!batchQuote||!spendGate) return {ok:false,reason:lastReason};

    if(spendGate.override){
      state.auto.stage='ZAKUP SKŁADNIKA • PROFIT OVERRIDE';
      state.auto.stageDetail=`${extra.name} ×${batchQty}: ${money(batchQuote.total)} • ${spendGate.reason}`;
      autoLogMsg('info',spendGate.reason);
    }

    if(autoCfg.dryRun){
      state.auto.stage='TEST: ZAKUP SKŁADNIKA';
      state.auto.stageDetail=`Kupiłbym ${extra.name} ×${batchQty} za ${money(batchQuote.total)} • 1 zakup`;
      return {ok:false,dry:true,reason:'dry-run'};
    }

    const br=await bazaarBuyBatch(Number(extra.id),Number(extra.minEnhancement||0),batchQty,{maxUnit,orderbook:ob});
    if(br?.manualWait) return {ok:false,reason:br.reason||'limit zakupów wyczerpany'};
    const paid=Number(br?.paid??batchQuote.total);

    autoSpend.amount=Number(autoSpend.amount||0)+paid;
    autoSpend.purchases=Number(autoSpend.purchases||0)+1;
    saveJSON(K.autoSpend,autoSpend);
    sessionRecordPurchase(paid);

    state.auto.lockedRecipeId=Number(target.recipe.id);
    clearRecipePurchaseStall(target.recipe.id);
    autoLogMsg('info',`KUPIONO SKŁADNIK: ${extra.name} ×${batchQty} za ${money(paid)} • 1 zakup bazaru.`);
    return {ok:true,spent:paid,quantity:batchQty,profitOverride:!!spendGate.override};
  }""")

put("strategicBuyExtra",r"""  async function strategicBuyExtra(plan,tier='target'){
    if(!autoCfg.autoBuy || !autoCfg.strategicExtraIngredients) return false;
    const e=bestStrategicExtra(plan,tier);
    if(!e) return false;

    const ob=await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(e.id)}/${Number(e.enhancement||0)}`);
    const listings=(ob?.listings||[]).slice().sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit));
    const first=listings[0];
    if(!first){ state.auto.stage='MAGAZYN: BRAK SKŁADNIKA'; state.auto.stageDetail=`Brak ofert: ${e.name}`; return false; }

    const live=Number(first.price_per_unit);
    const reference=getHistoricalPrice(e.id,e.enhancement)||live;
    let maxUnit=live*(1+Number(autoCfg.maxInputPriceDriftPct||0)/100);
    if(tier==='target'){
      const bargain=reference*Math.max(0.10,Math.min(1.20,Number(autoCfg.strategicBargainPct||0.85)));
      if(live>bargain){ state.auto.stage='MAGAZYN: CZEKA NA OKAZJĘ'; state.auto.stageDetail=`${e.name}: ${money(live)} > okazja ${money(bargain)}`; return false; }
      maxUnit=bargain;
    }

    let qty=Math.max(1,Math.min(50,Math.floor(Number(e.target||0)-Number(e.have||0) || 1)));
    let quote=null;
    for(;qty>=1;qty--){
      const q=bazaarBatchQuote(listings,qty,{maxUnit});
      if(q.complete && Number(q.qty||0)>=qty && strategicCanSpend(Number(q.total||0),0)){ quote=q; break; }
    }
    if(!quote){ state.auto.stage='MAGAZYN: LIMIT'; state.auto.stageDetail='Brak paczki mieszczącej się w budżecie/cenie'; return false; }

    if(autoCfg.dryRun){
      state.auto.stage='TEST: MAGAZYN → SKŁADNIK';
      state.auto.stageDetail=`Kupiłbym ${e.name} ×${qty} za ${money(quote.total)} • 1 zakup`;
      return true;
    }

    const br=await bazaarBuyBatch(Number(e.id),Number(e.enhancement||0),qty,{maxUnit,orderbook:ob});
    if(br?.manualWait) return false;
    const paid=Number(br?.paid??quote.total);
    recordStrategicSpend(paid);
    state.auto.strategicLastAction=`Składnik: ${e.name} ×${qty} za ${money(paid)} • 1 zakup`;
    autoLogMsg('info',`MAGAZYN: kupiono ${e.name} ×${qty} za ${money(paid)} • 1 zakup bazaru.`);
    return true;
  }""")

put("buyBundleItemOne",r"""  async function buyBundleItemOne(target,planItem,cycleSpent){
    resetAutoSpendIfNeeded();
    if(!planItem) return {ok:false,reason:'brak pozycji w planie'};
    if(isCraftIngredientProtected(planItem.itemId)) return {ok:false,reason:craftIngredientProtectionText(planItem.itemId)};
    if(dismantleFreeSlots()<=0) return {ok:false,reason:'kolejka demontażu pełna'};

    const rem=purchaseRemaining();
    if(rem!=null && rem<=0) return {ok:false,reason:'limit zakupów wyczerpany'};

    const ob=await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(planItem.itemId)}/0`);
    const listings=(ob?.listings||[]).slice().sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit));
    const first=listings[0];
    if(!first) return {ok:false,reason:`brak ofert: ${planItem.name}`};

    const live=Number(first.price_per_unit);
    const planned=Number(planItem.unitPrice||planItem.price||live);
    const maxDrift=1+Number(autoCfg.maxInputPriceDriftPct||0)/100;
    const maxUnit=planned>0?planned*maxDrift:live*maxDrift;
    if(planned>0 && live>maxUnit) return {ok:false,reason:`${planItem.name}: cena wzrosła z ${money(planned)} do ${money(live)}`};

    const y=planItem.yields||{};
    if(Number(y.odpady||0)>0 && Number(autoCfg.maxCostPerOdpady||0)>0){
      const cpo=live/Math.max(1,Number(y.odpady||0));
      if(cpo>Number(autoCfg.maxCostPerOdpady)) return {ok:false,reason:`${planItem.name}: ${money(cpo)}/odpad > limit ${money(autoCfg.maxCostPerOdpady)}`};
    }

    const bulk=isBulkStackDismantleItem(planItem.itemId,planItem.name);
    let qty=bulk?Math.max(1,Math.min(50,Math.floor(Number(planItem.count||1)),dismantleFreeSlots())):1;
    const dayLeft=Math.max(0,Number(autoCfg.maxSpendPerDay||0)-Number(autoSpend.amount||0));
    let quote=null,spendGate=null,lastReason='brak paczki w limitach';
    for(;qty>=1;qty--){
      const q=bazaarBatchQuote(listings,qty,{maxUnit});
      if(!q.complete || Number(q.qty||0)<qty) continue;
      if(Number(q.total||0)>dayLeft){ lastReason='limit wydatku dziennego'; continue; }
      const g=profitAwarePurchaseDecision(target,Number(q.total||0),planned*qty,cycleSpent);
      if(!g.ok){ lastReason=g.reason||lastReason; continue; }
      quote=q; spendGate=g; break;
    }
    if(!quote||!spendGate) return {ok:false,reason:lastReason};

    if(autoCfg.dryRun){
      state.auto.stage='TEST: ZAKUP → DEMONTAŻ';
      state.auto.stageDetail=`Kupiłbym ${planItem.name} ×${qty} za ${money(quote.total)} • 1 zakup`;
      return {ok:false,dry:true,reason:'dry-run'};
    }

    const before=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    const beforeMap=snapshotDismantlable(before?.items,planItem.itemId);
    const br=await bazaarBuyBatch(Number(planItem.itemId),0,qty,{maxUnit,orderbook:ob});
    if(br?.manualWait) return {ok:false,reason:br.reason||'limit zakupów wyczerpany'};
    const paid=Number(br?.paid??quote.total);

    autoSpend.amount=Number(autoSpend.amount||0)+paid;
    autoSpend.purchases=Number(autoSpend.purchases||0)+1;
    saveJSON(K.autoSpend,autoSpend);
    sessionRecordPurchase(paid);

    await sleep(Math.min(1200,Number(autoCfg.actionDelayMs||900)));
    const after=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    const inv=findPurchasedInventory(beforeMap,after?.items,planItem.itemId);
    if(!inv) throw new Error(`Kupiono ${planItem.name}, ale nie znaleziono stacka do demontażu.`);

    let queued=0;
    const toQueue=bulk?Math.min(qty,dismantleFreeSlots()):1;
    for(let i=0;i<toQueue;i++){
      const qr=await apiActive(`/api/workshop/${settings.characterId}/queue/add`,{method:'POST',body:{inventoryId:Number(inv.inventory_id)}});
      parseQueue(qr); queued++;
      if(i+1<toQueue) await sleep(120);
    }

    const meta=staticDismantleById(planItem.itemId);
    const mins=Number(meta?.baseTime||0)/Math.max(0.0001,Number(state.dismantleSpeed||1))/60;
    if(target?.recipe) clearRecipePurchaseStall(target.recipe.id);
    autoLogMsg('info',`GLOBAL: ${planItem.name} ×${qty} za ${money(paid)} • 1 zakup bazaru → demontaż ${queued} szt. (${fmt(mins,1)} min/szt.).`);
    return {ok:true,spent:paid,quantity:qty,queued,profitOverride:!!spendGate.override};
  }""")

checks=[
 "// @version      8.8.54",
 "const ANDROID_VERSION = '1.0.47';",
 "function isBulkStackDismantleItem(",
 "async function buyExtraIngredientOne(",
 "async function strategicBuyExtra(",
 "async function buyBundleItemOne(",
 "bazaarBuyBatch(",
 "1 zakup bazaru"
]
miss=[x for x in checks if x not in s]
if miss: raise SystemExit("v1.0.47 NIEKOMPLETNA: "+", ".join(miss))
for name in ["buyExtraIngredientOne","strategicBuyExtra","buyBundleItemOne"]:
    a,b=bounds(name)
    if re.search(r"quantity\s*:\s*1\b",s[a:b]):
        raise SystemExit(name+": nadal quantity:1")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
if "versionCode = 10046" not in t or 'versionName = "1.0.46"' not in t:
    raise SystemExit("Oczekiwano Android 1.0.46")
t=t.replace("versionCode = 10046","versionCode = 10047",1)
t=t.replace('versionName = "1.0.46"','versionName = "1.0.47"',1)
bg.write_text(t,encoding="utf-8")
js.write_text(s,encoding="utf-8")

print("v1.0.47 Batch Buy 2 applied")
print("OK: Obierki po jablkach / Zgnile-Sfermentowane jablko / kat.2 batch")
print("OK: direct extras + strategic extras batch")
