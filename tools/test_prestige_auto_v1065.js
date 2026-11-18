const fs=require('fs'),vm=require('vm'),assert=require('assert');
const script=fs.readFileSync(__dirname+'/prestige_autoplay_v1065.js','utf8');
const now=Date.now(),calls=[],saved={};
const currentBuild='50/50/35/4/7:BB';
const ctx={console,Date,Math,Set,Map,JSON,String,Number,Array,Object,Promise,
  settings:{characterId:462},location:{origin:'https://menelgame.online',href:'https://menelgame.online'},
  pvpLab:{current:{build:currentBuild},battles:[]},leagueLab:{individualFights:[]},
  state:{localAI:{busy:false},auto:{inCycle:false},manual:{semi:{inCycle:false}}},
  raidAuto:{runtimeBusy:false},alcoholAuto:{runtimeBusy:false},companyAuto:{runtimeBusy:false},
  __mgSessionTemplate:{headers:{}},loadJSON:(k,d)=>saved[k]||d,
  saveJSON:(k,d)=>{saved[k]=JSON.parse(JSON.stringify(d))},
  pvpLabOwnId:()=>462,pvpLabCurrentBuild:()=>currentBuild,
  pvpLabParseRequestBody:v=>typeof v==='string'?JSON.parse(v):v,
  pvpLabMetaRecord:()=>{},pvpLabIngestDuelStatus:()=>{},
  leagueLabSave:()=>{},leagueLabAccountGuard:()=>{},
  pvpLabUrl:s=>new URL(String(s),'https://menelgame.online'),
  leagueLabNumber:v=>v==null?null:Number(v),
  render:()=>{},confirm:()=>true,nowIso:()=>new Date().toISOString(),
  esc:x=>String(x).replace(/[<>]/g,''),pomagierSaveJsonNative:async()=>true,
  pomagierBrowserDownload:()=>{},
  apiActive:async(path,opts={})=>{calls.push({path,opts});
    if(path.endsWith('/status'))return {success:true,canAttack:true};
    if(path.endsWith('/roll-opponents'))return {success:true,opponents:[
      {id:21,nickname:'Wilson28',level:75,expectedGain:10,expectedLoss:-10},
      {id:22,nickname:'Pewny',level:72,expectedGain:20,expectedLoss:-10}]};
    if(path.endsWith('/fight'))return {success:true,battleId:'auto'+calls.length,won:ctx.__winNext,
      opponent:{id:opts.body.targetId,nickname:'Pewny'},prestigeChange:20};
    throw Error('unexpected API '+path);
  },
  pvpLabObserveApi:(path,data,meta)=>vm.runInContext("prestigeAutoObserve('duel_fight',__lastData,__lastMeta)",Object.assign(ctx,{__lastData:data,__lastMeta:meta})),
  __winNext:true,
};
vm.createContext(ctx);vm.runInContext(script,ctx);
const evalJs=(s)=>vm.runInContext(s,ctx);
assert.equal(evalJs('prestigeAuto.enabled'),false);
// 8 prestige fights with Wilson28: 3 wins + 5 losses, cannot attack him.
ctx.pvpLab.battles.push(...Array.from({length:8},(_,i)=>({source:'prestige',direction:'attack',won:i<3,
  createdAt:now-1e5-i*1000,opponent:{id:21},buildCode:currentBuild})));
ctx.pvpLab.battles.push(...Array.from({length:4},(_,i)=>({source:'prestige',direction:'attack',won:true,
  createdAt:now-3e5-i*1000,opponent:{id:22},buildCode:currentBuild})));
assert.equal(evalJs('prestigeAutoHistory(21).eligible'),false);
assert.equal(evalJs('prestigeAutoHistory(22).eligible'),true);
// Manual fight teaches actual request body and must not leak an API token.
evalJs(`prestigeAutoObserve('duel_roll',{success:true,opponents:[{id:21,nickname:'Wilson28'},{id:22,nickname:'Pewny'}]}, {method:'GET'})`);
evalJs(`prestigeAutoObserve('duel_fight',{success:true,won:true,battleId:'manual1',opponent:{id:22}},
  {method:'POST',requestBody:{targetId:22}})`);
assert.equal(evalJs('prestigeAuto.calibration.field'),'targetId');
assert.equal(evalJs('prestigeAuto.rollMethod'),'GET');
evalJs('prestigeAuto.lastAttackAt=Date.now()-31*60*1000');
evalJs('prestigeAutoStart()');
assert.equal(evalJs('prestigeAuto.enabled'),true);
(async()=>{
  await evalJs('prestigeAutoCycle({manual:true})');
  const writes=calls.filter(x=>x.opts.method==='POST');
  assert.equal(writes.length,1);
  assert.equal(writes[0].opts.body.targetId,22);
  assert.equal(evalJs('prestigeAuto.actions.filter(x=>x.origin==="auto").length'),1);
  assert.equal(evalJs('prestigeAuto.enabled'),true);
  // Every recent loss on selected rival must invalidate subsequent automatic attacks.
  ctx.pvpLab.battles.push({source:'prestige',direction:'attack',won:false,
    createdAt:Date.now(),opponent:{id:22},buildCode:currentBuild});
  assert.equal(evalJs('prestigeAutoHistory(22).eligible'),false);
  // When no safe target, no POST goes through.
  evalJs('prestigeAuto.lastAttackAt=Date.now()-31*60*1000');
  await evalJs('prestigeAutoCycle({manual:true})');
  assert.equal(calls.filter(x=>x.opts.method==='POST').length,1);
  // League explicit marker recorded, normal fight not classified as league.
  assert.equal(evalJs(`leagueLabCaptureIndividual('/api/combat/462/attack/123',
    {battleId:'l1',mode:'showDomination',won:false,leagueXpChange:-10,opponent:{id:123,nickname:'Liga'}},{method:'POST'})`),true);
  assert.equal(evalJs('leagueLab.individualFights.length'),1);
  assert.equal(evalJs(`leagueLabCaptureIndividual('/api/combat/462/attack/111',
    {battleId:'p1',won:true,opponent:{id:111,nickname:'Normalny'}},{method:'POST'})`),false);
  assert.equal(evalJs('leagueLab.individualFights.length'),1);
  assert.equal(evalJs(`leagueLabCaptureIndividual('/api/duels/462/fight',
    {battleId:'p2',won:true,leagueXpChange:99},{method:'POST'})`),false);
  console.log('PASS: 4/4 same build, 3/8 excluded, manual calibration, strictly one POST, stop after loss, League vs prestige separation');
})().catch(e=>{console.error(e);process.exit(1)});