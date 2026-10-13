import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./curriculum-db.js',import.meta.url),'utf8').replace(/loadDatabaseMapping\(\);\s*$/,'');
function setup(existing={}){
 const fields=new Map();const $=id=>{if(!fields.has(id))fields.set(id,{disabled:false,value:'Edited objective',textContent:'',addEventListener(){}});return fields.get(id);};
 const c={$,mappingBusy:false,catalog:existing,mappingContext:()=>({board:'CBSE',grade:'Grade 1',subject:'English'}),syncMappingControls(){},current:()=>({name:''}),AbortSignal,URLSearchParams,confirm:()=>true,applyCurriculumMapping:m=>{c.applied=m;},fetch:async()=>({ok:true,json:async()=>({mapping:{version:1,topics:[{name:'Letters',concepts:[{name:'ABC',objective:'Recognize letters'}]}]}})})};
 runInNewContext(source+'\nthis.load=loadDatabaseMapping;',c);return c;
}
test('database mapping loads automatically into an empty page',async()=>{const c=setup();await c.load();assert.equal(c.applied.catalog.Letters[0].name,'ABC');});
test('automatic database lookup preserves an existing browser draft',async()=>{const c=setup({Draft:[]});await c.load();assert.equal(c.applied,undefined);assert.match(c.$('pushStatus').textContent,/preserved/);});
test('old lookup cannot overwrite a newly selected context',async()=>{const c=setup();let resolve;c.fetch=()=>new Promise(r=>resolve=r);const request=c.load();c.mappingContext=()=>({board:'CBSE',grade:'Grade 2',subject:'English'});resolve({ok:true,json:async()=>({mapping:{version:1,topics:[]}})});await request;assert.equal(c.applied,undefined);});
