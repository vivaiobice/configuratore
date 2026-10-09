import {createCountsGateway,createCountsTransport} from './counts-client.js?v=1.3.5';
import {COUNTS_CONFIG} from '../conteggi/config.js?v=1.3.5';

export function createDesktopCountsGateway({client,ownerId,environment,backendUrl,syncEnabled=false,noticeVersion=COUNTS_CONFIG.noticeVersion,store,channel}={}){
  if(!ownerId||!environment||!backendUrl)throw new TypeError('Identità e ambiente Conteggi richiesti.');
  const transport=syncEnabled?createCountsTransport({client,environment}):null;
  return createCountsGateway({scope:{backend:backendUrl,environment,owner:ownerId},transport,noticeVersion,
    canSyncWithoutNotice:async scope=>{const session=(await client.auth.getSession())?.data?.session;return session?.user?.id===scope.owner&&session.user.is_anonymous===false;},
    ...(store?{store}:{}),...(channel===undefined?{}:{channel})});
}
