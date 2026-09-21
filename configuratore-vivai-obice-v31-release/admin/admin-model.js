function text(value) { return String(value ?? '').trim().toLowerCase(); }

export function filterProjects(projects, filters = {}) {
  const environment = text(filters.environment);
  const status = text(filters.status);
  const grapeVariety = text(filters.grapeVariety);
  const company = text(filters.company);
  const zone = text(filters.zone);
  const rootstock = text(filters.rootstock);
  const contextType = text(filters.contextType);
  const ownerKind = text(filters.ownerKind);
  const origin = text(filters.origin);
  const campaignYear = Number(filters.campaignYear) || 0;
  const minPlants = Number(filters.minPlants) || 0;
  const minArea = Number(filters.minArea) || 0;
  const createdFrom = filters.createdFrom ? new Date(`${filters.createdFrom}T00:00:00`).getTime() : null;
  const createdTo = filters.createdTo ? new Date(`${filters.createdTo}T23:59:59.999`).getTime() : null;
  return (projects ?? []).filter((project) => {
    if (!filters.includeDeleted && project.deleted_at) return false;
    if (environment && text(project.environment) !== environment) return false;
    if (status && text(project.status) !== status) return false;
    if (grapeVariety && !text(project.grape_variety).includes(grapeVariety)) return false;
    if (company && !text(project.company_name).includes(company)) return false;
    const geographicText = [project.location_label, project.municipality, project.province, project.region].map(text).join(' ');
    if (zone && !geographicText.includes(zone)) return false;
    if (rootstock && !text(project.rootstock).includes(rootstock)) return false;
    if (contextType && text(project.project_context_type) !== contextType) return false;
    if (ownerKind && text(project.owner_kind) !== ownerKind) return false;
    if (origin && text(project.origin) !== origin) return false;
    if (campaignYear && Number(project.campaign_year) !== campaignYear) return false;
    if ((Number(project.commercial_plants_25) || 0) < minPlants) return false;
    if ((Number(project.gross_area_m2) || 0) < minArea) return false;
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
  return {
    type:'FeatureCollection',
    features:(projects ?? []).filter((project) => project?.geometry?.type === 'Polygon' && Array.isArray(project.geometry.coordinates)).map((project) => ({
      type:'Feature',
      id:project.id,
      properties:{
        projectId:project.id,
        publicCode:project.public_code ?? '',
        status:project.status ?? '',
        company:project.company_name ?? project.contacts?.company_name ?? ''
      },
      geometry:project.geometry
    }))
  };
}
