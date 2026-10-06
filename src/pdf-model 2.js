import {terrainReportMetadata} from './terrain-report-summary.js?v=1.3.0';
import {rowPortionDescriptors,hasTerrainGuide} from './row-portion-summary.js?v=1.3.0';
import {soilProfileIsCurrent} from './soil.js';
import { isOtherMaterialSelection } from './plant-catalog.js?v=45';
import { ensureProjectFields } from './fields.js?v=1.3.0';

const CONTEXT_LABELS = {
  application: 'Domanda',
  tender: 'Bando',
  contribution: 'Contributo / finanziamento',
  other: 'Altro'
};

export function projectToPdfModel({ state, metrics = {}, publicCode = '', generatedAt = new Date().toISOString(), resumeUrl = null }) {
  const project = state?.project ?? {};
  const contact = state?.contact ?? null;
  const contextType = project.projectContextType || '';
  const terrain=terrainReportMetadata(metrics);
  const metric=value=>value??(terrain?.status==='invalid'?null:0);
  const portions=rowPortionDescriptors(project,metrics);

  return {
    ...(terrain?{terrain}:{}),
    title: 'Proposta preliminare d’impianto',
    brand: 'Vivai Obice',
    environment: state?.environment ?? 'TEST',
    projectCode: publicCode,
    generatedAt,
    location: (project.locationLabel || project.municipality || project.province || project.region) ? {
      label: project.locationLabel || '',
      municipality: project.municipality || '',
      province: project.province || '',
      region: project.region || ''
    } : null,
    customer: contact ? {
      companyName: contact.companyName || '',
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      phone: contact.phone || '',
      email: contact.email || ''
    } : null,
    context: contextType ? {
      type: contextType,
      label: CONTEXT_LABELS[contextType] ?? 'Altro',
      note: project.projectContextNote || ''
    } : null,
    geometry: {
      areaM2: metric(metrics.areaM2),
      netAreaM2: metric(metrics.netAreaM2 ?? metrics.areaM2),
      headlandAreaM2: metric(metrics.headlandAreaM2),
      perimeterM: metric(metrics.perimeterM),
      vertexCount: metric(metrics.vertexCount),
      polygon: project.geometry ?? null,
      sourceType: project.sourceType ?? 'manual',
      rows: Array.isArray(metrics.rows) ? metrics.rows : []
    },
    layout: {
      portions,
      rowSpacingM: project.rowSpacingM ?? null,
      plantSpacingM: project.plantSpacingM ?? null,
      orientationDeg: hasTerrainGuide({portions}) ? null : project.orientationDeg ?? 0,
      headlandWidthM: project.headlandWidthM ?? null,
      postSpacingM: project.postSpacingM ?? null,
      mechanizedHarvest: Boolean(project.mechanizedHarvest),
      rowCount: metric(metrics.rowCount),
      rowLinearM: metric(metrics.rowLinearM),
      theoreticalPlants: metric(metrics.theoreticalPlants),
      simulatedPlants: metric(metrics.simulatedPlants),
      commercialPlants25: metric(metrics.commercialPlants25),
      headPosts: metric(metrics.headPosts),
      intermediatePosts: metric(metrics.intermediatePosts),
      totalPosts: metric(metrics.totalPosts)
    },
    plantingStatus: project.plantingStatus === 'planted' ? 'planted' : 'planned',
    plantMaterial: {
      grapeVariety: project.grapeVariety || 'Da definire',
      rootstock: project.rootstock || 'Consigliami',
      cloneSelection: project.cloneSelection || null,
      requestNote: project.materialRequestNote || '',
      requiresVerification: [project.grapeVariety, project.rootstock, project.cloneSelection].some(isOtherMaterialSelection) || Boolean(project.materialRequestNote),
      quantity: metric(metrics.commercialPlants25)
    },
    resumeUrl,
    disclaimer: 'Simulazione preliminare e indicativa. Non sostituisce elaborati catastali, rilievi o progettazioni tecniche professionali quando richiesti.',
    cta: 'Richiedi preventivo a Vivai Obice'
  };
}

export class ReportSelectionError extends Error {
  constructor(message='Nessun campo disponibile per il documento'){
    super(message);this.name='ReportSelectionError';
  }
}

const REPORT_TITLE='Studio preliminare ed esemplificativo di impianto viticolo';
const COMPANY={
  name:'VIVAI OBICE S.S.A.',address:'Via Cossano, 6 · 12058 Santo Stefano Belbo (CN)',
  email:'info@vivaiobice.com',phone:'393 892 9801',vat:'01656710041',sdi:'SUBM70N'
};

function n(value){return value===null||value===undefined||value===''?null:(Number.isFinite(Number(value))?Number(value):null);}
function total(fields,path){return fields.some(field=>field.terrain?.status==='invalid')?null:fields.reduce((sum,field)=>sum+(n(path(field))??0),0);}
function closedRing(value){
  if(!Array.isArray(value)||value.length<4)return false;
  const first=value[0],last=value.at(-1);
  return value.every(point=>Array.isArray(point)&&Number.isFinite(Number(point[0]))&&Number.isFinite(Number(point[1])))
    && Number(first[0])===Number(last[0])&&Number(first[1])===Number(last[1]);
}
function unique(values){return [...new Set(values.map(value=>String(value??'').trim()).filter(Boolean))];}

function reportField(field,index,metrics={},mapAssets={},projectCampaignYear=null){
  const geometryValid=closedRing(field.geometry);
  const terrain=terrainReportMetadata(metrics);
  const metric=value=>n(value)??(terrain?.status==='invalid'?null:0);
  const portions=rowPortionDescriptors(field,metrics);
  return {
    id:String(field.id||field.clientFieldId||`field-${index+1}`),
    label:String(field.label||`Campo ${index+1}`),
    geometryValid,
    ...(terrain?{terrain}:{}),
    location:{
      label:mapAssets.location?.label||field.locationLabel||'',municipality:mapAssets.location?.municipality||field.municipality||'',
      province:mapAssets.location?.province||field.province||'',region:field.region||''
    },
    cadastralRefs:field.cadastralRefs??[],
    soil:field.soil??null,
    soilCurrent:soilProfileIsCurrent(field.soil,field.geometry),
    geometry:field.geometry??null,
    exclusions:Array.isArray(field.exclusions)?field.exclusions:[],
    rows:Array.isArray(metrics.rows)?metrics.rows:[],
    sideMeasurements:Array.isArray(metrics.sideMeasurements)?metrics.sideMeasurements:[],
    layout:{
      portions,
      rowSpacingM:n(field.rowSpacingM),plantSpacingM:n(field.plantSpacingM),
      orientationDeg:hasTerrainGuide({portions})?null:n(field.orientationDeg)??0,headlandWidthM:n(field.headlandWidthM),
      postSpacingM:n(field.postSpacingM),mechanizedHarvest:Boolean(field.mechanizedHarvest)
    },
    plantMaterial:{
      grapeVariety:field.grapeVariety||'Da definire',
      cloneSelection:field.cloneSelection||null,rootstock:field.rootstock||'Da definire',
      plantHeightCm:field.plantHeightCm===60?60:40
    },
    plantingYear:n(field.campaignYear??field.plantingYear??projectCampaignYear),
    plantingStatus:field.plantingStatus==='planted'?'planted':'planned',
    context:{type:field.projectContextType||'',label:CONTEXT_LABELS[field.projectContextType]||'',note:field.projectContextNote||''},
    notes:field.materialRequestNote||'',
    metrics:{
      ...(terrain?{terrainStatus:terrain.status,terrainSource:terrain.source,quantityBasis:terrain.quantityBasis,surfaceRowLinearM:terrain.surfaceRowLinearM,horizontalRowLinearM:terrain.horizontalRowLinearM,surfaceAreaM2:terrain.surfaceAreaM2,surfaceNetAreaM2:terrain.surfaceNetAreaM2,surfaceHeadlandAreaM2:terrain.surfaceHeadlandAreaM2}:{}),
      grossAreaM2:metric(metrics.areaM2),netAreaM2:metric(metrics.netAreaM2??metrics.areaM2),
      headlandAreaM2:metric(metrics.headlandAreaM2),perimeterM:metric(metrics.perimeterM),
      vertexCount:metric(metrics.vertexCount),rowCount:metric(metrics.rowCount),
      rowLinearM:metric(metrics.rowLinearM),theoreticalPlants:metric(metrics.theoreticalPlants),
      calculatedPlants:metric(metrics.simulatedPlants),commercialPlants:metric(metrics.commercialPlants25),
      headPosts:metric(metrics.headPosts),intermediatePosts:metric(metrics.intermediatePosts),
      totalPosts:metric(metrics.totalPosts)
    },
    satelliteImage:mapAssets.satelliteImage??null,
    satelliteOverlayMapModel:mapAssets.satelliteOverlayMapModel??null,
    mapAttribution:mapAssets.mapAttribution||'Imagery © Esri'
  };
}

export function buildProjectReportModel({
  state,selectedFieldIds,getMetrics=()=>({}),report={},recipient={},mapAssets={},overview=null
}={}){
  const project=ensureProjectFields(state?.project??{});
  const all=project.fields??[];
  const requested=Array.isArray(selectedFieldIds)&&selectedFieldIds.length
    ? selectedFieldIds.map(String)
    : all.map(field=>String(field.id));
  const byId=new Map(all.map(field=>[String(field.id),field]));
  const selected=requested.map(id=>byId.get(id)).filter(Boolean);
  if(!selected.length)throw new ReportSelectionError();
  const warnings=[];
  for(const id of requested)if(!byId.has(id))warnings.push(`Campo ${id} non trovato e non incluso.`);
  const fields=selected.map((field,index)=>{
    const model=reportField(field,index,getMetrics(field)??{},mapAssets[field.id]??{},project.campaignYear);
    if(model.terrain?.status==='invalid')warnings.push(`${model.label}: terreno non disponibile; rivedere il disegno.`);
    if(!model.geometryValid)warnings.push(`${model.label}: perimetro non disponibile o incompleto.`);
    return model;
  });
  const generatedAt=report.generatedAt??new Date().toISOString();
  return {
    title:REPORT_TITLE,
    brand:'Vivai Obice',company:COMPANY,environment:state?.environment??'TEST',
    project:{
      id:report.projectId??state?.cloud?.projectId??null,
      code:report.projectCode??state?.cloud?.publicCode??'',
      name:project.localProjectName||'Il mio impianto',campaignYear:n(project.campaignYear),
      revisionNumber:n(report.revisionNumber),documentId:report.id??null,generatedAt
    },
    recipient:{
      firstName:recipient.firstName||'',lastName:recipient.lastName||'',companyName:recipient.companyName||'',
      email:recipient.email||'',phone:recipient.phone||'',address:recipient.address||'',
      addressCity:recipient.addressCity||'',addressProvince:recipient.addressProvince||'',addressPostalCode:recipient.addressPostalCode||'',
      plantLocation:recipient.plantLocation||'',province:recipient.province||'',reference:recipient.reference||''
    },
    fields,
    overview,
    summary:{
      fieldCount:fields.length,
      grossAreaM2:total(fields,field=>field.metrics.grossAreaM2),
      netAreaM2:total(fields,field=>field.metrics.netAreaM2),
      rowCount:total(fields,field=>field.metrics.rowCount),
      rowLinearM:total(fields,field=>field.metrics.rowLinearM),
      calculatedPlants:total(fields,field=>field.metrics.calculatedPlants),
      commercialPlants:total(fields,field=>field.metrics.commercialPlants),
      headPosts:total(fields,field=>field.metrics.headPosts),
      intermediatePosts:total(fields,field=>field.metrics.intermediatePosts),
      totalPosts:total(fields,field=>field.metrics.totalPosts),
      grapeVarieties:unique(fields.map(field=>field.plantMaterial.grapeVariety)),
      clones:unique(fields.map(field=>field.plantMaterial.cloneSelection)),
      rootstocks:unique(fields.map(field=>field.plantMaterial.rootstock)),
      plantingYears:unique(fields.map(field=>field.plantingYear))
    },
    shareUrl:report.shareUrl??null,qrSvg:report.qrSvg??null,
    disclaimer:{
      version:report.disclaimerVersion||'VO-DISC-2026-01',
      short:'Elaborato preliminare ed esemplificativo basato sui dati inseriti nel configuratore. Non costituisce progetto tecnico firmato, rilievo topografico, pratica autorizzativa o asseverazione.',
      full:'Il presente documento è uno studio preliminare ed esemplificativo di supporto alla valutazione di un possibile impianto viticolo. I dati, le quantità, le geometrie, le distanze e le rappresentazioni cartografiche derivano dalle informazioni inserite nel configuratore e da elaborazioni indicative. Il documento non costituisce progetto tecnico firmato, rilievo topografico o catastale, pratica autorizzativa, asseverazione, direzione lavori o garanzia di realizzabilità. Prima dell’esecuzione devono essere verificati sul posto confini, quote, pendenze, vincoli, accessi, distanze, sottoservizi e prescrizioni applicabili, ricorrendo quando necessario a professionisti abilitati e agli enti competenti.'
    },
    warnings
  };
}
