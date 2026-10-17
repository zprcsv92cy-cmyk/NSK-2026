import assert from 'node:assert/strict';
import { readScopedLegacyRoster as read } from './production-roster-scoped-data.js';

const base = 'https://nsk-api.invalid';
const req = path => new Request(base + path);
const records = [
  {id:1,Namn:'Team 18 player',Lag:[{id:18}]},
  {id:2,Namn:'Team 27 player',Lag:[{id:27}]},
  {id:3,Namn:'Both teams',Lag:[18,27]},
  {id:4,Namn:'Unassigned',Lag:[]},
  {id:5,Namn:'No team'}
];
const deps = {
  fetchAllRosterRows: async table => {
    assert.ok(['spelare','tranare'].includes(table));
    return records;
  },
  fetchTeamStaff: async team => {
    assert.equal(team, '18');
    return [{id:'staff-1',name:'Coach',role:'team_manager'}];
  }
};
const response = await read(req('/api/spelare?page=1&size=1'), '18', deps);
assert.equal(response.status,200);
assert.deepEqual((await response.json()).results.map(row=>row.id),[1]);
const second=await read(req('/api/spelare?page=2&size=1'),'18',deps);
assert.deepEqual((await second.json()).results.map(row=>row.id),[3]);
const row=await read(req('/api/tranare/2'),'18',deps);
assert.deepEqual((await row.json()).results,[]);
const staff=await read(req('/api/lagpersonal'),'18',deps);
assert.equal((await staff.json()).results[0].id,'staff-1');
await assert.rejects(()=>read(req('/api/spelare'),'27',{fetchAllRosterRows:async()=>null}),/Incomplete/);
await assert.rejects(()=>read(req('/api/spelare'),'18',{fetchAllRosterRows:async()=>{throw Error('offline');}}),/offline/);
for(const path of ['/api/spelare?page=0','/api/spelare?page=1&page=2','/api/spelare?size=999','/api/spelare?size=-1']) {
  await assert.rejects(()=>read(req(path),'18',deps),/pagination/);
}
await assert.rejects(()=>read(req('/api/spelare'),'team-18',deps),/trusted team/);
await assert.rejects(()=>read(req('/api/lagpersonal'),'18',{}),/Trusted staff/);
await assert.rejects(()=>read(req('/api/poolspel'),'18',deps),/Unsupported/);
console.log('PASS server-scoped legacy roster response and paging');
