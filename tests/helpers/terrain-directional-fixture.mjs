import {createTerrainModel} from '../../src/terrain-model.js';
import {fromUTM} from '../../src/coordinate-system.js';
export function nativeDirectionalFixture({size=35,noise=.02,slopeX=0,slopeY=.31,hole=false}={}){
 const n=65,width=size*4,ring=points=>points.map(([x,y])=>fromUTM([500000.37+x+.07*y,5000000.63+y],32632));
 const model=createTerrainModel({acquiredAt:'2026-10-08T00:00:00.000Z',grid:{width:n,height:n,origin:[499900,5000220],step:[5,-5],values:Array.from({length:n*n},(_,i)=>{const x=-100+(i%n)*5,y=220-Math.floor(i/n)*5;return Math.fround(120+x*slopeX+y*slopeY+noise*(Math.sin(x*.13)*Math.cos(y*.11)+.33*Math.sin(x*.71+y*.87)));})}});
 const geometry=ring([[0,0],[width,-1.2],[width-2,size],[width/2+1,size],[width/2-2,size*2],[1,size*2-.7],[0,0]]);
 return {model,project:{geometry,exclusions:[ring([[-2,size],[width+2,size],[width+2,size+1.5],[-2,size+1.5],[-2,size]]),...(hole?[ring([[width*.25,size*.2],[width*.4,size*.2],[width*.4,size*.5],[width*.25,size*.5],[width*.25,size*.2]])]:[])],rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,orientationDeg:0,rowPortions:[{id:'lower',mode:'local',orientationDeg:0,geometry:[ring([[0,0],[width,-1.2],[width-2,size],[0,size],[0,0]])]},{id:'upper',mode:'local',orientationDeg:90,geometry:[ring([[.5,size+1.5],[width/2+.75,size+1.5],[width/2-2,size*2],[1,size*2-.7],[.5,size+1.5]])]}]}};
}
