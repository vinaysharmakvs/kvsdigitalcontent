import {migrate,closeDatabase} from '../database.mjs';
try{await migrate();console.log('Neon curriculum tables ready.');}catch{console.error('Database setup failed. Check DATABASE_URL and Neon availability.');process.exitCode=1;}finally{await closeDatabase();}
