import {createTerrainModel} from '../../src/terrain-model.js';
import {fromUTM} from '../../src/coordinate-system.js';

// Native 5 m cells with a 20 m support margin; height takes local XY metres.
export function contourFixture({height=()=>0,geometryXY,exclusionsXY=[],spacingM=3,angle=0,headlandM=0}={}){
 const geometry=geometryXY??[[0,0],[40,0],[40,40],[0,40],[0,0]];
 const ring=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:17,height:17,origin:[499980,5000060],step:[5,-5],values:Array.from({length:289},(_,i)=>height(-20+(i%17)*5,60-Math.floor(i/17)*5))}});
 const project={geometry:ring(geometry),exclusions:exclusionsXY.map(ring),rowSpacingM:spacingM,plantSpacingM:1,postSpacingM:5,headlandWidthM:headlandM,orientationDeg:angle,rowPortions:[]};
 return {project,model};
}
