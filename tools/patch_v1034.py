from pathlib import Path
import sys

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
s=js.read_text(encoding="utf-8")

s=s.replace("// @version      8.8.40","// @version      8.8.41",1)
s=s.replace("const VERSION = '8.8.40';","const VERSION = '8.8.41';",1)
s=s.replace("const ANDROID_VERSION = '1.0.33';","const ANDROID_VERSION = '1.0.34';",1)

anchor="  // v8.8.40"
note="""  // v8.8.41 KOLEKCJE — LIMIT BAZARU = CZEKAJ NA RĘCZNY ZAKUP:
  // - dzienny limit zakupów na bazarze nie kończy operacji Kolekcji,
  // - po wykryciu limitu Pomagier przechodzi w stan CZEKA NA RĘCZNY ZAKUP,
  // - co 5 s sprawdza kolekcję i plecak; gdy wymagany przedmiot pojawi się po ręcznym zakupie,
  //   automatycznie wznawia oddawanie i kończy kolekcję,
  // - obsługuje zarówno lokalny licznik purchaseRemaining(), jak i błąd limitu zwrócony przez API,
  // - pozostałe automaty Pomagiera nadal działają podczas oczekiwania.
"""
if note not in s:
    p=s.find(anchor)
    if p>=0: s=s[:p]+note+s[p:]

# Stan oczekiwania.
old="""  let collectionShop={
    busy:false,
    data:null,"""
new="""  let collectionShop={
    busy:false,
    waitingManual:null,
    data:null,"""
if old not in s:
    raise SystemExit("Nie znaleziono stanu collectionShop")
s=s.replace(old,new,1)

# Zastąp zakup jednego przedmiotu wersją rozpoznającą limit.
start=s.find("  async function collectionShopBuyOne(itemId,maxUnit){")
end=s.find("  async function collectionShopRun(collectionId){",start)
if start<0 or end<0:
    raise SystemExit("Nie znaleziono collectionShopBuyOne")

buy_block=r"""  function collectionShopIsLimitMessage(msg){
    const x=String(msg||'').toLowerCase();
    return (x.includes('limit') && (x.includes('zakup')||x.includes('purchase')||x.includes('bazar')))
      || x.includes('dzienny limit')
      || x.includes('daily purchase');
  }
  async function collectionShopWaitForManual(collectionId,row){
    const id=Number(settings.characterId||0);
    collectionShop.waitingManual={
      collectionId:Number(collectionId),
      itemId:Number(row.itemId),
      itemName:String(row.name||('item '+row.itemId)),
      since:Date.now()
    };
    collectionShop.lastError='';
    collectionShop.lastAction='⏸ LIMIT BAZARU • kup ręcznie: '+collectionShop.waitingManual.itemName+' • czekam…';
    autoLogMsg('info','KOLEKCJE: dzienny limit bazaru — czekam na ręczny zakup '+collectionShop.waitingManual.itemName);
    try{render();}catch(e){}

    while(collectionShop.busy){
      await sleep(5000);
      let fresh=null;
      try{ fresh=await apiActive('/api/collections/'+id); }catch(e){ continue; }
      if(!fresh||fresh.success===false) continue;
      collectionShop.data=fresh;
      const c=collectionShopFind(fresh,collectionId);
      if(!c){
        collectionShop.waitingManual=null;
        collectionShop.lastAction='Kolekcja zakończona lub zniknęła — wznawiam.';
        try{render();}catch(e){}
        return 'done';
      }
      const req=(c.requiredItems||[]).find(x=>Number(x.itemId)===Number(row.itemId));
      if(!req || collectionShopNeed(req)<=0){
        collectionShop.waitingManual=null;
        collectionShop.lastAction='Wymaganie już spełnione — wznawiam.';
        try{render();}catch(e){}
        return 'done';
      }
      if(Number(req.owned||0)>0){
        collectionShop.waitingManual=null;
        collectionShop.lastAction='✓ Wykryłem ręczny zakup: '+String(row.name||'przedmiot')+' • wznawiam.';
        autoLogMsg('info','KOLEKCJE: wykryto ręczny zakup '+String(row.name||row.itemId)+' — wznawiam');
        try{render();}catch(e){}
        return 'owned';
      }
      collectionShop.lastAction='⏸ LIMIT BAZARU • nadal czekam na ręczny zakup: '+String(row.name||row.itemId);
      try{render();}catch(e){}
    }
    collectionShop.waitingManual=null;
    return 'stopped';
  }
  async function collectionShopBuyOne(itemId,maxUnit){
    const id=Number(settings.characterId||0);
    if(typeof purchaseRemaining==='function'){
      const rem=purchaseRemaining();
      if(rem!=null&&rem<=0) return {manualWait:true,reason:'daily_limit'};
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
    if(!buy||buy.success===false){
      const msg=String(buy?.error||buy?.message||'Zakup na bazarze nieudany.');
      if(collectionShopIsLimitMessage(msg)) return {manualWait:true,reason:'api_daily_limit',message:msg};
      throw new Error(msg);
    }
    if(buy?.purchaseLimit) state.purchaseLimit=buy.purchaseLimit;
    return {manualWait:false,paid:Number(buy?.totalCost??live)};
  }
"""
s=s[:start]+buy_block+s[end:]

# W pętli Kolekcji limit nie przerywa operacji — przechodzi do oczekiwania.
old_call="""          const paid=await collectionShopBuyOne(row.itemId,pre.maxByItem[String(row.itemId)]);
          spent+=paid; bought++;
          await sleep(450);"""
new_call="""          const buyResult=await collectionShopBuyOne(row.itemId,pre.maxByItem[String(row.itemId)]);
          if(buyResult?.manualWait){
            const waited=await collectionShopWaitForManual(collectionId,row);
            if(waited==='stopped') return;
            continue;
          }
          spent+=Number(buyResult?.paid||0); bought++;
          await sleep(450);"""
if old_call not in s:
    raise SystemExit("Nie znaleziono wywołania collectionShopBuyOne")
s=s.replace(old_call,new_call,1)

# Wyczyść stan oczekiwania po zakończeniu/błędzie.
old_final="""    }finally{
      collectionShop.busy=false;
      collectionShop.lastRefreshAt=Date.now();"""
new_final="""    }finally{
      collectionShop.busy=false;
      collectionShop.waitingManual=null;
      collectionShop.lastRefreshAt=Date.now();"""
if old_final not in s:
    raise SystemExit("Nie znaleziono finally collectionShopRun")
s=s.replace(old_final,new_final,1)

# Widoczny komunikat w zakładce.
needle="""      '<div class="section simple-notice info"><b>Bezpieczny zakup:</b> przed wydaniem kasy zobaczysz aktualny koszt. Jeśli cena któregokolwiek przedmiotu wzrośnie w trakcie operacji ponad potwierdzony poziom, Pomagier zatrzyma dalsze zakupy.</div>'+"""
replacement="""      '<div class="section simple-notice info"><b>Bezpieczny zakup:</b> przed wydaniem kasy zobaczysz aktualny koszt. Jeśli cena któregokolwiek przedmiotu wzrośnie w trakcie operacji ponad potwierdzony poziom, Pomagier zatrzyma dalsze zakupy.</div>'+
      (collectionShop.waitingManual?'<div class="section simple-notice warn"><b>⏸ Czekam na ręczny zakup</b><br>Kup na bazarze: <b>'+esc(collectionShop.waitingManual.itemName)+'</b>. Pomagier sprawdza co 5 s i sam wznowi oddawanie, gdy przedmiot pojawi się w plecaku.</div>':'')+"""
if needle not in s:
    raise SystemExit("Nie znaleziono notki Bezpieczny zakup")
s=s.replace(needle,replacement,1)

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
t=t.replace("versionCode = 10033","versionCode = 10034")
t=t.replace('versionName = "1.0.33"','versionName = "1.0.34"')
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.34 / userscript 8.8.41" not in r:
        r += """

## v1.0.34 / userscript 8.8.41
- Kolekcje: dzienny limit zakupów na bazarze nie zatrzymuje już operacji.
- Pomagier przechodzi w „Czekam na ręczny zakup” i co 5 s sprawdza stan kolekcji/plecaka.
- Po ręcznym kupieniu brakującego przedmiotu automatycznie wznawia oddawanie i odbiór nagrody.
- Obsługa limitu działa zarówno z lokalnego licznika, jak i komunikatu API.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.34 patch applied")
