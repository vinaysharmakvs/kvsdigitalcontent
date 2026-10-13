import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
let pool;
export function getPool(){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is not configured.');
 if(!pool){const url=new URL(process.env.DATABASE_URL);url.searchParams.set('sslmode','verify-full');pool=new pg.Pool({connectionString:url.toString(),enableChannelBinding:true,max:3,connectionTimeoutMillis:15000,idleTimeoutMillis:10000,statement_timeout:20000});pool.on('error',()=>{});}
 return pool;
}
export async function closeDatabase(){if(pool)await pool.end();pool=undefined;}
export async function migrate(){await getPool().query(await readFile(new URL('./db/schema.sql',import.meta.url),'utf8'));}
export function context(input){
 const out={};for(const key of ['board','grade','subject']){const value=input?.[key];if(typeof value!=='string'||!value.trim()||value.length>200)throw Error('Choose a board, grade and subject.');out[key]=value.trim();}return out;
}
export function validateMapping(input){
 const ctx=context(input);if(!Array.isArray(input.topics)||input.topics.length<1||input.topics.length>200)throw Error('Provide between 1 and 200 topics.');
 const clean=(value,label,max=200)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Invalid '+label);return value.trim();};
 const distinct=(list,label)=>{if(new Set(list.map(x=>x.name.normalize('NFKC').toLowerCase())).size!==list.length)throw Error('Duplicate '+label);};
 const topics=input.topics.map(t=>{
  if(!Array.isArray(t.concepts)||!t.concepts.length||t.concepts.length>200)throw Error('Each topic needs 1 to 200 concepts.');
  const concepts=t.concepts.map(c=>({name:clean(c.name,'concept name'),objective:clean(c.objective,'learning objective',12000)}));distinct(concepts,'concept');return {name:clean(t.name,'topic name'),concepts};
 });distinct(topics,'topic');
 if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<0)throw Error('Load the database mapping before saving.');
 return {...ctx,topics,expectedVersion:input.expectedVersion,source:['gemini','import','manual'].includes(input.source)?input.source:'manual'};
}
export async function loadMapping(input,client=getPool()){
 const c=context(input);
 const {rows}=await client.query('SELECT * FROM kidsverse.curricula WHERE board=$1 AND grade=$2 AND subject=$3 ORDER BY version DESC LIMIT 1',[c.board,c.grade,c.subject]);
 if(!rows.length)return null;const row=rows[0];
 const topics=(await client.query('SELECT id,name FROM kidsverse.topics WHERE curriculum_id=$1 ORDER BY position',[row.id])).rows;
 const concepts=(await client.query('SELECT c.id,c.topic_id,c.name,c.objective FROM kidsverse.concepts c JOIN kidsverse.topics t ON t.id=c.topic_id WHERE t.curriculum_id=$1 ORDER BY t.position,c.position',[row.id])).rows;
 return {...row,topics:topics.map(t=>({...t,concepts:concepts.filter(c=>c.topic_id===t.id).map(({topic_id,...c})=>c)}))};
}
export async function saveMapping(input){
 const data=validateMapping(input);const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([data.board,data.grade,data.subject])]);
  const previous=await loadMapping(data,client);
  if((previous?.version||0)!==data.expectedVersion){const e=Error('This curriculum changed in another session. Load the database version before saving.');e.status=409;throw e;}
  const id=randomUUID(),version=data.expectedVersion+1;
  await client.query('INSERT INTO kidsverse.curricula(id,board,grade,subject,version,source) VALUES($1,$2,$3,$4,$5,$6)',[id,data.board,data.grade,data.subject,version,data.source]);
  const topics=[],concepts=[];
  for(const [position,t] of data.topics.entries()){
   const tid=randomUUID();topics.push({id:tid,curriculum_id:id,name:t.name,position});
   for(const [pos,c] of t.concepts.entries())concepts.push({id:randomUUID(),topic_id:tid,name:c.name,objective:c.objective,position:pos});
  }
  await client.query('INSERT INTO kidsverse.topics SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,curriculum_id uuid,name text,position integer)',[JSON.stringify(topics)]);
  await client.query('INSERT INTO kidsverse.concepts SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,topic_id uuid,name text,objective text,position integer)',[JSON.stringify(concepts)]);
  await client.query('COMMIT');return {id,version};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function databaseRequest(method,params,input){
 if(!process.env.DATABASE_URL)return {status:503,body:{error:'Add DATABASE_URL to .env and restart.'}};
 try{
  if(method==='GET'){context(params);return {status:200,body:{mapping:await loadMapping(params)}};}
  if(method==='POST'){validateMapping(input);return {status:200,body:await saveMapping(input)};}
  return {status:405,body:{error:'GET or POST required'}};
 }catch(e){return {status:e.status|| (e.message.startsWith('Invalid')||e.message.startsWith('Choose')||e.message.startsWith('Provide')||e.message.startsWith('Each')||e.message.startsWith('Duplicate')||e.message.startsWith('Load')?400:503),body:{error:e.status===409?e.message:e.code?'Database request failed. Check the connection and run npm run db:init.':e.message}};}
}
