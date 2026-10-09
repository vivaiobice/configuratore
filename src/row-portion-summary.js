import {resolveRowPortions} from './row-portions.js?v=1.3.4';
import {normalizeRowCurvePoints} from './row-curves.js?v=1.3.4';

// Report only effective designs: saved controls may still use the inherited base.
export function rowPortionDescriptors(field={},metrics={}){
  const portions=Array.isArray(metrics.portions)?metrics.portions:resolveRowPortions({
    polygon:field.geometry,exclusions:field.exclusions,rowPortions:field.rowPortions,
    orientationDeg:field.orientationDeg,rowCurvePoints:field.rowCurvePoints,
    maintainRowEquidistance:field.maintainRowEquidistance!==false
  });
  // Applied rows may follow a terrain guide while their reference controls and
  // metrics.portions still hold the manual angle/curve used before application.
  const applied=metrics.terrainStatus==='applied';
  const designs=new Map((applied?field.terrain?.applied?.portionResults??[]:[]).map(portion=>[portion.id,portion.design]));
  const saved=new Map((applied?field.rowPortions??[]:[]).map(portion=>[portion.id,portion.terrainDesign]));
  return portions.map((portion,index)=>{
    const design=designs.get(portion.id)??saved.get(portion.id)??portion.terrainDesign;
    // followTerrain records the latest action; a retained automatic guide can
    // have followTerrain:false after another portion is recalculated.
    const terrainGuide=applied&&(design?.guide==='native-contour-distance-family'||Array.isArray(design?.guideCoordinates)&&design.guideCoordinates.length>=2
      ||design?.algorithmVersion==='terrain-contour-family-1'&&design.mode==='adapt'&&Array.isArray(design.axes)&&design.axes.length>0);
    return {id:portion.id,label:portion.label||`Porzione ${index+1}`,
      mode:portion.mode,orientationDeg:terrainGuide?null:Number(portion.orientationDeg)||0,
      curved:terrainGuide?null:normalizeRowCurvePoints(portion.rowCurvePoints).some(point=>Math.abs(point.offsetM)>0),
      maintainRowEquidistance:portion.maintainRowEquidistance!==false,...(terrainGuide?{terrainGuide:true}:{})};
  });
}

export function hasTerrainGuide(layout={}){
  return layout.portions?.some(portion=>portion.terrainGuide===true)||false;
}

export function hasPortionDesign(layout={}){
  return layout.portions?.length>1||layout.portions?.some(portion=>portion.mode==='local')||hasTerrainGuide(layout);
}

export function formatPortionDesign(portion={}, {includeEquidistance=true}={}){
  if(portion.terrainGuide===true)return 'Guida dal terreno';
  const angle=Number(portion.orientationDeg||0).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1});
  return `${angle}° · ${portion.curved?'Curvi':'Rettilinei'}${includeEquidistance?` · Equidistanza ${portion.maintainRowEquidistance!==false?'sì':'no'}`:''}`;
}

// Column-width print lines use a conservative glyph budget for system/fallback
// fonts. Pages share the same six inline lines and 32-line data continuation.
export function portionReportPages(layout={}){
  if(!hasPortionDesign(layout))return [];
  const units=letter=>letter.codePointAt(0)<=255?1:2;
  const width=text=>Array.from(text).reduce((sum,letter)=>sum+units(letter),0);
  const lines=[];
  for(const portion of layout.portions){
    let line='';
    const text=`${portion.label}: ${formatPortionDesign(portion,{includeEquidistance:false})}`;
    for(const word of text.split(/\s+/)){
      if(line&&width(line+' '+word)>24){lines.push(line);line='';}
      let piece='';const pieces=[];
      for(const letter of word){
        if(piece&&width(piece)+units(letter)>24){pieces.push(piece);piece='';}
        piece+=letter;
      }
      if(piece)pieces.push(piece);
      while(pieces.length>1)lines.push(pieces.shift());
      line=line?line+' '+pieces[0]:pieces[0]||'';
    }
    if(line)lines.push(line);
  }
  const pages=[lines.slice(0,6)];
  for(let i=6;i<lines.length;i+=32)pages.push(lines.slice(i,i+32));
  return pages;
}
