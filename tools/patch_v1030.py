from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
js = root / "app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak pomagier.user.js")

s = js.read_text(encoding="utf-8")

s = s.replace("// @version      8.8.36", "// @version      8.8.37", 1)
s = s.replace("const VERSION = '8.8.36';", "const VERSION = '8.8.37';", 1)
s = s.replace("const ANDROID_VERSION = '1.0.29';", "const ANDROID_VERSION = '1.0.30';", 1)

anchor = "  // v8.8.36"
note = """  // v8.8.37 KOLEKCJE — KUP + ODDAJ:
  // - nowa zakładka „Kolekcje” z filtrem T1–T5 i stanem wymaganych przedmiotów,
  // - kliknięcie „Kup + oddaj” robi preflight na świeżych cenach z bazaru,
  // - przed wydaniem pieniędzy pokazuje potwierdzenie z listą braków i łącznym kosztem,
  // - najpierw wykorzystuje przedmioty już posiadane, kupuje tylko brakujące sztuki,
  // - po zakupie automatycznie oddaje przedmioty do wskazanej kolekcji,
  // - po skompletowaniu automatycznie odbiera nagrodę z /claim/{collectionId},
  // - ochrona ceny: jeśli w trakcie operacji cena wzrośnie ponad potwierdzoną, automat zatrzymuje się,
  // - działa także z kolekcjami powtarzalnymi i ich bieżącym cyklem.
"""
if note not in s:
    p=s.find(anchor)
    if p>=0:
        s=s[:p]+note+s[p:]

# Moduł wstawiamy przed SPÓŁKĄ.
company_anchor = "  // ============================================================\n  // SPÓŁKA AUTO v8.8.34"
if company_anchor not in s:
    raise SystemExit("Nie znaleziono kotwicy SPÓŁKA AUTO")

module = r"""  // ============================================================
  // KOLEKCJE — KUP + ODDAJ v8.8.37
  // ============================================================
  let collectionShop={
    busy:false,
    data:null,
    selectedTier:5,
    lastRefreshAt:0,
    lastAction:'',
    lastError:''
  };

  function collectionShopAll(data){
    const out=[];
    for(const tier of (data?.tiers||[])){
      if(tier?.unlocked===false) continue;
      for(const c of (tier?.collections||[])){
        if(!c) continue;
        if(c.isCompleted && !c.isRepeatable) continue;
        out.push({...c,__tier:Number(tier.tier||c.tier||0)});
      }
    }
    return out;
  }
  function collectionShopFind(data,id){
    id=Number(id||0);
    return collectionShopAll(data).find(c=>Number(c.id)===id)||null;
  }
  function collectionShopNeed(req){
    return Math.max(0,Number(req?.required||0)-Number(req?.deposited||0));
  }
  function collectionShopOwnedUse(req){
    return Math.min(collectionShopNeed(req),Math.max(0,Number(req?.owned||0)));
  }
  function collectionShopToBuy(req){
    return Math.max(0,collectionShopNeed(req)-collectionShopOwnedUse(req));
  }
  function collectionShopReward(c){
    const bits=[];
    if(Number(c?.rewardMoney||0)>0) bits.push(money(Number(c.rewardMoney||0)));
    if(Number(c?.rewardGoldenTeeth||0)>0) bits.push(Number(c.rewardGoldenTeeth)+' zł. zębów');
    for(const x of (c?.rewardItems||[])){
      bits.push((Number(x.quantity||1)>1?Number(x.quantity||1)+'× ':'')+String(x.name||('item '+x.itemId)));
    }
    return bits.join(' • ')||'—';
  }
  async function collectionShopRefresh(renderAfter=true){
    const id=Number(settings.characterId||0);
    if(!id) return false;
    try{
      collectionShop.lastError='';
      const data=await apiActive('/api/collections/'+id);
      if(!data||data.success===false) throw new Error(String(data?.error||data?.message||'Brak danych kolekcji'));
      collectionShop.data=data;
      collectionShop.lastRefreshAt=Date.now();
      const tiers=(data.tiers||[]).filter(x=>x?.unlocked!==false).map(x=>Number(x.tier||0)).filter(Boolean);
      if(tiers.length && !tiers.includes(Number(collectionShop.selectedTier||0))) collectionShop.selectedTier=Math.max(...tiers);
      if(renderAfter) try{render();}catch(e){}
      return true;
    }catch(e){
      collectionShop.lastError=String(e?.message||e);
      if(renderAfter) try{render();}catch(e){}
      return false;
    }
  }
  async function collectionShopOrderbook(itemId){
    const id=Number(settings.characterId||0);
    const ob=await apiActive('/api/bazaar/'+id+'/queue/'+Number(itemId)+'/0');
    const listings=Array.isArray(ob?.listings)?ob.listings.slice():[];
    listings.sort((a,b)=>Number(a.price_per_unit||Infinity)-Number(b.price_per_unit||Infinity));
    return {raw:ob,listings};
  }
  function collectionShopEstimateQty(listings,qty){
    qty=Math.max(0,Number(qty||0));
    let left=qty,total=0,maxUnit=0,available=0;
    for(const row of (listings||[])){
      if(left<=0) break;
      const p=Number(row?.price_per_unit||0);
      if(!(p>0)) continue;
      const q=Math.max(1,Number(row?.quantity||1));
      const take=Math.min(left,q);
      total+=take*p;
      maxUnit=Math.max(maxUnit,p);
      available+=take;
      left-=take;
    }
    return {ok:left<=0,total,maxUnit,available,missing:left};
  }
  async function collectionShopPreflight(collectionId){
    const id=Number(settings.characterId||0);
    if(!id) throw new Error('Brak ID postaci.');
    const data=await apiActive('/api/collections/'+id);
    if(!data||data.success===false) throw new Error(String(data?.error||data?.message||'Brak danych kolekcji'));
    collectionShop.data=data;
    const c=collectionShopFind(data,collectionId);
    if(!c) throw new Error('Nie znaleziono aktywnej kolekcji.');

    const rows=[];
    let total=0;
    const maxByItem={};
    let purchases=0;
    for(const req of (c.requiredItems||[])){
      const need=collectionShopNeed(req);
      if(need<=0) continue;
      const ownedUse=collectionShopOwnedUse(req);
      const toBuy=Math.max(0,need-ownedUse);
      let est={ok:true,total:0,maxUnit:0,available:0,missing:0};
      if(toBuy>0){
        const ob=await collectionShopOrderbook(req.itemId);
        est=collectionShopEstimateQty(ob.listings,toBuy);
        if(!est.ok){
          throw new Error('Brakuje ofert na bazarze: '+String(req.name||req.itemId)+' • dostępne '+est.available+'/'+toBuy+'.');
        }
        total+=est.total;
        maxByItem[String(req.itemId)]=est.maxUnit;
        purchases+=toBuy;
      }
      rows.push({
        itemId:Number(req.itemId),
        name:String(req.name||('item '+req.itemId)),
        need,ownedUse,toBuy,
        estimatedCost:Number(est.total||0),
        maxUnit:Number(est.maxUnit||0)
      });
    }
    return {collection:c,rows,total,maxByItem,purchases};
  }
  function collectionShopPreflightText(p){
    const c=p.collection;
    const lines=(p.rows||[]).map(r=>{
      const parts=[];
      if(r.ownedUse>0) parts.push(r.ownedUse+' z plecaka');
      if(r.toBuy>0) parts.push('kupić '+r.toBuy+' za ~'+money(r.estimatedCost));
      return '• '+r.name+': '+parts.join(', ');
    });
    if(!lines.length) lines.push('• Wszystkie wymagane przedmioty są już oddane.');
    return 'KOLEKCJA: '+String(c.name||'')+
      '\n\n'+lines.join('\n')+
      '\n\nSzacowany koszt zakupów: '+money(p.total)+
      '\nNagroda: '+collectionShopReward(c)+
      '\n\nPomagier NIE kupi sztuki drożej niż cena użyta w tym potwierdzeniu.'+
      '\n\nKontynuować?';
  }
  async function collectionShopDeposit(collectionId,itemId){
    const id=Number(settings.characterId||0);
    const r=await apiActive('/api/collections/'+id+'/deposit/'+Number(collectionId)+'/'+Number(itemId),{method:'POST'});
    if(!r||r.success===false) throw new Error(String(r?.error||r?.message||'Nie udało się oddać przedmiotu.'));
    return r;
  }
  async function collectionShopBuyOne(itemId,maxUnit){
    const id=Number(settings.characterId||0);
    if(typeof purchaseRemaining==='function'){
      const rem=purchaseRemaining();
      if(rem!=null&&rem<=0) throw new Error('Koniec dziennego limitu zakupów na bazarze.');
    }
    if(typeof localAiGuardInventory==='function'){
      const bag=await localAiGuardInventory({reason:'zakup do kolekcji',processLoot:false,minimumReserve:1});
      if(bag&&!bag.ok) throw new Error('Brak bezpiecznego miejsca w plecaku na zakup do kolekcji.');
    }
    const ob=await collectionShopOrderbook(itemId);
    const best=ob.listings[0];
    if(!best) throw new Error('Brak oferty na bazarze dla item '+itemId+'.');
    const live=Number(best.price_per_unit||0);
    if(!(live>0)) throw new Error('Nieprawidłowa cena bazaru dla item '+itemId+'.');
    if(Number(maxUnit||0)>0 && live>Number(maxUnit||0)){
      throw new Error('Cena wzrosła do '+money(live)+' (potwierdzony limit '+money(maxUnit)+'). Zakup zatrzymany.');
    }
    const buy=await apiActive('/api/bazaar/'+id+'/buy',{
      method:'POST',
      body:{itemId:Number(itemId),enhancementLevel:0,quantity:1}
    });
    if(!buy||buy.success===false) throw new Error(String(buy?.error||buy?.message||'Zakup na bazarze nieudany.'));
    if(buy?.purchaseLimit) state.purchaseLimit=buy.purchaseLimit;
    return Number(buy?.totalCost??live);
  }
  async function collectionShopRun(collectionId){
    if(collectionShop.busy) return;
    collectionShop.busy=true;
    collectionShop.lastError='';
    collectionShop.lastAction='Sprawdzam świeże ceny…';
    try{render();}catch(e){}
    try{
      const pre=await collectionShopPreflight(collectionId);
      if(!confirm(collectionShopPreflightText(pre))){
        collectionShop.lastAction='Anulowano — nic nie kupiono.';
        return;
      }

      const id=Number(settings.characterId||0);
      let spent=0,bought=0,deposited=0;

      for(const row of pre.rows){
        while(true){
          const fresh=await apiActive('/api/collections/'+id);
          if(!fresh||fresh.success===false) throw new Error('Nie udało się odświeżyć kolekcji.');
          collectionShop.data=fresh;
          const c=collectionShopFind(fresh,collectionId);
          if(!c) throw new Error('Kolekcja zniknęła lub została zakończona.');
          const req=(c.requiredItems||[]).find(x=>Number(x.itemId)===Number(row.itemId));
          if(!req || collectionShopNeed(req)<=0) break;

          if(Number(req.owned||0)>0){
            collectionShop.lastAction='Oddaję: '+row.name;
            try{render();}catch(e){}
            await collectionShopDeposit(collectionId,row.itemId);
            deposited++;
            await sleep(220);
            continue;
          }

          collectionShop.lastAction='Kupuję: '+row.name;
          try{render();}catch(e){}
          const paid=await collectionShopBuyOne(row.itemId,pre.maxByItem[String(row.itemId)]);
          spent+=paid; bought++;
          await sleep(450);
        }
      }

      let after=await apiActive('/api/collections/'+id);
      collectionShop.data=after;
      let c=collectionShopFind(after,collectionId);
      let claimed=false;
      if(c?.claimable){
        collectionShop.lastAction='Odbieram nagrodę: '+String(c.name||'');
        try{render();}catch(e){}
        const claim=await apiActive('/api/collections/'+id+'/claim/'+Number(collectionId),{method:'POST',body:{}});
        if(!claim||claim.success===false) throw new Error(String(claim?.error||claim?.message||'Nie udało się odebrać nagrody.'));
        claimed=true;
        await sleep(300);
        after=await apiActive('/api/collections/'+id);
        collectionShop.data=after;
      }

      collectionShop.lastAction='GOTOWE • kupiono '+bought+' • oddano '+deposited+' • wydano '+money(spent)+(claimed?' • nagroda odebrana':'');
      autoLogMsg('info','KOLEKCJE: '+collectionShop.lastAction);
    }catch(e){
      collectionShop.lastError=String(e?.message||e);
      collectionShop.lastAction='ZATRZYMANO';
      autoLogMsg('warn','KOLEKCJE: '+collectionShop.lastError);
    }finally{
      collectionShop.busy=false;
      collectionShop.lastRefreshAt=Date.now();
      try{render();}catch(e){}
    }
  }
  async function collectionShopClaim(collectionId){
    if(collectionShop.busy) return;
    collectionShop.busy=true; collectionShop.lastError='';
    try{
      const id=Number(settings.characterId||0);
      const r=await apiActive('/api/collections/'+id+'/claim/'+Number(collectionId),{method:'POST',body:{}});
      if(!r||r.success===false) throw new Error(String(r?.error||r?.message||'Nie udało się odebrać nagrody.'));
      collectionShop.lastAction='Nagroda odebrana.';
      await collectionShopRefresh(false);
    }catch(e){collectionShop.lastError=String(e?.message||e);}
    finally{collectionShop.busy=false;try{render();}catch(e){}}
  }
  function collectionShopHTML(){
    const data=collectionShop.data;
    const all=collectionShopAll(data);
    const tiers=[...new Set(all.map(c=>Number(c.__tier||0)).filter(Boolean))].sort((a,b)=>a-b);
    const selected=Number(collectionShop.selectedTier||5);
    const cols=all.filter(c=>Number(c.__tier||0)===selected);

    const tierBtns=(tiers.length?tiers:[1,2,3,4,5]).map(t=>
      '<button class="'+(t===selected?'btn-main':'')+'" data-act="collection-tier" data-tier="'+t+'">T'+t+'</button>'
    ).join('');

    const cards=cols.map(c=>{
      const reqs=(c.requiredItems||[]).map(r=>{
        const need=collectionShopNeed(r);
        const dep=Number(r.deposited||0),req=Number(r.required||0),owned=Number(r.owned||0);
        const status=need<=0?'✓':owned>0?'📦':'🛒';
        const cls=need<=0?'ok':owned>0?'':'warn';
        return '<div class="simple-card"><span>'+status+' '+esc(r.name||('item '+r.itemId))+'</span><b class="'+cls+'">'+dep+'/'+req+'</b><small>posiadasz: '+owned+(need>0?' • brakuje do oddania: '+need:'')+'</small></div>';
      }).join('');
      const missing=(c.requiredItems||[]).reduce((a,r)=>a+collectionShopToBuy(r),0);
      let button='';
      if(c.claimable){
        button='<button class="btn-main" data-act="collection-claim" data-id="'+Number(c.id)+'">🎁 Odbierz nagrodę</button>';
      }else{
        button='<button class="btn-main" data-act="collection-buy-deposit" data-id="'+Number(c.id)+'">'+(missing>0?'💸 Kup + oddaj':'📦 Oddaj posiadane')+'</button>';
      }
      return '<div class="section">'+
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><b style="font-size:16px">'+esc(c.name||'Kolekcja')+'</b><div class="sub">T'+Number(c.__tier||0)+' • ukończona razy: '+Number(c.completionCount||0)+(c.isRepeatable?' • powtarzalna':'')+'</div></div><div>'+button+'</div></div>'+
        '<div class="sub" style="margin-top:6px">Nagroda: <b>'+esc(collectionShopReward(c))+'</b></div>'+
        '<div style="margin-top:10px">'+reqs+'</div>'+
      '</div>';
    }).join('');

    return ''+
      '<div class="helper-hero">'+
        '<div><div class="helper-name">🧩 Kolekcje — kup i oddaj</div><div class="sub">Wybierz kolekcję. Pomagier sprawdzi świeże ceny, pokaże koszt do potwierdzenia, kupi tylko brakujące rzeczy, odda je i odbierze nagrodę.</div></div>'+
        '<div class="helper-actions"><button data-act="collections-refresh">'+(collectionShop.busy?'Pracuję…':'↻ Odśwież')+'</button></div>'+
      '</div>'+
      '<div class="section"><b>Poziom kolekcji</b><div class="helper-actions" style="margin-top:8px">'+tierBtns+'</div></div>'+
      '<div class="section simple-notice info"><b>Bezpieczny zakup:</b> przed wydaniem kasy zobaczysz aktualny koszt. Jeśli cena któregokolwiek przedmiotu wzrośnie w trakcie operacji ponad potwierdzony poziom, Pomagier zatrzyma dalsze zakupy.</div>'+
      (collectionShop.lastError?'<div class="section simple-notice warn"><b>Błąd:</b> '+esc(collectionShop.lastError)+'</div>':'')+
      (collectionShop.lastAction?'<div class="section note"><b>'+esc(collectionShop.lastAction)+'</b></div>':'')+
      (!data?'<div class="section"><div class="sub">Kliknij „Odśwież”, aby pobrać kolekcje.</div></div>':(cards||'<div class="section"><div class="sub">Brak aktywnych kolekcji T'+selected+'.</div></div>'));
  }

"""
s=s.replace(company_anchor,module+company_anchor,1)

# Dodaj zakładkę do obecnej listy po Spółce.
old_tabs="['raids','🚨 Napady'],['company','🏭 Spółka'],['payouts','💰 Wypłaty']"
new_tabs="['raids','🚨 Napady'],['company','🏭 Spółka'],['collections','🧩 Kolekcje'],['payouts','💰 Wypłaty']"
if old_tabs not in s:
    raise SystemExit("Nie znaleziono aktualnej listy zakładek")
s=s.replace(old_tabs,new_tabs,1)

# Render zakładki.
render_anchor="      if (state.activeTab==='company') html = companyAutoHTML();"
if render_anchor not in s:
    raise SystemExit("Nie znaleziono renderu Spółki")
s=s.replace(render_anchor,render_anchor+"\n      if (state.activeTab==='collections') html = collectionShopHTML();",1)

# Handlery.
act_anchor="    if(act==='company-toggle'){"
if act_anchor not in s:
    raise SystemExit("Nie znaleziono handlera company-toggle")
handlers=r"""    if(act==='collections-refresh'){
      await collectionShopRefresh(true);
      return;
    }
    if(act==='collection-tier'){
      collectionShop.selectedTier=Number(btn.dataset.tier||5);
      render();
      return;
    }
    if(act==='collection-buy-deposit'){
      await collectionShopRun(Number(btn.dataset.id||0));
      return;
    }
    if(act==='collection-claim'){
      await collectionShopClaim(Number(btn.dataset.id||0));
      return;
    }
"""
s=s.replace(act_anchor,handlers+act_anchor,1)

# Przy pierwszym wejściu do zakładki automatycznie pobierz dane bez klikania.
tab_handler = """      state.activeTab = btn.dataset.tab;
      state.diagnostics.tabClicks = Number(state.diagnostics.tabClicks||0)+1;"""
if tab_handler in s:
    s=s.replace(tab_handler, """      state.activeTab = btn.dataset.tab;
      state.diagnostics.tabClicks = Number(state.diagnostics.tabClicks||0)+1;
      if(state.activeTab==='collections' && !collectionShop.data && !collectionShop.busy){
        setTimeout(()=>collectionShopRefresh(true),0);
      }""",1)

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
if bg.exists():
    t=bg.read_text(encoding="utf-8")
    t=t.replace("versionCode = 10029","versionCode = 10030")
    t=t.replace('versionName = "1.0.29"','versionName = "1.0.30"')
    bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.30 / userscript 8.8.37" not in r:
        r += """

## v1.0.30 / userscript 8.8.37
- Nowa zakładka Kolekcje.
- Filtry T1–T5 i podgląd: oddane / wymagane / posiadane.
- Jedno kliknięcie „Kup + oddaj” robi świeży preflight cen na bazarze.
- Przed zakupem Pomagier pokazuje łączny koszt i prosi o potwierdzenie.
- Najpierw wykorzystuje posiadane przedmioty, kupuje wyłącznie brakujące.
- Po zakupie automatycznie oddaje przedmioty do kolekcji i odbiera nagrodę.
- Cena każdej sztuki jest ograniczona do poziomu zaakceptowanego w preflight; wzrost ceny zatrzymuje operację.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.30 patch applied")
