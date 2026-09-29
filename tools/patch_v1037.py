from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
s=js.read_text(encoding="utf-8")

s=s.replace("// @version      8.8.43","// @version      8.8.44",1)
s=s.replace("const VERSION = '8.8.43';","const VERSION = '8.8.44';",1)
s=s.replace("const ANDROID_VERSION = '1.0.36';","const ANDROID_VERSION = '1.0.37';",1)

anchor="  // v8.8.43"
note="""  // v8.8.44 UI SCROLL + HISTORIA ZAKUPÓW:
  // - naprawia samoczynne zamykanie „Zaawansowane / diagnostyka” podczas renderów,
  // - zachowuje pozycję przewinięcia bieżącej zakładki przy automatycznym odświeżaniu,
  // - nowa zakładka „Zakupy” pokazuje ostatnie 20 zakupów wykonanych przez Pomagiera,
  // - zapisuje nazwę/ID, ilość, cenę za sztukę, łączny koszt, źródło modułu i pozostały limit bazaru,
  // - historia zakupów jest trwała lokalnie i przechowuje do 200 wpisów.
"""
if note not in s:
    p=s.find(anchor)
    if p>=0: s=s[:p]+note+s[p:]

target="    companyAuto:'pomagier_company_auto_v1'\n"
if target not in s:
    raise SystemExit("Nie znaleziono K.companyAuto")
s=s.replace(target,"    companyAuto:'pomagier_company_auto_v1',\n    purchaseHistory:'pomagier_purchase_history_v1'\n",1)

marker="  // ============================================================\n  // SPÓŁKA AUTO v8.8.34"
if marker not in s:
    raise SystemExit("Nie znaleziono kotwicy SPÓŁKA AUTO")

module=r"""  // ============================================================
  // HISTORIA ZAKUPÓW v8.8.44
  // ============================================================
  let purchaseHistory=loadJSON(K.purchaseHistory,[]);
  if(!Array.isArray(purchaseHistory)) purchaseHistory=[];

  function purchaseHistorySave(){
    if(purchaseHistory.length>200) purchaseHistory=purchaseHistory.slice(-200);
    saveJSON(K.purchaseHistory,purchaseHistory);
  }
  function purchaseHistorySource(){
    try{ if(typeof collectionShop!=='undefined' && collectionShop && collectionShop.busy) return 'Kolekcje'; }catch(_){}
    try{ if(typeof alcoholAuto!=='undefined' && alcoholAuto && alcoholAuto.runtimeBusy) return 'Alkohol'; }catch(_){}
    try{ if(state && state.manual && state.manual.semi && state.manual.semi.inCycle) return 'Półautomat'; }catch(_){}
    try{ if(state && state.manual && state.manual.busy) return 'Ręczny demontaż'; }catch(_){}
    try{ if(state && state.auto && state.auto.inCycle) return 'AUTO zysk'; }catch(_){}
    return 'Pomagier';
  }
  function purchaseHistoryName(itemId,enh){
    const id=Number(itemId||0), e=Number(enh||0);
    try{
      const p=getPrice(id,e);
      const n=p && (p.name||p.item_name||p.itemName);
      if(n) return String(n);
    }catch(_){}
    try{
      const m=staticDismantleById(id);
      if(m && m.name) return String(m.name);
    }catch(_){}
    try{
      const r=(state.recipes||[]).find(function(x){ return Number(x && x.result_item_id)===id; });
      if(r && r.item_name) return String(r.item_name);
    }catch(_){}
    try{
      const rows=[];
      for(const t of ((collectionShop && collectionShop.data && collectionShop.data.tiers)||[]))
        for(const c of ((t && t.collections)||[])) rows.push(...((c && c.requiredItems)||[]));
      for(const c of ((collectionShop && collectionShop.data && collectionShop.data.repeatableCollections)||[]))
        rows.push(...((c && c.requiredItems)||[]));
      const x=rows.find(function(v){ return Number(v && v.itemId)===id; });
      if(x && x.name) return String(x.name);
    }catch(_){}
    return id?('ID '+id):'nieznany przedmiot';
  }
  function purchaseHistoryAdd(body,result,sourceOverride){
    try{
      body=body||{}; result=result||{};
      const itemId=Number(body.itemId!=null?body.itemId:body.item_id||0);
      const quantity=Math.max(1,Number(body.quantity!=null?body.quantity:body.qty||1));
      const enhancement=Number(body.enhancementLevel!=null?body.enhancementLevel:body.enhancement_level||0);
      let total=Number(result.totalCost!=null?result.totalCost:(result.total_cost!=null?result.total_cost:(result.cost!=null?result.cost:result.spent||0)));
      if(!(total>0)){
        try{
          const p=getPrice(itemId,enhancement);
          const unit=Number(p && (p.min_price!=null?p.min_price:p.price_per_unit||0));
          if(unit>0) total=unit*quantity;
        }catch(_){}
      }
      const unitPrice=total>0?total/quantity:0;
      const pr=result.purchaseLimit||{};
      const fallback=state.purchaseLimit||{};
      const remRaw=pr.purchasesRemaining!=null?pr.purchasesRemaining:fallback.purchasesRemaining;
      const rem=Number(remRaw);
      const row={
        ts:Date.now(),iso:nowIso(),itemId:itemId,enhancement:enhancement,quantity:quantity,
        name:purchaseHistoryName(itemId,enhancement),
        unitPrice:unitPrice,totalCost:total,
        source:String(sourceOverride||purchaseHistorySource()),
        purchasesRemaining:Number.isFinite(rem)?rem:null
      };
      purchaseHistory.push(row);
      purchaseHistorySave();
      actionHistoryAdd('Zakupy','Kupiono '+row.name,'OK',(row.quantity>1?row.quantity+' szt. • ':'')+(row.totalCost>0?'wydano '+money(row.totalCost):'koszt ?')+' • '+row.source);
    }catch(_){}
  }
  function purchaseHistoryHTML(){
    const rows=purchaseHistory.slice(-20).reverse();
    const total=rows.reduce(function(n,x){ return n+Number(x.totalCost||0); },0);
    const html=rows.map(function(x,i){
      return '<tr>'+
        '<td>'+(i+1)+'</td>'+
        '<td>'+new Date(Number(x.ts||Date.now())).toLocaleString('pl-PL')+'</td>'+
        '<td class="left"><b>'+esc(x.name||('ID '+x.itemId))+'</b><div class="sub">ID '+Number(x.itemId||0)+(Number(x.enhancement||0)?' • +'+Number(x.enhancement):'')+' • '+esc(x.source||'Pomagier')+'</div></td>'+
        '<td>'+Number(x.quantity||1)+'</td>'+
        '<td>'+(Number(x.unitPrice||0)>0?money(x.unitPrice):'—')+'</td>'+
        '<td><b>'+(Number(x.totalCost||0)>0?money(x.totalCost):'—')+'</b></td>'+
        '<td>'+(x.purchasesRemaining==null?'—':Number(x.purchasesRemaining))+'</td>'+
      '</tr>';
    }).join('');
    return '<div class="helper-hero"><div><div class="helper-name">🛒 Ostatnie zakupy Pomagiera</div><div class="sub">Ostatnie 20 zakupów wykonanych przez automat lub ręczne funkcje Pomagiera.</div></div><div class="helper-actions"><button data-act="purchase-history-clear">Wyczyść</button></div></div>'+
      '<div class="cards mini"><div class="card"><div class="label">Pokazane</div><div class="big">'+rows.length+'</div><div>z '+purchaseHistory.length+' zapisanych</div></div>'+
      '<div class="card"><div class="label">Suma ostatnich 20</div><div class="big">'+money(total)+'</div></div></div>'+
      '<div class="section table-wrap"><table><thead><tr><th>#</th><th>Czas</th><th class="left">Przedmiot / moduł</th><th>Ilość</th><th>Cena/szt.</th><th>Razem</th><th>Limit po</th></tr></thead><tbody>'+
      (html||'<tr><td colspan="7">Brak zapisanych zakupów.</td></tr>')+
      '</tbody></table></div>';
  }

"""
s=s.replace(marker,module+marker,1)

# apiActive: dopisz capture po istniejącym actionHistoryAdd dla mutacji.
hook="    if(method!=='GET') actionHistoryAdd('API',"
p=s.find(hook)
if p<0:
    raise SystemExit("Nie znaleziono hooka actionHistory w apiActive")
line_end=s.find("\n",p)
insert="\n    if(method==='POST' && /\\/api\\/(?:bazaar|market)\\/[^?]*\\/buy(?:$|\\?)/i.test(String(path))) purchaseHistoryAdd(body,j);"
s=s[:line_end]+insert+s[line_end:]

# alcoholReplayTemplate: dodaj capture przed return data w obrębie funkcji.
a=s.find("  async function alcoholReplayTemplate")
b=s.find("  async function alcoholAutoCycle",a)
if a<0 or b<0:
    raise SystemExit("Nie znaleziono alcoholReplayTemplate")
seg=s[a:b]
ret=seg.rfind("    return data;")
if ret<0:
    raise SystemExit("Nie znaleziono return data w alcoholReplayTemplate")
capture="""    if(method==='POST' && /\\/api\\/(?:bazaar|market)\\/[^?]*\\/buy(?:$|\\?)/i.test(String(path))){
      let parsedBody=null;
      try{ parsedBody=bodyRaw?JSON.parse(bodyRaw):null; }catch(_){}
      purchaseHistoryAdd(parsedBody||{},data,'Alkohol');
    }
"""
seg=seg[:ret]+capture+seg[ret:]
s=s[:a]+seg+s[b:]

old_tabs="['company','🏭 Spółka'],['collections','🧩 Kolekcje'],['payouts','💰 Wypłaty']"
new_tabs="['company','🏭 Spółka'],['collections','🧩 Kolekcje'],['purchases','🛒 Zakupy'],['payouts','💰 Wypłaty']"
if old_tabs not in s:
    raise SystemExit("Nie znaleziono listy zakładek z Kolekcjami")
s=s.replace(old_tabs,new_tabs,1)

render_anchor="      if (state.activeTab==='collections') html = collectionShopHTML();"
if render_anchor not in s:
    raise SystemExit("Nie znaleziono renderu Kolekcji")
s=s.replace(render_anchor,render_anchor+"\n      if (state.activeTab==='purchases') html = purchaseHistoryHTML();",1)

act_anchor="    if(act==='collections-refresh'){"
if act_anchor not in s:
    raise SystemExit("Nie znaleziono handlerów Kolekcji")
handler="""    if(act==='purchase-history-clear'){
      if(confirm('Wyczyścić historię zakupów Pomagiera?')){
        purchaseHistory=[]; purchaseHistorySave(); render();
      }
      return;
    }
"""
s=s.replace(act_anchor,handler+act_anchor,1)

old_render_start="""  function render() {
    const body = panel.querySelector('.content');
    const tabs = panel.querySelectorAll('.tab');"""
new_render_start="""  function render() {
    const body = panel.querySelector('.content');
    const __sameRenderTab=body && body.dataset && body.dataset.renderTab===String(state.activeTab);
    const __keepScroll=__sameRenderTab?Number(body.scrollTop||0):0;
    const __oldSimpleAdvanced=__sameRenderTab?body.querySelector('details.simple-advanced'):null;
    const __keepSimpleAdvanced=!!(__oldSimpleAdvanced && __oldSimpleAdvanced.open);
    const tabs = panel.querySelectorAll('.tab');"""
if old_render_start not in s:
    raise SystemExit("Nie znaleziono początku render()")
s=s.replace(old_render_start,new_render_start,1)

render_start=s.find("  function render() {")
render_next=s.find("  function updateHeader()",render_start)
if render_start<0 or render_next<0:
    raise SystemExit("Nie znaleziono granic render()")
render_seg=s[render_start:render_next]
update_pos=render_seg.rfind("    updateHeader();")
if update_pos<0:
    raise SystemExit("Nie znaleziono updateHeader() w render()")
restore="""    body.dataset.renderTab=String(state.activeTab);
    const __simpleAdvanced=body.querySelector('details.simple-advanced');
    if(__simpleAdvanced && __keepSimpleAdvanced) __simpleAdvanced.open=true;
    if(__sameRenderTab && __keepScroll>0){
      requestAnimationFrame(function(){
        try{ body.scrollTop=Math.min(__keepScroll,Math.max(0,body.scrollHeight-body.clientHeight)); }catch(_){}
      });
    }
"""
render_seg=render_seg[:update_pos]+restore+render_seg[update_pos:]
s=s[:render_start]+render_seg+s[render_next:]

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
if bg.exists():
    t=bg.read_text(encoding="utf-8")
    t=t.replace("versionCode = 10036","versionCode = 10037")
    t=t.replace('versionName = "1.0.36"','versionName = "1.0.37"')
    bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.37 / userscript 8.8.44" not in r:
        r += """

## v1.0.37 / userscript 8.8.44
- UI zachowuje scroll przy automatycznym renderze.
- „Zaawansowane / diagnostyka” nie zamyka się samoczynnie podczas pracy automatu.
- Nowa zakładka „Zakupy” z ostatnimi 20 zakupami Pomagiera.
- Historia zakupów zapisuje przedmiot, ilość, cenę/szt., koszt łączny, moduł i pozostały limit bazaru.
- Historia zakupów przechowuje lokalnie do 200 wpisów.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.37 patch applied")
