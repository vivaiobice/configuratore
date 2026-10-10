import { buildReportMapModel, buildTechnicalReportMapModel } from './report-map-model.js?v=1.3.7';
import {reportExclusionGeometry} from './report-satellite.js?v=1.3.7';

function pathFromPoints(points) {
  if (!Array.isArray(points) || !points.length) return '';
  return `${points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')} Z`;
}

function escapeXml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function polylinePoints(row) {
  const points=Array.isArray(row?.coordinates)&&row.coordinates.length>=2?row.coordinates:[row?.start,row?.end];
  return points.filter(point=>Array.isArray(point)&&point.length>=2).map(([x,y])=>`${Number(x).toFixed(2)},${Number(y).toFixed(2)}`).join(' ');
}

function placeholder() {
  return '<svg viewBox="0 0 760 360" role="img" aria-label="Schema vigneto"><rect width="760" height="360" rx="18" fill="#f4f6f3"/><text x="380" y="185" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#68736b">Perimetro non disponibile</text></svg>';
}

export function renderProjectDiagramSvg({ mapModel, polygon, rows = [], exclusions = [], mode = 'technical', width=760, height=360, padding=34 } = {}) {
  const sourceModel = mapModel ?? buildReportMapModel({ polygon, rows, exclusions, width, height, padding });
  // Detailed external annotations are a print concern; field-list thumbnails
  // keep the inexpensive, non-throwing projection used before this release.
  const model = mode === 'technical-print' ? buildTechnicalReportMapModel(sourceModel) : sourceModel;
  if (!model?.valid) return placeholder();

  const overlay = mode === 'overlay';
  ({width,height}=model);
  const rootClass = overlay ? 'map-overlay' : 'technical-diagram';
  const background = overlay ? '' : `<rect class="technical-background" width="${width}" height="${height}" rx="18" fill="#eef2ed"/>`;
  const defs = '<defs><pattern id="excluded-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#8f5a49" stroke-width="3" opacity=".5"/></pattern></defs>';
  const parcel = `<path class="parcel" d="${pathFromPoints(model.polygon)}"/>`;
  const rowLines = model.rows.map((row) => `<polyline class="vine-row" points="${polylinePoints(row)}" fill="none"/>`).join('');
  const exclusionShapes = model.exclusions.map((item) => {
    const geometry=reportExclusionGeometry(item),grouped=geometry.type==='MultiPolygon';
    // Retain full projected numbers for opted-in cycles; fixed decimal rounding
    // could collapse a small physical hole or component into its neighbour.
    const path=grouped?geometry.coordinates.flat().map(ring=>`${ring.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join(' ')} Z`).join(' '):pathFromPoints(item.points);
    return `<path class="${item.type === 'linear' ? 'linear-passage' : 'excluded-area'}" d="${path}"${grouped?' fill-rule="evenodd"':''}/>`;
  }).join('');
  const annotations=model.annotations??model.sideMeasurements.map(side=>({point:side.point,label:side.label,fontSize:13,box:{width:Math.max(44,String(side.label).length*8.3+18),height:26}}));
  const leaders=annotations.filter(item=>item.leader).map(({leader:[a,b]})=>`<line class="side-leader" x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}"/>`).join('');
  const labels = annotations.map(({point:[x,y],label,box,fontSize}) => {
    return `<g class="side-label" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><rect x="${(-box.width/2).toFixed(2)}" y="${(-box.height/2).toFixed(2)}" width="${box.width.toFixed(2)}" height="${box.height.toFixed(2)}" rx="${mode==='technical-print'?5:13}"/><text x="0" y="${mode==='technical-print'?(fontSize*.35).toFixed(2):5}" style="font-size:${fontSize}px" text-anchor="middle">${escapeXml(label)}</text></g>`;
  }).join('');
  const north = `<g class="north" transform="translate(${width - 48} 38)"><text x="0" y="0" text-anchor="middle">N</text><path d="M0 8 L11 36 L0 29 L-11 36 Z"/></g>`;

  return `<svg class="${rootClass}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${overlay ? 'Sovrapposizione cartografica del progetto' : 'Schema tecnico del progetto vigneto'}" xmlns="http://www.w3.org/2000/svg">${defs}${background}${parcel}${exclusionShapes}${rowLines}${leaders}${labels}${north}<style>
    .${rootClass} .parcel{fill:${overlay ? 'none' : '#dce8d7'};stroke:${overlay ? '#f7f4cd' : '#355f45'};stroke-width:${overlay ? '2.2' : '2.6'};vector-effect:non-scaling-stroke}
    .${rootClass} .vine-row{stroke:${overlay ? '#fffbd4' : '#8b7d45'};stroke-width:${overlay ? '1.8' : '1.35'};opacity:.94;vector-effect:non-scaling-stroke}
    .${rootClass} .excluded-area{fill:${overlay ? 'rgba(141,55,38,.32)' : 'url(#excluded-hatch)'};stroke:${overlay ? '#ffd6cb' : '#8f5a49'};stroke-width:1.8;vector-effect:non-scaling-stroke}
    .${rootClass} .linear-passage{fill:${overlay ? 'rgba(255,255,255,.22)' : '#faf7eb'};stroke:${overlay ? '#ffffff' : '#7a7152'};stroke-width:1.8;stroke-dasharray:6 4;vector-effect:non-scaling-stroke}
    .${rootClass} .side-leader{stroke:#355f45;stroke-width:1;vector-effect:non-scaling-stroke}
    .${rootClass} .side-label rect{fill:${overlay ? 'rgba(255,255,255,.94)' : '#ffffff'};stroke:${overlay ? 'rgba(24,63,40,.3)' : '#cbd5cc'};stroke-width:1}
    .${rootClass} .side-label text,.${rootClass} .north{font-family:Arial,sans-serif;fill:#183f28;font-size:13px;font-weight:700}
    .${rootClass} .north text{font-size:16px}.${rootClass} .north path{fill:#183f28}
  </style></svg>`;
}
