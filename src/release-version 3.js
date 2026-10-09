import {APP_CONFIG} from './config.js?v=1.3.5';

// Read the coordinated release config at mount time; never duplicate its value in copy.
export function mountReleaseVersion({document=globalThis.document,config=APP_CONFIG}={}){
  const label=`${config.version} · ${config.environment}`;
  for(const node of document?.querySelectorAll('[data-release-version]')??[])node.textContent=label;
  return label;
}
