from pathlib import Path
import sys

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
s=js.read_text(encoding="utf-8")

s=s.replace("// @version      8.8.42","// @version      8.8.43",1)
s=s.replace("const VERSION = '8.8.42';","const VERSION = '8.8.43';",1)
s=s.replace("const ANDROID_VERSION = '1.0.35';","const ANDROID_VERSION = '1.0.36';",1)

anchor="  // v8.8.42"
note="""  // v8.8.43 BAZAR — CZEKAJ NA ODBLOKOWANIE:
  // - po wyczerpaniu dziennego limitu Pomagier NIE oczekuje ręcznego kupienia konkretnego przedmiotu,
  // - czeka aż sam bazar znów będzie miał purchasesRemaining > 0,
  // - działa po ręcznym resecie limitu za złote zęby ORAZ po naturalnym resecie dobowym,
  // - Kolekcje podczas oczekiwania odpytują /api/bazaar/{id}/index co 15 s i automatycznie wznawiają zakupy,
  // - główny Pomagier również pozostaje włączony i sam wznawia po odblokowaniu bazaru,
  // - Pomagier nigdy sam nie wydaje złotych zębów na reset bazaru.
"""
if note not in s:
    p=s.find(anchor)
    if p>=0: s=s[:p]+note+s[p:]

# Kolekcje: zamień oczekiwanie na ręczny przedmiot na oczekiwanie na odblokowanie bazaru.
start=s.find("  async function collectionShopWaitForManual(collectionId,row){")
end=s.find("  async function collectionShopBuyOne(itemId,maxUnit){",start)
if start<0 or end<0:
    raise SystemExit("Nie znaleziono collectionShopWaitForManual")

wait_fn=r"""  async function collectionShopWaitForBazaarUnlock(collectionId,row){
    const id=Number(settings.characterId||0);
    collectionShop.waitingManual={
      collectionId:Number(collectionId),
      itemId:Number(row.itemId),
      itemName:String(row.name||('item '+row.itemId)),
      since:Date.now(),
      mode:'bazaar_unlock'
    };

    const limit=state.purchaseLimit||{};
    const resetCost=Number(limit.resetCost||0);
    collectionShop.lastError='';
    collectionShop.lastAction='⏸ LIMIT BAZARU • czekam na odblokowanie'+(resetCost>0?' (reset: '+resetCost+' zł. zębów)':'')+'…';
    autoLogMsg('info','KOLEKCJE: limit bazaru — czekam na odblokowanie; nie trzeba kupować przedmiotu ręcznie.');
    try{render();}catch(e){}

    while(collectionShop.busy){
      await sleep(15000);

      // Najpierw odśwież sam bazar. To wykrywa zarówno reset za zęby,
      // jak i naturalny reset dobowy.
      try{
        const baz=await apiActive('/api/bazaar/'+id+'/index');
        if(baz) parseBazaar(baz);
      }catch(e){
        collectionShop.lastAction='⏸ LIMIT BAZARU • czekam na odblokowanie…';
        try{render();}catch(_){}
        continue;
      }

      const rem=typeof purchaseRemaining==='function'?purchaseRemaining():null;
      if(rem==null || rem>0){
        collectionShop.waitingManual=null;
        collectionShop.lastAction='✓ Bazar odblokowany • wznawiam automatyczne zakupy.';
        autoLogMsg('info','KOLEKCJE: bazar odblokowany — automatycznie wznawiam zakupy.');
        try{render();}catch(e){}
        return 'unlocked';
      }

      const lim=state.purchaseLimit||{};
      const cost=Number(lim.resetCost||0);
      collectionShop.lastAction='⏸ LIMIT BAZARU • nadal zablokowany'+(cost>0?' • reset za '+cost+' zł. zębów lub reset dobowy':' • czekam na reset dobowy');
      try{render();}catch(e){}
    }

    collectionShop.waitingManual=null;
    return 'stopped';
  }
"""
s=s[:start]+wait_fn+s[end:]

# Wywołanie nowej funkcji.
s=s.replace(
    "const waited=await collectionShopWaitForManual(collectionId,row);",
    "const waited=await collectionShopWaitForBazaarUnlock(collectionId,row);"
)
s=s.replace(
    "if(waited==='stopped') return;\n            continue;",
    "if(waited==='stopped') return;\n            continue;",
    1
)

# Teksty Kolekcji: nie "kup ręcznie", tylko czekaj na bazar.
s=s.replace(
    "<b>⏸ Czekam na ręczny zakup</b><br>Kup na bazarze: <b>'+esc(collectionShop.waitingManual.itemName)+'</b>. Pomagier sprawdza co 5 s i sam wznowi oddawanie, gdy przedmiot pojawi się w plecaku.",
    "<b>⏸ Czekam na odblokowanie bazaru</b><br>Możesz zresetować limit za złote zęby albo poczekać na reset dobowy. Pomagier sprawdza bazar co 15 s i sam wznowi zakupy."
)

# Półautomat — popraw komunikat.
s=s.replace(
    "semi.lastAction='Limit zakupów bazaru — czekam. Kup brak ręcznie; Pomagier nie zostanie zatrzymany.';",
    "semi.lastAction='Limit zakupów bazaru — czekam na odblokowanie (reset za zęby lub reset dobowy). Pomagier sam wznowi.';"
)

# Główny automat — popraw komunikaty ze "kup ręcznie".
s=s.replace(
    "state.auto.stageDetail='Kup ręcznie: '+String(nextItem?.name||'wymagany przedmiot')+'. Pomagier sprawdzi stan w następnym cyklu i sam wznowi.';",
    "state.auto.stageDetail='Dzienny limit zakupów wyczerpany. Czekam na odblokowanie bazaru (reset za zęby lub reset dobowy).';"
)
s=s.replace(
    "autoLogMsg('info','LIMIT BAZARU: czekam na ręczny zakup '+String(nextItem?.name||'wymaganego przedmiotu')+' — Pomagier pozostaje włączony.');",
    "autoLogMsg('info','LIMIT BAZARU: czekam na odblokowanie bazaru — Pomagier pozostaje włączony i sam wznowi.');"
)
s=s.replace(
    "state.auto.stageDetail='Kup ręcznie: '+String(missingExtra.name||'brakujący składnik')+'. Gdy przedmiot pojawi się w ekwipunku, Pomagier sam wznowi.';",
    "state.auto.stageDetail='Dzienny limit zakupów wyczerpany. Czekam na odblokowanie bazaru (reset za zęby lub reset dobowy).';"
)
s=s.replace(
    "autoLogMsg('info','LIMIT BAZARU: czekam na ręczny zakup '+String(missingExtra.name||'składnika')+' — Pomagier pozostaje włączony.');",
    "autoLogMsg('info','LIMIT BAZARU: czekam na odblokowanie bazaru — Pomagier pozostaje włączony i sam wznowi.');"
)
s=s.replace(
    "state.auto.stageDetail='Dzienny limit zakupów wyczerpany. Kup brakujący przedmiot ręcznie — Pomagier sam wznowi po wykryciu zmiany.';",
    "state.auto.stageDetail='Dzienny limit zakupów wyczerpany. Czekam na odblokowanie bazaru (reset za złote zęby lub reset dobowy).';"
)
s=s.replace(
    "autoLogMsg('warn','LIMIT BAZARU: nie zatrzymuję Pomagiera — czekam na ręczne uzupełnienie.');",
    "autoLogMsg('warn','LIMIT BAZARU: nie zatrzymuję Pomagiera — czekam na odblokowanie bazaru.');"
)

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
t=t.replace("versionCode = 10035","versionCode = 10036")
t=t.replace('versionName = "1.0.35"','versionName = "1.0.36"')
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.36 / userscript 8.8.43" not in r:
        r += """

## v1.0.36 / userscript 8.8.43
- Po wyczerpaniu dziennego limitu Pomagier czeka na odblokowanie bazaru, a nie na ręczny zakup konkretnego przedmiotu.
- Odblokowanie może nastąpić przez ręczny reset limitu za złote zęby albo naturalny reset dobowy.
- Kolekcje sprawdzają /api/bazaar/{id}/index co 15 sekund i po purchasesRemaining > 0 same wznawiają zakup braków.
- Główny Pomagier pozostaje włączony i również sam wznawia po odblokowaniu.
- Pomagier nie wydaje złotych zębów samodzielnie.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.36 patch applied")
