import './style.css';
import {hapticTick,hapticRelease,hapticReverse} from './effects.js';

const C=[
['01','触发输入','Trigger / Input','chufashuru','cfsr'],
['02','提示上下文','Prompt / Context','tishishangxiawen','tssxw'],
['03','模型推理','Model / Reasoning','moxingtuili','mxtl'],
['04','工具动作','Tool / Action','gongjudongzuo','gjdz'],
['05','记忆数据','Memory / Data','jiyishuju','jysj'],
['06','输出响应','Output / Response','shuchuxiangying','scxy'],
['07','逻辑控制','Logic / Control','luojikongzhi','ljkz'],
['08','安全观测','Safety / Observability','anquanguance','aqgc'],
['09','编排','Orchestration','bianpai','bp']
].map(([tag,title,subtitle,pinyinFull,pinyinAbbr])=>({tag,title,subtitle,pinyinFull,pinyinAbbr}));
const P=[{peak:-282,curve:45,tilt:95},{peak:21.5,curve:16,tilt:65},{peak:735,curve:14,tilt:-65}];
const W=150,H=132,GAP=-24,PAD=58,STEP=72,FOCUS=.42,MAXV=55;
const stage=document.querySelector('#stage'),L=document.querySelector('#railLeft'),R=document.querySelector('#railRight');
const searchToggle=document.querySelector('#searchToggle'),searchInput=document.querySelector('#searchInput');
const orders=[C.map((_,i)=>i).filter(i=>i%2===0),C.map((_,i)=>i).filter(i=>i%2===1)];
const flips=new Map(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mod=(v,m)=>((v%m)+m)%m;
let preset=0,peak=-282,curve=45,tilt=95,anim=null,animAt=0;
let lo=0,ro=0,lv=0,rv=0,lt=0,rt=0,ld=false,rd=false,lp=NaN,rp=NaN;
let leftDeltaLow=0,rightDeltaLow=0,prevLo=0,prevRo=0,leftSpringV=0;
let layout=null,gesture=null,cardHold=null,lastFrame=0,raf=0,lastLS=0,lastRS=0;
let searchMotion=null,searchHighlight=-1,searchHighlightUntil=0,searchTimer=0,sensorTilt=0;

function measure(){
 const h=stage.clientHeight,w=stage.clientWidth,b=orders[0].length,s=orders[1].length;
 layout={h,w,focusY:h*FOCUS,maxDist:Math.max(h/2,1),bigRows:b,smallRows:s,smallHeight:s*STEP,
 bigMin:-h*FOCUS+H/2,bigMax:(b-1)*STEP-h*FOCUS+H/2,copies:Math.ceil(h/Math.max(b*STEP,s*STEP))+1};
 if(!measure.ready){lo=ro=-h*FOCUS+H/2;lt=lo;rt=ro;measure.ready=true;}
}
measure.ready=false;
function html(i,side,copy){
 const c=C[i],gold=side==='left';
 const porcelain='<div class="face porcelain"><div class="glaze"></div><div class="copy"><span class="gold-label">AI · '+c.tag+'</span><h2>'+c.title+'</h2><p>'+c.subtitle+'</p></div></div>';
 const front='<div class="face front"><div class="cast"></div><span class="eyebrow">AI · '+c.tag+'</span><div class="copy"><h2>'+c.title+'</h2><p>'+c.subtitle+'</p></div></div>';
 const back='<div class="face back"><div class="cast"></div></div>';
 return '<article class="card '+(gold?'gold':'normal')+'" data-i="'+i+'" data-copy="'+copy+'"><div class="inner">'+(gold?porcelain:front+back)+'</div></article>';
}
function bind(el){
 const i=+el.dataset.i;
 el.addEventListener('pointerdown',e=>cardDown(e,el));
 el.addEventListener('click',()=>{
  if(el.dataset.dragged==='1'){el.dataset.dragged='0';return;}
  // Native CardFace disables flip on the porcelain/gold track.
  if(el.classList.contains('gold'))return;
  const state=flips.get(i)||{angle:0,velocity:0,elev:0,elevVelocity:0,target:0};
  state.target=state.target===180?0:180;
  flips.set(i,state);
  hapticTick(.65);
 });
}
function build(){
 L.innerHTML=orders[0].map(i=>html(i,'left',0)).join('');
 L.querySelectorAll('.card').forEach(bind);
 R.innerHTML='';
 for(let k=-layout.copies;k<=layout.copies;k++)for(const i of orders[1]){
  const d=document.createElement('div');d.innerHTML=html(i,'right',k);
  const el=d.firstElementChild;R.append(el);bind(el);
 }
}
function geometry(row,side,offset,copy){
 const p=layout;
 const baseY=side==='left'?row*STEP-offset:row*STEP-mod(offset,p.smallHeight)+copy*p.smallHeight;
 const center=baseY+H/2,sBase=center-p.focusY,norm=clamp(Math.abs(sBase)/p.maxDist,0,1);
 const pointer=side==='left'?lp:rp,velocity=side==='left'?lv:rv,raw=velocity/MAXV;
 const speed=Math.abs(raw)<.1?0:clamp(raw,-1.2,1.2);
 const stretchD=clamp((center-(Number.isFinite(pointer)?pointer:center))/p.maxDist,-1,1);
 const stretch=speed*70*stretchD*Math.abs(stretchD),s=sBase+stretch,amount=curve/100;
 const radius=amount<.01?Infinity:Math.max(140/amount,Math.abs(peak));
 const thetaRaw=Number.isFinite(radius)?s/radius:0,theta=clamp(thetaRaw,-Math.PI,Math.PI);
 const dx=Number.isFinite(radius)?-radius*(1-Math.cos(theta)):0;
 const cy=Number.isFinite(radius)?p.focusY+radius*Math.sin(theta):center+stretch;
 const smooth=Math.cos(norm*Math.PI/2),boost=.12*Math.pow(smooth,4);
 const x=PAD+(side==='left'?0:W+GAP)+dx,y=cy-H/2;
 const out=Math.max(0,Math.abs(thetaRaw)-Math.PI);
 return{x,y,alpha:out<.001?1:clamp(1-out*2,0,1),
 scale:(.75+.32*smooth+boost)*(side==='left'?1.06:.96),
 z:side==='left'?10000+(p.bigRows-row)*100+smooth*20:-copy*1000+(p.smallRows-row)*100+smooth*20};
}
function setPreset(n){
 n=clamp(n,0,2);if(n===preset)return;
 anim={peak,curve,tilt};preset=n;animAt=performance.now();hapticReverse();
}
function render(now){
 if(!layout)measure();
 if(anim){
  const t=clamp((now-animAt)/760,0,1),e=1-Math.exp(-7*t)*Math.cos(10*t),p=P[preset];
  peak=anim.peak+(p.peak-anim.peak)*e;curve=anim.curve+(p.curve-anim.curve)*e;tilt=anim.tilt+(p.tilt-anim.tilt)*e;
  if(t>=1)anim=null;
 }
 const over=lo<layout.bigMin?layout.bigMin-lo:lo>layout.bigMax?lo-layout.bigMax:0;
 const compress=over?Math.min(Math.sqrt(over*6),120):0;
 const shown=lo<layout.bigMin?layout.bigMin-compress:lo>layout.bigMax?layout.bigMax+compress:lo;
 const tn=clamp(tilt/100,-5,5),rot=tn*48,origin=clamp(.5-tn*.35,0,1);
 L.style.transform=R.style.transform='perspective(8px) rotateY('+clamp(rot+sensorTilt*6,-48,48)+'deg)';
 L.style.transformOrigin=R.style.transformOrigin=(origin*100)+'% 50%';
 for(const el of L.querySelectorAll('.card')){
  const i=+el.dataset.i,row=orders[0].indexOf(i);if(row<0)continue;
  apply(el,geometry(row,'left',shown,0));
 }
 for(const el of R.querySelectorAll('.card')){
  const i=+el.dataset.i,row=orders[1].indexOf(i);if(row<0)continue;
  apply(el,geometry(row,'right',ro,+el.dataset.copy));
 }
}
function apply(el,g){
 const highlighted=+el.dataset.i===searchHighlight&&performance.now()<searchHighlightUntil;
 el.classList.toggle('is-highlighted',highlighted);
 const press=el.classList.contains('is-pressed') ? 0.97 : 1;
 const state=el.classList.contains('normal')?(flips.get(+el.dataset.i)||null):null;
 const angle=state?state.angle:0,elev=state?state.elev:0;
 const arch=Math.sin(clamp(angle/180,0,1)*Math.PI)*12;
 const lift=elev*26+arch,flipScale=1+elev*.12;
 el.style.transform='translate3d('+g.x+'px,'+(g.y-lift-(highlighted?8:0))+'px,0) scale('+(g.scale*flipScale*press)+')'+(el.classList.contains('normal')?' rotateY(-8deg) rotateX('+angle+'deg)':'');
 el.style.opacity=String(g.alpha);el.style.zIndex=String(Math.round(g.z+elev*100));
}
function down(e){
 // Match Android's root-level Initial-pass gesture detector: swipes may begin on a card.
 const hitCard=e.target.closest?.('.card');
 let side;
 if(hitCard){
  side=hitCard.classList.contains('gold')?'left':'right';
 }else{
  const x1=PAD+peak+W/2,x2=x1+W+GAP,dl=Math.abs(e.clientX-x1),dr=Math.abs(e.clientX-x2);
  if(Math.min(dl,dr)>W*.75)return;
  side=dl<=dr?'left':'right';
 }
 if(side==='left'){ld=true;lv=0;lt=lo;}else{rd=true;rv=0;rt=ro;}
 gesture={id:e.pointerId,side,x:e.clientX,y:e.clientY,lastY:e.clientY,lastTime:performance.now(),switched:false};
 // Keep card pointer capture on the card so its click/flip handling remains intact.
 if(!hitCard)stage.setPointerCapture?.(e.pointerId);
}
function move(e){
 if(!gesture||gesture.id!==e.pointerId)return;
 const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y,now=performance.now();
 if(!gesture.switched&&Math.abs(dx)>W*1.5&&Math.abs(dx)>Math.abs(dy)*1.5){
  gesture.switched=true;setPreset(preset+(dx>0?1:-1));e.preventDefault();return;
 }
 if(Math.abs(dy)<=Math.abs(dx)*1.5)return;
 const delta=e.clientY-gesture.lastY,dt=Math.max(8,now-gesture.lastTime);
 if(gesture.side==='left'){lt-=delta;lp=e.clientY;}
 else{rt-=delta;rp=e.clientY;}
 gesture.lastY=e.clientY;gesture.lastTime=now;e.preventDefault();
}
function up(e){
 if(!gesture||gesture.id!==e.pointerId)return;
 if(gesture.side==='left')ld=false;else rd=false;
 hapticRelease(clamp(Math.abs(gesture.side==='left'?lv:rv)/MAXV,0,1));gesture=null;
}
stage.addEventListener('pointerdown',down);
stage.addEventListener('pointermove',e=>{move(e);cardMove(e);});
stage.addEventListener('pointerup',e=>{up(e);cardUp(e);});
stage.addEventListener('pointercancel',e=>{up(e);cardUp(e);});
stage.addEventListener('wheel',e=>{
 e.preventDefault();
 if(e.clientX<layout.w/2){lo+=e.deltaY;lt=lo;}else{ro+=e.deltaY;rt=ro;}
},{passive:false});

function cardDown(e,el){
 if(e.button!==undefined&&e.button!==0)return;
 const rect=el.getBoundingClientRect(),g={id:e.pointerId,el,index:+el.dataset.i,side:el.classList.contains('gold')?'left':'right',x:e.clientX,y:e.clientY,rect,moved:false,active:false,timer:0};
 el.classList.add('is-pressed');
 cardHold=g;
 g.timer=setTimeout(()=>{
  if(cardHold!==g||g.moved)return;
  g.active=true;el.classList.add('is-dragging');el.style.position='fixed';
  el.style.left=rect.left+'px';el.style.top=rect.top+'px';el.style.transform='translate3d(0,0,0)';hapticTick(1);
 },400);
 el.setPointerCapture?.(e.pointerId);
}
function cardMove(e){
 const g=cardHold;if(!g||g.id!==e.pointerId)return;
 const dx=e.clientX-g.x,dy=e.clientY-g.y;
 if(Math.hypot(dx,dy)>8&&!g.active){g.moved=true;clearTimeout(g.timer);}
 if(g.active){g.el.style.transform='translate3d('+dx+'px,'+dy+'px,0)';e.preventDefault();}
}
function cardUp(e){
 const g=cardHold;if(!g||g.id!==e.pointerId)return;
 clearTimeout(g.timer);
 g.el.classList.remove('is-pressed');
 if(g.active){
  const x1=PAD+peak+W/2,x2=x1+W+GAP;
  const target=Math.abs(e.clientX-x1)<=Math.abs(e.clientX-x2)?0:1;
  orders[g.side==='left'?0:1]=orders[g.side==='left'?0:1].filter(i=>i!==g.index);
  if(!orders[target].includes(g.index))orders[target].push(g.index);
  flips.delete(g.index);measure();build();
 }else if(g.moved)g.el.dataset.dragged='1';
 cardHold=null;
}

function frame(now){
 const dt=lastFrame?Math.min(40,now-lastFrame):16.667;lastFrame=now;
 const frameScale=dt/16.667,fr=Math.pow(.96,frameScale);
 if(searchMotion){const t=clamp((now-searchMotion.started)/600,0,1),e=1-Math.pow(1-t,3),v=searchMotion.start+(searchMotion.target-searchMotion.start)*e;if(searchMotion.side==='left'){lo=v;lt=v;lv=0;}else{ro=v;rt=v;rv=0;}if(t>=1)searchMotion=null;}
 if(ld)lo+=(lt-lo)*.95;else{lo+=lv*frameScale;lv*=fr;if(Math.abs(lv)<.15)lv=0;}
 if(rd)ro+=(rt-ro)*.95;else{ro+=rv*frameScale;rv*=fr;if(Math.abs(rv)<.15)rv=0;}
 const rawLeftDelta=lo-prevLo,rawRightDelta=ro-prevRo;prevLo=lo;prevRo=ro;
 leftDeltaLow=leftDeltaLow*.55+rawLeftDelta*.45;
 rightDeltaLow=rightDeltaLow*.55+rawRightDelta*.45;
 if(ld)lv=lv*.35+leftDeltaLow*.65;
 if(rd)rv=rv*.35+rightDeltaLow*.65;
 for(const state of flips.values()){
  const fs=Math.max(.1,frameScale);
  state.velocity=(state.velocity+(state.target-state.angle)*.035*fs)*Math.pow(.82,fs);
  state.angle+=state.velocity*fs;
  state.elevVelocity=(state.elevVelocity+(state.target/180-state.elev)*.055*fs)*Math.pow(.78,fs);
  state.elev=clamp(state.elev+state.elevVelocity*fs,0,1);
  if(Math.abs(state.target-state.angle)<.08&&Math.abs(state.velocity)<.08){state.angle=state.target;state.velocity=0;}
  if(Math.abs(state.target/180-state.elev)<.001&&Math.abs(state.elevVelocity)<.001){state.elev=state.target/180;state.elevVelocity=0;}
 }
 const ls=Math.trunc(lo/STEP),rs=Math.trunc(ro/STEP);
 if(ls!==lastLS){hapticTick(clamp(Math.abs(lv)/MAXV,0,1));lastLS=ls;}
 if(rs!==lastRS){hapticTick(clamp(Math.abs(rv)/MAXV,0,1));lastRS=rs;}
 const bound=clamp(lo,layout.bigMin,layout.bigMax),overflow=bound-lo;
 if(!ld&&Math.abs(overflow)>.5){
  // Source uses a medium-low damped spring to return the finite rail to its bounds.
  leftSpringV=(leftSpringV+overflow*.12*frameScale)*Math.pow(.72,frameScale);
  lo+=leftSpringV*frameScale;lv=0;
  if(Math.abs(overflow)<.35&&Math.abs(leftSpringV)<.35){lo=bound;leftSpringV=0;}
 }else if(ld)leftSpringV=0;
 render(now);raf=requestAnimationFrame(frame);
}
function resize(){measure();build();render(performance.now());}
measure();build();render(performance.now());raf=requestAnimationFrame(frame);
addEventListener('resize',resize);
function normalizeSearch(s){return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');}
function findSearchMatch(raw){const q=normalizeSearch(raw);if(!q)return -1;let best=-1,bestScore=0;for(let i=0;i<C.length;i++){const c=C[i],fields=[c.title,normalizeSearch(c.pinyinFull),normalizeSearch(c.pinyinAbbr)];for(let k=0;k<fields.length;k++){const v=fields[k];if(!v)continue;let score=0;if(v===q)score=100-k*3;else if(v.startsWith(q))score=75-k*3;else if(v.includes(q))score=50-k*3;if(score>bestScore){bestScore=score;best=i;}}}return best;}
function searchFor(raw){const i=findSearchMatch(raw);if(i<0)return;const side=i%2===0?'left':'right',row=orders[side==='left'?0:1].indexOf(i);if(row<0)return;const target=row*STEP-layout.h*FOCUS+H/2;searchMotion={side,start:side==='left'?lo:ro,target,started:performance.now()};searchHighlight=i;searchHighlightUntil=performance.now()+1600;}
if(searchToggle&&searchInput){searchToggle.addEventListener('click',()=>{searchInput.classList.toggle('open');if(searchInput.classList.contains('open'))searchInput.focus();else{searchInput.value='';searchHighlight=-1;}});searchInput.addEventListener('input',()=>{clearTimeout(searchTimer);const value=searchInput.value;searchTimer=setTimeout(()=>searchFor(value),200);});searchInput.addEventListener('keydown',e=>{if(e.key==='Escape'){searchInput.value='';searchInput.classList.remove('open');searchHighlight=-1;searchInput.blur();}});}
addEventListener('deviceorientation',e=>{if(typeof e.gamma==='number')sensorTilt=clamp(e.gamma/45,-1,1);},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);lastFrame=0;}else raf=requestAnimationFrame(frame);});
