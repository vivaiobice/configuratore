// Presentation only. Native sources and lengths retain every acquired face knot.
export const TERRAIN_ROW_PREVIEW_CONVENTION='native-row-preview-1';
export const TERRAIN_ROW_PREVIEW_TOLERANCE_M=.01;
export function validTerrainRowPreview(marker){
 if(!marker||typeof marker!=='object'||Array.isArray(marker)||![Object.prototype,null].includes(Object.getPrototypeOf(marker)))return false;
 const keys=Reflect.ownKeys(marker);if(keys.length!==2||!keys.includes('convention')||!keys.includes('toleranceM'))return false;
 const convention=Object.getOwnPropertyDescriptor(marker,'convention'),tolerance=Object.getOwnPropertyDescriptor(marker,'toleranceM');
 return Object.hasOwn(convention,'value')&&convention.enumerable&&Object.hasOwn(tolerance,'value')&&tolerance.enumerable&&convention.value===TERRAIN_ROW_PREVIEW_CONVENTION&&tolerance.value===TERRAIN_ROW_PREVIEW_TOLERANCE_M;
}
export function compactTerrainRowPreview(points,toleranceM=TERRAIN_ROW_PREVIEW_TOLERANCE_M,{budget}={}){
 if(!Array.isArray(points)||points.length<2||!Number.isFinite(toleranceM)||toleranceM<=0)throw new RangeError('Invalid terrain row preview');
 for(const point of points){budget?.check();if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw new RangeError('Invalid terrain row preview coordinate');}
 const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
 const stack=[[0,points.length-1]],threshold=toleranceM*(1-16*Number.EPSILON);
 while(stack.length){
  budget?.check();const [start,end]=stack.pop(),a=points[start],b=points[end],dx=b[0]-a[0],dy=b[1]-a[1],norm=dx*dx+dy*dy;
  let farthest=-1,distance=threshold;
  for(let index=start+1;index<end;index++){
   budget?.check();const p=points[index],t=norm?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/norm)):0;
   const deviation=Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));
   if(deviation>distance){distance=deviation;farthest=index;}
  }
  if(farthest!==-1){keep[farthest]=1;stack.push([start,farthest],[farthest,end]);}
 }
 const count=keep.reduce((sum,item)=>sum+item,0);budget?.check(count);
 return points.filter((_,index)=>keep[index]).map(point=>point.slice());
}
