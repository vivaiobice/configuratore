function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 unavailable');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}

function samePoint(a,b){ return Number(a?.[0])===Number(b?.[0]) && Number(a?.[1])===Number(b?.[1]); }
function cross(a,b,c){ return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]); }
function onSegment(a,b,p){
  return Math.abs(cross(a,b,p))<1e-12 && p[0]>=Math.min(a[0],b[0]) && p[0]<=Math.max(a[0],b[0])
    && p[1]>=Math.min(a[1],b[1]) && p[1]<=Math.max(a[1],b[1]);
}
function segmentsIntersect(a,b,c,d){
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if(((abC>0&&abD<0)||(abC<0&&abD>0))&&((cdA>0&&cdB<0)||(cdA<0&&cdB>0))) return true;
  return (Math.abs(abC)<1e-12&&onSegment(a,b,c))||(Math.abs(abD)<1e-12&&onSegment(a,b,d))
    ||(Math.abs(cdA)<1e-12&&onSegment(c,d,a))||(Math.abs(cdB)<1e-12&&onSegment(c,d,b));
}

function validRing(ring) {
  if(!Array.isArray(ring)||ring.length<4||!samePoint(ring[0],ring.at(-1))) return false;
  const points=ring.map((position)=>[Number(position?.[0]),Number(position?.[1])]);
  if(points.some(([lon,lat])=>!Number.isFinite(lon)||!Number.isFinite(lat)||lon < -180||lon > 180||lat < -90||lat > 90)) return false;
  let twiceArea=0;
  for(let i=0;i<points.length-1;i++) twiceArea+=points[i][0]*points[i+1][1]-points[i+1][0]*points[i][1];
  if(Math.abs(twiceArea)<1e-12) return false;
  const segments=points.length-1;
  for(let i=0;i<segments;i++) for(let j=i+1;j<segments;j++) {
    if(j===i+1||(i===0&&j===segments-1)) continue;
    if(segmentsIntersect(points[i],points[i+1],points[j],points[j+1])) return false;
  }
  return true;
}

function featuresFrom(input) {
  if(input?.type==='FeatureCollection'&&Array.isArray(input.features)) return input.features;
  if(input?.type==='Feature') return [input];
  if(input?.type==='Polygon'||input?.type==='MultiPolygon') return [{type:'Feature',properties:{},geometry:input}];
  throw new TypeError('GeoJSON must be a Feature, FeatureCollection, Polygon or MultiPolygon');
}

export async function normalizeFieldAreaGeoJson(input,{sourceFileName='fieldarea.geojson',importedAt=new Date().toISOString()}={}) {
  const fingerprint=await sha256Hex(canonical(input));
  const fields=[];
  const features=featuresFrom(input);
  features.forEach((feature,featureIndex)=>{
    const geometry=feature?.geometry;
    const polygons=geometry?.type==='Polygon' ? [geometry.coordinates]
      : geometry?.type==='MultiPolygon' ? geometry.coordinates : null;
    if(!Array.isArray(polygons)||polygons.length===0) throw new TypeError(`Feature ${featureIndex+1}: geometry is not a Polygon`);
    const baseLabel=String(feature.properties?.name||feature.properties?.label||`Campo storico ${featureIndex+1}`).trim();
    polygons.forEach((polygon,partIndex)=>{
      const ring=polygon?.[0];
      if(!validRing(ring)||polygon.length!==1) throw new TypeError(`Feature ${featureIndex+1}: geometry is invalid, unclosed or self-intersecting`);
      fields.push({
        id:`fieldarea-${featureIndex+1}-${partIndex+1}`,
        clientFieldId:`fieldarea-${featureIndex+1}-${partIndex+1}`,
        label:polygons.length>1?`${baseLabel} · ${partIndex+1}`:baseLabel,
        geometry:ring.map(([lon,lat])=>[Number(lon),Number(lat)]),
        exclusions:[],
        origin:'fieldarea',
        status:'imported_incomplete',
        cloudReady:true,
        importProvenance:{sourceFileName,sourceFingerprint:fingerprint,importedAt,featureIndex,properties:structuredClone(feature.properties??{})}
      });
    });
  });
  if(!fields.length) throw new TypeError('GeoJSON contains no fields');
  return {
    schemaVersion:2,
    origin:'fieldarea',
    revisionReason:'migration',
    sourceFileName,
    sourceFingerprint:fingerprint,
    importedAt,
    fields
  };
}
