const STATUS_LABELS={draft:'Bozza',saved:'Salvato',pdf_downloaded:'PDF scaricato',quote_requested:'Preventivo richiesto',contacted:'Contattato',client:'Cliente'};
const number=value=>(Number(value)||0).toLocaleString('it-IT',{useGrouping:true});
const area=value=>`${Math.round(Number(value)||0).toLocaleString('it-IT')} m²`;
const date=value=>value?new Date(value).toLocaleDateString('it-IT'):'—';
const lifecycle=value=>value==='planted'?'Impianto realizzato / archivio storico':'Da realizzare';

const COLUMNS={
  fields:[
    ['Data progetto',row=>date(row.projectDate)],['Nome progetto',row=>row.projectName||'—'],['Numero progetto',row=>row.projectCode||'—'],
    ['Cliente',row=>row.client||'—'],['Località impianto',row=>row.location||row.municipality||'—'],['Anno',row=>row.year||'—'],
    ['Stato impianto',row=>lifecycle(row.plantingStatus)],['Vitigno',row=>row.grapeVariety||'—'],['Clone',row=>row.cloneSelection||'—'],
    ['Portainnesto',row=>row.rootstock||'—'],['Superficie',row=>area(row.areaM2)],['Barbatelle calcolate',row=>number(row.calculatedPlants)],
    ['Quantità commerciale',row=>number(row.commercialPlants)]
  ],
  projects:[
    ['Data',row=>date(row.date)],['Numero progetto',row=>row.code||'—'],['Nome progetto',row=>row.name||'—'],['Azienda / cliente',row=>row.client||'—'],
    ['Stato',row=>STATUS_LABELS[row.status]||row.status||'—'],['Campi',row=>number(row.fieldCount)],['Superficie totale',row=>area(row.areaM2)],
    ['Piante commerciali',row=>number(row.commercialPlants)],['Preventivo',row=>row.quoteRequested?(row.quoteNumber||'Richiesto · numero da assegnare'):'No']
  ],
  clients:[
    ['Cliente / utente',row=>row.displayName||'—'],['E-mail',row=>row.email||'—'],['Telefono',row=>row.phone||'—'],
    ['Progetti',row=>number(row.projectCount)],['Campi',row=>number(row.fieldCount)],['Superficie totale',row=>area(row.areaM2)],
    ['Barbatelle totali',row=>number(row.commercialPlants)],['Da piantare',row=>number(row.plantsToPlant)]
  ]
};

const TITLES={fields:'Campi',projects:'Progetti',clients:'Clienti / Utenti'};

export function createAdminViews({document=globalThis.document,onSelect=()=>{}}={}){
  if(!document)throw new TypeError('Document required');
  const head=document.querySelector('#admin-table-head'),body=document.querySelector('#admin-table-body');
  const detail=document.querySelector('#admin-detail'),detailTitle=document.querySelector('#detail-title'),detailGrid=document.querySelector('#detail-grid');
  const detailChildren=document.querySelector('#detail-children');
  let selectedRowId='';

  function detailItem(label,value){
    const box=document.createElement('div'),name=document.createElement('span'),data=document.createElement('strong');
    name.textContent=label;data.textContent=value??'—';box.append(name,data);return box;
  }

  function clearDetail(){selectedRowId='';if(detail)detail.hidden=true;if(detailGrid)detailGrid.replaceChildren();if(detailChildren)detailChildren.replaceChildren();}

  function renderSection(kind,rows=[]){
    const columns=COLUMNS[kind]??COLUMNS.fields;
    const title=document.querySelector('#admin-list-title');if(title)title.textContent=TITLES[kind]??'Archivio';
    if(head){const tr=document.createElement('tr');for(const [label] of columns){const th=document.createElement('th');th.textContent=label;tr.append(th);}head.replaceChildren(tr);}
    if(body){body.replaceChildren();for(const row of rows){const tr=document.createElement('tr');tr.dataset.rowId=row.rowId;tr.classList.toggle('selected',row.rowId===selectedRowId);for(const [,format] of columns){const td=document.createElement('td');td.textContent=format(row);tr.append(td);}tr.addEventListener('click',()=>onSelect(kind,row));body.append(tr);}}
    if(selectedRowId&&!rows.some(row=>row.rowId===selectedRowId))clearDetail();
  }

  function renderFieldChildren(fields=[]){
    if(!detailChildren)return;
    detailChildren.replaceChildren();
    if(!fields.length)return;
    const title=document.createElement('h3');title.textContent='Campi del progetto';detailChildren.append(title);
    for(const field of fields){const button=document.createElement('button');button.type='button';button.className='admin-child-field';button.textContent=`${field.label} · ${area(field.areaM2)} · ${lifecycle(field.plantingStatus)}`;button.addEventListener('click',()=>onSelect('fields',field));detailChildren.append(button);}
  }

  function renderDetail(kind,row){
    if(!row||!detail||!detailGrid)return;
    selectedRowId=row.rowId;detail.hidden=false;detailGrid.replaceChildren();if(detailChildren)detailChildren.replaceChildren();
    const actions=document.querySelector('.admin-project-actions');if(actions)actions.hidden=kind!=='projects';
    if(kind==='fields'){
      detailTitle.textContent=`${row.label||'Campo'} · ${row.projectCode||row.projectName||'Progetto'}`;
      detailGrid.append(
        detailItem('Progetto',row.projectName),detailItem('Codice progetto',row.projectCode),detailItem('Cliente',row.client),
        detailItem('Località impianto',row.location||row.municipality||'—'),detailItem('Anno',row.year||'—'),detailItem('Stato impianto',lifecycle(row.plantingStatus)),
        detailItem('Superficie',area(row.areaM2)),detailItem('Perimetro',`${number(row.perimeterM)} m`),detailItem('Filari',number(row.rowCount)),
        detailItem('Metri lineari',`${number(row.rowLinearM)} m`),detailItem('Barbatelle calcolate',number(row.calculatedPlants)),detailItem('Quantità commerciale',number(row.commercialPlants)),
        detailItem('Vitigno',row.grapeVariety||'Da definire'),detailItem('Clone / selezione',row.cloneSelection||'Da definire'),detailItem('Portainnesto',row.rootstock||'Da definire'),
        detailItem('Richiesta materiale',row.field?.materialRequestNote||'—'),
        detailItem('Pali di testa',number(row.headPosts)),detailItem('Pali intermedi',number(row.intermediatePosts)),detailItem('Pali totali',number(row.totalPosts)),
        detailItem('Geometria',row.geometryValid?'Disponibile':'Geometria non disponibile')
      );
    }else if(kind==='projects'){
      detailTitle.textContent=`${row.name||'Progetto'} · ${row.code||'—'}`;
      detailGrid.append(detailItem('Cliente',row.client),detailItem('Stato CRM',STATUS_LABELS[row.status]||row.status),detailItem('Campi',number(row.fieldCount)),
        detailItem('Superficie totale',area(row.areaM2)),detailItem('Piante commerciali',number(row.commercialPlants)),detailItem('Preventivo',row.quoteRequested?(row.quoteNumber||'Richiesto · numero da assegnare'):'No'));
      renderFieldChildren(row.fields);
    }else{
      detailTitle.textContent=row.displayName||'Cliente';
      detailGrid.append(detailItem('E-mail',row.email||'—'),detailItem('Telefono',row.phone||'—'),detailItem('Località',row.city||'—'),detailItem('Provincia',row.province||'—'),
        detailItem('Progetti',number(row.projectCount)),detailItem('Campi',number(row.fieldCount)),detailItem('Superficie totale',area(row.areaM2)),
        detailItem('Barbatelle totali',number(row.commercialPlants)),detailItem('Barbatelle da piantare',number(row.plantsToPlant)));
      renderFieldChildren(row.fields);
    }
    detail.scrollIntoView?.({behavior:'smooth',block:'start'});
  }

  return {renderSection,renderDetail,clearDetail};
}
