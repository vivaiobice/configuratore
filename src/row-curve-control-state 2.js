const whole={id:'whole',index:0,label:'Tratto 1',startPosition:0,endPosition:1};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function curveControlRange(point,segments=[]){
 const available=segments.length?segments:[whole];
 const segment=available.find(item=>item.id===point.segmentId)
  ??available.find(item=>point.position>=item.startPosition&&point.position<=item.endPosition)
  ??available.reduce((nearest,item)=>Math.abs(point.position-(item.startPosition+item.endPosition)/2)<Math.abs(point.position-(nearest.startPosition+nearest.endPosition)/2)?item:nearest);
 const span=segment.endPosition-segment.startPosition;
 return {segment,min:segment.startPosition+span*.02,max:segment.endPosition-span*.02,
  percent:Math.round(clamp((point.position-segment.startPosition)/span,0,1)*100)};
}

export function nextCurveControlPoint(points,segments=[],id){
 const available=segments.length?segments:[whole];
 const gaps=[];
 for(const segment of available){
  const assigned=points.filter(point=>curveControlRange(point,available).segment.id===segment.id);
  const positions=[segment.startPosition,...assigned.map(point=>point.position),segment.endPosition].sort((a,b)=>a-b);
  for(let index=1;index<positions.length;index++)gaps.push({segment,start:positions[index-1],end:positions[index],empty:!assigned.length});
 }
 gaps.sort((a,b)=>Number(b.empty)-Number(a.empty)||(b.end-b.start)-(a.end-a.start));
 const gap=gaps[0],range=curveControlRange({segmentId:gap.segment.id,position:(gap.start+gap.end)/2},available);
 const point={id,position:clamp((gap.start+gap.end)/2,range.min,range.max),offsetM:0};
 if(available.length>1)point.segmentId=gap.segment.id;
 return point;
}
