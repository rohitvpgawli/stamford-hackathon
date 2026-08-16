import { buildApp } from './server.js';
const runtime=buildApp();
const port=Number(process.env.PORT||3001); runtime.app.listen({port,host:process.env.HOST||'0.0.0.0'}).catch(err=>{runtime.app.log.error(err);process.exit(1);});
