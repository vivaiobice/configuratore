// The control stays with the single shared map when mobile/fields reparent it.
export function createMapTerrainControl({map,onToggle=()=>{}}){
 const container=map?.getContainer?.(),host=container?.closest?.('.map-wrap')??container;
 if(!host?.ownerDocument?.createElement||!host.append)return {setState(){},destroy(){}};
 const button=host.ownerDocument.createElement('button');button.type='button';button.className='map-terrain-control';button.dataset.mapTerrain='';
 const toggle=()=>{if(!button.disabled)onToggle();};button.addEventListener('click',toggle);host.append(button);
 function setState({available=false,active=false,busy=false,opening=false}={}){
  button.disabled=!available||(!active&&busy&&!opening);button.textContent=active?'2D':'3D';button.title=opening?'Annulla apertura della vista 3D':active?'Torna alla mappa 2D':'Mostra il terreno in 3D';
  button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-busy',String(busy));
 }
 setState();return {setState,destroy(){button.removeEventListener('click',toggle);button.remove();}};
}
