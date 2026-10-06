import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateProject} from '../src/project-calculator.js';
const metrePerDegree=6371008.8*Math.PI/180;
const dx=1/(metrePerDegree*Math.cos(44*Math.PI/180)), dy=1/metrePerDegree;
const rect=(a,b,c,d)=>[[8+a*dx,44+b*dy],[8+c*dx,44+b*dy],[8+c*dx,44+d*dy],[8+a*dx,44+d*dy],[8+a*dx,44+b*dy]];
test('internal 1.5m cut adds no headlands and doubles head posts',()=>{
 const args={polygon:rect(0,0,20,100),rowSpacingM:2.5,plantSpacingM:1,postSpacingM:4.5,headlandWidthM:6};
 const base=calculateProject(args), cut=calculateProject({...args,exclusions:[rect(-1,49,21,50.5)]});
 assert.ok(Math.abs((base.rowLinearM-cut.rowLinearM)/base.rowCount-1.5)<.02);
 assert.equal(cut.headPosts,base.headPosts*2);
 assert.ok(Math.abs(cut.headlandAreaM2-base.headlandAreaM2)<.1);
});
test('area exclusion cuts only its own width with headlands enabled',()=>{
 const args={polygon:rect(0,0,20,100),rowSpacingM:2.5,plantSpacingM:1,postSpacingM:4.5,headlandWidthM:6};
 const base=calculateProject(args), cut=calculateProject({...args,exclusions:[rect(-1,40,21,60)]});
 assert.ok(Math.abs((base.rowLinearM-cut.rowLinearM)/base.rowCount-20)<.02);
});
