import {createCountsGateway,createCountsTransport} from './counts-client.js?v=1.2.4';

export function createDesktopCountsGateway({client,ownerId,environment,backendUrl,syncEnabled=false,store,channel}={}){
  if(!ownerId||!environment||!backendUrl)throw new TypeError('Identità e ambiente Conteggi richiesti.');
  const transport=syncEnabled?createCountsTransport({client,environment}):null;
  return createCountsGateway({scope:{backend:backendUrl,environment,owner:ownerId},transport,
    ...(store?{store}:{}),...(channel===undefined?{}:{channel})});
}
