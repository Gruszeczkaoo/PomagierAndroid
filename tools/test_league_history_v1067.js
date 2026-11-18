// Regression for official Liga Meneli v2 /api/rivals responses (read-only).
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const js=fs.readFileSync(process.argv[2]||'app/src/main/assets/pomagier.user.js','utf8');
const a=js.indexOf('  // LIGA MENELI LAB v8.8.67'),b=js.indexOf('  // PvP ENGINE V2 SCANNER v8.8.55',a);
assert(a>=0&&b>a,'league section');
const db={};const requests=[];
const context={URL,URLSearchParams,Date,JSON,Number,String,Object,Array,Math,Set,Map,RegExp,
  location:{href:'https://menelgame.online/',origin:'https://menelgame.online'},
  pvpLabUrl:u=>new URL(u,'https://menelgame.online/'),
  loadJSON:(key,d)=>db[key]||d,saveJSON:(key,v)=>{db[key]=JSON.parse(JSON.stringify(v))},
  pvpLabOwnId:()=>462,document:{querySelector:()=>({innerText:'Liga Meneli'})},
  esc:x=>String(x).replace(/</g,'&lt;'),render:()=>{},confirm:()=>true,alert:()=>{},sleep:async()=>{},
  nowIso:()=>new Date().toISOString(),ANDROID_VERSION:'1.0.67',VERSION:'8.8.74',
  pomagierSaveJsonNative:async()=>true,pomagierBrowserDownload:()=>{},
  tryHydrateSessionFromGameAuth:()=>true,__mgSessionTemplate:{},
  apiActive:async p=>{requests.push(p);return {success:true,history:[]}}};
vm.createContext(context);
vm.runInContext(js.slice(a,b)+'\nthis.t={capture:leagueLabCapture,path:leagueLabPathMatches,lab:()=>leagueLab,sync:leagueLabSync,html:leagueLabHTML}',context);
const t=context.t;
assert(t.path('/api/rivals/462/history'),'official history GET recognized');
assert(!t.path('/api/rivals/12876/history'),'other account not permitted');
const fight=(id,a,d,w,state='resolved')=>({id,attacker_id:a,defender_id:d,
  attacker_name:a===462?'DonCziczo':'Other',defender_name:d===462?'DonCziczo':'Opponent',
  started_at:1795013576789,due_at:1795015376789,resolved_at:state==='resolved'?1795015380005:null,
  state,winner_id:w,xp_amount:232,xp_loss_amount:351});
const match={id:404,gang_a:108,gang_b:119,gang_a_name:'ŻabkaSquad',gang_b_name:'Elitarny oddział menelski',
  xp_balance_a:13194,state:'open',winner_gang_id:null,day_key:'2026-11-18',day_no:5,division_no:2};
const overview={success:true,week:{id:4,week_no:1},todayMatches:[match],
  history:[fight(84006,462,6717,462),fight(84007,12876,462,12876),fight(70742,462,10236,null,'cancelled')]};
assert(t.capture('/api/rivals/462/overview',overview,{method:'GET'}));
assert.equal(t.lab().matches.length,1);
assert.equal(t.lab().matches[0].home,'ŻabkaSquad');
assert.equal(t.lab().matches[0].away,'Elitarny oddział menelski');
assert.equal(t.lab().matches[0].homeXp,13194);
assert.equal(t.lab().matches[0].awayXp,-13194);
assert.equal(t.lab().matches[0].winner,'','open match has no winner');
assert.equal(t.lab().individualFights.length,3);
assert.equal(t.lab().individualFights.filter(x=>x.won===true).length,1);
assert.equal(t.lab().individualFights.filter(x=>x.won===false).length,1);
assert.equal(t.lab().individualFights.filter(x=>x.state==='cancelled').length,1);
assert.equal(t.lab().individualFights.find(x=>x.rivalId===84007).leagueXpChange,-351);
assert(t.capture('/api/rivals/462/overview',overview,{method:'GET'}));
assert.equal(t.lab().individualFights.length,3,'no duplicate after refresh');
assert.equal(t.lab().matches.length,1,'same gang match unique');
const pending=fight(84582,462,12876,null,'pending');
assert(t.capture('/api/rivals/462/status',{success:true,outgoing:pending,incoming:[]},{method:'GET'}));
assert.equal(t.lab().individualFights.length,4);
assert.equal(t.lab().individualFights.find(x=>x.rivalId===84582).won,null,'pending not a loss');
assert(t.capture('/api/rivals/462/history',{success:true,history:[fight(84582,462,12876,462)]},{method:'GET'}));
assert.equal(t.lab().individualFights.find(x=>x.rivalId===84582).won,true,'pending updated to win');
assert(t.capture('/api/rivals/462/status',{success:true,outgoing:pending,incoming:[]},{method:'GET'}));
assert.equal(t.lab().individualFights.find(x=>x.rivalId===84582).won,true,'late pending must not downgrade');
assert(t.capture('/api/rivals/462/matches/404/attacks',{success:true,attacks:[fight(84583,45,67,45)]},{method:'GET'}));
assert.equal(t.lab().individualFights.length,4,'other gang members not imported');
assert(t.capture('/api/rivals/462/overview',{success:true,token:'SHOULD_NOT_STORE',todayMatches:[match],history:[]},{method:'GET'}));
assert(!JSON.stringify(t.lab().endpoints).includes('SHOULD_NOT_STORE'),'redaction');
// Optional real export regression: node test.js userscript.js user_liga.json
if(process.argv[3]){
  const exported=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
  const ep=Object.values(exported.lab?.endpoints||{});
  const realOverview=ep.find(x=>x.path?.endsWith('/overview'))?.sample;
  if(realOverview&&Array.isArray(realOverview.history)){
    const own=Number(exported.characterId);
    const fights=realOverview.history.filter(x=>[Number(x.attacker_id),Number(x.defender_id)].includes(own));
    const won=fights.filter(x=>x.state==='resolved'&&Number(x.winner_id)===own).length;
    const lost=fights.filter(x=>x.state==='resolved'&&x.winner_id!=null&&Number(x.winner_id)!==own).length;
    const cancelled=fights.filter(x=>x.state==='cancelled').length;
    t.capture('/api/rivals/462/overview',realOverview,{method:'GET'});
    const v=t.lab().individualFights.filter(x=>x.battleId?.startsWith('rival:'));
    assert.equal(t.lab().matches.length,realOverview.todayMatches.length);
    assert(v.length>=fights.length,'imported every own fight');
    assert(v.filter(x=>x.won===true).length>=won);
    assert(v.filter(x=>x.won===false).length>=lost);
    assert(v.filter(x=>x.state==='cancelled').length>=cancelled);
    console.log('REAL-EXPORT:',{matches:t.lab().matches.length,history:fights.length,wins:won,losses:lost,cancelled});
  }
}
assert(!t.html().includes('WYGRANA</td><td>-351'),'no negative XP on win');
assert(t.html().includes('ŻabkaSquad')&&t.html().includes('Bilans z rywalami'));
(async()=>{await t.sync();assert(requests.includes('/api/rivals/462/history'),'observed history GET sync');
 console.log('PASS: league v2 matches, history W/L, cancel, pending, 30min resolve, dedup, isolation, redaction, GET sync');
})().catch(e=>{console.error(e);process.exitCode=1});