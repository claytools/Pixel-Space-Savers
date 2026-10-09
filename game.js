(()=>{'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;ctx.imageSmoothingEnabled=false;
const ui={score:$('score'),level:$('level'),lives:$('lives'),power:$('power'),shipTier:$('shipTier'),shipCount:$('shipCount'),start:$('startOverlay'),upgrades:$('upgradeOverlay'),over:$('gameOverOverlay'),levelCard:$('levelOverlay'),startBtn:$('startButton'),continueBtn:$('continueButton'),againBtn:$('playAgainButton'),saveBtn:$('saveScoreButton'),fullscreenBtn:$('fullscreenButton'),initials:$('initials'),final:$('finalScore'),board:$('leaderboard'),upgradeScore:$('upgradeScore'),upgradeChoices:$('upgradeChoices'),moveControls:$('moveControls'),touchLeft:$('touchLeft'),touchRight:$('touchRight'),touchFire:$('touchFire')};
const keys=new Set(),shots=[],enemyShots=[],invaders=[],particles=[],stars=[]; const player={x:W/2,y:H-56,w:44,h:26,speed:340,invuln:0};
let playing=false,paused=false,shopping=false,score=1000,lives=10,level=1,last=0,direction=1,enemySpeed=32,enemyFire=0,fireCooldown=0,bonus=null,bonusTimer=6,flash=0,boss=null,bossDefeated=false;
let upgrades={fireRate:0,bulletSpeed:0,spread:0,power:0};
let shipUpgrades=0,shipMilestoneMessage='';
const SHIP_MAX=1000;
const defs={yellow:{points:100,scale:.68,hp:1,color:'#ffe12c'},orange:{points:150,scale:.92,hp:1,color:'#ff8a22'},purple:{points:250,scale:1.18,hp:2,color:'#9b4de3'},green:{points:450,scale:1.48,hp:3,color:'#36b36c'}};
const upgradeDefs=[{key:'fireRate',name:'Rapid Fire',desc:'Shoot more often.',base:100,step:125,max:10},{key:'bulletSpeed',name:'Hyper Bolts',desc:'Shots travel faster.',base:100,step:150,max:10},{key:'spread',name:'Multi-Shot',desc:'Adds more angled side shots.',base:200,step:250,max:10},{key:'power',name:'Plasma Power',desc:'More damage and piercing.',base:250,step:300,max:10}];
const patterns={yellow:['00111100','01111110','11111111','11011011','11111111','01000010'],orange:['0011111100','0111111110','1111111111','1101101011','1111111111','1010000101','0101001010'],purple:['000111000','001111100','111111111','111101111','111111111','001111100','001111100','010101010'],green:['000100000','001110000','111111111','101111101','111111111','110111011','111111111','011111110','010000010']};
const bossPatterns={1:['000110000000000110000','000110000000000110000','001111111111111111100','011111111111111111110','111111100000011111111','111111102200011111111','111111103300011111111','111111100000011111111','111111111111111111111','011111111111111111110','001110111111111011100','000000011111110000000','000000001111100000000'],2:['000110000000000110000','000110000000000110000','001111111111111111100','011111111111111111110','111111100000011111111','111111104400041111111','111111105500051111111','111111100000011111111','111111111111111111111','011111111111111111110','001111116666666111100','000111166666666111000','000011660606060661000']};
// Ship expansions are separate from weapon/shop levels, so the ship can reach 1,000.
function shipSpec(count=shipUpgrades){
  if(count>=1000)return {width:520,blasters:43,title:'GALAXY FLAGSHIP'};
  if(count>=100){const tiers=Math.floor((count-100)/100);return {width:264+21*tiers,blasters:21+2*tiers,title:'BATTLESHIP'}}
  const tiers=Math.floor(count/10);
  return {width:44+18*tiers,blasters:1+2*tiers,title:tiers?'STAR FIGHTER':'SCOUT'};
}
function nextShipMilestone(){
  if(shipUpgrades>=SHIP_MAX)return SHIP_MAX;
  return shipUpgrades<100?(Math.floor(shipUpgrades/10)+1)*10:(Math.floor(shipUpgrades/100)+1)*100;
}
function shipUpgradeCostAt(count){return 100+12*count+40*Math.floor(count/10)}
function shipBulkCost(quantity){
  if(quantity<1||shipUpgrades+quantity>SHIP_MAX)return Infinity;
  let sum=0;for(let i=0;i<quantity;i++)sum+=shipUpgradeCostAt(shipUpgrades+i);
  return sum;
}
function syncShipSize(){
  player.w=shipSpec().width;
  player.x=Math.max(player.w/2+16,Math.min(W-player.w/2-16,player.x));
}
function purchaseShipExpansions(quantity){
  const price=shipBulkCost(quantity);
  if(!shopping||!Number.isFinite(price)||score<price)return;
  const previous=shipSpec();
  score-=price;shipUpgrades+=quantity;syncShipSize();
  const current=shipSpec();
  if(current.blasters>previous.blasters){
    shipMilestoneMessage=shipUpgrades>=1000?'GALAXY FLAGSHIP UNLOCKED!':shipUpgrades>=100&&previous.title!=='BATTLESHIP'?'BATTLESHIP UNLOCKED!':`${current.blasters} BLASTERS UNLOCKED!`;
  }else{shipMilestoneMessage=''}
  hud();renderUpgrades();
}
const upgradeCost=d=>d.base+d.step*upgrades[d.key];
function hud(){
  ui.score.textContent=Math.floor(score);ui.level.textContent=level;
  ui.lives.textContent=lives;ui.power.textContent=1+upgrades.power;
  ui.shipTier.textContent=shipSpec().title;ui.shipCount.textContent=shipUpgrades.toLocaleString();
}
function makeStars(){let seed=1337,r=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);for(let i=0;i<125;i++)stars.push({x:r()*W,y:r()*H,s:r()<.84?1:2,a:.35+r()*.65})}
function levelMsg(t=`LEVEL ${level}`){ui.levelCard.textContent=t;ui.levelCard.classList.add('shown');setTimeout(()=>ui.levelCard.classList.remove('shown'),1200)}
function monsterForRow(row,rows){const f=rows<=1?0:row/(rows-1);return f<.16?'green':f<.38?'purple':f<.68?'orange':'yellow'}
function spawnBoss(stage){boss={stage,x:W/2,y:stage===1?145:155,w:stage===1?250:275,h:stage===1?165:205,dir:1,speed:stage===1?75:90,hp:stage===1?8000:12000,maxHp:stage===1?8000:12000,points:stage===1?20000:50000,fire:.7,bob:0};invaders.length=shots.length=enemyShots.length=0;bonus=null;shopping=false;ui.upgrades.classList.remove('shown');levelMsg(stage===1?'LEVEL 50 • UNTHINKABLE':'LEVEL 100 • FIRE UNTHINKABLE')}
function wave(){invaders.length=shots.length=enemyShots.length=0;direction=1;enemySpeed=32+(level-1)*8;boss=null;bossDefeated=false;if(level===50)return spawnBoss(1);if(level===100)return spawnBoss(2);const rows=Math.min(5+Math.floor((level-1)/3),7),cols=Math.min(9+Math.floor((level-1)/2),12),gapX=72,gapY=62,startX=W/2-((cols-1)*gapX)/2;for(let r=0;r<rows;r++){const kind=monsterForRow(r,rows),d=defs[kind],u=level>100;for(let c=0;c<cols;c++)invaders.push({x:startX+c*gapX,y:86+r*gapY,w:42*d.scale,h:30*d.scale,row:r,col:c,kind,points:u?Math.round(d.points*1.5):d.points,color:u?'#d92d2d':d.color,alive:true,hp:u?d.hp+2+Math.floor((level-101)/20):d.hp,maxHp:u?d.hp+2+Math.floor((level-101)/20):d.hp,unthinkified:u})}shopping=false;ui.upgrades.classList.remove('shown');levelMsg()}
function reset(){score=1000;lives=10;level=1;paused=false;shopping=false;upgrades={fireRate:0,bulletSpeed:0,spread:0,power:0};shipUpgrades=0;shipMilestoneMessage='';player.x=W/2;syncShipSize();player.invuln=0;particles.length=0;bonus=null;bonusTimer=6;boss=null;wave();hud()}
function start(){reset();playing=true;ui.start.classList.remove('shown');ui.over.classList.remove('shown');last=performance.now()} function gameOver(){playing=false;shopping=false;ui.final.textContent=Math.floor(score);ui.initials.value='';ui.over.classList.add('shown');setTimeout(()=>ui.initials.focus(),50)}
const overlap=(a,b)=>a.x-a.w/2<b.x+b.w/2&&a.x+a.w/2>b.x-b.w/2&&a.y-a.h/2<b.y+b.h/2&&a.y+a.h/2>b.y-b.h/2; function burst(x,y,color,count=12){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=45+Math.random()*170;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.45,color,size:2+Math.random()*3})}}
function fire(){
  if(!playing||paused||shopping||fireCooldown>0)return;
  const spec=shipSpec(),speed=560+upgrades.bulletSpeed*75,damage=1+upgrades.power,pierce=Math.floor(upgrades.power/2);
  const add=(vx=0,off=0)=>shots.push({x:player.x+off,y:player.y-24,w:4,h:14,vx,vy:-speed,damage,pierce});
  const span=spec.width-24;
  for(let n=0;n<spec.blasters;n++){
    const off=spec.blasters===1?0:-span/2+span*n/(spec.blasters-1);
    add(0,off); // Every visible blaster fires a real shot.
  }
  const pairs=Math.min(5,Math.ceil(upgrades.spread/2));
  const outer=spec.width/2-14;
  for(let p=1;p<=pairs;p++){const vx=55+p*48;add(-vx,-outer);add(vx,outer)}
  fireCooldown=Math.max(.04,.22-upgrades.fireRate*.018);
}
function shooter(){const front=new Map();for(const i of invaders)if(i.alive){const c=front.get(i.col);if(!c||i.y>c.y)front.set(i.col,i)}const a=[...front.values()];return a[Math.floor(Math.random()*a.length)]}
function hitPlayer(n=1){if(player.invuln>0)return;lives=Math.max(0,lives-n);player.invuln=n>=5?2.2:1.6;flash=n>=5?.35:.18;burst(player.x,player.y,n>=5?'#ff9d2d':'#fff',n>=5?40:24);hud();if(lives<=0)gameOver()}
function openUpgradeBay(){shopping=true;shipMilestoneMessage='';shots.length=enemyShots.length=0;score+=150*(level+1);level++;hud();renderUpgrades();ui.upgrades.classList.add('shown')}
function makeProgress(cur,max=10,life=false){const w=document.createElement('div');w.className='upgrade-progress';w.setAttribute('aria-label',`${cur} of ${max} unlocked`);for(let i=1;i<=max;i++){const p=document.createElement('span');p.className='upgrade-pip'+(i<=cur?' filled':'')+(life?' life':'');w.appendChild(p)}return w}
function renderShipUpgrades(){
  const spec=shipSpec(),next=nextShipMilestone(),card=document.createElement('div');
  card.className='upgrade-card ship-upgrade-card';
  const heading=document.createElement('h3');heading.textContent=`SHIP EXPANSION  ${shipUpgrades.toLocaleString()} / ${SHIP_MAX.toLocaleString()}`;
  const subtitle=document.createElement('p');
  subtitle.textContent='Every 10 expansions adds wider wings and twin blasters. After 100, grow every 100 more. Reach 1,000 for the Galaxy Flagship!';
  const status=document.createElement('p');status.className='ship-status';
  status.textContent=`${spec.title} • ${spec.blasters} WORKING BLASTERS`;
  const progressText=document.createElement('p');progressText.className='ship-progress-label';
  progressText.textContent=shipUpgrades>=SHIP_MAX?'ALL 1,000 EXPANSIONS COMPLETE':`NEXT SHIP FORM: ${next.toLocaleString()} EXPANSIONS`;
  const track=document.createElement('div');track.className='ship-progress-track';
  track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(SHIP_MAX));track.setAttribute('aria-valuenow',String(shipUpgrades));
  const fill=document.createElement('span');fill.className='ship-progress-fill';
  const previous=shipUpgrades<100?Math.floor(shipUpgrades/10)*10:Math.floor(shipUpgrades/100)*100;
  fill.style.width=`${shipUpgrades>=SHIP_MAX?100:100*(shipUpgrades-previous)/Math.max(1,next-previous)}%`;
  track.appendChild(fill);
  card.append(heading,status,subtitle,progressText,track);
  if(shipMilestoneMessage){const unlocked=document.createElement('p');unlocked.className='ship-unlocked';unlocked.textContent=shipMilestoneMessage;card.appendChild(unlocked)}
  const actions=document.createElement('div');actions.className='ship-upgrade-actions';
  for(const quantity of [1,10,100]){
    const price=shipBulkCost(quantity),button=document.createElement('button');
    button.type='button';
    button.textContent=shipUpgrades+quantity>SHIP_MAX?`+${quantity} • MAX`:`+${quantity} • ${price.toLocaleString()} PTS`;
    button.disabled=!Number.isFinite(price)||score<price;
    button.onclick=()=>purchaseShipExpansions(quantity);
    actions.appendChild(button);
  }
  card.appendChild(actions);ui.upgradeChoices.appendChild(card);
}
function renderUpgrades(){ui.upgradeScore.textContent=Math.floor(score);ui.upgradeChoices.innerHTML='';const lifeCost=500,maxLife=lives>=10,lc=document.createElement('div');lc.className='upgrade-card';const lh=document.createElement('h3');lh.textContent=`Extra Life  ${lives}/10`;const lp=document.createElement('p');lp.textContent='Repair one lost life. Max 10.';const lcost=document.createElement('p');lcost.className='cost';lcost.textContent=maxLife?'LIVES FULL':`COST: ${lifeCost} PTS`;const lb=document.createElement('button');lb.type='button';lb.textContent=maxLife?'MAX LIVES':'BUY +1 LIFE';lb.disabled=maxLife||score<lifeCost;lb.onclick=()=>{if(lives>=10||score<lifeCost)return;score-=lifeCost;lives++;hud();renderUpgrades()};lc.append(lh,makeProgress(lives,10,true),lp,lcost,lb);ui.upgradeChoices.appendChild(lc);renderShipUpgrades();for(const d of upgradeDefs){const lvl=upgrades[d.key],maxed=lvl>=d.max,cost=upgradeCost(d),card=document.createElement('div'),h=document.createElement('h3'),p=document.createElement('p'),c=document.createElement('p'),b=document.createElement('button');card.className='upgrade-card';h.textContent=`${d.name}  LV ${lvl}/${d.max}`;p.textContent=d.desc;c.className='cost';c.textContent=maxed?'MAXED':`COST: ${cost} PTS`;b.type='button';b.textContent=maxed?'MAXED OUT':'BUY UPGRADE';b.disabled=maxed||score<cost;b.onclick=()=>{const live=upgradeCost(d);if(upgrades[d.key]>=d.max||score<live)return;score-=live;upgrades[d.key]++;hud();renderUpgrades()};card.append(h,makeProgress(lvl,d.max),p,c,b);ui.upgradeChoices.appendChild(card)}}
function bossAttack(){if(!boss)return;if(boss.stage===1){enemyShots.push({x:boss.x-55,y:boss.y+20,w:10,h:20,vx:-20,vy:225,damage:1,kind:'bolt'},{x:boss.x+55,y:boss.y+20,w:10,h:20,vx:20,vy:225,damage:1,kind:'bolt'});boss.fire=.85}else{for(const [vx,off] of [[-95,-44],[0,0],[95,44]])enemyShots.push({x:boss.x+off,y:boss.y+45,w:22,h:22,vx,vy:190,damage:5,kind:'fireball'});boss.fire=.95}}
function update(dt){if(!playing||paused||shopping)return;fireCooldown=Math.max(0,fireCooldown-dt);if(keys.has('Space'))fire();player.invuln=Math.max(0,player.invuln-dt);flash=Math.max(0,flash-dt);if(keys.has('ArrowLeft')||keys.has('KeyA'))player.x-=player.speed*dt;if(keys.has('ArrowRight')||keys.has('KeyD'))player.x+=player.speed*dt;player.x=Math.max(player.w/2+16,Math.min(W-player.w/2-16,player.x));for(const s of shots){s.y+=s.vy*dt;s.x+=(s.vx||0)*dt}for(const s of enemyShots){s.y+=s.vy*dt;s.x+=(s.vx||0)*dt}
for(let n=shots.length-1;n>=0;n--){const sh=shots[n];let used=sh.y<-20||sh.x<-30||sh.x>W+30;if(bonus&&!used&&overlap(sh,bonus)){score+=1000;burst(bonus.x,bonus.y,'#ffd966',28);bonus=null;used=sh.pierce-->0?false:true;hud()}if(boss&&!used&&overlap(sh,boss)){boss.hp-=sh.damage;burst(sh.x,sh.y,boss.stage===1?'#ff5252':'#ff8f1f',8);if(boss.hp<=0){score+=boss.points;burst(boss.x,boss.y,'#ff7b2e',80);boss=null;bossDefeated=true;hud()}used=sh.pierce-->0?false:true}if(!used)for(const i of invaders)if(i.alive&&overlap(sh,i)){i.hp-=sh.damage;burst(sh.x,sh.y,i.color,6);if(i.hp<=0){i.alive=false;score+=i.points;burst(i.x,i.y,i.color,i.kind==='green'?24:i.kind==='purple'?18:12);hud()}used=sh.pierce-->0?false:true;break}if(used)shots.splice(n,1)}
const playerCore={x:player.x,y:player.y,w:Math.min(74,player.w*.72),h:player.h};for(let n=enemyShots.length-1;n>=0;n--){const s=enemyShots[n];if(overlap(s,playerCore)){enemyShots.splice(n,1);hitPlayer(s.damage||1)}else if(s.y>H+40||s.x<-60||s.x>W+60)enemyShots.splice(n,1)}
if(boss){boss.bob+=dt;boss.x+=boss.dir*boss.speed*dt;if(boss.x+boss.w/2>W-40||boss.x-boss.w/2<40)boss.dir*=-1;boss.fire-=dt;if(boss.fire<=0)bossAttack()}else{const alive=invaders.filter(i=>i.alive);if(alive.length){let minX=Infinity,maxX=-Infinity;for(const i of alive){i.x+=direction*enemySpeed*dt;minX=Math.min(minX,i.x-i.w/2);maxX=Math.max(maxX,i.x+i.w/2)}if((direction>0&&maxX>W-24)||(direction<0&&minX<24)){direction*=-1;for(const i of alive)i.y+=18}if(alive.some(i=>i.y+i.h/2>=player.y-12)){lives=0;hud();gameOver()}}else if(invaders.length){invaders.length=0;openUpgradeBay()}}
if(bossDefeated){bossDefeated=false;openUpgradeBay()}if(!boss){enemyFire-=dt;if(enemyFire<=0){const s=shooter();if(s)enemyShots.push({x:s.x,y:s.y+s.h/2,w:5,h:14,vx:0,vy:195+level*16,damage:1,kind:'bolt'});enemyFire=Math.max(.25,1.05-level*.07)*(.65+Math.random()*.7)}bonusTimer-=dt;if(!bonus&&bonusTimer<=0){const d=Math.random()<.5?1:-1;bonus={x:d>0?-40:W+40,y:54,w:54,h:22,vx:d*(105+level*5),vy:0};bonusTimer=9+Math.random()*9}if(bonus){bonus.x+=bonus.vx*dt;if(bonus.x<-80||bonus.x>W+80)bonus=null}}for(let n=particles.length-1;n>=0;n--){const p=particles[n];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;p.life-=dt;if(p.life<=0)particles.splice(n,1)}}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))} function drawPattern(p,pal,x0,y0,u){p.forEach((row,r)=>[...row].forEach((v,c)=>{if(v!=='0'){ctx.fillStyle=pal[v]||pal.default;ctx.fillRect(Math.round(x0+c*u),Math.round(y0+r*u),Math.ceil(u),Math.ceil(u))}}))}
function drawPlayer(){
  if(player.invuln>0&&Math.floor(player.invuln*12)%2===0)return;
  const x=Math.round(player.x),y=Math.round(player.y),spec=shipSpec(),w=spec.width;
  // A growing pixel-art silhouette: longer wings, armored tiers, and a cockpit.
  rect(x-w/2,y+5,w,13,shipUpgrades>=100?'#76badd':'#b4e7fb');
  rect(x-w/2+7,y-1,w-14,10,'#d9f7ff');
  rect(x-Math.max(14,w*.20),y-9,Math.max(28,w*.40),16,'#9bc8ee');
  if(shipUpgrades>=10){
    rect(x-w/2+3,y+17,Math.max(12,w*.17),5,'#5475bb');
    rect(x+w/2-Math.max(12,w*.17)-3,y+17,Math.max(12,w*.17),5,'#5475bb');
  }
  if(shipUpgrades>=100){
    rect(x-w*.35,y-5,w*.17,9,'#f8d77d');
    rect(x+w*.18,y-5,w*.17,9,'#f8d77d');
    rect(x-w*.28,y+19,w*.56,6,'#527caa');
  }
  if(shipUpgrades>=1000){
    rect(x-w*.45,y-13,w*.18,10,'#ffca57');
    rect(x+w*.27,y-13,w*.18,10,'#ffca57');
    rect(x-w*.12,y+22,w*.24,6,'#a788ff');
  }
  const span=w-24;
  for(let n=0;n<spec.blasters;n++){
    const off=spec.blasters===1?0:-span/2+span*n/(spec.blasters-1);
    const top=y-19-(n%2)*3;
    rect(x+off-3,top,6,20,'#3e8ea9');
    rect(x+off-2,top-4,4,8,'#ffd966');
  }
  rect(x-12,y-9,24,14,'#d9f7ff');
  rect(x-6,y-15,12,15,'#72f2cf');
  rect(x-2,y-20,4,7,'#fff3aa');
  if(upgrades.power>1)rect(x-9,y-9,18,4,'#ff7edb');
}
function drawInvader(i){const p=patterns[i.kind],cols=p[0].length,rows=p.length,u=Math.max(2,Math.round(i.w/cols)),x0=i.x-cols*u/2,y0=i.y-rows*u/2,pal=i.unthinkified?{'1':'#d92d2d','default':'#d92d2d'}:{'1':i.color,'default':i.color};drawPattern(p,pal,x0,y0,u);if(i.unthinkified){rect(i.x-i.w*.16,i.y-i.h*.1,i.w*.08,i.h*.08,'#fff');rect(i.x+i.w*.08,i.y-i.h*.1,i.w*.08,i.h*.08,'#fff')}if(i.kind==='green'&&!i.unthinkified){rect(i.x-i.w*.16,i.y-i.h*.07,i.w*.09,i.h*.09,'#ffe12c');rect(i.x+i.w*.07,i.y-i.h*.07,i.w*.09,i.h*.09,'#ffe12c')}if(i.hp<i.maxHp)rect(i.x-12,i.y+i.h/2+4,24*(i.hp/i.maxHp),3,'#fff')}
function drawBoss(){if(!boss)return;const p=bossPatterns[boss.stage],cols=p[0].length,rows=p.length,u=Math.floor(Math.min(boss.w/cols,boss.h/rows)),x0=boss.x-cols*u/2,y0=boss.y-rows*u/2+Math.sin(boss.bob*2)*3,pal=boss.stage===1?{'1':'#e33030','2':'#fff','3':'#4a0000','default':'#e33030'}:{'1':'#d62828','4':'#ff8f1f','5':'#ffd34d','6':'#fff4c7','default':'#d62828'};drawPattern(p,pal,x0,y0,u);const bw=360,bx=W/2-bw/2,by=18;rect(bx,by,bw,16,'#321012');rect(bx,by,bw*Math.max(0,boss.hp/boss.maxHp),16,boss.stage===1?'#ff4d4d':'#ff8f1f');ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 14px monospace';ctx.fillText(`UNTHINKABLE • HP ${Math.max(0,boss.hp)}/${boss.maxHp}`,W/2,by+12)}
function drawShot(s){if(s.kind==='fireball'){rect(s.x-10,s.y-10,20,20,'#ff8f1f');rect(s.x-6,s.y-6,12,12,'#ffd34d');rect(s.x-3,s.y-3,6,6,'#fff4b8')}else{rect(s.x-s.w/2,s.y-s.h/2,s.w,s.h,'#ff6f91');rect(s.x-1,s.y-5,2,4,'#fff')}}
function draw(t){ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);for(const s of stars){ctx.globalAlpha=s.a*(.75+.25*Math.sin(t*1.4+s.x));rect(s.x,s.y,s.s,s.s,'#fff')}ctx.globalAlpha=1;ctx.strokeStyle='#1a3a38';ctx.lineWidth=2;ctx.setLineDash([8,8]);ctx.beginPath();ctx.moveTo(0,H-28);ctx.lineTo(W,H-28);ctx.stroke();ctx.setLineDash([]);for(const i of invaders)if(i.alive)drawInvader(i);drawBoss();if(bonus){const x=Math.round(bonus.x),y=Math.round(bonus.y);rect(x-24,y,48,7,'#ffd966');rect(x-17,y-7,34,7,'#ff9d5c');rect(x-8,y-12,16,5,'#fff')}for(const s of shots)rect(s.x-s.w/2,s.y-s.h/2,s.w,s.h,upgrades.power>0?'#7fffd4':'#d9fff7');for(const s of enemyShots)drawShot(s);drawPlayer();for(const p of particles){ctx.globalAlpha=Math.min(1,p.life*2.5);rect(p.x,p.y,p.size,p.size,p.color)}ctx.globalAlpha=1;if(paused&&playing&&!shopping){ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 44px monospace';ctx.fillText('PAUSED',W/2,H/2)}if(flash>0){ctx.fillStyle=`rgba(255,255,255,${flash*1.8})`;ctx.fillRect(0,0,W,H)}}
function loop(now){const dt=Math.min(.034,(now-last)/1000||0);last=now;update(dt);draw(now/1000);requestAnimationFrame(loop)}
function loadScores(){try{return JSON.parse(localStorage.getItem('pixel-space-savers-scores')||localStorage.getItem('pixel-space-savers-legacy-scores')||'[]')}catch{return[]}} function renderScores(){const a=loadScores().sort((x,y)=>y.score-x.score).slice(0,8);ui.board.innerHTML='';if(!a.length){const li=document.createElement('li');li.textContent='NO SCORES YET';ui.board.appendChild(li);return}for(const e of a){const li=document.createElement('li'),sp=document.createElement('span');li.append(document.createTextNode(e.initials));sp.textContent=e.score;li.appendChild(sp);ui.board.appendChild(li)}} function saveScore(){const initials=ui.initials.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3)||'???',a=loadScores();a.push({initials,score:Math.floor(score),at:Date.now()});a.sort((x,y)=>y.score-x.score);localStorage.setItem('pixel-space-savers-scores',JSON.stringify(a.slice(0,20)));renderScores();ui.saveBtn.textContent='SAVED!';setTimeout(()=>ui.saveBtn.textContent='SAVE SCORE',900)}
async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{document.body.classList.toggle('fullscreen-mode')}} function syncFullscreen(){const f=!!document.fullscreenElement;document.body.classList.toggle('fullscreen-mode',f);ui.fullscreenBtn.textContent=f?'EXIT FULL SCREEN':'FULL SCREEN'}
addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='Space')fire();if(e.code==='KeyP'&&playing&&!shopping)paused=!paused;if(e.code==='KeyR')start();if(e.code==='KeyF')toggleFullscreen()},{passive:false});addEventListener('keyup',e=>keys.delete(e.code));document.addEventListener('fullscreenchange',syncFullscreen);
const touchFire=new Set(),steer=new Map();function setDir(d){keys.delete('ArrowLeft');keys.delete('ArrowRight');ui.touchLeft.classList.remove('active');ui.touchRight.classList.remove('active');if(d==='left'){keys.add('ArrowLeft');ui.touchLeft.classList.add('active')}else if(d==='right'){keys.add('ArrowRight');ui.touchRight.classList.add('active')}}function dirFrom(e){const r=ui.moveControls.getBoundingClientRect();return e.clientX<r.left+r.width/2?'left':'right'}if(ui.moveControls){ui.moveControls.addEventListener('pointerdown',e=>{e.preventDefault();steer.set(e.pointerId,dirFrom(e));try{ui.moveControls.setPointerCapture(e.pointerId)}catch{}setDir(dirFrom(e))},{passive:false});ui.moveControls.addEventListener('pointermove',e=>{if(!steer.has(e.pointerId))return;e.preventDefault();const d=dirFrom(e);steer.set(e.pointerId,d);setDir(d)},{passive:false});const rel=e=>{steer.delete(e.pointerId);setDir(steer.size?[...steer.values()].at(-1):null)};ui.moveControls.addEventListener('pointerup',rel);ui.moveControls.addEventListener('pointercancel',rel);ui.moveControls.addEventListener('lostpointercapture',rel)}if(ui.touchFire){const rel=e=>{touchFire.delete(e.pointerId);if(!touchFire.size)ui.touchFire.classList.remove('active')};ui.touchFire.addEventListener('pointerdown',e=>{e.preventDefault();touchFire.add(e.pointerId);try{ui.touchFire.setPointerCapture(e.pointerId)}catch{}ui.touchFire.classList.add('active');fire()},{passive:false});ui.touchFire.addEventListener('pointerup',rel);ui.touchFire.addEventListener('pointercancel',rel);ui.touchFire.addEventListener('lostpointercapture',rel)}setInterval(()=>{if(touchFire.size)fire()},25);
ui.startBtn.onclick=start;ui.againBtn.onclick=start;ui.saveBtn.onclick=saveScore;ui.continueBtn.onclick=()=>{if(shopping)wave()};ui.fullscreenBtn.onclick=toggleFullscreen;ui.initials.oninput=()=>ui.initials.value=ui.initials.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);makeStars();renderScores();hud();requestAnimationFrame(loop);
})();
