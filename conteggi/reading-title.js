const DETAIL_KEYS=Object.freeze({plants:['varietyLabel','rootstockLabel'],posts:['postType','postMaterial'],other:['componentType']});
const LEGACY_TITLES=Object.freeze({plants:'Barbatelle / Viti',posts:'Pali',other:'Altro'});
const COMPONENT_OPTIONS=new Set(['molle','tendifili','ancore','fili','tutori','legacci','distanziatori','altro']);
const TITLE_LIMIT=200,STATE_PREFIX='vivai-obice-counts-reading-title-v1:';
// Keep authorship available for this page session when browser storage is blocked.
const fallbackFlags=new Map();

const clean=value=>typeof value==='string'?value.trim():'';
function limitTitle(value){const chars=[...value];return chars.length>TITLE_LIMIT?chars.slice(0,TITLE_LIMIT-1).join('')+'…':value;}

export function displayDetailValue(key,value){
  const chars=[...clean(value)];
  return chars.length?chars[0].toLocaleUpperCase('it-IT')+chars.slice(1).join(''):'';
}

export function selectedDetailLines(record={}){
  return (DETAIL_KEYS[record.category]??[]).map(key=>displayDetailValue(key,record[key])).filter(Boolean).slice(0,2);
}

export function generatedReadingTitle(record={}){
  const details=selectedDetailLines(record);
  if(details.length)return limitTitle(['Conteggio',...details].join(' · '));
  return record.category==='other'?'Conteggio di…':record.category==='posts'?'Conteggio pali':'Conteggio barbatelle';
}

// Recognize exact locally generated 1.3.5 names without claiming authored cloud titles.
function legacyGeneratedReadingTitle(record={}){
  if(record.category==='other'){
    const component=clean(record.componentType),option=component.toLocaleLowerCase('it-IT');
    return limitTitle(component?`Conteggio di ${COMPONENT_OPTIONS.has(option)?option:component}`:'Conteggio di…');
  }
  const base=record.category==='posts'?'Conteggio pali':'Conteggio barbatelle';
  return limitTitle([base,...selectedDetailLines(record)].join(' · '));
}

function browserStorage(){try{return globalThis.localStorage??null;}catch{return null;}}
function flagKey(scope,record){
  return typeof scope==='string'&&scope&&typeof record?.countId==='string'&&record.countId?STATE_PREFIX+JSON.stringify([scope,record.countId]):null;
}
function validFlag(value){return value&&typeof value==='object'&&typeof value.automatic==='boolean'&&typeof value.title==='string';}

export function createReadingTitleState({storage=browserStorage()}={}){
  function read(key){
    if(!key)return null;
    try{
      const saved=storage?.getItem(key);
      if(saved){const flag=JSON.parse(saved);if(validFlag(flag)){fallbackFlags.set(key,flag);return flag;}}
    }catch{}
    return fallbackFlags.get(key)??null;
  }
  function mark(scope,record,automatic,title=record?.title){
    const key=flagKey(scope,record);if(!key)return;
    const flag={automatic,title:clean(title)};
    fallbackFlags.set(key,flag);
    try{storage?.setItem(key,JSON.stringify(flag));}catch{}
  }
  return {
    isAutomatic(scope,record){
      // Authorship travels with the reading across devices and guest adoption.
      if(record?.titleMode==='manual')return false;
      if(record?.titleMode==='auto')return true;
      const title=clean(record?.title),flag=read(flagKey(scope,record));
      // Exact title snapshots stop an old automatic marker from claiming a remote edit.
      // An explicit manual marker also protects a title identical to the generated one.
      if(flag)return flag.automatic&&flag.title===title;
      // Unmarked cloud rows may contain an authored default; only local legacy
      // defaults can safely opt into automatic naming without recorded intent.
      if(Number(record?.revision)>0)return false;
      return title===generatedReadingTitle(record)||title===legacyGeneratedReadingTitle(record)||title===LEGACY_TITLES[record?.category]||title==='Lettura';
    },
    markManual:(scope,record,title)=>mark(scope,record,false,title),
    markAutomatic:(scope,record,title)=>mark(scope,record,true,title)
  };
}
