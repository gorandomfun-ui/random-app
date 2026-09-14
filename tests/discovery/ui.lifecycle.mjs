import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const root=process.cwd()
const require=createRequire(pathToFileURL(path.join(root,'package.json')))
const temporary=fs.mkdtempSync(path.join(root,'.random-ui-test-'))
const output=path.join(temporary,'component.cjs')
await build({entryPoints:[`${root}/app/random/RandomExperience.tsx`],outfile:output,bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','react/jsx-runtime'],tsconfig:`${root}/tsconfig.json`,plugins:[{name:'ui-test-boundaries',setup(build){
 build.onResolve({filter:/^(next\/|@\/components\/|@\/providers\/|@\/utils\/sound$)/},args=>({path:args.path,namespace:'stubs'}))
 build.onLoad({filter:/.*/,namespace:'stubs'},({path})=>{
  if(path.includes('I18nProvider'))return{contents:`export const useI18n=()=>({dict:{},locale:'en',locales:['en'],setLocale:()=>{},t:(key,fallback)=>fallback||key})`}
  if(path.includes('ScoreProvider'))return{contents:`export const useScore=()=>({addAction:()=>{},addPoints:()=>{},maybeSpawnDiamond:()=>{},quizScore:0,score:0})`}
  if(path.includes('CookieConsent'))return{contents:`export const useCookieConsent=()=>({consent:null})`}
  if(path==='next/dynamic')return{contents:`export default ()=>()=>null`}
  if(path.includes('/utils/sound'))return{contents:`export const playAgain=()=>{},playRandom=()=>{},playWaveEnter=()=>{},playWaveStep=()=>{},setMuted=()=>{}`}
  if(path.includes('RandomContentRenderer'))return{contents:`import React from 'react'; export const FactQuizCard=()=>React.createElement('div',null,'Quiz')`}
  return{contents:`import React from 'react'; export default function Stub(p){return React.createElement('span',{className:p.className},p.children||p.label||p.text||null)}`}
 })
}}]})
const profileOutput=path.join(temporary,'profile.cjs')
await build({entryPoints:[`${root}/lib/discovery/profile.ts`],outfile:profileOutput,bundle:true,platform:'node',format:'cjs'})
const {buildProfile}=require(profileOutput)
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://test.invalid/random',pretendToBeVisual:true})
for(const name of ['window','document','navigator','sessionStorage','localStorage','history','CustomEvent','StorageEvent','Event','Image'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true})
window.scrollTo=()=>{};window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window)
let serial=0;const calls=[],curationWrites=[],publicLikeWrites=[];let curated=false,curationReads=0,waveCalls=0,wavePlansAvailable=true,waveResponseDelayMs=0
globalThis.fetch=async(input,init={})=>{
 const url=new URL(String(input),'https://test.invalid')
 if(url.pathname==='/api/discovery/random'){
  const req=JSON.parse(init.body);calls.push(req);const n=++serial
  const profile=buildProfile({title:'Stone carving workshop'})
  const payload={type:req.type,_id:n.toString(16).padStart(24,'0'),url:`https://example.invalid/${n}`,provider:'youtube',text:`Fixture ${n}`,title:`Fixture ${n}`,variant:req.factVariant==='quiz'?'quiz':'text',question:'Question',options:['a','b'],correctIndex:0}
  return Response.json({candidate:{key:`fixture:${n}`,type:req.type,payload,profile,provider:'youtube',stock:false,available:true}})
 }
 if(url.pathname==='/api/discovery/wave'){
  waveCalls++
  const req=JSON.parse(init.body);const profile=buildProfile({title:'Stone carving workshop'})
  const make=(key,type)=>({key,type,profile,provider:'youtube',stock:false,available:true,payload:{type,_id:key.replace(/[^0-9]/g,'').padStart(24,'0'),url:'https://example.invalid/'+key,text:key,provider:'youtube'}})
  if(waveResponseDelayMs)await new Promise(resolve=>setTimeout(resolve,waveResponseDelayMs))
  if(!wavePlansAvailable)return Response.json({ready:false,trio:[],reserves:[]})
  return Response.json({ready:true,anchor:make('fixture:'+parseInt(req.anchorId,16),'video'),trio:[make('wave1001','video'),make('wave1002','image'),make('wave1003','video')],reserves:[make('wave1004','video')]})
 }
 if(url.pathname==='/api/discovery/curation'){
  if((init.method||'GET')==='GET'){curationReads++;return Response.json({active:curated})}
  const body=JSON.parse(init.body);curated=body.active===true;curationWrites.push(body);return Response.json({ok:true})
 }
 if(url.pathname==='/api/feedback/like'){
  publicLikeWrites.push({method:init.method,body:JSON.parse(init.body)});return Response.json({success:true,likeCount:init.method==='POST'?1:0})
 }
 return Response.json({ok:true})
}
const {RandomExperience}=require(output)
let app=createRoot(document.getElementById('root'));app.render(React.createElement(RandomExperience,{discoveryMode:true,waveDiscoveryMode:true}))
async function until(fn){const end=Date.now()+10000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,40))}throw new Error('UI condition timeout')}
const snapshot=()=>{const raw=sessionStorage.getItem('random-discovery-v2-en');return raw?JSON.parse(raw):null}
try{
 await until(()=>snapshot()?.discovery?.displayed>=1)
 await until(()=>calls.length>=3)
 let previous=snapshot().discovery.displayed
 for(let i=0;i<5;i++){
  const buttons=[...document.querySelectorAll('button')];const button=buttons.find(x=>/random again/i.test(x.textContent))
  if(!button)throw new Error('Random Again not rendered')
  await until(()=>!button.disabled);button.click()
  await until(()=>snapshot()?.discovery?.displayed>previous);previous=snapshot().discovery.displayed
 }
 const state=snapshot();if(state.ready.length!==0)throw new Error('Speculative media leaked into saved session')
 if(state.discovery.displayed!==6)throw new Error('Wrong committed draw count')
 if(state.sequence.draws!==6)throw new Error('Format sequence drifted from actual display')
 app.unmount()
 const priorRequests=calls.length
 app=createRoot(document.getElementById('root'));app.render(React.createElement(RandomExperience,{discoveryMode:true,waveDiscoveryMode:true}))
 await until(()=>calls.length>priorRequests)
 if(snapshot().discovery.displayed!==6)throw new Error('Reload consumed a Random')
 const afterReload=[...document.querySelectorAll('button')].find(x=>/random again/i.test(x.textContent))
 await until(()=>afterReload&&!afterReload.disabled);afterReload.click()
 await until(()=>snapshot()?.discovery?.displayed===7)
 const waveButton=document.querySelector('button[data-wave-status]')
 await until(()=>waveButton&&!waveButton.disabled)
 if(!waveButton.classList.contains('wave-action--available'))throw new Error('Ready Wave is not visibly available')
 waveButton.click()
 await until(()=>snapshot()?.discovery?.recent.some(x=>x.key.startsWith('wave')))
 const waveRevision=snapshot().discovery.revision
 for(let i=0;i<2;i++){
  const btn=[...document.querySelectorAll('button')].find(x=>/random again/i.test(x.textContent))
  await until(()=>!btn.disabled);btn.click()
  await until(()=>snapshot()?.discovery?.revision>=waveRevision+i+1)
 }
 if(snapshot().discovery.displayed!==7)throw new Error('Wave consumed an ordinary Random')
 const leave=[...document.querySelectorAll('button')].find(x=>/random again/i.test(x.textContent))
 await until(()=>!leave.disabled);leave.click()
 await until(()=>snapshot()?.discovery?.displayed===8)
 if(snapshot().sequence.draws!==8)throw new Error('Sequence not restored after Wave')
 app.unmount();sessionStorage.removeItem('random-curation-v2-en');localStorage.removeItem('likes')
 app=createRoot(document.getElementById('root'));app.render(React.createElement(RandomExperience,{discoveryMode:true,waveDiscoveryMode:true,curationMode:true}))
 const curationSnapshot=()=>{const raw=sessionStorage.getItem('random-curation-v2-en');return raw?JSON.parse(raw):null}
 await until(()=>curationSnapshot()?.currentItem)
 // The first curated draw can legitimately be a quote, quiz or website.
 // Navigate as a visitor would instead of waiting forever for its type to change.
 for(let i=0;i<40&&!['video','image'].includes(curationSnapshot().currentItem.type);i++){
  const prior=curationSnapshot().discovery.displayed
  const next=[...document.querySelectorAll('button')].find(x=>/random again/i.test(x.textContent))
  await until(()=>next&&!next.disabled);next.click()
  await until(()=>curationSnapshot().discovery.displayed>prior)
 }
 if(!['video','image'].includes(curationSnapshot().currentItem.type))throw new Error('No visual curation draw in one cycle')
 await until(()=>curationReads>0)
 const likeButton=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Like')
 await until(()=>likeButton&&!likeButton.disabled);likeButton.click()
 await until(()=>curationWrites.some(x=>x.active===true&&x.syncPublicLike===true))
 if(publicLikeWrites.length)throw new Error('Curation sent a duplicate public feedback request')
 const likedId=String(curationSnapshot().currentItem._id)
 await until(()=>Boolean(likeButton.querySelector('.heart-icon--liked')))
 if(!JSON.parse(localStorage.getItem('likes')||'[]').some(x=>x.itemId===likedId))throw new Error('Curation heart did not enter Your Likes')
 likeButton.click()
 await until(()=>curationWrites.some(x=>x.active===false&&x.syncPublicLike===true))
 if(publicLikeWrites.length)throw new Error('Curation unlike sent a duplicate public feedback request')
 await until(()=>!likeButton.querySelector('.heart-icon--liked'))
 if(JSON.parse(localStorage.getItem('likes')||'[]').some(x=>x.itemId===likedId))throw new Error('Curation unlike did not leave Your Likes')
 app.unmount();wavePlansAvailable=true;waveResponseDelayMs=3400
 const waveCallsBeforeSlow=waveCalls
 const slowItem={type:'video',_id:'eeeeeeeeeeeeeeeeeeeeeeee',url:'https://example.invalid/slow',provider:'youtube',text:'Slow Wave fixture'}
 app=createRoot(document.getElementById('root'));app.render(React.createElement(RandomExperience,{savedItem:slowItem,waveDiscoveryMode:true}))
 await until(()=>waveCalls>waveCallsBeforeSlow)
 const slowWaveButton=document.querySelector('button[data-wave-status]')
 await until(()=>slowWaveButton?.dataset.waveStatus==='slow')
 if(!slowWaveButton.disabled)throw new Error('Slow Wave button became active before its trio arrived')
 await until(()=>slowWaveButton?.dataset.waveStatus==='ready'&&!slowWaveButton.disabled)
 app.unmount();wavePlansAvailable=false;waveResponseDelayMs=0
  const waveCallsBeforeUnavailable=waveCalls
 const unavailableItem={type:'video',_id:'ffffffffffffffffffffffff',url:'https://example.invalid/unavailable',provider:'youtube',text:'Unavailable Wave fixture'}
 app=createRoot(document.getElementById('root'));app.render(React.createElement(RandomExperience,{savedItem:unavailableItem,waveDiscoveryMode:true}))
 await until(()=>waveCalls>waveCallsBeforeUnavailable)
 const unavailableWaveButton=document.querySelector('button[data-wave-status]')
 await until(()=>unavailableWaveButton?.dataset.waveStatus==='empty'&&unavailableWaveButton.classList.contains('wave-action--unavailable'))
  if(!unavailableWaveButton.disabled)throw new Error('Unavailable Wave button remained active')
 console.log(JSON.stringify({passed:true,component:'RandomExperience.tsx',committed:8,waveDisplays:3,requests:calls.length,savedPrepared:state.ready.length,sequenceDraws:snapshot().sequence.draws,reloadPreserved:true,waveAvailability:{readyAnimated:true,slowDistinguished:true,lateReadyAccepted:true,emptyGrayAndDisabled:true},curationHeart:{yourLikes:true,weLikeSyncDelegated:true,noDuplicatePublicRequest:true,poolCool:true,reversible:true},mode:'JSDOM, player/components boundaries stubbed'},null,2))
}finally{app.unmount();dom.window.close();fs.rmSync(temporary,{recursive:true,force:true})}
