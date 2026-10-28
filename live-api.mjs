import {gameConfig} from './game-api.mjs';
export const liveFeedUrl='https://kidsverse-apinew.vercel.app/api/v1/admin/content/feed';
export function liveEnvironment(env=process.env){
 const value=env.GAME_API_URL;
 return {...env,GAME_API_URL:!value||/^https:\/\/kidsverse-apinew\.vercel\.app\/api\/v1\/?$/.test(value)?liveFeedUrl:value};
}
export async function readLiveContent(params,env=process.env,fetcher=fetch){
 const target=params.target||'tree';
 let path;
 if(target==='tree')path='curriculum/tree';
 else if(target==='packages')path='admin/content/packages';
 else if(target==='package'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(params.id||''))path='admin/content/packages/'+params.id;
 else return {status:400,body:{error:'Invalid live content request.'}};
 try{
  const feed=new URL(gameConfig(liveEnvironment(env)));
  const marker=feed.pathname.indexOf('/api/v1/');
  if(marker<0)return {status:503,body:{error:'Live API base path is not configured.'}};
  const url=new URL(feed.pathname.slice(0,marker)+'/api/v1/'+path,feed.origin);
  for(const key of ['grade','board','subject','topic','theme'])if(params[key])url.searchParams.set(key,String(params[key]));
  const headers={Accept:'application/json','Cache-Control':'no-cache'};
  if(env.GAME_API_TOKEN)headers.Authorization='Bearer '+env.GAME_API_TOKEN;
  const response=await fetcher(url.href,{headers,redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.ok)return {status:502,body:{error:'New API returned HTTP '+response.status+'. No old database or browser content was loaded.',upstreamStatus:response.status}};
  const body=await response.json();
  if(target==='tree'){
   if(!Array.isArray(body.topics))throw Error('Invalid tree');
   const topics=body.topics.filter(t=>Array.isArray(t.concepts)&&t.concepts.length&&(!params.subject||t.subject?.toLowerCase()===params.subject.toLowerCase()));
   return {status:200,body:{source:'new-api',mapping:topics.length?{version:0,topics}:null}};
  }
  return {status:200,body};
 }catch{return {status:502,body:{error:'Could not read the new API. No old database or browser content was loaded.'}};}
}
