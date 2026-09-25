import { isValidProjectStatus } from './admin-model.js';

const PROJECT_SELECT = [
  'id','owner_user_id','client_project_id','public_code','name','campaign_year','origin','owner_kind','version','latest_revision_number','deleted_at',
  'geometry','created_at','updated_at','environment','status','source_type','cadastral_refs',
  'location_label','municipality','province','region',
  'gross_area_m2','net_area_m2','perimeter_m','vertex_count','row_spacing_m','plant_spacing_m',
  'row_orientation_deg','headland_width_m','commercial_plants_25','row_count','row_linear_m',
  'post_spacing_m','head_posts','intermediate_posts','total_posts','mechanization','project_context_type',
  'project_context_note','grape_variety','rootstock','clone_selection','field_plans','active_field_id','contact_id',
  'contacts(id,company_name,first_name,last_name,phone,email,marketing_consent)',
  'quote_requests(id,status,message,created_at)'
].join(',');

export function createAdminService(client) {
  if (!client) throw new TypeError('Supabase client required');

  return {
    async restoreProject(operationId, projectId) {
      const result=await client.rpc('restore_project',{p_operation_id:operationId,p_project_id:projectId});
      if(result.error) throw result.error;
      return result.data;
    },

    async restoreRevision(operationId, projectId, revisionNumber) {
      const result=await client.rpc('restore_project_revision',{
        p_operation_id:operationId,p_project_id:projectId,p_revision_number:revisionNumber
      });
      if(result.error) throw result.error;
      return result.data;
    },
    async loadProjects() {
      const result = await client.from('projects')
        .select(PROJECT_SELECT)
        .order('created_at', { ascending:false })
        .limit(500);
      if (result.error) throw result.error;
      return result.data ?? [];
    },

    async loadProfiles() {
      const result=await client.from('profiles')
        .select('user_id,display_name,username,owner_kind,created_at,last_seen_at')
        .order('display_name',{ascending:true});
      if(result.error)throw result.error;
      return result.data ?? [];
    },

    async updateProjectStatus(projectId, status) {
      if (!isValidProjectStatus(status)) throw new TypeError('Invalid project status');
      const result = await client.from('projects')
        .update({ status, updated_at:new Date().toISOString() })
        .eq('id', projectId)
        .select('id,status')
        .single();
      if (result.error) throw result.error;
      return result.data;
    },

    async loadNotes(projectId) {
      const result = await client.from('admin_notes')
        .select('id,project_id,author_id,body,created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending:false });
      if (result.error) throw result.error;
      return result.data ?? [];
    },

    async addNote(projectId, authorId, body) {
      const clean = String(body ?? '').trim();
      if (!clean) throw new TypeError('Internal note required');
      const result = await client.from('admin_notes')
        .insert({ project_id:projectId, author_id:authorId, body:clean })
        .select('id,project_id,author_id,body,created_at')
        .single();
      if (result.error) throw result.error;
      return result.data;
    }
  };
}
