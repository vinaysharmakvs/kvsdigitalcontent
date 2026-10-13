import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMapping} from './database.mjs';
const fixture=()=>({board:'CBSE',grade:'Grade 1',subject:'Mathematics',expectedVersion:0,topics:[{name:'Counting',concepts:[{name:'Count to ten',objective:'Count ten objects.'}]}]});
test('database accepts small complete user-provided mappings',()=>assert.equal(validateMapping(fixture()).topics.length,1));
test('database rejects duplicate topic names',()=>{const d=fixture();d.topics.push({...d.topics[0],name:' counting '});assert.throws(()=>validateMapping(d),/Duplicate/);});
test('database requires objectives and an explicit loaded version',()=>{const d=fixture();d.topics[0].concepts[0].objective='';assert.throws(()=>validateMapping(d));const e=fixture();delete e.expectedVersion;assert.throws(()=>validateMapping(e));});
