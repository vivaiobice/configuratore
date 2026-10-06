import {buildTerrainProposal} from './terrain-design.js?v=1.3.1-prova.1';
self.onmessage=event=>self.postMessage(buildTerrainProposal(event.data));
