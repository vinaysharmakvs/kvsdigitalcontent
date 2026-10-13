import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {saveMapping,loadMapping,getPool,closeDatabase} from '../database.mjs';
const board='__verification_'+randomUUID();
const data={board,grade:'Grade 1',subject:'Test only',expectedVersion:0,topics:[{name:'Test topic',concepts:[{name:'Test concept',objective:'Verify database persistence.'}]}]};
try{
 assert.equal(await loadMapping(data),null);
 const saved=await saveMapping(data);assert.equal(saved.version,1);
 const loaded=await loadMapping(data);assert.equal(loaded.topics[0].concepts[0].objective,data.topics[0].concepts[0].objective);
 await assert.rejects(saveMapping(data),e=>e.status===409);
 const updated=await saveMapping({...data,expectedVersion:1});assert.equal(updated.version,2);
 assert.equal((await getPool().query('SELECT count(*)::int AS n FROM kidsverse.curricula WHERE board=$1',[board])).rows[0].n,2);
 console.log('Live Neon checks passed: save, reload, version history and conflict protection.');
}finally{
 await getPool().query('DELETE FROM kidsverse.curricula WHERE board=$1',[board]);await closeDatabase();
}
