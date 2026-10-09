import {APP_CONFIG} from '../src/config.js?v=1.3.6';
// Coordinated cloud release. Browser flags never grant server permission.
export const COUNTS_CONFIG=Object.freeze({
 version:APP_CONFIG.version,environment:APP_CONFIG.environment,backendUrl:APP_CONFIG.supabaseUrl,
 countsBaseUrl:new URL('./',import.meta.url).href,configuratorBaseUrl:new URL('../',import.meta.url).href,
 syncEnabled:true,adminEnabled:false,submitEnabled:true,guestTransferEnabled:true,noticeVersion:'counts-v1-2026-10-09'
});
