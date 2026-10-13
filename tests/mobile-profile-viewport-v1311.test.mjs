import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Opt in with MOBILE_PROFILE_BROWSER=1. This exercises real shipped markup and
// stylesheet order without requiring a browser for the ordinary Node suite.
const enabled=process.env.MOBILE_PROFILE_BROWSER==='1';

test('mobile profile keeps compact rows and visible controls across account states',{skip:!enabled},async t=>{
  const require=createRequire(import.meta.url);
  const {chromium}=require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`);
  const root=new URL('../',import.meta.url);
  const html=(await readFile(new URL('index.html',root),'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<link\b[^>]*href="https?:[^>]*>/gi,'');
  const fixture=`<script type="module">
    import {createMobileUI} from './src/mobile-ui.js';
    import {mountReleaseVersion} from './src/release-version.js';
    mountReleaseVersion();
    const kind=new URL(location.href).searchParams.get('kind');
    const user={kind:'user',displayName:'Marco Obice',username:'marco_obice_profilo_aziendale',email:'marco@example.it',firstName:'Marco',lastName:'Obice',companyName:'Vivai Obice Società Semplice Agricola',address:'Via Fontanette 1',postalCode:'12058',city:'Santo Stefano Belbo',province:'CN',vatNumber:'01234567890',phone:'+39 333 1234567'};
    const auth={getState:()=>kind==='user'?user:{kind:'guest'},supportsCountsTransfer:true,subscribe(fn){fn(this.getState());},login(){},register(){},logout(){},requestPasswordReset(){},updateProfile(){}};
    window.__profileUi=createMobileUI({isMobile:()=>true,getField:()=>({localProjectName:'Test'}),getFields:()=>[],getMap:()=>null,resizeMap(){},focusAll(){},stopTools(){},auth,countsEnabled:true,openCounts(){},openPublicProject(){}});
    window.__profileUi.navigate('profile');
    if(kind==='register')document.querySelector('#mobile-show-register').click();
    window.__profileReady=true;
  </script>`;
  const server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html.replace('</body>',`${fixture}</body>`));return;}
      const file=new URL(`.${pathname}`,root);
      if(!file.href.startsWith(root.href))throw new Error('Invalid path');
      res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.woff2':'font/woff2'})[extname(fileURLToPath(file))]??'application/octet-stream');
      res.end(await readFile(file));
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
  t.after(()=>browser.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  const screenshots=process.env.MOBILE_PROFILE_SCREENSHOT_DIR;
  if(screenshots)await mkdir(screenshots,{recursive:true});
  for(const viewport of [{width:320,height:568},{width:369,height:800},{width:360,height:640},{width:568,height:320},{width:640,height:360},{width:800,height:369}]){
    for(const kind of ['user','login','register']){
      await t.test(`${kind} at ${viewport.width}×${viewport.height}`,async caseTest=>{
        const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
        caseTest.after(()=>context.close());
        const page=await context.newPage();
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
        await page.goto(`${base}/?kind=${kind}`);
        await page.waitForFunction(()=>window.__profileReady===true,null,{timeout:5000});
        const data=await page.evaluate(()=>{
          const pages=document.querySelector('#mobile-pages'),nav=document.querySelector('.mobile-navigation').getBoundingClientRect();
          const box=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {name:node.name||node.id||node.textContent.trim(),top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,font:parseFloat(s.fontSize),line:parseFloat(s.lineHeight),hit:node.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2))};};
          const controls=[...pages.querySelectorAll('input,button,select')].filter(node=>!node.closest('[hidden],[aria-hidden="true"]')&&node.checkVisibility()).map(box);
          const labels=[...pages.querySelectorAll('.mobile-profile-details label')];
          const rowTops=new Set(),rows=labels.filter(node=>{const top=Math.round(node.getBoundingClientRect().top);if(rowTops.has(top))return false;rowTops.add(top);return true;});
          const rowGaps=rows.slice(1).map((node,i)=>node.getBoundingClientRect().top-rows[i].querySelector('input').getBoundingClientRect().bottom);
          const save=document.querySelector('[data-mobile-profile-action="save"]'),account=document.querySelector('.mobile-profile-account-actions');
          const release=document.querySelector('#mobile-app>.mobile-release-label');
          return {controls,rowGaps,scroll:pages.scrollHeight-pages.clientHeight,scrollWidth:pages.scrollWidth-pages.clientWidth,navTop:nav.top,navBottom:nav.bottom,pageBottom:pages.getBoundingClientRect().bottom,release:release?{...box(release),visible:release.checkVisibility(),text:release.textContent,headerText:document.querySelector('.test-badge').textContent}:null,actionGap:save&&account?account.getBoundingClientRect().top-save.getBoundingClientRect().bottom:null,accountButtons:account?[...account.querySelectorAll('button')].map(box):[]};
        });
        if(process.env.MOBILE_PROFILE_DIAGNOSTIC==='1')caseTest.diagnostic(JSON.stringify(data));
        if(screenshots)await page.screenshot({path:`${screenshots}/${kind}-${viewport.width}x${viewport.height}.png`});
        assert.deepEqual(errors,[]);
        assert.ok(data.scroll<=1,`profile page needs ${data.scroll}px of scrolling`);
        assert.ok(data.scrollWidth<=1,`profile page overflows horizontally by ${data.scrollWidth}px`);
        assert.ok(data.release?.visible,'the release version footer is missing');
        assert.equal(data.release.text,data.release.headerText);
        assert.ok(data.release.top>=data.navBottom+4&&data.release.bottom<=viewport.height,'release version must remain below navigation');
        for(const control of data.controls){
          assert.ok(control.top>=0&&control.bottom<=Math.min(data.navTop,data.pageBottom)+1,`${control.name} is clipped or covered by navigation`);
          assert.ok(control.left>=0&&control.right<=viewport.width+1,`${control.name} overflows horizontally`);
          assert.equal(control.hit,true,`${control.name} cannot be reached at its center`);
        }
        const expectedActions=kind==='user'?['mobile-public-project','Salva dati profilo','Reimposta password','Esci / Logout']:kind==='register'?['mobile-public-project','mobile-register-name','mobile-register-email','mobile-register-username','mobile-register-password','mobile-auth-register','mobile-show-login']:['mobile-public-project','mobile-auth-identifier','mobile-auth-password','mobile-auth-login','mobile-show-register','mobile-auth-reset'];
        for(const name of expectedActions)assert.ok(data.controls.some(control=>control.name===name),`${name} is missing from the visible ${kind} controls`);
        if(kind==='user'){
          assert.equal(data.controls.filter(control=>['firstName','lastName','companyName','address','postalCode','city','province','vatNumber','phone'].includes(control.name)).length,9);
          assert.ok(Math.max(...data.rowGaps)<=8,`field rows have ${Math.max(...data.rowGaps)}px of dead vertical space`);
          assert.ok(data.controls.filter(control=>['firstName','lastName','companyName','address','postalCode','city','province','vatNumber','phone'].includes(control.name)).every(control=>control.font>=11&&control.font<=12&&control.line<=18),'field text must stay compact and readable');
          if(viewport.width<500){
            assert.ok(data.actionGap>=10,`account actions have only ${data.actionGap}px breathing room`);
            assert.ok(data.accountButtons.every(control=>control.height>=(viewport.width<360?34:40)),'account buttons lose their usable height');
          }
          if(viewport.height<=340)assert.ok(data.accountButtons.every(control=>control.height>=34),'short-landscape account buttons lose their usable height');
        }
      });
    }
  }
});
