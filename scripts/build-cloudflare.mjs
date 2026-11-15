/** Gera somente os arquivos públicos (não expõe dados, API Node nem configuração interna). */
import {cpSync,rmSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(new URL('../',import.meta.url).pathname);
const out=resolve(root,'dist');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
const allow=['index.html','online.html','online-app.js','online-config.js','online.css','online-v3.css','bot-ai.js','regras.js','regras-classico.js','treino.html','app.js','styles.css','assets'];
for(const name of allow){
 const src=resolve(root,name);
 if(existsSync(src))cpSync(src,resolve(out,name),{recursive:true});
}
// A arte oficial da Batalha dos Monstros também passa a ser servida pelo Cloudflare.
// Assim a versão publicada não depende de GitHub Raw para os rostos das peças.
const portraits=['fada','chama','lobo','cavaleiro','dragao','maga'];
const destination=resolve(out,'assets','monstros');
mkdirSync(destination,{recursive:true});
for(const hero of portraits){
 const filename='hero_'+hero+'.png';
 const url='https://raw.githubusercontent.com/drjcs2020/classmana-batalha-dos-monstros-V2/main/assets/'+filename;
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Falha ao preparar arte oficial '+filename+': HTTP '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length<10000||bytes.length>25000000)throw Error('Arte inválida: '+filename);
 writeFileSync(resolve(destination,filename),bytes);
}
console.log('Cloudflare: assets seguros + 6 retratos oficiais preparados em dist/; API e banco não são públicos.');
