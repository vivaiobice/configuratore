import {createTerrainModel} from '../../src/terrain-model.js';
import {fromUTM} from '../../src/coordinate-system.js';
import {buildTerrainProposal} from '../../src/terrain-design.js';
export function appliedTerrainField(height=(x,y)=>y/2,overrides={}){
 const geometry=[[0,0],[40,0],[40,40],[0,40],[0,0]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const model=createTerrainModel({source:{id:'anonymous-dtm',label:'DTM anonimo',resolutionM:5,surveyEpoch:'2019',release:'fixture',citation:'Fixture numerica anonima',license:'CC0',url:'about:blank'},grid:{width:17,height:17,origin:[499980,5000060],step:[5,-5],values:Array.from({length:289},(_,i)=>height(-20+i%17*5,60-Math.floor(i/17)*5))}});
 const project={id:'applied',label:'Campo applicato',geometry,exclusions:[],rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,orientationDeg:0,rowPortions:[],rowCurvePoints:[],maintainRowEquidistance:true,...overrides};
 const proposal=buildTerrainProposal({project,model,followTerrain:false});
 if(!proposal.ok)throw new Error(proposal.message);
 return {field:{...project,rowPortions:proposal.rowPortions,terrain:proposal.terrain},result:proposal.result,proposal};
}
