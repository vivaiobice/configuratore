// iPad Safari can omit the compatibility click after a short finger or Pencil tap.
// Keep native clicks and scrolling intact; synthesize only the missing activation.
export function installPenTapFallback(root,isActive,{delayMs=110,onMapTap=()=>{}}={}){
  let start=null,pending=null,lastSynthetic=null;
  root.addEventListener('pointerdown',event=>{if(['pen','touch'].includes(event.pointerType))start={id:event.pointerId,x:event.clientX,y:event.clientY,target:event.target,moved:false};},true);
  root.addEventListener('pointermove',event=>{if(start?.id===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)start.moved=true;},true);
  root.addEventListener('click',event=>{
    if(pending&&(pending.target===event.target||pending.target.contains?.(event.target)||event.target.contains?.(pending.target))){clearTimeout(pending.timer);pending=null;}
    if(lastSynthetic&&(lastSynthetic.target===event.target||lastSynthetic.target.contains?.(event.target))&&Date.now()-lastSynthetic.at<700&&event.pointerType!=='mouse'&&(event.detail>0||event.pointerType==='touch'||event.pointerType==='pen')){
      event.preventDefault();if(event.stopImmediatePropagation)event.stopImmediatePropagation();else event.stopPropagation?.();lastSynthetic=null;
    }
  },true);
  root.addEventListener('pointerup',event=>{
    if(!['pen','touch'].includes(event.pointerType)||!isActive())return;
    const startingControl=start?.target?.closest?.('button,input,textarea,select,a,summary');
    const endingControl=event.target.closest?.('button,input,textarea,select,a,summary');
    if(start&&(start.id!==event.pointerId||start.moved||(startingControl??start.target)!==(endingControl??event.target)||Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)){start=null;return;}
    start=null;
    const target=endingControl??event.target;
    if(target.matches?.('input:not([type="checkbox"]),textarea'))target.focus?.({preventScroll:true});
    if(!target.matches?.('button,a,summary,input[type="checkbox"]')&&!target.closest?.('.map-wrap'))return;
    if(pending)clearTimeout(pending.timer);
    const timer=setTimeout(()=>{
      pending=null;
      if(!isActive()||!target.isConnected||target.disabled)return;
      if(target.matches?.('button,a,summary,input[type="checkbox"]')){target.click();lastSynthetic={target,at:Date.now()};}
      else if(event.pointerType==='pen'&&target.closest?.('.map-wrap'))onMapTap(event);
    },delayMs);
    pending={target,timer};
  },true);
  root.addEventListener('pointercancel',()=>{start=null;if(pending)clearTimeout(pending.timer);pending=null;},true);
}
