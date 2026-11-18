// Offline tests for v1.0.71 using the actual built userscript functions.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const filename=process.argv[2];
if(!filename){console.error('Usage: node test_prestige_points_v1071.js <full-userscript>');process.exit(2)}
const js=fs.readFileSync(filename,'utf8');
function extract(start,end){const a=js.indexOf(start);assert(a>=0,'missing '+start);const b=js.indexOf(end,a+start.length);assert(b>a,'missing end '+end);return js.slice(a,b)}
const choose=extract('  function prestigeAutoChoose(candidates){','  function prestigeAutoBusyElsewhere(){');
const points=extract('  function prestigeAutoPoints(d){','  function prestigeAutoServerReady(d){');
const cycle=extract('  async function prestigeAutoCycle({manual=false}={}){','  async function prestigeAutoRefreshTargets(){');
const testSrc=[choose,points,cycle,'globalThis.choose=prestigeAutoChoose;globalThis.cycle=prestigeAutoCycle;globalThis.points=prestigeAutoPoints;'].join('\n');
const c={};vm.createContext(c);vm.runInContext(testSrc,c);
const entry=(id,level,gain,eligible=false)=>({id,level,expectedGain:gain,history:{eligible}});
let s=c.choose([entry(13,20,0),entry(12,35,10),entry(11,50,15)]);
assert.equal(s.choice.id,12);assert.equal(s.rule,'lowest_level');
s=c.choose([entry(13,20,0),entry(12,35,10),entry(11,50,15,true)]);
assert.equal(s.choice.id,11);assert.equal(s.rule,'history');
s=c.choose([entry(7,5,0),entry(8,17,0)]);assert.equal(s.choice,null);
let pts=c.points({success:true,actionPoints:5});assert.equal(pts.remaining,5);assert.equal(pts.ready,true);
pts=c.points({success:true,action_points:0});assert.equal(pts.remaining,0);assert.equal(pts.ready,false);
pts=c.points({success:true,remainingAttacks:3,canAttack:false});assert.equal(pts.ready,false);
assert(!js.includes('Date.now()-prestigeAuto.lastAutoRollAt<30*60000'),'30m roll throttle still present');
assert(!cycle.includes('prestigeAutoDayCount()>=prestigeAuto.maxDaily'),'false daily 12 cap still present');
assert(js.includes("prestigeAuto.maxDaily=0"));

function setup({points=3,rollLists=null,fightWon=true,manual=false}={}){
  const mock={attacks:[],rolls:[],remaining:points,posts:0};
  const ctx={
    __mgSessionTemplate:true,
    prestigeAuto:{enabled:true,runtimeBusy:false,checkMinutes:5,lastCheckAt:0,
      calibration:{type:'target-id',ownId:462,field:'targetId',base:{}},
      characterId:462,actions:[],status:'',lastStatus:null,rollMethod:'POST',allowAutoRoll:true,
      rollCalibration:{ownId:462},rollCandidates:[],lastRollAt:0},
    pvpLabOwnId:()=>462,prestigeAutoGuard:()=>{},prestigeAutoBusyElsewhere:()=>false,
    tryHydrateSessionFromGameAuth:()=>{},prestigeAutoSave:()=>{},render:()=>{},
    pvpLabIngestDuelStatus:()=>{},
    prestigeAutoStop(msg){ctx.prestigeAuto.enabled=false;ctx.prestigeAuto.status=msg},
    prestigeAutoCandidates(){return ctx.prestigeAuto.rollCandidates.map(x=>({...x,history:x.history||{eligible:false}}))},
    async prestigeAutoMaybeRoll(){
      mock.rolls.push(mock.remaining);
      const list=(rollLists&&rollLists[Math.min(mock.rolls.length-1,rollLists.length-1)])||[entry(100+mock.rolls.length,25,10)];
      ctx.prestigeAuto.rollCandidates=list;
      ctx.prestigeAuto.lastStatus={ready:true,remaining:mock.remaining};
    },
    apiActive:async (path,opts)=>{
      if(path.endsWith('/status'))return {success:true,actionPoints:mock.remaining,canAttack:mock.remaining>0};
      if(path.endsWith('/fight')){
        mock.posts++;mock.attacks.push(opts.body.targetId);mock.remaining--;
        return {success:true,won:fightWon,battleId:'test_'+mock.posts,prestigeChange:fightWon?10:-9};
      }
      throw Error('Unexpected request '+path);
    },
    pvpLabObserveApi(){
      const sent=ctx.prestigeAuto.actions.findLast(a=>a.status==='wyslano');
      if(sent)sent.status=fightWon?'wygrana':'przegrana';
      ctx.prestigeAuto.rollCandidates=[];ctx.prestigeAuto.lastRollAt=0;
    }
  };
  vm.createContext(ctx);vm.runInContext(testSrc,ctx);
  return {ctx,mock};
}
(async()=>{
  {
    const {ctx,mock}=setup({points:3});await ctx.cycle({manual:true});
    assert.deepEqual(mock.attacks,[101,102,103]);
    assert.equal(mock.remaining,0);assert.equal(mock.rolls.length,3);
    assert.equal(ctx.prestigeAuto.enabled,true);
    assert(ctx.prestigeAuto.status.includes('BRAK PUNKTOW'));
    console.log('PASS: consecutive fights, server points govern, fresh opponents each time');
  }
  {
    const {ctx,mock}=setup({points:9,rollLists:[ [entry(3,25,0)], [entry(4,15,0)], [entry(5,17,0)] ]});
    await ctx.cycle({manual:true});assert.equal(mock.attacks.length,0);
    assert.equal(mock.rolls.length,3);assert.equal(mock.remaining,9);
    assert(ctx.prestigeAuto.status.includes('BRAK CELU'));
    console.log('PASS: 0-prestige opponents never consume points; 3 bounded rerolls');
  }
  {
    const {ctx,mock}=setup({points:8,fightWon:false});await ctx.cycle({manual:true});
    assert.equal(mock.attacks.length,1);assert.equal(ctx.prestigeAuto.enabled,false);
    console.log('PASS: loss stops automation immediately');
  }
  {
    const {ctx,mock}=setup({points:12});await ctx.cycle({manual:true});
    assert.equal(mock.attacks.length,12);assert.equal(mock.remaining,0);
    console.log('PASS: full 12-point batch permitted; next 5m cycle can use regenerated points');
  }
  console.log('ALL v1.0.71 TESTS PASSED');
})().catch(e=>{console.error(e);process.exit(1)});