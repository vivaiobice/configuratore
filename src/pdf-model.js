import { isOtherMaterialSelection } from './plant-catalog.js?v=45';
import { ensureProjectFields } from './fields.js?v=45';

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

  return {
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
      areaM2: metrics.areaM2 ?? 0,
      netAreaM2: metrics.netAreaM2 ?? metrics.areaM2 ?? 0,
      headlandAreaM2: metrics.headlandAreaM2 ?? 0,
      perimeterM: metrics.perimeterM ?? 0,
      vertexCount: metrics.vertexCount ?? 0,
      polygon: project.geometry ?? null,
      sourceType: project.sourceType ?? 'manual',
      rows: Array.isArray(metrics.rows) ? metrics.rows : []
    },
    layout: {
      rowSpacingM: project.rowSpacingM ?? null,
      plantSpacingM: project.plantSpacingM ?? null,
      orientationDeg: project.orientationDeg ?? 0,
      headlandWidthM: project.headlandWidthM ?? null,
      postSpacingM: project.postSpacingM ?? null,
      mechanizedHarvest: Boolean(project.mechanizedHarvest),
      rowCount: metrics.rowCount ?? 0,
      rowLinearM: metrics.rowLinearM ?? 0,
      theoreticalPlants: metrics.theoreticalPlants ?? 0,
      simulatedPlants: metrics.simulatedPlants ?? 0,
      commercialPlants25: metrics.commercialPlants25 ?? 0,
      headPosts: metrics.headPosts ?? 0,
      intermediatePosts: metrics.intermediatePosts ?? 0,
      totalPosts: metrics.totalPosts ?? 0
    },
    plantMaterial: {
      grapeVariety: project.grapeVariety || 'Da definire',
      rootstock: project.rootstock || 'Consigliami',
      cloneSelection: project.cloneSelection || null,
      requestNote: project.materialRequestNote || '',
      requiresVerification: [project.grapeVariety, project.rootstock, project.cloneSelection].some(isOtherMaterialSelection) || Boolean(project.materialRequestNote),
      quantity: metrics.commercialPlants25 ?? 0
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
function total(fields,path){return fields.reduce((sum,field)=>sum+(n(path(field))??0),0);}
function closedRing(value){
  if(!Array.isArray(value)||value.length<4)return false;
  const first=value[0],last=value.at(-1);
  return value.every(point=>Array.isArray(point)&&Number.isFinite(Number(point[0]))&&Number.isFinite(Number(point[1])))
    && Number(first[0])===Number(last[0])&&Number(first[1])===Number(last[1]);
}
function unique(values){return [...new Set(values.map(value=>String(value??'').trim()).filter(Boolean))];}

function reportField(field,index,metrics={},mapAssets={},projectCampaignYear=null){
  const geometryValid=closedRing(field.geometry);
  return {
    id:String(field.id||field.clientFieldId||`field-${index+1}`),
    label:String(field.label||`Campo ${index+1}`),
    geometryValid,
    location:{
      label:mapAssets.location?.label||field.locationLabel||'',municipality:mapAssets.location?.municipality||field.municipality||'',
      province:mapAssets.location?.province||field.province||'',region:field.region||''
    },
    geometry:field.geometry??null,
    exclusions:Array.isArray(field.exclusions)?field.exclusions:[],
    rows:Array.isArray(metrics.rows)?metrics.rows:[],
    sideMeasurements:Array.isArray(metrics.sideMeasurements)?metrics.sideMeasurements:[],
    layout:{
      rowSpacingM:n(field.rowSpacingM),plantSpacingM:n(field.plantSpacingM),
      orientationDeg:n(field.orientationDeg)??0,headlandWidthM:n(field.headlandWidthM),
      postSpacingM:n(field.postSpacingM),mechanizedHarvest:Boolean(field.mechanizedHarvest)
    },
    plantMaterial:{
      grapeVariety:field.grapeVariety||'Da definire',
      cloneSelection:field.cloneSelection||null,rootstock:field.rootstock||'Da definire',
      plantHeightCm:field.plantHeightCm===60?60:40
    },
    plantingYear:n(field.campaignYear??field.plantingYear??projectCampaignYear),
    context:{type:field.projectContextType||'',label:CONTEXT_LABELS[field.projectContextType]||'',note:field.projectContextNote||''},
    notes:field.materialRequestNote||'',
    metrics:{
      grossAreaM2:n(metrics.areaM2)??0,netAreaM2:n(metrics.netAreaM2??metrics.areaM2)??0,
      headlandAreaM2:n(metrics.headlandAreaM2)??0,perimeterM:n(metrics.perimeterM)??0,
      vertexCount:n(metrics.vertexCount)??0,rowCount:n(metrics.rowCount)??0,
      rowLinearM:n(metrics.rowLinearM)??0,theoreticalPlants:n(metrics.theoreticalPlants)??0,
      calculatedPlants:n(metrics.simulatedPlants)??0,commercialPlants:n(metrics.commercialPlants25)??0,
      headPosts:n(metrics.headPosts)??0,intermediatePosts:n(metrics.intermediatePosts)??0,
      totalPosts:n(metrics.totalPosts)??0
    },
    satelliteImage:mapAssets.satelliteImage??null,
    satelliteOverlayMapModel:mapAssets.satelliteOverlayMapModel??null,
    mapAttribution:mapAssets.mapAttribution||'Imagery © Esri'
  };
}

export function buildProjectReportModel({
  state,selectedFieldIds,getMetrics=()=>({}),report={},recipient={},mapAssets={}
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
