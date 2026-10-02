import {APP_CONFIG} from '../src/config.js?v=1.2.3';
// Replace these values only in the coordinated release. Browser flags never grant server permission.
export const COUNTS_CONFIG=Object.freeze({
 version:APP_CONFIG.version,environment:APP_CONFIG.environment,backendUrl:APP_CONFIG.supabaseUrl,
 countsBaseUrl:new URL('./',import.meta.url).href,configuratorBaseUrl:new URL('../',import.meta.url).href,
 syncEnabled:false,adminEnabled:false,submitEnabled:false,guestTransferEnabled:false,noticeVersion:null
});
