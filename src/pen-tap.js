// Safari can deliver a pen pointer sequence without a compatibility click.
// Give the native click priority; synthesize one only when it is absent.
export function installPenTapFallback(root,isActive,{delayMs=110,onMapTap=()=>{}}={}){
  let start=null,pending=null;
  root.addEventListener('pointerdown',event=>{if(event.pointerType==='pen')start={id:event.pointerId,x:event.clientX,y:event.clientY,target:event.target};},true);
  root.addEventListener('click',event=>{if(pending&&(pending.target===event.target||pending.target.contains?.(event.target))){clearTimeout(pending.timer);pending=null;}},true);
  root.addEventListener('pointerup',event=>{
    if(event.pointerType!=='pen'||!isActive())return;
    if(start&&start.id===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>10){start=null;return;}
    start=null;
    const target=event.target.closest?.('button,input,textarea,select,a')??event.target;
    if(target.matches?.('input:not([type="checkbox"]),textarea'))target.focus?.({preventScroll:true});
    if(!target.matches?.('button,a,input[type="checkbox"]')&&!target.closest?.('.map-wrap'))return;
    if(pending)clearTimeout(pending.timer);
    const timer=setTimeout(()=>{
      pending=null;
      if(!isActive()||!target.isConnected||target.disabled)return;
      if(target.matches?.('button,a,input[type="checkbox"]'))target.click();
      else if(target.closest?.('.map-wrap'))onMapTap(event);
    },delayMs);
    pending={target,timer};
  },true);
  root.addEventListener('pointercancel',()=>{start=null;if(pending)clearTimeout(pending.timer);pending=null;},true);
}
