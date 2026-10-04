// Read-only numeric WCS probe in Chromium from a local application origin.
// This harness loads only the terrain provider, never the app or a signed-in SDK.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {X509Certificate,createHash} from 'node:crypto';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=process.env.TERRAIN_LIVE_OUTPUT??'/tmp/v130-live-terrain';
await mkdir(output,{recursive:true});
const requests=JSON.parse(await readFile(resolve(root,'tests/fixtures/terrain/requests.json'),'utf8'));
const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Numeric terrain probe</title>');return;}
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+'/'))throw Error('Invalid path');
  res.setHeader('Content-Type',extname(path)==='.js'?'application/javascript':'application/octet-stream');
  res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
let browser;const reports=[],failures=[],responses=[],consoleMessages=[];
try{
  const proxyUrl=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
  const proxy=proxyUrl?{server:proxyUrl.protocol+'//'+proxyUrl.hostname+':'+proxyUrl.port,bypass:'127.0.0.1,localhost',...(proxyUrl.username?{username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password)}:{})}:null;
  const args=['--no-sandbox','--disable-dev-shm-usage'];
  // Trust only the runtime's already configured CA in this ephemeral test
  // browser. Never disable certificate checks globally or change app settings.
  if(proxy&&process.env.SSL_CERT_FILE){
    const pem=await readFile(process.env.SSL_CERT_FILE,'utf8');
    const certs=pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)??[];
    const pins=certs.map(cert=>createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64'));
    if(pins.length)args.push('--ignore-certificate-errors-spki-list='+pins.join(','));
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH??'/tmp/v130-task5-chromium',args,...(proxy?{proxy}:{})});
  const page=await browser.newPage();
  const network=await page.context().newCDPSession(page);
  await network.send('Network.enable');
  network.on('Network.responseReceivedExtraInfo',event=>responses.push({rawStatus:event.statusCode,headers:event.headers}));
  page.on('requestfailed',request=>failures.push({origin:new URL(request.url()).origin,error:request.failure()?.errorText}));
  page.on('console',message=>{if(message.type()==='error')consoleMessages.push(message.text());});
  page.on('response',response=>{if(!response.url().startsWith(origin))responses.push({url:response.url(),status:response.status(),headers:response.headers()});});
  await page.goto(origin+'/');
  for(const fixture of requests.slice(0,2)){
    const result=await page.evaluate(async fixture=>{
      const {loadTerrainForField}=await import('/src/terrain-provider.js?v=1.3.0');
      const {fromUTM}=await import('/src/coordinate-system.js?v=1.3.0');
      const {validateTerrainModel,decodeTerrainGrid}=await import('/src/terrain-model.js?v=1.3.0');
      const started=performance.now();
      const model=await loadTerrainForField({polygon:fixture.fieldRing.map(point=>fromUTM(point)),signal:AbortSignal.timeout(45000)});
      const validation=validateTerrainModel(model),values=decodeTerrainGrid(model);
      return {sourceId:model.source.id,resolutionM:model.source.resolutionM,width:model.grid.width,height:model.grid.height,firstHeight:values[0],valid:validation.valid,contentHash:model.contentHash,elapsedMs:performance.now()-started};
    },fixture);
    const regionalFallback=fixture.resolutionM===5&&result.sourceId==='tinitaly-1.1';
    reports.push({fixture:fixture.file,origin,regionalFallback,...result});
    await writeFile(resolve(output,'summary.json'),JSON.stringify({reports,failures,responses,consoleMessages},null,2)+'\n');
    assert.equal(result.valid,true);
    const expected=regionalFallback?requests.find(item=>item.file==='piemonte-fallback-tinitaly-float32.tif'):fixture;
    assert.equal(result.resolutionM,expected.resolutionM);
    assert.equal(result.sourceId,expected.resolutionM===5?'piemonte-ice-dtm5':'tinitaly-1.1');
    assert.equal(result.firstHeight,expected.firstHeight);
  }
  await writeFile(resolve(output,'summary.json'),JSON.stringify({reports,regionalBrowserAvailable:reports[0].sourceId==='piemonte-ice-dtm5',failures,responses,consoleMessages},null,2)+'\n');
  console.log(JSON.stringify(reports,null,2));
}catch(error){await writeFile(resolve(output,'failure.json'),JSON.stringify({message:error.message,reports,failures,responses,consoleMessages},null,2)+'\n');console.log(JSON.stringify({failures,consoleMessages}));throw error;}
finally{await browser?.close();await new Promise(done=>server.close(done));}
