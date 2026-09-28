from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
js = root / "app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak pomagier.user.js")

s = js.read_text(encoding="utf-8")

s = s.replace("// @version      8.8.37", "// @version      8.8.38", 1)
s = s.replace("const VERSION = '8.8.37';", "const VERSION = '8.8.38';", 1)
s = s.replace("const ANDROID_VERSION = '1.0.30';", "const ANDROID_VERSION = '1.0.31';", 1)

anchor = "  // v8.8.37"
note = """  // v8.8.38 KOLEKCJE POWTARZALNE:
  // - nowy przełącznik Zwykłe / Powtarzalne,
  // - Powtarzalne czytają osobne pole API repeatableCollections,
  // - zachowano filtr T1-T5,
  // - preflight, zakup, oddanie i odbiór nagrody działają również dla repeatableCollections,
  // - wyszukiwanie kolekcji po ID sprawdza oba źródła i usuwa duplikaty.
"""
if note not in s:
    p=s.find(anchor)
    if p>=0:
        s=s[:p]+note+s[p:]

# Domyślny tryb.
old = """    data:null,
    selectedTier:5,
    lastRefreshAt:0,"""
new = """    data:null,
    selectedTier:5,
    selectedMode:'normal',
    lastRefreshAt:0,"""
if old not in s:
    raise SystemExit("Nie znaleziono stanu collectionShop")
s=s.replace(old,new,1)

# Źródła kolekcji: zwykłe oraz repeatableCollections.
start=s.find("  function collectionShopAll(data){")
end=s.find("  function collectionShopNeed(req){", start)
if start<0 or end<0:
    raise SystemExit("Nie znaleziono helperów kolekcji")

helpers=r"""  function collectionShopTierRows(data){
    const out=[];
    for(const tier of (data?.tiers||[])){
      if(tier?.unlocked===false) continue;
      for(const c of (tier?.collections||[])){
        if(!c) continue;
        out.push({...c,__tier:Number(tier.tier||c.tier||0),__source:'tiers'});
      }
    }
    return out;
  }
  function collectionShopRepeatRows(data){
    const out=[];
    for(const c of (data?.repeatableCollections||[])){
      if(!c) continue;
      out.push({...c,__tier:Number(c.tier||0),__source:'repeatableCollections',isRepeatable:true});
    }
    // Fallback dla wersji API, które wkładają powtarzalne także do tiers.
    for(const c of collectionShopTierRows(data)){
      if(c?.isRepeatable) out.push({...c,__source:c.__source||'tiers'});
    }
    const byId=new Map();
    for(const c of out){
      const id=Number(c.id||0);
      if(!id) continue;
      const prev=byId.get(id);
      // Preferuj rekord z repeatableCollections, bo to bieżący cykl repeatable.
      if(!prev || c.__source==='repeatableCollections') byId.set(id,c);
    }
    return [...byId.values()];
  }
  function collectionShopNormalRows(data){
    return collectionShopTierRows(data).filter(c=>{
      if(c?.isRepeatable) return false;
      if(c?.isCompleted) return false;
      return true;
    });
  }
  function collectionShopAll(data,mode){
    return mode==='repeatable' ? collectionShopRepeatRows(data) : collectionShopNormalRows(data);
  }
  function collectionShopFind(data,id){
    id=Number(id||0);
    if(!id) return null;
    return collectionShopRepeatRows(data).find(c=>Number(c.id)===id)
      || collectionShopNormalRows(data).find(c=>Number(c.id)===id)
      || collectionShopTierRows(data).find(c=>Number(c.id)===id)
      || null;
  }
"""
s=s[:start]+helpers+s[end:]

# Refresh: tier list zależnie od trybu.
old = """      const tiers=(data.tiers||[]).filter(x=>x?.unlocked!==false).map(x=>Number(x.tier||0)).filter(Boolean);
      if(tiers.length && !tiers.includes(Number(collectionShop.selectedTier||0))) collectionShop.selectedTier=Math.max(...tiers);"""
new = """      const rows=collectionShopAll(data,collectionShop.selectedMode);
      const tiers=[...new Set(rows.map(x=>Number(x.__tier||x.tier||0)).filter(Boolean))];
      if(tiers.length && !tiers.includes(Number(collectionShop.selectedTier||0))) collectionShop.selectedTier=Math.max(...tiers);"""
if old not in s:
    raise SystemExit("Nie znaleziono tier refresh")
s=s.replace(old,new,1)

# HTML: pobieraj kolekcje wg trybu.
old = """    const data=collectionShop.data;
    const all=collectionShopAll(data);
    const tiers=[...new Set(all.map(c=>Number(c.__tier||0)).filter(Boolean))].sort((a,b)=>a-b);
    const selected=Number(collectionShop.selectedTier||5);
    const cols=all.filter(c=>Number(c.__tier||0)===selected);"""
new = """    const data=collectionShop.data;
    const mode=collectionShop.selectedMode==='repeatable'?'repeatable':'normal';
    const all=collectionShopAll(data,mode);
    const tiers=[...new Set(all.map(c=>Number(c.__tier||0)).filter(Boolean))].sort((a,b)=>a-b);
    const selected=Number(collectionShop.selectedTier||5);
    const cols=all.filter(c=>Number(c.__tier||0)===selected);
    const normalCount=collectionShopNormalRows(data).length;
    const repeatCount=collectionShopRepeatRows(data).length;"""
if old not in s:
    raise SystemExit("Nie znaleziono początku collectionShopHTML")
s=s.replace(old,new,1)

# Dodaj przełącznik trybu przed poziomem.
old = """      '<div class="section"><b>Poziom kolekcji</b><div class="helper-actions" style="margin-top:8px">'+tierBtns+'</div></div>'+"""
new = """      '<div class="section"><b>Rodzaj kolekcji</b><div class="helper-actions" style="margin-top:8px">'+
        '<button class="'+(mode==='normal'?'btn-main':'')+'" data-act="collection-mode" data-mode="normal">Zwykłe ('+normalCount+')</button>'+
        '<button class="'+(mode==='repeatable'?'btn-main':'')+'" data-act="collection-mode" data-mode="repeatable">🔁 Powtarzalne ('+repeatCount+')</button>'+
      '</div></div>'+
      '<div class="section"><b>Poziom kolekcji</b><div class="helper-actions" style="margin-top:8px">'+tierBtns+'</div></div>'+"""
if old not in s:
    raise SystemExit("Nie znaleziono UI poziomu kolekcji")
s=s.replace(old,new,1)

# Lepszy pusty komunikat.
old = """(cards||'<div class="section"><div class="sub">Brak aktywnych kolekcji T'+selected+'.</div></div>'));"""
new = """(cards||'<div class="section"><div class="sub">'+(mode==='repeatable'?'Brak powtarzalnych kolekcji T':'Brak zwykłych aktywnych kolekcji T')+selected+'.</div></div>'));"""
if old not in s:
    raise SystemExit("Nie znaleziono pustego komunikatu")
s=s.replace(old,new,1)

# Handler trybu.
anchor2 = """    if(act==='collection-tier'){
      collectionShop.selectedTier=Number(btn.dataset.tier||5);
      render();
      return;
    }
"""
if anchor2 not in s:
    raise SystemExit("Nie znaleziono handlera collection-tier")
handler = """    if(act==='collection-mode'){
      collectionShop.selectedMode=String(btn.dataset.mode||'normal')==='repeatable'?'repeatable':'normal';
      const rows=collectionShopAll(collectionShop.data,collectionShop.selectedMode);
      const tiers=[...new Set(rows.map(x=>Number(x.__tier||0)).filter(Boolean))];
      if(tiers.length&&!tiers.includes(Number(collectionShop.selectedTier||0))) collectionShop.selectedTier=Math.max(...tiers);
      render();
      return;
    }
"""
s=s.replace(anchor2,handler+anchor2,1)

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
if bg.exists():
    t=bg.read_text(encoding="utf-8")
    t=t.replace("versionCode = 10030","versionCode = 10031")
    t=t.replace('versionName = "1.0.30"','versionName = "1.0.31"')
    bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.31 / userscript 8.8.38" not in r:
        r += """

## v1.0.31 / userscript 8.8.38
- Kolekcje: przełącznik Zwykłe / Powtarzalne.
- Powtarzalne są pobierane z osobnego pola API repeatableCollections.
- Obsługa T1-T5 pozostaje bez zmian.
- Kup + oddaj oraz odbiór nagrody działają dla kolekcji powtarzalnych.
- Dedup kolekcji po ID, gdy API zwraca ten sam repeatable także w tiers.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.31 patch applied")
