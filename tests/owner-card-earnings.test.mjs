import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indiaToday } from '../js/earning-periods.js';
const source = (await readFile(new URL('../js/owner-card-earnings.js', import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
const module = await import('data:text/javascript;base64,'+Buffer.from(`const indiaToday=${indiaToday.toString()}; const request=(...args)=>globalThis.earningsRequest(...args);`+source).toString('base64'));
test('card totals group stored owner amounts once per eligible booking using IST arrival dates',()=>{
 const row=(space,arrival,amount,category='completed')=>({parking_space_id:space,arrival,parking_subtotal:amount,earnings_category:category});
 const totals=module.groupCardEarnings([
  row('a','2030-01-31T18:30:00Z',95), row('a','2030-02-01T18:30:00Z',19.99),
  row('a','2030-01-31T18:29:59Z',10),row('b','2030-02-01T01:00:00Z',50),
  row('a','2030-02-01T01:00:00Z',100,'pending'),row('a','2030-02-01T01:00:00Z',100,'refunded'),
  row('a','2030-02-01T01:00:00Z',100,'excluded')],'2030-02-01');
 assert.deepEqual(totals.get('a'),{total:12499,daily:9500,monthly:11499});
 assert.deepEqual(totals.get('b'),{total:5000,daily:5000,monthly:5000});
 assert.equal(module.groupCardEarnings([],'2030-02-01').size,0);
});
test('card earnings fetch all protected pages and use server date',async()=>{
 const calls=[];
 globalThis.earningsRequest=async(path,body,auth)=>{
  calls.push([path,body,auth]);
  return {as_of:'2030-01-31T18:30:00Z',rows:Array.from({length:body.p_offset===0?50:1},()=>({parking_space_id:'a',arrival:'2030-02-01T00:00:00Z',parking_subtotal:1,earnings_category:'completed'}))};
 };
 try {
  const result=await module.loadCardEarnings();
  assert.equal(result.day,'2030-02-01');assert.equal(result.totals.get('a').total,5100);
  assert.deepEqual(calls,[['rpc/owner_earnings',{p_offset:0},true],['rpc/owner_earnings',{p_offset:50},true]]);
 } finally {delete globalThis.earningsRequest;}
});

test('account totals combine all owned spaces without deducting the platform fee twice',()=>{
 assert.deepEqual(module.accountEarningsTotals(new Map([
  ['published-space',{total:9500,daily:1900,monthly:4750}],
  ['unpublished-space',{total:4750,daily:950,monthly:2375}]
 ])),{total:14250,daily:2850,monthly:7125});
 assert.deepEqual(module.accountEarningsTotals(new Map()),{total:0,daily:0,monthly:0});
});
