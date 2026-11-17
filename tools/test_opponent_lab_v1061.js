const fs=require('fs'), vm=require('vm'), assert=require('assert');
const moduleSource=fs.readFileSync(__dirname+'/opponent_module_v1061.js','utf8');
const lab=JSON.parse(fs.readFileSync('/mnt/data/pomagier_pvp_lab_2026-11-17T18-51-25.085Z.json','utf8'));
let saved={};
const context={Date,Number,String,Math,JSON,Object,Array,Map,Set,RegExp,console,location:{href:'https://menelgame.online/gang',origin:'https://menelgame.online'},
  pvpLab:{battles:lab.battles,opponentRolls:lab.opponentRolls},pvpLabOwnId:()=>462,
  loadJSON:(k,d)=>saved[k]??d,saveJSON:(k,v)=>{saved[k]=JSON.parse(JSON.stringify(v))},
  pvpLabMedian:(arr,fb=null)=>{if(!arr.length)return fb; const s=arr.slice().sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;},
  pvpLabUrl:url=>{try{return new URL(url,'https://menelgame.online/gang')}catch{return null}},
  esc:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  VERSION:'8.8.68',ANDROID_VERSION:'1.0.61',nowIso:()=>new Date().toISOString(),pomagierSaveJsonNative:async()=>true,pomagierBrowserDownload:()=>null,
};
vm.createContext(context);
vm.runInContext(moduleSource+'\nthis.__OPP={opponentLabAggregate,opponentLabProfilePath,opponentLabObserveProfile,opponentLabAttrs,opponentLabCode,opponentLabHTML,opponentLabKnownId};',context);
const o=context.__OPP;
assert(o.opponentLabCode('50/40/35/20/1:ABBABBABAB/BBABABBBAA/ABABABA/AAAA/')==='50/40/35/20/1:ABBABBABAB/BBABABBBAA/ABABABA/AAAA/');
assert(o.opponentLabCode('51/0/0/0/0')==='');
assert(o.opponentLabAttrs({str:0,end:0,agi:0,vit:0})===null);
assert(o.opponentLabAttrs({str:{level:0},end:{level:30},agi:{level:40},vit:50,prc:0}).end===30);
assert(o.opponentLabProfilePath('https://menelgame.online/api/pvp/462/summary')===null);
assert(o.opponentLabProfilePath('https://other.example/api/pvp/999/summary')===null);
const all=o.opponentLabAggregate();
console.log('opponents',all.length,'total fought',all.reduce((x,a)=>x+a.n,0),'profile captures before',Object.keys(saved['pomagier_pvp_opponents_v1']?.profiles||{}).length);
assert(all.length>5);
assert(!all.some(q=>q.id===462));
assert(all.every(q=>!q.confirmed));
const q=all.find(x=>x.id>0);
assert(q);
let url='https://menelgame.online/api/character/'+q.id+'/profile';
assert(o.opponentLabProfilePath(url).id===q.id);
o.opponentLabObserveProfile(url,{success:true,character:{id:q.id,nickname:'Testowa Postac',pvp:{attributes:{str:50,end:40,agi:10,vit:0,prc:46},build:'50/40/10/0/46:AAAAAAAAAA/BBBBBBBB/A A//'}}},{method:'GET'});
const a=o.opponentLabAggregate().find(x=>x.id===q.id);
assert(a?.confirmed);assert(a?.attributes?.str===50);
assert(!a.code); // invalid spaced A/B string is rejected
assert(o.opponentLabHTML().includes('Analizator przeciwnika'));
assert(o.opponentLabProfilePath('/api/character/462/profile')===null);
assert(saved['pomagier_pvp_opponents_v1'].profiles['id:'+q.id]);
console.log('OK: 8 checks + actual exported data, confirmed profile id',q.id,'unknowns remain unknown');