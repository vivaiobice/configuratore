import {APP_CONFIG} from '../src/config.js?v=counts2';
// Replace these values only in the coordinated release. Browser flags never grant server permission.
export const COUNTS_CONFIG=Object.freeze({
 environment:APP_CONFIG.environment,backendUrl:APP_CONFIG.supabaseUrl,
 countsBaseUrl:new URL('./',import.meta.url).href,configuratorBaseUrl:new URL('../',import.meta.url).href,
 syncEnabled:false,adminEnabled:false,submitEnabled:false,noticeVersion:null
});
