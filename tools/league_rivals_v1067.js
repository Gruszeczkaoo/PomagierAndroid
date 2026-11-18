  // LIGA MENELI V2: schema recovered from the user's actual /api/rivals/:id/overview.
  // GET only. Never treat an open gang match as a completed win.
  function leagueLabV2NormalizeMatches(payload,source){
    const out=[],seen=new Set();let count=0;
    function visit(node,depth=0){
      if(!node||typeof node!=='object'||depth>6||count++>1800)return;
      if(Array.isArray(node)){for(const x of node.slice(0,150))visit(x,depth+1);return;}
      const home=String(node.gang_a_name||node.gangAName||'').trim().slice(0,100);
      const away=String(node.gang_b_name||node.gangBName||'').trim().slice(0,100);
      if(home&&away&&home!==away&&Number.isSafeInteger(Number(node.id))&&Number(node.id)>0){
        const id=Number(node.id),key='rivals:'+id;
        if(!seen.has(key)){
          seen.add(key);
          const h=leagueLabNumber(node.xp_balance_a??node.xpBalanceA);
          const b=leagueLabNumber(node.xp_balance_b??node.xpBalanceB);
          const winnerId=leagueLabNumber(node.winner_gang_id??node.winnerGangId);
          const w=winnerId!=null&&winnerId===Number(node.gang_a)?home:
            winnerId!=null&&winnerId===Number(node.gang_b)?away:'';
          out.push({key,matchId:id,season:String(node.week_id??payload?.week?.id??''),
            week:String(node.day_no??payload?.week?.week_no??''),
            date:String(node.day_key??node.date??'').slice(0,40),home,away,
            homeXp:h,awayXp:b!=null?b:h!=null?-h:null,
            winner:w,status:String(node.state??node.status??'').slice(0,45),
            source:String(source||'').slice(0,220),lastSeenAt:Date.now()});
        }
      }
      for(const k of ['todayMatches','matches','divisions','days','schedule','archive','results','data','match','games','fixtures']){
        const child=node[k];if(child&&typeof child==='object')visit(child,depth+1);
      }
    }
    visit(payload);
    return out.slice(0,500);
  }

  function leagueLabV2IngestIndividual(payload,path=''){
    const own=Number(pvpLabOwnId()||0);
    if(!own||!/^\/api\/rivals\/\d+\/(?:overview|history|status|matches\/\d+\/attacks)(?:\?|$)/.test(path))return 0;
    const lists=[];
    if(Array.isArray(payload?.history))lists.push(payload.history);
    if(Array.isArray(payload?.data?.history))lists.push(payload.data.history);
    if(/\/history(?:\?|$)/.test(path)){
      for(const field of ['rows','items','attacks','results','data']){
        if(Array.isArray(payload?.[field]))lists.push(payload[field]);
      }
    }
    if(/\/matches\/\d+\/attacks/.test(path)&&Array.isArray(payload?.attacks))lists.push(payload.attacks);
    if(/\/status(?:\?|$)/.test(path)){
      if(payload.outgoing&&typeof payload.outgoing==='object')lists.push([payload.outgoing]);
      if(Array.isArray(payload.incoming))lists.push(payload.incoming);
    }
    if(!lists.length)return 0;
    leagueLab.individualFights=Array.isArray(leagueLab.individualFights)?leagueLab.individualFights:[];
    let updated=0;
    for(const list of lists){
      for(const raw of list.slice(0,250)){
        if(!raw||typeof raw!=='object')continue;
        const id=Number(raw.id),attacker=Number(raw.attacker_id),defender=Number(raw.defender_id);
        // The match's attacks list can contain other gang members. Never record
        // an unrelated player's fight as DonCziczo's win or loss.
        if(!Number.isSafeInteger(id)||id<=0||![attacker,defender].includes(own)||attacker===defender)continue;
        const state=String(raw.state||'').toLowerCase();
        if(!['resolved','pending','cancelled'].includes(state))continue;
        const winner=raw.winner_id==null?null:Number(raw.winner_id);
        const ended=state==='resolved'&&[attacker,defender].includes(winner);
        const won=ended?(winner===own):null;
        const other=attacker===own?defender:attacker;
        const oppName=String(attacker===own?raw.defender_name??'':raw.attacker_name??'').slice(0,100);
        const gain=leagueLabNumber(raw.xp_amount),loss=leagueLabNumber(raw.xp_loss_amount);
        const xp=won===true?gain:won===false?(loss==null?null:-Math.abs(loss)):null;
        const at=Number(raw.started_at||0),resolvedAt=Number(raw.resolved_at||0);
        const record={battleId:'rival:'+id,rivalId:id,
          at:Number.isFinite(at)&&at>0?at:Date.now(),
          resolvedAt:Number.isFinite(resolvedAt)&&resolvedAt>0?resolvedAt:null,
          opponentId:other,opponent:oppName,direction:attacker===own?'attack':'defense',
          won,state,leagueXpChange:xp,xpAmount:gain,xpLossAmount:loss,
          source:'rivals-history'};
        const idx=leagueLab.individualFights.findIndex(x=>x.battleId===record.battleId);
        if(idx>=0){
          const old=leagueLab.individualFights[idx];
          // Late status responses must never downgrade a resolved result.
          if(old.state==='resolved'&&record.state!=='resolved')continue;
          leagueLab.individualFights[idx]={...old,...record};
        }else leagueLab.individualFights.push(record);
        updated++;
      }
    }
    if(updated){
      leagueLab.individualFights.sort((a,b)=>Number(a.at||0)-Number(b.at||0));
      leagueLab.individualFights=leagueLab.individualFights.slice(-1200);
    }
    return updated;
  }

  function leagueLabV2OpponentSummary(){
    const byId=new Map();
    for(const x of (leagueLab.individualFights||[])){
      if(typeof x.won!=='boolean'||!Number(x.opponentId))continue;
      const key=Number(x.opponentId);
      const old=byId.get(key)||{name:x.opponent||'ID '+key,wins:0,losses:0};
      old.name=x.opponent||old.name;
      if(x.won)old.wins++;else old.losses++;
      byId.set(key,old);
    }
    return [...byId.values()].sort((a,b)=>b.wins+b.losses-(a.wins+a.losses)).slice(0,35)
      .map(x=>`<tr><td class="left">${esc(x.name)}</td><td>${x.wins}</td><td>${x.losses}</td></tr>`).join('');
  }