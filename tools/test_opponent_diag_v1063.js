const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/opponent_diag_v1063.js','utf8');
let saves=0,upserts=[];
const fake={
  location:{origin:'https://game.example'},
  pvpLabOwnId:()=>462,
  opponentLab:{selectedKey:'id:2989',profiles:{}},
  opponentLabAggregate:()=>[{key:'id:2989',id:2989}],
  opponentLabSave:()=>{saves++;},
  opponentLabKnownId:id=>Number(id)===2989,
  opponentLabAttrs:n=>n?.attributes&&Number.isInteger(n.attributes.str)&&n.attributes.end!=null&&n.attributes.agi!=null&&n.attributes.vit!=null&&n.attributes.prc!=null?n.attributes:null,
  opponentLabCode:()=>'',
  opponentLabUpsertProfile:(id,raw,route)=>upserts.push({id,raw,route}),
  pvpLabUrl:url=>new URL(url,'https://game.example'),
  render:()=>{},console
};
vm.createContext(fake);
vm.runInContext(source,fake);
assert.equal(fake.opponentLabDiagActive(),false);
fake.opponentLabDiagCapture('https://game.example/api/characters/2989/profile','GET',200,{build:'SECRET'},'native-fetch');
assert.equal(Object.keys(fake.opponentLab.diag.paths).length,0);
fake.opponentLabDiagStart();
const secret={success:true,profile:{id:2989,attributes:{str:30,end:30,agi:40,vit:40,prc:5},token:'NEVER_EXPORT'},message:'NOT_EXPORTED'};
fake.opponentLabDiagCapture('https://game.example/api/characters/2989/profile?token=AAA','GET',200,secret,'native-fetch');
assert.equal(upserts.length,1);
assert.equal(upserts[0].id,2989);
assert.equal(Object.keys(fake.opponentLab.diag.paths).length,1);
const diag=JSON.stringify(fake.opponentLab.diag);
assert(!diag.includes('AAA')&&!diag.includes('NOT_EXPORTED')&&!diag.includes('NEVER_EXPORT'));
assert(diag.includes('/api/characters/:id/profile'));
assert(diag.includes('selectedIdInPath'));
fake.opponentLabDiagCapture('/api/auth/session','GET',200,{password:'secret'},'native-xhr');
assert.equal(Object.keys(fake.opponentLab.diag.paths).length,1);
fake.opponentLabDiagCapture('/api/characters/462/summary','GET',200,{id:462,attributes:{str:50,end:50,agi:35,vit:4,prc:6}},'native-xhr');
assert.equal(upserts.length,1,'own profile must not be mistaken for opponent');
fake.opponentLabDiagStop();
assert.equal(fake.opponentLabDiagActive(),false);
console.log('Opponent diagnostics 1.0.63: PASS');