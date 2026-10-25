import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('  async function initSkapaPoolspelPage() {');
const end=app.indexOf('\n  function renderLaguppstallningButtons()',start);
assert.ok(start>=0&&end>start,'pool creation init function must be present');
const initSource=app.slice(start,end).trim();

function exercise({partial=false}={}){
  const saved={title:'Poolspel',place:'Testort',hall:'Stora hallen',pool_date:'2026-11-11',
    status:'Aktiv',teams:2,matches:8,players_on_field:3,periods:2,period_time:15,sub_time:90};
  const values=new Map([
    ['nsk2_calendar_pool_import_key','12345678-1234-4123-8123-123456789abc'],
    ['nsk2_calendar_pool_import_payload',JSON.stringify(saved)],
    ...(partial?[['nsk2_calendar_match_import_errors',JSON.stringify({poolId:'91',errors:['Några matcher saknas']})]]:[])
  ]);
  const sessionStorage={
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key)
  };
  const make=(tagName='INPUT')=>({tagName,value:'',options:[],add(option){this.options.push(option)},addEventListener(){}});
  const fields=Object.fromEntries(['savePool','teams','poolPlace','poolHall','poolDate','matches','players','periods','periodTime','subTime'].map(n=>[n,make(['teams','matches','players','periods','periodTime','subTime'].includes(n)?'SELECT':'INPUT')]));
  fields.teams.options=[{value:'1'}];
  fields.matches.options=[{value:'1'}];
  const warnings=[];
  const init=new Function('byId','sessionStorage','setText','renderLaguppstallningButtons','savePool','Option',
    'return ('+initSource+');')(
      name=>fields[name]??null,sessionStorage,(id,message)=>warnings.push([id,message]),()=>{},()=>{},
      function Option(text,value){this.text=text;this.value=value}
    );
  return {init,fields,warnings,sessionStorage,values,saved};
}

for(const partial of [false,true]){
  test('restores immutable calendar pool after reload '+(partial?'with partial matches':'before server response'),async()=>{
    const ctx=exercise({partial});
    await ctx.init();
    assert.equal(ctx.fields.poolPlace.value,ctx.saved.place);
    assert.equal(ctx.fields.poolHall.value,ctx.saved.hall);
    assert.equal(ctx.fields.poolDate.value,ctx.saved.pool_date);
    assert.equal(ctx.fields.teams.value,'2');
    assert.equal(ctx.fields.matches.value,'8');
    assert.equal(ctx.fields.periodTime.value,'15');
    assert.ok(ctx.fields.matches.options.some(x=>x.value==='8'),'eight matches must remain selectable');
    assert.ok(ctx.values.has('nsk2_calendar_pool_import_key'),'retry key must remain stored');
    assert.ok(ctx.values.has('nsk2_calendar_pool_import_payload'),'immutable payload must remain stored');
    assert.ok(ctx.warnings.some(([id])=>id==='appError'));
  });
}
