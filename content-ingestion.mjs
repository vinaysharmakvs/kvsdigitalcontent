import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {getPool} from './database.mjs';
import {validateGamePackage} from './game-api.mjs';
const schema=await readFile(new URL('./db/content-schema.sql',import.meta.url),'utf8');
const json=value=>JSON.stringify(value??null);

// Only cms_content is written; existing kidsverse curriculum tables stay intact.
export async function ingestContent(payload){
 try{validateGamePackage(payload);}catch(error){return {status:400,body:{error:error.message}};}
 if(!process.env.DATABASE_URL)return {status:503,body:{error:'DATABASE_URL is required.'}};
 let client;
 try{
  client=await getPool().connect();await client.query('BEGIN');
  // Serialize schema setup and duplicate-package ingestion across local requests.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('cms_content_ingestion_v2',0))");
  await client.query(schema);
  const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const prior=await client.query('SELECT p.id FROM cms_content.packages p LEFT JOIN cms_content.content_packages c ON c.package_id=p.id WHERE p.payload=$1::jsonb ORDER BY (c.package_id IS NOT NULL) DESC,p.created_at LIMIT 1',[json(payload)]);
  const inserted=prior.rows.length?{rows:[]}:await client.query('INSERT INTO cms_content.packages(id,payload_sha256,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(payload_sha256) DO NOTHING RETURNING id',[randomUUID(),hash,json(payload)]);
  const packageId=(prior.rows[0]||inserted.rows[0]||(await client.query('SELECT id FROM cms_content.packages WHERE payload_sha256=$1',[hash])).rows[0]).id;
  const existed=!!(await client.query('SELECT package_id FROM cms_content.content_packages WHERE package_id=$1',[packageId])).rows.length;
  const c=payload.curriculum;
  // Reuse hierarchy entries, without changing previously authored values.
  async function entity(table,columns,values,conflict){
   const id=randomUUID();
   const params=[id,...values];
   const result=await client.query(`INSERT INTO cms_content.${table}(id,${columns.join(',')}) VALUES(${params.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(${conflict.join(',')}) DO NOTHING RETURNING id`,params);
   if(result.rows.length)return result.rows[0].id;
   const keys=conflict.map(k=>values[columns.indexOf(k)]);
   return (await client.query(`SELECT id FROM cms_content.${table} WHERE ${conflict.map((k,i)=>k+'=$'+(i+1)).join(' AND ')}`,keys)).rows[0].id;
  }
  let ids;
  if(existed){
   ids=(await client.query(`SELECT cp.concept_id,cp.theme_id,s.curriculum_id,t.subject_id,c.topic_id,
    lc.id AS learning_content_id,m.id AS mission_id,te.id AS test_id,ch.id AS challenge_id
    FROM cms_content.content_packages cp
    JOIN cms_content.concepts c ON c.id=cp.concept_id JOIN cms_content.topics t ON t.id=c.topic_id
    JOIN cms_content.subjects s ON s.id=t.subject_id
    JOIN cms_content.learning_content lc ON lc.package_id=cp.package_id
    JOIN cms_content.missions m ON m.package_id=cp.package_id
    JOIN cms_content.tests te ON te.package_id=cp.package_id
    JOIN cms_content.challenges ch ON ch.package_id=cp.package_id WHERE cp.package_id=$1`,[packageId])).rows[0];
  }else{
   const curriculum_id=await entity('curricula',['board','grade'],[c.board,c.grade],['board','grade']);
   const subject_id=await entity('subjects',['curriculum_id','name'],[curriculum_id,c.subject],['curriculum_id','name']);
   const topic_id=await entity('topics',['subject_id','name'],[subject_id,c.topic],['subject_id','name']);
   const concept_id=await entity('concepts',['topic_id','name'],[topic_id,payload.concept.name],['topic_id','name']);
   const themeName=typeof payload.theme==='string'&&payload.theme.trim()?payload.theme.trim():'Everyday Life';
   const theme_id=await entity('themes',['name'],[themeName],['name']);
   const lesson=payload.learn_before_test;
   await client.query('INSERT INTO cms_content.content_packages VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[packageId,concept_id,theme_id,payload.concept.learning_objective,payload.content_type,lesson.required,json(lesson.order),lesson.starts_quiz_after,json(payload)]);
   const learning_content_id=randomUUID(),l=payload.learning_content;
   await client.query('INSERT INTO cms_content.learning_content VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[learning_content_id,packageId,l.teaching_method,l.explanation,l.image_url,l.image_prompt,l.image_alt,json(l.hints??[]),l.nova_script,l.nova_feedback,json(l)]);
   for(const [position,step] of lesson.steps.entries()){
    const stepId=randomUUID();
    await client.query('INSERT INTO cms_content.learning_steps VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[stepId,packageId,position,step.step_key,step.title,step.teaching_text,step.key_idea,step.image_url,step.image_prompt,step.image_alt,step.nova_script,json(step.mini_question),json(step)]);
    for(const [index,way] of (step.explanation_ways??[]).entries())await client.query('INSERT INTO cms_content.example_alternatives VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[randomUUID(),stepId,index,way.label,way.teaching_text,way.key_idea,way.image_url,way.image_prompt,way.image_alt,way.nova_script,json(way.mini_question),json(way)]);
   }
   const mission_id=randomUUID(),test_id=randomUUID(),challenge_id=randomUUID();
   await client.query('INSERT INTO cms_content.missions VALUES($1,$2)',[mission_id,packageId]);
   await client.query('INSERT INTO cms_content.tests VALUES($1,$2,$3)',[test_id,packageId,payload.test_questions?.one_time??false]);
   await client.query('INSERT INTO cms_content.challenges VALUES($1,$2,$3)',[challenge_id,packageId,payload.challenge.one_time??false]);
   const banks={cfu:payload.check_for_understanding,test:payload.test_questions?.questions??[],battle:payload.battle_questions,challenge:payload.challenge.questions};
   for(const [bank,questions] of Object.entries(banks))for(const [position,q] of questions.entries())await client.query('INSERT INTO cms_content.questions VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)',[randomUUID(),packageId,bank,position,['cfu','battle'].includes(bank)?mission_id:null,bank==='test'?test_id:null,bank==='challenge'?challenge_id:null,q.question,json(q.options),q.answer,q.difficulty,q.explanation,json(q.hints),q.xp,q.marks,q.novaFeedback??q.nova_feedback,q.nova_script,q.image_url,q.image_prompt,q.image_alt,json(q)]);
   ids={curriculum_id,subject_id,topic_id,concept_id,theme_id,learning_content_id,mission_id,test_id,challenge_id};
  }
  const theme=(await client.query('SELECT name FROM cms_content.themes WHERE id=$1',[ids.theme_id])).rows[0].name;
  const rows=(await client.query('SELECT bank,count(*)::int AS count FROM cms_content.questions WHERE package_id=$1 GROUP BY bank',[packageId])).rows;
  const counts={cfu:0,test:0,battle:0,challenge:0};for(const row of rows)counts[row.bank]=row.count;
  const steps=(await client.query('SELECT count(*)::int AS count FROM cms_content.learning_steps WHERE package_id=$1',[packageId])).rows[0].count;
  await client.query('COMMIT');
  return {status:existed?200:201,body:{status:'success',message:'Content package successfully ingested and segregated into relational tables',data:{...ids,curriculum:c.board+' - '+c.grade,subject:c.subject,board:c.board,grade:c.grade,topic:c.topic,concept:payload.concept.name,theme,package_id:packageId,already_saved:existed,learn_before_test_steps_saved:steps,questions_saved:{...counts,total:Object.values(counts).reduce((a,b)=>a+b,0)}}}};
 }catch(error){
  if(client)await client.query('ROLLBACK').catch(()=>{});
  console.error('Content ingestion failed:',error.code||error.name);
  return {status:503,body:{error:'Content could not be saved. No partial package was committed.'}};
 }finally{client?.release();}
}
