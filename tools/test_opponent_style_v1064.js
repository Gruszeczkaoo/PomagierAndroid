/* Test analizy stylu PvP na autentycznym eksporcie, bez dostępu do sieci. */
const fs=require('fs'), vm=require('vm'),assert=require('assert');
const moduleSrc=fs.readFileSync(__dirname+'/opponent_style_v1064.js','utf8');
const p=process.argv[2]||__dirname+'/pomagier_pvp_lab_2026-11-17T18-51-25.085Z.json';
if(!fs.existsSync(p)){
  // GitHub Actions buduje bez prywatnej historii użytkownika: test syntetyczny działa niezależnie.
  run(false);
}else run(true);
function run(hasReal){
 const battles=hasReal?JSON.parse(fs.readFileSync(p,'utf8')).battles:[];
 const ctx={pvpLab:{battles},pvpLabOwnId:()=>462,
  pvpLabMedian:(arr,fb=null)=>{const a=arr.filter(x=>x!=null&&Number.isFinite(Number(x))).map(Number).sort((x,y)=>x-y);return a.length?(a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2):fb;},
  opponentLabKey:(id,name)=>Number(id)>0&&Number(id)!==462?'id:'+Number(id):String(name||'').trim()?'name:'+String(name).trim().toLowerCase():'',
  esc:t=>String(t).replace(/[<>&'"`]/g,''),
  console
 };
 vm.createContext(ctx);vm.runInContext(moduleSrc,ctx);
 const get=(id,nick)=>ctx.opponentLabStyle({key:'id:'+id,id,nickname:nick,n:3,medianHp:null,medianRegen:null});
 const empty=get(12345,'Nieznany');assert.equal(empty.type,'Nierozpoznany styl');assert.equal(empty.confidence,'NISKA');
 assert.equal(empty.samples.detailed,0);assert(!('attributes' in empty));
 const synthetic=(id,nick,regen,hp,damage=330,crit=2)=>({detailLoaded:true,opponent:{id,nickname:nick,maxHp:hp},
  opponentObserved:{maxHp:hp,hpRegen:regen},direction:'attack',won:false,
  eventSummary:{attacks:20,hits:16,enemyAttacks:18,enemyHits:15,enemyCrits:crit,enemyDoubles:5,
   enemyCounters:2,damageTaken:damage*15,enemyBleedApplied:1,stunsTaken:0,enemyLifesteal:500}});
 for(let i=0;i<4;i++)battles.push(synthetic(777,'TankTest',70,4120));
 const tank=get(777,'TankTest');assert.equal(tank.type,'Przetrwanie / regeneracja');
 assert(tank.traits.includes('Bardzo duże HP i regeneracja'));assert.equal(tank.confidence,'WSTĘPNA');
 assert.equal(tank.observed.hp,4120);assert.equal(tank.observed.regen,70);
 assert.equal(tank.directions.attack.n,4);
 if(hasReal){
   const gul=ctx.opponentLabStyle({key:'id:3855',id:3855,nickname:'Gul Dog',n:3,medianHp:4114,medianRegen:70});
   assert.equal(gul.type,'Przetrwanie / regeneracja');assert(gul.samples.detailed>=1);
   const wil=ctx.opponentLabStyle({key:'id:2989',id:2989,nickname:'Wilson28',n:8,medianHp:2209,medianRegen:2});
   assert.notEqual(wil.type,'Przetrwanie / regeneracja');
   assert(wil.samples.enemyHits>30);assert(wil.observed.myMissRate>=0 && wil.observed.myMissRate<=100);
   console.log('Real test: Wilson28 '+wil.type+', Gul Dog '+gul.type);
 }
 console.log('OK: opponent style model, sample-size confidence, rates, separation of build and behavior');
}