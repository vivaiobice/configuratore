function text(value) { return String(value ?? '').trim().toLowerCase(); }

function finite(...values) {
  for (const value of values) {
    if (value === '' || value === null || value === undefined) continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function ringFrom(value) {
  if (Array.isArray(value)) return value;
  return value?.type === 'Polygon' ? value.coordinates?.[0] ?? null : null;
}

function validRing(value) {
  const ring = ringFrom(value);
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return ring.every((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])));
}

function contactLabel(project) {
  const contact = project?.contacts ?? {};
  return String(contact.company_name ?? project?.company_name ?? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`).trim() || 'Da definire';
}

function fieldMetric(field, project, ...names) {
  const snake = {
    areaM2:'gross_area_m2', netAreaM2:'net_area_m2', simulatedPlants:'simulated_plants',
    commercialPlants25:'commercial_plants_25', perimeterM:'perimeter_m', rowCount:'row_count',
    rowLinearM:'row_linear_m', headPosts:'head_posts', intermediatePosts:'intermediate_posts', totalPosts:'total_posts'
  };
  const values = [];
  for (const name of names) values.push(field?.metrics?.[name], field?.[name], field?.[snake[name]]);
  if (!Array.isArray(project?.field_plans) || project.field_plans.length === 0) {
    for (const name of names) values.push(project?.[snake[name]], project?.[name]);
  }
  return finite(...values);
}

function legacyField(project) {
  const ring = ringFrom(project?.geometry);
  return {
    id:project?.active_field_id || 'legacy-field', label:'Campo', geometry:ring,
    plantingStatus:'planned', locationLabel:project?.location_label ?? '', municipality:project?.municipality ?? '',
    province:project?.province ?? '', region:project?.region ?? '', campaignYear:project?.campaign_year,
    grapeVariety:project?.grape_variety ?? '', cloneSelection:project?.clone_selection ?? '', rootstock:project?.rootstock ?? '',
    metrics:{
      areaM2:finite(project?.gross_area_m2), netAreaM2:finite(project?.net_area_m2), perimeterM:finite(project?.perimeter_m),
      simulatedPlants:finite(project?.simulated_plants), commercialPlants25:finite(project?.commercial_plants_25),
      rowCount:finite(project?.row_count), rowLinearM:finite(project?.row_linear_m), headPosts:finite(project?.head_posts),
      intermediatePosts:finite(project?.intermediate_posts), totalPosts:finite(project?.total_posts)
    }
  };
}

export function expandProjectFields(projects = []) {
  const rows = [];
  for (const project of projects ?? []) {
    if (project?.deleted_at) continue;
    let fields = Array.isArray(project?.field_plans) ? project.field_plans : [];
    if (!fields.length && validRing(project?.geometry)) fields = [legacyField(project)];
    fields.forEach((field, index) => {
      const id = String(field?.id ?? field?.clientFieldId ?? `field-${index + 1}`);
      const plantingStatus = field?.plantingStatus === 'planted' ? 'planted' : 'planned';
      const year = finite(field?.campaignYear, field?.plantingYear, project?.campaign_year) || null;
      const label = String(field?.label ?? `Campo ${index + 1}`).trim() || `Campo ${index + 1}`;
      const municipality = String(field?.municipality || project?.municipality || '').trim();
      const location = String(field?.locationLabel || municipality || project?.location_label || '').trim();
      const client = contactLabel(project);
      const row = {
        rowId:`${project.id}:${id}`, projectId:String(project.id), fieldId:id, index, project, field,
        projectDate:project.created_at ?? null, projectName:project.name ?? 'Progetto', projectCode:project.public_code ?? '',
        client, location, municipality, province:field?.province ?? project?.province ?? '', year, plantingStatus,
        label, grapeVariety:field?.grapeVariety ?? project?.grape_variety ?? '', cloneSelection:field?.cloneSelection ?? project?.clone_selection ?? '',
        rootstock:field?.rootstock ?? project?.rootstock ?? '', areaM2:fieldMetric(field,project,'areaM2'),
        netAreaM2:fieldMetric(field,project,'netAreaM2','areaM2'), calculatedPlants:fieldMetric(field,project,'simulatedPlants'),
        commercialPlants:fieldMetric(field,project,'commercialPlants25'), perimeterM:fieldMetric(field,project,'perimeterM'),
        rowCount:fieldMetric(field,project,'rowCount'), rowLinearM:fieldMetric(field,project,'rowLinearM'),
        headPosts:fieldMetric(field,project,'headPosts'), intermediatePosts:fieldMetric(field,project,'intermediatePosts'),
        totalPosts:fieldMetric(field,project,'totalPosts'), geometry:ringFrom(field?.geometry), geometryValid:validRing(field?.geometry),
        environment:project.environment ?? '', status:project.status ?? '', ownerKind:project.owner_kind ?? '', origin:project.origin ?? ''
      };
      row.searchText = [row.projectCode,row.projectName,row.label,row.client,row.location,row.municipality,row.province,row.grapeVariety,row.cloneSelection,row.rootstock].map(text).join(' ');
      rows.push(row);
    });
  }
  return rows;
}

export function buildAdminProjects(projects = []) {
  const fieldRows = expandProjectFields(projects);
  return (projects ?? []).filter((project) => !project.deleted_at).map((project) => {
    const fields = fieldRows.filter((field) => field.projectId === String(project.id));
    const quotes = Array.isArray(project.quote_requests) ? project.quote_requests : [];
    const quote = quotes.find((item) => item.quote_number) ?? quotes[0] ?? null;
    const row = {
      rowId:String(project.id), projectId:String(project.id), project, fields,
      date:project.created_at ?? null, code:project.public_code ?? '', name:project.name ?? 'Progetto', client:contactLabel(project),
      status:project.status ?? 'draft', fieldCount:fields.length, areaM2:fields.reduce((sum,field)=>sum+field.areaM2,0),
      commercialPlants:fields.reduce((sum,field)=>sum+field.commercialPlants,0), quoteRequested:quotes.length>0 || Boolean(project.quote_requested),
      quoteNumber:quote?.quote_number ?? '', environment:project.environment ?? '', ownerKind:project.owner_kind ?? '', origin:project.origin ?? '',
      year:finite(project.campaign_year) || null
    };
    row.searchText=[row.code,row.name,row.client,row.status,row.quoteNumber].map(text).join(' ');
    return row;
  });
}

export function buildAdminClients(projects = [], profiles = []) {
  const profilesByOwner = new Map((profiles ?? []).map((profile) => [String(profile.user_id),profile]));
  const groups = new Map();
  for (const project of projects ?? []) {
    if (project?.deleted_at) continue;
    const contact = project.contacts ?? {};
    const ownerId = String(project.owner_user_id ?? '');
    const email = text(contact.email);
    const key = ownerId && profilesByOwner.has(ownerId) ? `owner:${ownerId}` : email ? `email:${email}` : `contact:${project.contact_id ?? project.id}`;
    if (!groups.has(key)) groups.set(key,{key,profile:profilesByOwner.get(ownerId)??null,contact,projects:[]});
    groups.get(key).projects.push(project);
  }
  return [...groups.values()].map((group) => {
    const fields = expandProjectFields(group.projects);
    const profile = group.profile ?? {}, contact = group.contact ?? {};
    const displayName = String(profile.company_name ?? contact.company_name ?? profile.display_name ?? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`).trim() || 'Cliente';
    const row = {
      rowId:group.key, key:group.key, profile, contact, projects:group.projects, fields, displayName,
      email:profile.email ?? contact.email ?? '', phone:profile.phone ?? contact.phone ?? '', city:profile.city ?? '', province:profile.province ?? '',
      projectCount:group.projects.length, fieldCount:fields.length, areaM2:fields.reduce((sum,field)=>sum+field.areaM2,0),
      commercialPlants:fields.reduce((sum,field)=>sum+field.commercialPlants,0),
      plantsToPlant:fields.filter((field)=>field.plantingStatus==='planned').reduce((sum,field)=>sum+field.commercialPlants,0)
    };
    row.searchText=[row.displayName,row.email,row.phone,row.city,row.province].map(text).join(' ');
    return row;
  });
}

export function summarizeAdministration(projects = [], profiles = []) {
  const fields = expandProjectFields(projects);
  const projectRows = buildAdminProjects(projects);
  const clients = buildAdminClients(projects,profiles);
  return {
    totalProjects:projectRows.length, totalFields:fields.length, quoteRequests:projectRows.filter((row)=>row.quoteRequested).length,
    totalClients:clients.length, plantsToPlant:fields.filter((field)=>field.plantingStatus==='planned').reduce((sum,field)=>sum+field.commercialPlants,0),
    archiveAreaM2:fields.reduce((sum,field)=>sum+field.areaM2,0)
  };
}

export function filterAdminRows(rows = [], filters = {}) {
  const query = text(filters.query);
  const lifecycle = text(filters.plantingStatus);
  const environment = text(filters.environment), status = text(filters.status), ownerKind = text(filters.ownerKind), origin = text(filters.origin);
  const yearFrom = finite(filters.yearFrom), yearTo = finite(filters.yearTo), minArea = finite(filters.minArea), minPlants = finite(filters.minPlants);
  return (rows ?? []).filter((row) => {
    if (query && !text(row.searchText).includes(query) && !query.split(/\s+/).every((part)=>text(row.searchText).includes(part))) return false;
    if (lifecycle && text(row.plantingStatus)!==lifecycle) return false;
    if (environment && text(row.environment)!==environment) return false;
    if (status && text(row.status)!==status) return false;
    if (ownerKind && text(row.ownerKind)!==ownerKind) return false;
    if (origin && text(row.origin)!==origin) return false;
    if (yearFrom && finite(row.year)<yearFrom) return false;
    if (yearTo && finite(row.year)>yearTo) return false;
    if (minArea && finite(row.areaM2)<minArea) return false;
    if (minPlants && finite(row.commercialPlants)<minPlants) return false;
    return true;
  });
}

export function filterProjects(projects, filters = {}) {
  const environment = text(filters.environment);
  const status = text(filters.status);
  const grapeVariety = text(filters.grapeVariety);
  const company = text(filters.company);
  const zone = text(filters.zone);
  const rootstock = text(filters.rootstock);
  const contextType = text(filters.contextType);
  const ownerKind = text(filters.ownerKind);
  const ownerUserId = String(filters.ownerUserId ?? '').trim();
  const origin = text(filters.origin);
  const campaignYear = Number(filters.campaignYear) || 0;
  const minPlants = Number(filters.minPlants) || 0;
  const minArea = Number(filters.minArea) || 0;
  const createdFrom = filters.createdFrom ? new Date(`${filters.createdFrom}T00:00:00`).getTime() : null;
  const createdTo = filters.createdTo ? new Date(`${filters.createdTo}T23:59:59.999`).getTime() : null;
  return (projects ?? []).filter((project) => {
    const fieldRows=expandProjectFields([project]);
    const fieldText=(property)=>fieldRows.map((row)=>text(row[property])).join(' ');
    const totalPlants=fieldRows.length?fieldRows.reduce((sum,row)=>sum+row.commercialPlants,0):(Number(project.commercial_plants_25)||0);
    const totalArea=fieldRows.length?fieldRows.reduce((sum,row)=>sum+row.areaM2,0):(Number(project.gross_area_m2)||0);
    if (!filters.includeDeleted && project.deleted_at) return false;
    if (environment && text(project.environment) !== environment) return false;
    if (status && text(project.status) !== status) return false;
    if (grapeVariety && ![text(project.grape_variety),fieldText('grapeVariety')].join(' ').includes(grapeVariety)) return false;
    if (company && ![text(project.company_name),text(contactLabel(project))].join(' ').includes(company)) return false;
    const geographicText = [project.location_label, project.municipality, project.province, project.region,fieldText('location'),fieldText('municipality'),fieldText('province')].map(text).join(' ');
    if (zone && !geographicText.includes(zone)) return false;
    if (rootstock && ![text(project.rootstock),fieldText('rootstock')].join(' ').includes(rootstock)) return false;
    if (contextType && text(project.project_context_type) !== contextType) return false;
    if (ownerKind && text(project.owner_kind) !== ownerKind) return false;
    if (ownerUserId && String(project.owner_user_id ?? '') !== ownerUserId) return false;
    if (origin && text(project.origin) !== origin) return false;
    if (campaignYear && Number(project.campaign_year) !== campaignYear && !fieldRows.some((row)=>row.year===campaignYear)) return false;
    if (totalPlants < minPlants) return false;
    if (totalArea < minArea) return false;
    const createdAt = project.created_at ? new Date(project.created_at).getTime() : null;
    if (createdFrom && (!Number.isFinite(createdAt) || createdAt < createdFrom)) return false;
    if (createdTo && (!Number.isFinite(createdAt) || createdAt > createdTo)) return false;
    return true;
  });
}

export function summarizeProjects(projects) {
  const rows = projects ?? [];
  return {
    totalProjects: rows.length,
    quoteRequests: rows.filter((project) => project.quote_requested || project.status === 'quote_requested').length,
    clients: rows.filter((project) => project.status === 'client').length,
    totalPlants: rows.reduce((sum, project) => sum + (Number(project.commercial_plants_25) || 0), 0)
    ,guestProjects:rows.filter((project) => project.owner_kind === 'guest').length
    ,registeredProjects:rows.filter((project) => project.owner_kind === 'user').length
    ,fieldAreaProjects:rows.filter((project) => project.origin === 'fieldarea').length
    ,totalAreaM2:rows.reduce((sum,project) => sum + (Number(project.gross_area_m2) || 0),0)
  };
}

export const PROJECT_STATUSES = Object.freeze(['draft','saved','pdf_downloaded','quote_requested','contacted','client']);

export function isAdminUser(user) {
  return Boolean(user && !user.is_anonymous && user.app_metadata?.role === 'admin');
}

export function isValidProjectStatus(status) {
  return PROJECT_STATUSES.includes(String(status ?? ''));
}

export function projectsToFeatureCollection(projects) {
  const features=[];
  for(const project of projects ?? []){
    const common={
      projectId:project.id,
      publicCode:project.public_code ?? '',
      projectName:project.name ?? 'Progetto',
      status:project.status ?? '',
      company:project.company_name ?? project.contacts?.company_name ?? ''
    };
    const fields=(project.field_plans ?? []).filter((field)=>Array.isArray(field?.geometry)&&field.geometry.length>=4);
    if(fields.length){
      for(const field of fields)features.push({
        type:'Feature',id:`${project.id}:${field.id ?? features.length}`,
        properties:{...common,fieldId:field.id ?? '',fieldLabel:field.label ?? 'Campo',displayLabel:`${field.label ?? 'Campo'} · ${project.name ?? 'Progetto'}`},
        geometry:{type:'Polygon',coordinates:[field.geometry]}
      });
      continue;
    }
    if(project?.geometry?.type === 'Polygon' && Array.isArray(project.geometry.coordinates))features.push({
      type:'Feature',id:project.id,properties:{...common,fieldId:'',fieldLabel:'Campo',displayLabel:`Campo · ${project.name ?? 'Progetto'}`},geometry:project.geometry
    });
  }
  return {
    type:'FeatureCollection',
    features
  };
}
