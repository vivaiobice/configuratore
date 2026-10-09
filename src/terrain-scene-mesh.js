import {getTerrainMesh,createTerrainSampler} from './terrain-model.js?v=1.3.4';
import {toUTM,fromUTM} from './coordinate-system.js?v=1.3.4';

// Display data only. Native model, project geometry, and calculated quantities
// remain the authority; none of these buffers are read back by the calculator.
const EARTH_CIRCUMFERENCE=2*Math.PI*6378137;
const COLORS={field:[.96,.97,.9],rows:[.96,.91,.58],exclusions:[1,.57,.32],portions:[.7,.83,.94]};
const coordinateShape=point=>Array.isArray(point)&&typeof point[0]==='number';
function coordinate(point){
 if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw new RangeError('Coordinate finite richieste per la scena 3D.');
 return point;
}
function ring(points){
 if(!Array.isArray(points)||points.length<4)throw new RangeError('Perimetro non valido per la scena 3D.');
 points.forEach(coordinate);
 const first=points[0],last=points.at(-1);
 if(first[0]!==last[0]||first[1]!==last[1])throw new RangeError('Perimetro non chiuso per la scena 3D.');
 return points;
}
function polygonRings(value){
 if(value?.type==='Feature')return polygonRings(value.geometry);
 if(value?.type==='Polygon')return value.coordinates.map(ring);
 if(value?.type==='MultiPolygon')return value.coordinates.flatMap(polygon=>polygon.map(ring));
 if(Array.isArray(value)&&coordinateShape(value[0]))return [ring(value)];
 if(Array.isArray(value)&&coordinateShape(value[0]?.[0]))return value.map(ring);
 if(Array.isArray(value)&&coordinateShape(value[0]?.[0]?.[0]))return value.flatMap(polygon=>polygon.map(ring));
 throw new RangeError('Geometria poligonale non valida per la scena 3D.');
}
function overlayPolygons(input){
 if(input?.type==='FeatureCollection')return input.features.map(feature=>({id:feature.id??feature.properties?.id,rings:polygonRings(feature)}));
 if(input?.type)return [{id:input.id,rings:polygonRings(input)}];
 if(!Array.isArray(input))throw new RangeError('Aree della scena 3D non valide.');
 if(!input.length)return [];
 if(coordinateShape(input[0]))return [{rings:[ring(input)]}];
 return input.map((item,index)=>({id:item?.id??index,rings:polygonRings(Array.isArray(item)?item:item?.geometry)}));
}
function mercator([longitude,latitude]){
 const radians=latitude*Math.PI/180;
 return [(longitude+180)/360,(1-Math.asinh(Math.tan(radians))/Math.PI)/2];
}
function nativeCuts(start,end,grid){
 const u0=(start[0]-grid.origin[0])/grid.step[0],v0=(start[1]-grid.origin[1])/grid.step[1];
 const u1=(end[0]-grid.origin[0])/grid.step[0],v1=(end[1]-grid.origin[1])/grid.step[1],cuts=[0,1];
 // The calculator's faces meet at u=i, v=j and u+v=i+j+1.
 // Splitting at these crossings retains the piecewise planar surface exactly.
 for(const [a,b] of [[u0,u1],[v0,v1],[u0+v0,u1+v1]]){
  if(Math.abs(b-a)<1e-12)continue;
  for(let edge=Math.floor(Math.min(a,b))+1;edge<Math.max(a,b);edge++){
   const t=(edge-a)/(b-a);if(t>1e-10&&t<1-1e-10)cuts.push(t);
  }
 }
 cuts.sort((a,b)=>a-b);
 return cuts.filter((t,index)=>index===0||t-cuts[index-1]>1e-10);
}

export function buildTerrainScene({model,geometry,rows=[],exclusions=[],rowPortions=[]}={}){
 const field=ring(geometry),native=getTerrainMesh(model),sample=createTerrainSampler(model),epsg=Number(native.crs.split(':')[1]);
 const supported=point=>{
  coordinate(point);const height=sample(point);
  if(!Number.isFinite(height))throw new RangeError('Punto della scena 3D fuori copertura del terreno congelato.');
  return height;
 };
 const fieldXY=field.map(point=>{supported(point);return toUTM(point,epsg);});
 let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
 for(const [x,y] of fieldXY){xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
 const center=fromUTM([(xmin+xmax)/2,(ymin+ymax)/2],epsg),anchorXY=mercator(center);
 const reference={coordinate:center,height:supported(center),anchor:[...anchorXY,0],metersToMercator:1/(EARTH_CIRCUMFERENCE*Math.cos(center[1]*Math.PI/180))};
 const local=(point,height)=>{
  const [x,y]=mercator(point);
  return [x-reference.anchor[0],y-reference.anchor[1],(height-reference.height)*reference.metersToMercator];
 };
 const positions=new Float32Array(native.vertices.length*3),indices=new Uint32Array(native.triangles.length*3);
 const normals=new Float32Array(positions.length),normalSums=new Float64Array(positions.length),bounds=[Infinity,Infinity,-Infinity,-Infinity];
 native.vertices.forEach(([x,y,height],index)=>{
  const point=fromUTM([x,y],epsg);positions.set(local(point,height),index*3);
  bounds[0]=Math.min(bounds[0],point[0]);bounds[1]=Math.min(bounds[1],point[1]);bounds[2]=Math.max(bounds[2],point[0]);bounds[3]=Math.max(bounds[3],point[1]);
 });
 native.triangles.forEach((triangle,index)=>{
  indices.set(triangle,index*3);
  const [a,b,c]=triangle.map(vertex=>vertex*3),u=[positions[b]-positions[a],positions[b+1]-positions[a+1],positions[b+2]-positions[a+2]],v=[positions[c]-positions[a],positions[c+1]-positions[a+1],positions[c+2]-positions[a+2]];
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(normal[2]<0)for(let axis=0;axis<3;axis++)normal[axis]*=-1;
  for(const vertex of triangle)for(let axis=0;axis<3;axis++)normalSums[vertex*3+axis]+=normal[axis];
 });
 for(let offset=0;offset<normalSums.length;offset+=3){
  const length=Math.hypot(normalSums[offset],normalSums[offset+1],normalSums[offset+2]);
  if(!Number.isFinite(length)||length===0)throw new RangeError('Faccia del terreno non valida per la scena 3D.');
  for(let axis=0;axis<3;axis++)normals[offset+axis]=normalSums[offset+axis]/length;
 }
 const lineValues=[],colorValues=[],lineRanges=[];
 function path(points,kind,id){
  if(!Array.isArray(points)||points.length<2)throw new RangeError('Linea non valida per la scena 3D.');
  const xy=points.map(point=>{supported(point);return toUTM(point,epsg);}),offset=lineValues.length/3;
  for(let index=1;index<xy.length;index++){
   const a=xy[index-1],b=xy[index];if(a[0]===b[0]&&a[1]===b[1])continue;
   const cuts=nativeCuts(a,b,native);let previous=null;
   for(const t of cuts){
    const point=t===0?points[index-1]:t===1?points[index]:fromUTM([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],epsg);
    const value=local(point,supported(point));
    if(previous){lineValues.push(...previous,...value);colorValues.push(...COLORS[kind],...COLORS[kind]);}
    previous=value;
   }
  }
  const count=lineValues.length/3-offset;if(count)lineRanges.push({kind,id,offset,count});
 }
 path(field,'field');
 if(!Array.isArray(rows))throw new RangeError('Filari non validi per la scena 3D.');
 rows.forEach((row,index)=>path(Array.isArray(row?.coordinates)&&row.coordinates.length>=2?row.coordinates:[row?.start,row?.end],'rows',row?.id??index));
 for(const {id,rings} of overlayPolygons(exclusions))for(const polygon of rings)path(polygon,'exclusions',id);
 for(const {id,rings} of overlayPolygons(rowPortions))for(const polygon of rings)path(polygon,'portions',id);
 return {positions,normals,indices,linePositions:new Float32Array(lineValues),lineColors:new Float32Array(colorValues),lineRanges,bounds,reference,modelHash:model.contentHash,nativeVertexCount:native.vertices.length,nativeTriangleCount:native.triangles.length};
}

export function terrainSceneTransferables(scene){
 return [scene.positions.buffer,scene.normals.buffer,scene.indices.buffer,scene.linePositions.buffer,scene.lineColors.buffer];
}
