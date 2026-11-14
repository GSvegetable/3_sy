/** 手势：轨道纵向滚动、横向切换预设、点击卡片翻面；不提供长按或卡片拖出。 */
const SWIPE_DISTANCE_RATIO=0.10;
export function attachGestures(stage,handlers){
 const {getSide,isBlocked}=handlers;let gesture=null;
 const touchSlop=()=>stage.getBoundingClientRect().width*0.012||8;
 const onDown=e=>{if(e.button!==undefined&&e.button!==0)return;if(isBlocked())return;
  gesture={id:e.pointerId,side:getSide(e.clientX),startX:e.clientX,startY:e.clientY,lastY:e.clientY,lastTime:performance.now(),dragging:false,card:e.target.closest&&e.target.closest('.card:not(.free)')};};
 const onMove=e=>{if(!gesture||gesture.id!==e.pointerId||isBlocked())return;
  const dx=e.clientX-gesture.startX,dy=e.clientY-gesture.startY;
  if(Math.abs(dx)>touchSlop()&&Math.abs(dx)>Math.abs(dy)*1.25){e.preventDefault();return;}
  if(gesture.side<0||Math.abs(dy)<=Math.abs(dx)*1.5)return;
  if(!gesture.dragging&&Math.abs(dy)>touchSlop()){gesture.dragging=true;handlers.onDragStart(gesture.side);}
  if(gesture.dragging){const now=performance.now(),delta=e.clientY-gesture.lastY,dt=Math.max(8,now-gesture.lastTime);
   handlers.onDragMove(gesture.side,delta,dt,e.clientY);gesture.lastY=e.clientY;gesture.lastTime=now;e.preventDefault();}
 };
 const onUp=e=>{if(!gesture||gesture.id!==e.pointerId)return;
  const dx=e.clientX-gesture.startX,dy=e.clientY-gesture.startY,elapsed=Math.max(1,performance.now()-gesture.lastTime);
  const threshold=Math.max(34,stage.getBoundingClientRect().width*SWIPE_DISTANCE_RATIO);
  const horizontal=!gesture.dragging&&Math.abs(dx)>Math.abs(dy)*1.25;
  const swipe=horizontal&&(Math.abs(dx)>=threshold||(Math.abs(dx)>=18&&Math.abs(dx)/elapsed>=0.55));
  if(gesture.dragging)handlers.onDragEnd(gesture.side);
  else if(swipe)handlers.onPresetStep(dx>0?1:-1);
  else if(gesture.card&&Math.hypot(dx,dy)<=touchSlop()*1.4)handlers.onTap(Number(gesture.card.dataset.i),gesture.card.dataset.side==='back'?0:1,Number(gesture.card.dataset.copy));
  gesture=null;
 };
 stage.addEventListener('pointerdown',onDown);stage.addEventListener('pointermove',onMove);
 stage.addEventListener('pointerup',onUp);stage.addEventListener('pointercancel',onUp);
 return{cancelHold(){gesture=null;}};
}
