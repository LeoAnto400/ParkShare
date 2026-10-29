import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../js/nav.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
function node(tag, className, text) {
  return {tag,className,textContent:text,children:[],attributes:{},events:{},
    append(...items){this.children.push(...items);},
    replaceChildren(...items){this.children=items;},
    setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},
    addEventListener(k,v){this.events[k]=v;}};
}
async function setup(readSession) {
  const header=node('header'); header.append(node('a','','Old duplicate My spaces'));
  let callback, signedOut=false;
  const client={auth:{onAuthStateChange(fn){callback=fn;},async signOut(){signedOut=true;return {error:null};}}};
  const window={location:{href:'http://localhost/pages/search.html',pathname:'/pages/search.html',assign(value){this.destination=value;}}};
  const run=new (Object.getPrototypeOf(async function(){}).constructor)('getClient','isDemo','session','element','document','window',source);
  await run(async()=>client,false,readSession,node,{querySelector:()=>header,createTextNode:text=>node('text','',text)},window);
  return {header,account:header.children[1].children[3],event:(value)=>callback('CHANGE',value),window,isSignedOut:()=>signedOut};
}
test('shared navigation replaces stale headers and displays only Logout for restored sessions',async()=>{
 const ui=await setup(async()=>({user:{id:'driver'}}));
 assert.equal(ui.header.children.length,2);
 assert.deepEqual(ui.header.children[1].children.slice(0,3).map(n=>n.textContent),['Find parking','My spaces','My bookings']);
 assert.equal(ui.header.children[0].children[0].className,'brand-mark');
 assert.equal(ui.account.children.length,1);assert.equal(ui.account.children[0].textContent,'Logout');
 ui.event(null);assert.equal(ui.account.children[0].textContent,'Log in');
 ui.event({user:{id:'driver'}});assert.equal(ui.account.children.length,1);
 await ui.account.children[0].events.click();assert.equal(ui.isSignedOut(),true);assert.equal(ui.window.location.destination,'index.html');
});
test('signed-out and failed session checks do not pretend the user is logged in or logged out',async()=>{
 const signedOut=await setup(async()=>null);assert.equal(signedOut.account.children[0].textContent,'Log in');
 const failed=await setup(async()=>{throw new Error('offline');});assert.equal(failed.account.children[0].textContent,'Retry account');
});
