import {resolveRowPortions} from './row-portions.js?v=1.2.6';
import {normalizeRowCurvePoints} from './row-curves.js?v=1.2.6';

// Report only effective designs: saved controls may still use the inherited base.
export function rowPortionDescriptors(field={},metrics={}){
  const portions=Array.isArray(metrics.portions)?metrics.portions:resolveRowPortions({
    polygon:field.geometry,exclusions:field.exclusions,rowPortions:field.rowPortions,
    orientationDeg:field.orientationDeg,rowCurvePoints:field.rowCurvePoints,
    maintainRowEquidistance:field.maintainRowEquidistance!==false
  });
  return portions.map((portion,index)=>({id:portion.id,label:portion.label||`Porzione ${index+1}`,
    mode:portion.mode,orientationDeg:Number(portion.orientationDeg)||0,
    curved:normalizeRowCurvePoints(portion.rowCurvePoints).some(point=>Math.abs(point.offsetM)>0),
    maintainRowEquidistance:portion.maintainRowEquidistance!==false}));
}

export function hasPortionDesign(layout={}){
  return layout.portions?.length>1||layout.portions?.some(portion=>portion.mode==='local')||false;
}

export function formatPortionDesign(portion={}, {includeEquidistance=true}={}){
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
