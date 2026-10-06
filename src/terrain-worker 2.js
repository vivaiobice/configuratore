import {buildTerrainProposal} from './terrain-design.js?v=1.3.0';
self.onmessage=event=>self.postMessage(buildTerrainProposal(event.data));
