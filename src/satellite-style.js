export const SATELLITE_ATTRIBUTION='Imagery © Esri';
export const SATELLITE_REFERENCE_ATTRIBUTION='Reference © Esri';

export function satelliteSources(){
  return {
    satellite:{
      type:'raster',
      tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize:256,maxzoom:19,attribution:SATELLITE_ATTRIBUTION
    },
    'satellite-reference':{
      type:'raster',
      tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize:256,maxzoom:19,attribution:SATELLITE_REFERENCE_ATTRIBUTION
    }
  };
}

export function satelliteLayers({labelsVisible=true,imageryLayerId='satellite',referenceLayerId='satellite-reference'}={}){
  return [
    {id:imageryLayerId,type:'raster',source:'satellite'},
    {id:referenceLayerId,type:'raster',source:'satellite-reference',layout:{visibility:labelsVisible?'visible':'none'},paint:{'raster-opacity':.92}}
  ];
}

export function satelliteStyle(options={}){
  return {version:8,sources:satelliteSources(),layers:satelliteLayers(options)};
}
