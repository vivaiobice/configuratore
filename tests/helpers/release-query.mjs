import {APP_CONFIG} from '../../src/config.js';

const escaped=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Active application entrypoints follow the canonical release. Stable asset
// revisions (styles, icons, manifests and unchanged modules) stay explicit.
export function releaseQuery(asset){return new RegExp(`${escaped(asset)}\\?v=${escaped(APP_CONFIG.version)}(?=[&"'\\s]|$)`);}
