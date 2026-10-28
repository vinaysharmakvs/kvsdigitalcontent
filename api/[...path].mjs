import {storageStatus} from '../r2.mjs';
import {generate, generateImage, importDraft, schemaFor} from '../server.mjs';
import {databaseRequest} from '../database.mjs';
import {publishGamePackage,gameConfig} from '../game-api.mjs';

let active = false;
const liveApiEnv=()=>({...process.env,GAME_API_URL:process.env.GAME_API_URL||'https://kidsverse-apinew.vercel.app/api/v1/'});

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}
});

export const maxDuration = 60;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const {pathname} = url;

    if(pathname==='/api/game/status'&&request.method==='GET'){
      let configured=false;try{gameConfig(liveApiEnv());configured=true;}catch{}
      return json(200,{configured});
    }
    if(pathname==='/api/game/publish'){
      if(request.method!=='POST')return json(405,{error:'POST required'});
      if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json(403,{error:'Origin not allowed.'});
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json(415,{error:'JSON required'});
      if(active)return json(429,{error:'An operation is already in progress.'});
      let input;
      try{const raw=await request.text();if(Buffer.byteLength(raw)>2000000)return json(413,{error:'Package is too large.'});input=JSON.parse(raw);}
      catch{return json(400,{error:'Invalid JSON package.'});}
      active=true;
      try{const result=await publishGamePackage(input,liveApiEnv());return json(result.status,result.body);}
      finally{active=false;}
    }

    if(request.method==='GET'&&pathname==='/api/manual-schema')return json(200,schemaFor(false));
    if (request.method === 'GET' && pathname === '/api/status') {
      return json(200, {configured: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL), imageConfigured: !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID), imageProvider: 'cloudflare', ...storageStatus()});
    }

    if (pathname === '/api/curricula') {
      if (request.method === 'GET') {
        const result = await databaseRequest('GET', Object.fromEntries(url.searchParams));
        return json(result.status, result.body);
      }
      if (request.method !== 'POST') return json(405, {error: 'GET or POST required'});
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json(415, {error: 'JSON required'});
      try {
        const raw = await request.text();
        if (Buffer.byteLength(raw) > 2000000) return json(413, {error: 'Mapping is too large'});
        const result = await databaseRequest('POST', null, JSON.parse(raw));
        return json(result.status, result.body);
      } catch {
        return json(400, {error: 'Invalid JSON'});
      }
    }

    if (!['/api/generate', '/api/curriculum', '/api/image', '/api/import'].includes(pathname)) return json(404, {error: 'Not found'});
    if (request.method !== 'POST') return json(405, {error: 'POST required'});
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json(415, {error: 'JSON required'});
    if (active) return json(429, {error: 'A generation is already in progress.'});

    try {
      const raw = await request.text();
      if (Buffer.byteLength(raw) > (pathname === '/api/import' ? 500000 : 24000)) return json(413, {error: 'Request too large'});
      const input = JSON.parse(raw);
      active = true;
      try {
        const result = pathname === '/api/import' ? importDraft(input) : pathname === '/api/image' ? await generateImage(input) : await generate(input, process.env, fetch, pathname === '/api/curriculum' ? 'curriculum' : 'content');
        return json(result.status, result.body);
      } finally {
        active = false;
      }
    } catch {
      return json(400, {error: 'Invalid JSON request'});
    }
  }
};
