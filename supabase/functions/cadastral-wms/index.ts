import { handleCadastralWmsRequest } from '../_shared/cadastral-wms.js';

Deno.serve((request:Request) => handleCadastralWmsRequest(request));
