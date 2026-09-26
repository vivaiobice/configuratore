import {SOIL_DISCLAIMER,SOIL_LAYER_LABELS,SOIL_SOURCE,soilRows} from './soil.js?v=55.1';

function paragraph(text,className){const node=document.createElement('p');node.textContent=text;if(className)node.className=className;return node;}

export function renderSoilCard(node,data,{layer='texture',close=false}={}){
  if(!node)return;
  node.replaceChildren();
  const heading=document.createElement('h4');heading.textContent='Indicazione cartografica del suolo';node.append(heading);
  if(close){const button=document.createElement('button');button.type='button';button.className='soil-card-close';button.setAttribute('aria-label','Chiudi scheda suolo');button.textContent='×';button.addEventListener('click',event=>{event.stopPropagation();node.hidden=true;});node.append(button);}
  node.append(paragraph(`Tema: ${SOIL_LAYER_LABELS[layer]||SOIL_LAYER_LABELS.soil}`,'soil-theme'));
  if(data){
    node.append(paragraph(data.description||'Dato non disponibile','soil-card-description'));
    const rows=soilRows(data),list=document.createElement('dl');list.className='soil-card-rows';
    for(const [label,value] of rows){const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=String(value);list.append(dt,dd);}
    if(rows.length)node.append(list);
    if(data.units?.length>1){node.append(paragraph('Nel campo sono presenti più unità pedologiche.','soil-multiple'));node.append(paragraph(data.units.map(unit=>unit.description).join(' · '),'soil-units'));}
  }else node.append(paragraph('Dato non disponibile nel punto selezionato.','soil-card-description'));
  node.append(paragraph(`${SOIL_SOURCE} · CC BY 4.0`,'soil-source'),paragraph(SOIL_DISCLAIMER,'soil-disclaimer'));
  node.hidden=false;
}
