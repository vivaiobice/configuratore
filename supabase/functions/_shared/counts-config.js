// Public release defaults. Explicit environment flags remain server kill switches.
export function resolveCountsFlags(get){
 const enabled=(key,fallback)=>get(key)?get(key)==='true':fallback;
 return {
  sync:enabled('COUNTS_SYNC_ENABLED',true),admin:enabled('COUNTS_ADMIN_ENABLED',false),submit:enabled('COUNTS_SUBMIT_ENABLED',true),
  environment:get('COUNTS_ENVIRONMENT')||'LIVE',noticeVersion:get('COUNTS_NOTICE_VERSION')||'counts-v1-2026-10-09',
  allowedOrigins:(get('COUNTS_ALLOWED_ORIGINS')||'https://progettaimpianto.vivaiobice.com').split(',').map(value=>value.trim()).filter(Boolean),
  emailEnabled:Boolean(enabled('COUNTS_EMAIL_ENABLED',true)&&get('RESEND_API_KEY')&&get('QUOTE_EMAIL_FROM')),
  email:{from:get('QUOTE_EMAIL_FROM'),assetBase:get('CONFIGURATOR_BASE_URL')||'https://progettaimpianto.vivaiobice.com/'}
 };
}
