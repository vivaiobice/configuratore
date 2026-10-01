import {handleCadastralParcels} from '../_shared/cadastral-parcels.js';
// Public cartography only. The application key is checked here because the
// Supabase publishable key is not a JWT. No database or user data are accessed.
Deno.serve(request=>handleCadastralParcels(request,{allowedKeys:[Deno.env.get('SUPABASE_ANON_KEY'),'sb_publishable_ElSTuv9KWcsPgh6pJAA0KA_ww3LxrPo']}));
