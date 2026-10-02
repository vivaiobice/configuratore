// A label-only projection for Conteggi. Never hydrate a design or geometry here.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const FIELD_HANDOFF_KEY='vivai-obice:conteggi:field-handoff:v1';
export function clearPendingFieldContext(storage){storage?.removeItem?.(FIELD_HANDOFF_KEY);}

export function writePendingFieldContext(storage,input,now=Date.now()){
  if(!input?.ownerId||!input?.environment||!input?.localProjectId||!input?.localFieldId)throw new TypeError('Campo locale e identità richiesti.');
  const record={version:1,ownerId:input.ownerId,environment:input.environment,
    localProjectId:input.localProjectId,localFieldId:input.localFieldId,
    projectLabel:String(input.projectLabel??'').slice(0,200),fieldLabel:String(input.fieldLabel??'').slice(0,200),
    varietyLabel:String(input.varietyLabel??'').slice(0,200),expiresAt:now+24*60*60*1000};
  storage.setItem(FIELD_HANDOFF_KEY,JSON.stringify(record));
  return record;
}

export function readPendingFieldContext(storage,ownerId,environment,now=Date.now()){
  try{
    const record=JSON.parse(storage?.getItem(FIELD_HANDOFF_KEY)||'null');
    return record?.version===1&&record.ownerId===ownerId&&record.environment===environment
      &&record.localProjectId&&record.localFieldId&&record.expiresAt>now?record:null;
  }catch{return null;}
}

export function fieldRouteParams({projectId,fieldId}={}){
  return projectId&&UUID.test(projectId)&&fieldId?{projectId,fieldId}:{};
}

export function createFieldDirectory({client,auth,environment}){
  if(!client?.from||!auth?.getState||!environment)throw new TypeError('Client, identità e ambiente richiesti.');
  const owner=()=>{
    const id=auth.getState()?.user?.id;
    if(!id)throw new Error('Identità non ancora disponibile.');
    return id;
  };
  async function checked(query,expectedOwner){
    const {data,error}=await query;
    if(owner()!==expectedOwner)throw new Error('Identità cambiata durante la consultazione.');
    if(error)throw error;
    return data??[];
  }
  const projects=id=>client.from('projects').select('id,name')
    .eq('owner_user_id',id).eq('environment',environment).is('deleted_at',null);
  const fields=(id,projectId)=>client.from('project_fields').select('project_id,client_field_id,label')
    .eq('owner_user_id',id).eq('project_id',projectId).is('deleted_at',null);
  async function listProjects(){
    const id=owner(),rows=await checked(projects(id).order('updated_at',{ascending:false}),id);
    return rows.map(row=>({projectId:row.id,projectLabel:row.name||'Progetto'}));
  }
  async function listFields(projectId){
    if(!UUID.test(projectId))return [];
    const id=owner(),projectRows=await checked(projects(id).eq('id',projectId),id);
    if(!projectRows.length)return [];
    const projectLabel=projectRows[0].name||'Progetto';
    const rows=await checked(fields(id,projectId).order('display_order',{ascending:true}),id);
    return rows.map(row=>({projectId,projectLabel,fieldId:row.client_field_id,fieldLabel:row.label||'Campo',associationStatus:'verified'}));
  }
  async function resolveField(projectId,fieldId){
    if(!fieldId)return null;
    return (await listFields(projectId)).find(row=>row.fieldId===fieldId)??null;
  }
  return Object.freeze({listProjects,listFields,resolveField});
}
