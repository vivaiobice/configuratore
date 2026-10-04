async function fixture(height=()=>0,{exclusions=[],angle=0,headland=0}={}) {
 const {createTerrainModel}=await import('../../src/terrain-model.js');
 const {fromUTM}=await import('../../src/coordinate-system.js');
 const ring=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const model=createTerrainModel({grid:{width:17,height:17,origin:[499980,5000060],step:[5,-5],values:Array.from({length:289},(_,i)=>height(-20+(i%17)*5,60-Math.floor(i/17)*5))}});
 const project={geometry:ring([[0,0],[40,0],[40,40],[0,40],[0,0]]),exclusions:exclusions.map(ring),rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:headland,orientationDeg:angle,rowPortions:[]};
 return {model,project};
}
export {fixture};
