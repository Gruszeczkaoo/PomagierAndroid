from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
js = root / "app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak pomager.user.js")

s = js.read_text(encoding="utf-8")

# Wersje.
s = s.replace("// @version      8.8.33", "// @version      8.8.34", 1)
s = s.replace("const VERSION = '8.8.33';", "const VERSION = '8.8.34';", 1)
s = s.replace("const ANDROID_VERSION = '1.0.26';", "const ANDROID_VERSION = '1.0.27';", 1)

# Changelog.
anchor = "  // v8.8.33"
note = """  // v8.8.34 SPÓŁKA AUTO:
  // - nowa zakładka „Spółka” z niezależnym AUTO ON/OFF,
  // - pobiera realny fundusz, dochód, pensje, drzewko inwestycji i aktywną inwestycję,
  // - liczy mieszaną ścieżkę P/M/D/C/X po zależnościach zamiast iść jedną gałęzią,
  // - plan nie odejmuje dodatkowej puli 100 000 zł dla gangu; uwzględnia tylko realne pensje z API,
  // - przy każdym kroku pobiera oferty wykonawców i wybiera najszybszy przewidywany czas zakończenia (czas oczekiwania na fundusz + czas wykonania),
  // - automat uruchamia inwestycję dopiero gdy wybrana oferta jest faktycznie dostępna i opłacalna czasowo,
  // - receptury Rxx są pomijane przez tryb rozwoju dochodu; po każdym starcie/ukończeniu plan jest liczony od nowa.
"""
if note not in s:
    p = s.find(anchor)
    if p >= 0:
        s = s[:p] + note + s[p:]

# Klucz storage: po v1.0.22 istnieją diagnostics/actionHistory.
if "companyAuto:'pomagier_company_auto_v1'" not in s:
    target = "    diagnostics:'pomagier_diagnostics_v1'\n"
    if target in s:
        s = s.replace(target, "    diagnostics:'pomagier_diagnostics_v1',\n    companyAuto:'pomagier_company_auto_v1'\n", 1)
    else:
        target = "    gangPayout:'pomagier_gang_payout_v1'\n"
        if target not in s:
            raise SystemExit("Nie znaleziono miejsca na K.companyAuto")
        s = s.replace(target, "    gangPayout:'pomagier_gang_payout_v1',\n    companyAuto:'pomagier_company_auto_v1'\n", 1)

# Moduł Spółka przed Wypłatami.
company_anchor = "  // ============================================================\n  // WYPŁATY GANGU"
if company_anchor not in s:
    raise SystemExit("Nie znaleziono kotwicy WYPŁATY GANGU")

company_code = r"""  // ============================================================
  // SPÓŁKA AUTO v8.8.34 — mieszana ścieżka najszybszego rozwoju
  // ============================================================
  const COMPANY_AUTO_SCHEMA=1;
  const COMPANY_AUTO_POLL_MS=10*60*1000;
  const COMPANY_AUTO_BEAM=140;
  const __companyAutoSaved=loadJSON(K.companyAuto,{})||{};
  let companyAuto={
    schemaVersion:COMPANY_AUTO_SCHEMA,
    enabled:!!__companyAutoSaved.enabled,
    nextAt:Number(__companyAutoSaved.nextAt||0),
    runtimeBusy:false,
    lastFetchAt:0,
    lastStartAt:Number(__companyAutoSaved.lastStartAt||0),
    lastAction:String(__companyAutoSaved.lastAction||''),
    lastError:String(__companyAutoSaved.lastError||''),
    companyResp:null,
    investments:null,
    plan:null,
    liveOffers:{},
    history:Array.isArray(__companyAutoSaved.history)?__companyAutoSaved.history.slice(0,30):[]
  };

  function companyAutoSave(){
    try{
      saveJSON(K.companyAuto,{
        schemaVersion:COMPANY_AUTO_SCHEMA,
        enabled:!!companyAuto.enabled,
        nextAt:Number(companyAuto.nextAt||0),
        lastStartAt:Number(companyAuto.lastStartAt||0),
        lastAction:String(companyAuto.lastAction||''),
        lastError:String(companyAuto.lastError||''),
        history:(companyAuto.history||[]).slice(0,30)
      });
      try{ androidSyncBackgroundMode(); }catch(e){}
    }catch(e){ console.warn('[MG Spółka] save',e); }
  }
  function companyMoney(n){
    const x=Number(n||0);
    try{return new Intl.NumberFormat('pl-PL',{maximumFractionDigits:0}).format(x)+' zł';}
    catch(e){return Math.round(x)+' zł';}
  }
  function companyMinutes(n){
    const m=Math.max(0,Number(n||0));
    if(m<60) return Math.round(m)+' min';
    if(m<1440) return (m/60).toFixed(m<600?1:0)+' h';
    return (m/1440).toFixed(m<4320?1:0)+' d';
  }
  function companyBranchLabel(b){
    const x=String(b||'');
    return x==='production'?'Produkcja':x==='marketing'?'Marketing':x==='distribution'?'Dystrybucja':x==='corporate'?'Korporacja':x==='mega'?'Mega':x||'Inne';
  }
  function companyReqCodes(node){
    return (Array.isArray(node&&node.requires)?node.requires:[]).map(x=>String(x&&x.code||'')).filter(Boolean);
  }
  function companyBusinessNodes(inv){
    return (Array.isArray(inv&&inv.business)?inv.business:[]).filter(x=>x&&x.isActive!==false&&x.code);
  }
  function companyCompletedSet(inv){
    return new Set(companyBusinessNodes(inv).filter(x=>String(x.state||'')==='completed').map(x=>String(x.code)));
  }
  function companyAvailableNodes(nodes,done){
    return nodes.filter(n=>!done.has(String(n.code)) && companyReqCodes(n).every(c=>done.has(c)));
  }
  function companyNetDaily(companyResp,investments,incomeOverride){
    const c=companyResp&&companyResp.company||{};
    const income=Number(incomeOverride!=null?incomeOverride:(investments&&investments.dailyIncome!=null?investments.dailyIncome:c.dailyIncome)||0);
    const payroll=Number(c.totalSalaries||0);
    return Math.max(0,income-payroll);
  }
  function companyOfferEta(offer,fund,netDaily){
    const cost=Math.max(0,Number(offer&&offer.finalCost||0));
    const mins=Math.max(1,Number(offer&&offer.finalMinutes||1));
    const short=Math.max(0,cost-Number(fund||0));
    const wait=short<=0?0:(netDaily>0?short/netDaily*1440:Infinity);
    return {cost,mins,wait,total:wait+mins};
  }
  function companyOfferBest(offers,fund,netDaily){
    const list=(Array.isArray(offers)?offers:[]).filter(o=>o&&Number.isFinite(Number(o.finalCost))&&Number.isFinite(Number(o.finalMinutes)));
    let best=null;
    for(const o of list){
      const eta=companyOfferEta(o,fund,netDaily);
      if(!best || eta.total<best.eta.total || (eta.total===best.eta.total && eta.cost<best.eta.cost)) best={offer:o,eta};
    }
    return best;
  }
  async function companyFetchOffers(code){
    const cid=Number(settings.characterId||0);
    if(!cid||!code) return null;
    try{
      const r=await apiActive('/api/gangs/'+cid+'/company/investments/'+encodeURIComponent(code)+'/offers');
      if(r&&Array.isArray(r.offers)){
        companyAuto.liveOffers[String(code)]=r.offers;
        return r;
      }
    }catch(e){ console.warn('[MG Spółka] offers '+code,e); }
    return null;
  }

  function companyStateHeuristic(st,nodes,payroll){
    const remaining=nodes.filter(n=>!st.done.has(String(n.code)));
    let mins=0,cost=0;
    for(const n of remaining){
      mins+=Math.max(1,Number(n.baseMinutes||1));
      cost+=Math.max(0,Number(n.baseCost||0));
    }
    const net=Math.max(1,Number(st.income||0)-Number(payroll||0));
    const cashWait=Math.max(0,cost-Number(st.fund||0))/net*1440;
    return Number(st.t||0)+mins+cashWait*0.28;
  }

  function companyComputeMixedPlan(companyResp,inv){
    const nodes=companyBusinessNodes(inv);
    const c=companyResp&&companyResp.company||{};
    const payroll=Number(c.totalSalaries||0);
    let done=companyCompletedSet(inv);
    let fund=Number(inv&&inv.fund!=null?inv.fund:c.investmentFund||0);
    let income=Number(inv&&inv.dailyIncome!=null?inv.dailyIncome:c.dailyIncome||0);
    let initialDelay=0;
    const active=(inv&&inv.activeInvestment)||(companyResp&&companyResp.activeInvestment)||null;

    if(active&&active.code&&!done.has(String(active.code))){
      const fin=Date.parse(String(active.finishesAt||''));
      const rem=Number.isFinite(fin)?Math.max(0,(fin-Date.now())/60000):Math.max(0,Number(active.finalMinutes||0));
      const net=Math.max(0,income-payroll);
      fund+=net*(rem/1440);
      initialDelay+=rem;
      done=new Set(done);
      done.add(String(active.code));
      const n=nodes.find(x=>String(x.code)===String(active.code));
      income+=Number(active.incomeBonus!=null?active.incomeBonus:(n&&n.incomeBonus)||0);
    }

    if(!nodes.length) return {status:'BRAK DANYCH',steps:[],minutes:0,initialDelay,fund,income,payroll};
    if(done.size>=nodes.length) return {status:'MAX',steps:[],minutes:initialDelay,initialDelay,fund,income,payroll};

    let beam=[{done:new Set(done),fund,income,t:initialDelay,path:[]}];
    let full=[];
    const maxDepth=Math.min(60,nodes.length+2);

    for(let depth=0;depth<maxDepth;depth++){
      const next=[];
      for(const st of beam){
        if(st.done.size>=nodes.length){ full.push(st); continue; }
        const avail=companyAvailableNodes(nodes,st.done);
        if(!avail.length) continue;
        for(const n of avail){
          let opts=null;
          if(st.path.length===0 && Array.isArray(companyAuto.liveOffers[String(n.code)]) && companyAuto.liveOffers[String(n.code)].length){
            opts=companyAuto.liveOffers[String(n.code)].map(o=>({
              contractorCode:String(o.contractorCode||''),
              contractorName:String(o.contractorName||o.contractorCode||''),
              finalCost:Number(o.finalCost||n.baseCost||0),
              finalMinutes:Number(o.finalMinutes||n.baseMinutes||1),
              live:true
            }));
          }
          if(!opts||!opts.length){
            opts=[{
              contractorCode:'base',
              contractorName:'wartość bazowa',
              finalCost:Number(n.baseCost||0),
              finalMinutes:Number(n.baseMinutes||1),
              live:false
            }];
          }
          let bestOpt=null;
          for(const o of opts){
            const net=Math.max(0,Number(st.income||0)-payroll);
            const eta=companyOfferEta(o,st.fund,net);
            if(!Number.isFinite(eta.total)) continue;
            if(!bestOpt||eta.total<bestOpt.eta.total) bestOpt={o,eta};
          }
          if(!bestOpt) continue;
          const net=Math.max(0,Number(st.income||0)-payroll);
          const elapsed=bestOpt.eta.total;
          const newFund=Math.max(0,Number(st.fund||0)+net*(elapsed/1440)-bestOpt.eta.cost);
          const nd=new Set(st.done); nd.add(String(n.code));
          const step={
            code:String(n.code),
            name:String(n.name||n.code),
            branch:String(n.branch||''),
            incomeBonus:Number(n.incomeBonus||0),
            cost:Number(bestOpt.eta.cost),
            minutes:Number(bestOpt.eta.mins),
            waitMinutes:Number(bestOpt.eta.wait),
            contractorCode:String(bestOpt.o.contractorCode||''),
            contractorName:String(bestOpt.o.contractorName||''),
            liveOffer:!!bestOpt.o.live
          };
          next.push({
            done:nd,
            fund:newFund,
            income:Number(st.income||0)+Number(n.incomeBonus||0),
            t:Number(st.t||0)+elapsed,
            path:st.path.concat([step])
          });
        }
      }
      if(full.length) break;
      if(!next.length) break;

      const seen=new Map();
      for(const st of next){
        const sig=Array.from(st.done).sort().join(',');
        const h=companyStateHeuristic(st,nodes,payroll);
        const old=seen.get(sig);
        if(!old || h<old.h || (h===old.h && st.fund>old.st.fund)) seen.set(sig,{h,st});
      }
      beam=Array.from(seen.values()).sort((a,b)=>a.h-b.h).slice(0,COMPANY_AUTO_BEAM).map(x=>x.st);
    }

    if(!full.length) full=beam.filter(x=>x.done.size>=nodes.length);
    let winner=null;
    for(const st of full){
      if(!winner||st.t<winner.t||(st.t===winner.t&&st.fund>winner.fund)) winner=st;
    }
    if(!winner){
      winner=beam.slice().sort((a,b)=>companyStateHeuristic(a,nodes,payroll)-companyStateHeuristic(b,nodes,payroll))[0]||null;
    }
    return winner?{
      status:winner.done.size>=nodes.length?'OK':'CZĘŚCIOWY',
      steps:winner.path||[],
      minutes:Number(winner.t||0),
      initialDelay,
      fund:Number(fund||0),
      income:Number(income||0),
      payroll,
      completed:done.size,
      total:nodes.length
    }:{status:'BRAK ŚCIEŻKI',steps:[],minutes:0,initialDelay,fund,income,payroll};
  }

  async function companyAutoRefresh(opts){
    opts=opts||{};
    if(companyAuto.runtimeBusy&&!opts.force) return false;
    const cid=Number(settings.characterId||0);
    if(!cid){
      companyAuto.lastError='Nie znam ID aktualnej postaci.';
      return false;
    }
    if(!__mgSessionTemplate) tryHydrateSessionFromGameAuth();
    if(!__mgSessionTemplate){
      companyAuto.lastError='Brak aktywnej sesji gry.';
      return false;
    }
    if(!opts.keepBusy) companyAuto.runtimeBusy=true;
    companyAuto.lastError='';
    try{
      const pair=await Promise.all([
        apiActive('/api/gangs/'+cid+'/company'),
        apiActive('/api/gangs/'+cid+'/company/investments')
      ]);
      const companyResp=pair[0], inv=pair[1];
      if(!companyResp||companyResp.success===false) throw new Error(String(companyResp&&companyResp.error||companyResp&&companyResp.message||'Brak danych spółki'));
      if(!inv||inv.success===false) throw new Error(String(inv&&inv.error||inv&&inv.message||'Brak danych inwestycji'));

      companyAuto.companyResp=companyResp;
      companyAuto.investments=inv;
      companyAuto.lastFetchAt=Date.now();
      companyAuto.liveOffers={};

      const active=(inv&&inv.activeInvestment)||(companyResp&&companyResp.activeInvestment)||null;
      if(!active){
        const nodes=companyBusinessNodes(inv);
        const done=companyCompletedSet(inv);
        const avail=companyAvailableNodes(nodes,done).slice(0,8);
        const res=await Promise.allSettled(avail.map(n=>companyFetchOffers(n.code)));
        void res;
      }
      companyAuto.plan=companyComputeMixedPlan(companyResp,inv);
      companyAuto.lastAction=active?'Aktywna inwestycja: '+String(active.name||active.code||'—'):'Plan mieszany przeliczony.';
      companyAutoSave();
      return true;
    }catch(e){
      companyAuto.lastError=String(e&&e.message||e);
      companyAuto.nextAt=Date.now()+60000;
      companyAutoSave();
      return false;
    }finally{
      if(!opts.keepBusy) companyAuto.runtimeBusy=false;
      if(opts.renderAfter!==false){ try{render();}catch(e){} }
    }
  }

  async function companyAutoCycle(opts){
    opts=opts||{};
    const force=!!opts.force;
    if(!companyAuto.enabled&&!force) return false;
    if(companyAuto.runtimeBusy) return false;
    const now=Date.now();
    if(!force&&Number(companyAuto.nextAt||0)>now) return false;

    companyAuto.runtimeBusy=true;
    companyAuto.lastError='';
    try{
      const ok=await companyAutoRefresh({force:true,keepBusy:true,renderAfter:false});
      if(!ok) return false;
      const cr=companyAuto.companyResp||{};
      const inv=companyAuto.investments||{};
      const c=cr.company||{};
      const perms=cr.permissions||{};
      if(!(perms.canManageCompany||inv.canManage)){
        companyAuto.lastError='Brak uprawnień do zarządzania spółką.';
        companyAuto.nextAt=Date.now()+60*60*1000;
        companyAutoSave();
        return false;
      }

      const active=inv.activeInvestment||cr.activeInvestment||null;
      if(active){
        const fin=Date.parse(String(active.finishesAt||''));
        const rem=Number.isFinite(fin)?Math.max(0,fin-Date.now()):COMPANY_AUTO_POLL_MS;
        companyAuto.nextAt=Date.now()+Math.min(Math.max(60000,rem+15000),COMPANY_AUTO_POLL_MS);
        companyAuto.lastAction='Czekam na zakończenie: '+String(active.name||active.code||'—');
        companyAutoSave();
        return true;
      }

      const plan=companyAuto.plan||companyComputeMixedPlan(cr,inv);
      const step=plan&&Array.isArray(plan.steps)?plan.steps[0]:null;
      if(!step){
        companyAuto.lastAction=plan&&plan.status==='MAX'?'Spółka: biznesowe drzewko rozwinięte maksymalnie.':'Brak dostępnego kroku inwestycji.';
        companyAuto.nextAt=Date.now()+60*60*1000;
        companyAutoSave();
        return true;
      }

      const offerResp=await companyFetchOffers(step.code);
      const offers=offerResp&&Array.isArray(offerResp.offers)?offerResp.offers:[];
      const fund=Number(inv.fund!=null?inv.fund:c.investmentFund||0);
      const net=companyNetDaily(cr,inv);
      const best=companyOfferBest(offers,fund,net);
      if(!best){
        companyAuto.lastError='Brak ofert wykonawców dla '+step.code+'.';
        companyAuto.nextAt=Date.now()+COMPANY_AUTO_POLL_MS;
        companyAutoSave();
        return false;
      }

      const o=best.offer, eta=best.eta;
      const affordable=Number(o.finalCost||0)<=fund && o.affordable!==false;
      if(!affordable){
        companyAuto.lastAction='Czekam na fundusz: '+step.code+' • potrzeba '+companyMoney(o.finalCost)+' • fundusz '+companyMoney(fund);
        companyAuto.nextAt=Date.now()+COMPANY_AUTO_POLL_MS;
        companyAutoSave();
        return true;
      }

      const result=await apiActive('/api/gangs/'+Number(settings.characterId||0)+'/company/investments/'+encodeURIComponent(step.code)+'/start',{
        method:'POST',
        body:{contractorCode:String(o.contractorCode||'standardex')}
      });
      if(!result||result.success===false) throw new Error(String(result&&result.message||result&&result.error||'Nie udało się uruchomić inwestycji'));

      companyAuto.lastStartAt=Date.now();
      companyAuto.lastAction='START '+step.code+' • '+String(step.name||'')+' • '+String(o.contractorName||o.contractorCode||'')+' • '+companyMoney(o.finalCost)+' • '+companyMinutes(o.finalMinutes);
      companyAuto.history.unshift({
        at:Date.now(),code:step.code,name:step.name,branch:step.branch,
        contractorCode:String(o.contractorCode||''),contractorName:String(o.contractorName||''),
        cost:Number(o.finalCost||0),minutes:Number(o.finalMinutes||0)
      });
      companyAuto.history=companyAuto.history.slice(0,30);
      companyAuto.nextAt=Date.now()+Math.max(60000,Number(o.finalMinutes||60)*60000+15000);
      companyAutoSave();
      await companyAutoRefresh({force:true,keepBusy:true,renderAfter:false});
      return true;
    }catch(e){
      companyAuto.lastError=String(e&&e.message||e);
      companyAuto.nextAt=Date.now()+5*60*1000;
      companyAutoSave();
      return false;
    }finally{
      companyAuto.runtimeBusy=false;
      try{render();}catch(e){}
    }
  }

  function companyAutoHTML(){
    const cr=companyAuto.companyResp||{};
    const inv=companyAuto.investments||{};
    const c=cr.company||{};
    const p=companyAuto.plan||null;
    const active=inv.activeInvestment||cr.activeInvestment||null;
    const fund=Number(inv.fund!=null?inv.fund:c.investmentFund||0);
    const income=Number(inv.dailyIncome!=null?inv.dailyIncome:c.dailyIncome||0);
    const salaries=Number(c.totalSalaries||0);
    const net=Math.max(0,income-salaries);
    const nextIn=companyAuto.nextAt?Math.max(0,Math.ceil((companyAuto.nextAt-Date.now())/1000)):0;
    const steps=p&&Array.isArray(p.steps)?p.steps:[];
    const route=steps.slice(0,12).map((x,i)=>{
      const cls=i===0?'ok':'';
      const wait=Number(x.waitMinutes||0)>1?' • czekanie '+companyMinutes(x.waitMinutes):'';
      const contractor=x.contractorName&&x.contractorName!=='wartość bazowa'?' • '+esc(x.contractorName):'';
      return '<div class="simple-card"><span>#'+(i+1)+' • '+esc(companyBranchLabel(x.branch))+'</span><b class="'+cls+'">'+esc(x.code)+' — '+esc(x.name)+'</b><small>'+companyMoney(x.cost)+' • '+companyMinutes(x.minutes)+wait+' • +'+companyMoney(x.incomeBonus)+'/dzień'+contractor+'</small></div>';
    }).join('');
    const hist=(companyAuto.history||[]).slice(0,5).map(h=>
      '<div class="simple-card"><span>'+new Date(h.at).toLocaleString('pl-PL')+'</span><b>'+esc(h.code)+' — '+esc(h.name||'')+'</b><small>'+companyMoney(h.cost)+' • '+companyMinutes(h.minutes)+' • '+esc(h.contractorName||'')+'</small></div>'
    ).join('');

    let activeText='Brak — można uruchomić kolejny krok';
    if(active){
      const fin=Date.parse(String(active.finishesAt||''));
      const rem=Number.isFinite(fin)?Math.max(0,(fin-Date.now())/60000):0;
      activeText=esc(active.code||'')+' — '+esc(active.name||'')+(rem?' • zostało '+companyMinutes(rem):'');
    }

    const salaryWarn=salaries>0&&c.employeesCount&&c.config&&Number(c.config.minSalary||0)>0&&salaries>Number(c.employeesCount||0)*Number(c.config.minSalary||0)+1000
      ? '<div class="section simple-notice warn"><b>Uwaga:</b> realne pensje spółki to '+companyMoney(salaries)+'/dzień. Automat NIE ustawia wypłat 100 000 zł, ale istniejące pensje z serwera nadal zmniejszają fundusz.</div>'
      : '';

    return ''+
      '<div class="helper-hero">'+
        '<div><div class="helper-name">🏭 Spółka — AUTO rozwój</div><div class="sub">Mieszana ścieżka Produkcja / Marketing / Dystrybucja / Korporacja / Mega. Cel: jak najszybciej rozwijać dochód spółki.</div></div>'+
        '<div class="helper-actions">'+
          '<button class="'+(companyAuto.enabled?'btn-main':'')+'" data-act="company-toggle">'+(companyAuto.enabled?'AUTO: ON':'AUTO: OFF')+'</button>'+
          '<button data-act="company-refresh">'+(companyAuto.runtimeBusy?'Liczenie…':'↻ Przelicz')+'</button>'+
          '<button data-act="company-run-now">▶ Następny krok</button>'+
        '</div>'+
      '</div>'+
      '<div class="section simple-notice info"><b>Wypłaty 100 000 zł na gang: WYŁĄCZONE w planie.</b> Spółka nie uruchamia modułu Wypłaty i nie odejmuje dodatkowej puli 100 000 zł. Do kalkulacji bierze tylko realne pensje zapisane na serwerze.</div>'+
      salaryWarn+
      (companyAuto.lastError?'<div class="section simple-notice warn"><b>Błąd:</b> '+esc(companyAuto.lastError)+'</div>':'')+
      (companyAuto.lastAction?'<div class="section note"><b>'+esc(companyAuto.lastAction)+'</b></div>':'')+
      '<div class="cards mini">'+
        '<div class="card"><div class="label">Fundusz</div><div class="big">'+companyMoney(fund)+'</div><div>na inwestycje</div></div>'+
        '<div class="card"><div class="label">Dochód dzienny</div><div class="big">'+companyMoney(income)+'</div><div>brutto spółki</div></div>'+
        '<div class="card"><div class="label">Pensje</div><div class="big">'+companyMoney(salaries)+'</div><div>realny koszt / dzień</div></div>'+
        '<div class="card"><div class="label">Netto do funduszu</div><div class="big">'+companyMoney(net)+'</div><div>bez dodatkowych 100k</div></div>'+
        '<div class="card"><div class="label">Aktywna inwestycja</div><div class="big" style="font-size:13px">'+activeText+'</div><div>'+(active?'slot zajęty':'slot wolny')+'</div></div>'+
        '<div class="card"><div class="label">Scheduler</div><div class="big">'+(companyAuto.enabled?'ON':'OFF')+'</div><div>'+(companyAuto.enabled&&nextIn?'kolejny check ~'+Math.ceil(nextIn/60)+' min':'—')+'</div></div>'+
      '</div>'+
      '<div class="section"><b>Najkrótsza prognozowana ścieżka mieszana</b><div class="sub">Planner przelicza zależności i finansowanie po każdym kroku. Dla przyszłych zablokowanych inwestycji używa kosztu/czasu bazowego; przed realnym START-em zawsze pobiera świeże oferty wykonawców.</div>'+
        '<div style="margin-top:10px">'+(route||'<div class="sub">'+(p&&p.status==='MAX'?'Biznesowe drzewko ukończone.':'Kliknij „Przelicz”.')+'</div>')+'</div>'+
      '</div>'+
      '<div class="section"><b>Ostatnie automatyczne START-y</b><div style="margin-top:10px">'+(hist||'<div class="sub">Brak.</div>')+'</div></div>'+
      '<div class="section simple-notice warn"><b>Receptury Rxx są pomijane.</b> Nie zwiększają dziennego dochodu, więc ich budowanie wydłużałoby ekonomiczną ścieżkę rozwoju. Możemy później dodać osobny tryb receptur.</div>';
  }

"""
s = s.replace(company_anchor, company_code + company_anchor, 1)

# Nowa zakładka.
old_tabs = "['raids','🚨 Napady'],['payouts','💰 Wypłaty']"
new_tabs = "['raids','🚨 Napady'],['company','🏭 Spółka'],['payouts','💰 Wypłaty']"
if old_tabs not in s:
    raise SystemExit("Nie znaleziono listy zakładek")
s = s.replace(old_tabs,new_tabs,1)

# Render.
render_anchor = "      if (state.activeTab==='payouts') html = gangPayoutHTML();"
if render_anchor not in s:
    raise SystemExit("Nie znaleziono renderu payouts")
s = s.replace(render_anchor, "      if (state.activeTab==='company') html = companyAutoHTML();\n"+render_anchor,1)

# Obsługa przycisków przed payout.
act_anchor = "    if(act==='payout-default-range'){"
if act_anchor not in s:
    raise SystemExit("Nie znaleziono handlera payout-default-range")
handlers = r"""    if(act==='company-toggle'){
      if(!companyAuto.enabled){
        if(!confirm('Włączyć AUTO rozwój Spółki? Pomagier będzie sam uruchamiał inwestycje i wydawał fundusz spółki. Inwestycji nie da się anulować. W planie NIE ma dodatkowej wypłaty 100 000 zł na gang.')) return;
        companyAuto.enabled=true;
        companyAuto.nextAt=0;
        companyAuto.lastAction='AUTO Spółka włączone — liczę mieszaną ścieżkę.';
      }else{
        companyAuto.enabled=false;
        companyAuto.lastAction='AUTO Spółka wyłączone. Trwająca inwestycja nie jest anulowana.';
      }
      companyAutoSave();
      render();
      return;
    }
    if(act==='company-refresh'){
      await companyAutoRefresh({force:true,renderAfter:true});
      return;
    }
    if(act==='company-run-now'){
      await companyAutoCycle({force:true});
      return;
    }
"""
s = s.replace(act_anchor,handlers+act_anchor,1)

# Foreground service ma działać także dla Spółki.
old_bg = "window.AndroidBridge.setAutomationActive(!!autoCfg.enabled || !!recoveryResumePending || !!autoCfg.alcoholAutoEnabled || !!autoCfg.raidAutoEnabled || !!securityLab.active);"
new_bg = "window.AndroidBridge.setAutomationActive(!!autoCfg.enabled || !!recoveryResumePending || !!autoCfg.alcoholAutoEnabled || !!autoCfg.raidAutoEnabled || !!(typeof companyAuto!=='undefined'&&companyAuto.enabled) || !!securityLab.active);"
if old_bg not in s:
    raise SystemExit("Nie znaleziono androidSyncBackgroundMode")
s = s.replace(old_bg,new_bg,1)

# Scheduler: Spółka ma osobny tor zapisu, bez równoległości z innymi akcjami.
sched_anchor = "    // Drożdże winiarskie: osobny, bardzo wąski automat demontażu."
if sched_anchor not in s:
    raise SystemExit("Nie znaleziono kotwicy schedulera")
sched = r"""    // Spółka AUTO: osobny tor zapisujący. Nie działa równolegle z Brainem,
    // ekonomią, półautomatem ani innymi akcjami zapisu.
    if(
      companyAuto.enabled &&
      !companyAuto.runtimeBusy &&
      !state.localAI.busy &&
      !state.auto.inCycle &&
      !state.manual.semi.inCycle &&
      !raidAuto.runtimeBusy &&
      !alcoholAuto.runtimeBusy &&
      (!companyAuto.nextAt || Date.now()>=companyAuto.nextAt)
    ){
      companyAutoCycle({force:false});
      return;
    }
    if(companyAuto.runtimeBusy) return;

"""
s = s.replace(sched_anchor,sched+sched_anchor,1)

# Po starcie aplikacji, jeśli AUTO było zapisane jako ON, sprawdź spółkę szybko.
startup_anchor = "  setInterval(__pomagierSchedulerTick,1000);"
if startup_anchor not in s:
    raise SystemExit("Nie znaleziono setInterval scheduler")
s = s.replace(startup_anchor, "  if(companyAuto.enabled) companyAuto.nextAt=0;\n\n"+startup_anchor,1)

js.write_text(s,encoding="utf-8")

# Android.
bg = root / "app/build.gradle.kts"
if bg.exists():
    t=bg.read_text(encoding="utf-8")
    t=t.replace("versionCode = 10026","versionCode = 10027")
    t=t.replace('versionName = "1.0.26"','versionName = "1.0.27"')
    bg.write_text(t,encoding="utf-8")

# README.
readme = root / "README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.27 / userscript 8.8.34" not in r:
        r += """

## v1.0.27 / userscript 8.8.34
- Nowa zakładka Spółka.
- Niezależne AUTO ON/OFF dla inwestycji spółki.
- Planner mieszanej ścieżki Produkcja / Marketing / Dystrybucja / Korporacja / Mega.
- Brak dodatkowej rezerwy/wypłaty 100 000 zł na gang; kalkulacja używa realnych pensji z API.
- Przed START-em inwestycji Pomagier pobiera oferty wykonawców i wybiera wariant o najkrótszym przewidywanym czasie zakończenia.
- Automat nie buduje receptur Rxx w trybie rozwoju dochodu.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.27 patch applied")
