import { chromium } from '/home/lizzyman04/desktop/dev/cws/smart-hibernator/node_modules/@playwright/test/index.mjs'
import { execSync } from 'child_process'
import fs from 'fs'
const ext = '/home/lizzyman04/desktop/dev/cws/smart-hibernator/dist'
const urls = `example.com wikipedia.org/wiki/Chrome github.com/microsoft/playwright developer.mozilla.org/en-US/docs/Web/JavaScript news.ycombinator.com python.org docs.python.org/3/ nodejs.org rust-lang.org go.dev reactjs.org react.dev vuejs.org svelte.dev angular.dev tailwindcss.com vitejs.dev typescriptlang.org npmjs.com stackoverflow.com bbc.com/news npr.org apnews.com reuters.com theguardian.com archive.org gnu.org kernel.org debian.org ubuntu.com fedoraproject.org archlinux.org mozilla.org w3.org whatwg.org ietf.org eff.org openstreetmap.org duckduckgo.com bing.com/search?q=chrome gitlab.com sourceforge.net httpbin.org info.cern.ch neverssl.com example.org example.net iana.org`.split(/\s+/).map(u=>'https://'+u)
const sleep = ms => new Promise(r=>setTimeout(r,ms))
function procs(){
  const out = execSync(`ps -eo pid,rss,args --no-headers | grep -- '--extension-process' | grep 'playwright_chromiumdev_profile' | grep -v grep || true`).toString().trim().split('\n').filter(Boolean)
  return out.map(l=>{const m=l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); const pid=m[1]; let pss=0; try{pss=+fs.readFileSync(`/proc/${pid}/smaps_rollup`,'utf8').match(/^Pss:\s+(\d+)/m)[1]}catch{}; return {pid,rssMB:+(m[2]/1024).toFixed(1),pssMB:+(pss/1024).toFixed(1),type:(m[3].match(/--type=(\w+)/)||[])[1]}})
}
let tAlive=Date.now()
const ctx = await chromium.launchPersistentContext('', {channel:'chromium',headless:false,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,"--disable-gpu","--disable-features=VaapiVideoDecoder,UseChromeOSDirectVideoDecoder","--mute-audio","--autoplay-policy=user-gesture-required"]})
ctx.browser().on('disconnected',()=>{console.log('BROWSER DISCONNECTED at',((Date.now()-tAlive)/1000).toFixed(0),'s');process.exit(2)})
let [sw] = ctx.serviceWorkers(); if(!sw) sw = await ctx.waitForEvent('serviceworker')
const id = sw.url().split('/')[2]; console.log('ext id',id, 'chrome', ctx.browser()?.version())
await sw.evaluate(()=>chrome.storage.local.set({timeout_minutes:100000}))
const t0=Date.now()
for (const u of urls.slice(0,+(process.env.TABS||urls.length))){ const p=await ctx.newPage(); p.goto(u,{timeout:30000,waitUntil:'load'}).catch(()=>{}); await sleep(2000) }
console.log('tabs',ctx.pages().length)
await sleep(5000)
const seeded = await sw.evaluate(async()=>{
  const db = await new Promise((res,rej)=>{const r=indexedDB.open('smart-hibernator'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error)})
  if(!db.objectStoreNames.contains('tab-history')) return 'no store'
  const doms=['github.com','wikipedia.org','python.org','nodejs.org','bbc.com','example.com','npmjs.com','gnu.org','kernel.org','archive.org']
  const tx=db.transaction('tab-history','readwrite'); const st=tx.objectStore('tab-history'); const now=Date.now()
  for(let i=0;i<60;i++){const d=doms[i%doms.length]; st.add({domain:d,url:'https://'+d+'/',visitStart:now-i*3600e3,visitEnd:now-i*3600e3+120e3,dwellMs:120e3,hadFormActivity:false,timestamp:now-i*3600e3})}
  await new Promise(r=>tx.oncomplete=r); const c=await new Promise(r=>{const q=db.transaction('tab-history').objectStore('tab-history').count(); q.onsuccess=()=>r(q.result)}); db.close(); return c })
console.log('seeded history rows:',seeded)

await sleep(60000)
const hasOff = async()=> (await ctx.newCDPSession(ctx.pages()[0]).then(async s=>{const r=await s.send('Target.getTargets'); return r.targetInfos.filter(t=>t.url.includes(id)).map(t=>t.type+':'+t.url.split('/').slice(3).join('/'))}))
console.log('t+%dm warm targets',((Date.now()-t0)/60000).toFixed(1), JSON.stringify(await hasOff())); 
// wait for classification bursts (alarm 1m)
await sleep(+(process.env.WARMWAIT||150000))
console.log('WARM', JSON.stringify(procs()), JSON.stringify(await hasOff()))
const idleStart=Date.now()
// idle 13 min: no interaction
for(let m=1;m<=+(process.env.IDLEMIN||13);m++){ await sleep(60000); if(m%3==0) console.log('idle',m,'m', JSON.stringify(await hasOff())) }
console.log('IDLE', JSON.stringify(procs()), JSON.stringify(await hasOff()))
// recreation
await ctx.pages()[3].bringToFront(); await sleep(75000)
console.log('RECREATED', JSON.stringify(procs()), JSON.stringify(await hasOff()))
await ctx.close()
