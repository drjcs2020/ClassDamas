/** E2E da nova API Workers+D1, sem credenciais Cloudflare e sem Railway. */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

const root=resolve(new URL('../',import.meta.url).pathname);
const wrangler=resolve(root,'node_modules/wrangler/bin/wrangler.js');
const state=resolve(root,'.wrangler/test-classdamas');
const port=18821,base='http://127.0.0.1:'+port;
let child,debug='',seq=0;
const op=data=>({...data,requestId:'cf-test-'+(++seq)+'-'+randomUUID()});
function check(condition,message){assert(condition,message)}
async function req(action,{token='',body=null,query={}}={}){
 const u=new URL(base+'/api');u.searchParams.set('action',action);
 Object.entries(query).forEach(([k,v])=>u.searchParams.set(k,v));
 const r=await fetch(u,{method:body===null?'GET':'POST',headers:{
  ...(token?{Authorization:'Bearer '+token}:{}),
  ...(body===null?{}:{'Content-Type':'application/json'})
 },...(body===null?{}:{body:JSON.stringify(body)})});
 const payload=await r.json();
 return {http:r.status,...payload};
}
async function waitReady(){
 for(let i=0;i<160;i++){
  if(child.exitCode!==null)throw Error('Wrangler parou: '+debug.slice(-3500));
  try{
   const r=await req('ping');
   if(r.http===200){check(r.database==='cloudflare-d1','Banco não é D1');return;}
  }catch{}
  await sleep(250);
 }
 throw Error('Timeout de inicialização do Worker: '+debug.slice(-3500));
}
async function run(){
 rmSync(state,{recursive:true,force:true});mkdirSync(state,{recursive:true});
 const build=spawnSync(process.execPath,[resolve(root,'scripts/build-cloudflare.mjs')],{cwd:root,encoding:'utf8'});
 check(build.status===0,'Falha ao gerar assets: '+build.stderr);
 const migrate=spawnSync(process.execPath,[wrangler,'d1','migrations','apply','classdamas-db','--local','--persist-to',state],{
  cwd:root,encoding:'utf8',env:{...process.env,CI:'true'},timeout:80000
 });
 check(migrate.status===0,'Falha na migração D1 local:\n'+migrate.stdout+'\n'+migrate.stderr);
 child=spawn(process.execPath,[wrangler,'dev','--local','--port',String(port),'--persist-to',state],{
  cwd:root,env:{...process.env,CI:'true'},stdio:['ignore','pipe','pipe']
 });
 child.stdout.on('data',x=>{debug=(debug+String(x)).slice(-12000)});
 child.stderr.on('data',x=>{debug=(debug+String(x)).slice(-12000)});
 await waitReady();
 const roster=await req('roster');check(roster.players.length===78,'Cadastro de alunos deve conter 78');
 const a=(await req('identify',{body:{id:'A03'}}));
 const b=(await req('identify',{body:{id:'A08'}}));
 check(a.http===200&&b.http===200,'Alunos não identificados');
 check(a.player.house===b.player.house,'Devem estar na mesma turma');
 check(a.player.team===b.player.team,'Teste entre colegas da mesma equipe');
 const challenge=await req('challenge',{token:a.token,body:op({to:b.player.id})});
 check(challenge.http===200&&challenge.match.status==='PENDENTE','Convite da mesma turma falhou: '+challenge.error);
 const pending=await req('inbox',{token:b.token});
 check(pending.matches.some(x=>x.id===challenge.match.id),'Sininho não recebeu convite');
 const forbidden=await req('move',{token:a.token,body:op({
  id:challenge.match.id,path:[{r:5,c:0},{r:4,c:1}],expectedVersion:0
 })});
 check(forbidden.http===409,'Não se pode jogar antes de aceitar');
 const accepted=await req('answer',{token:b.token,body:op({id:challenge.match.id,decision:'accept'})});
 check(accepted.http===200&&accepted.match.status==='EM_ANDAMENTO','Aceite falhou');
 const m=await req('match',{token:a.token,query:{id:challenge.match.id}});
 check(m.match.version===1,'Versão do tabuleiro não atualizada');
 const wrongTurn=await req('move',{token:b.token,body:op({
  id:m.match.id,path:[{r:2,c:1},{r:3,c:0}],expectedVersion:1
 })});
 check(wrongTurn.http===409,'Adversário jogou fora do turno');
 // Duas abas enviando jogadas diferentes simultaneamente para a MESMA versão.
 // Só uma pode vencer; a rejeitada não pode criar uma linha extra em "moves".
 const legal=[{r:5,c:0},{r:4,c:1}];
 const alternate=[{r:5,c:2},{r:4,c:1}];
 const attempts=await Promise.all([legal,alternate].map(path=>
  req('move',{token:a.token,body:op({id:m.match.id,path,expectedVersion:1})})
 ));
 check(attempts.filter(x=>x.http===200).length===1,'D1 deve aceitar somente uma jogada concorrente: '+JSON.stringify(attempts.map(x=>x.http)));
 check(attempts.filter(x=>x.http===409).length===1,'D1 deve rejeitar a jogada concorrente.');
 const good=attempts.find(x=>x.http===200);
 check(good.match.version===2&&good.match.turn==='black'&&good.match.moves.length===1,
  'A partida deve conter exatamente um lance persistido.');
 const state=await req('match',{token:a.token,query:{id:m.match.id}});
 check(state.http===200&&state.match.ply===1&&state.match.moves.length===1,
  'Lance concorrente rejeitado criou registro órfão na base D1.');
 const stale=await req('move',{token:a.token,body:op({
  id:m.match.id,path:legal,expectedVersion:1
 })});
 check(stale.http===409,'A segunda jogada fora do turno deve ser rejeitada');
 const sync=await req('sync',{token:b.token,query:{matchId:m.match.id,ranking:'1'}});
 check(sync.http===200&&sync.match.version===2&&sync.matches.length>=1,'Sincronização integrada falhou');
 check(sync.onlinePlayerIds.includes(a.player.id),'Presença da turma falhou');
 const third=roster.players.find(x=>x.house==='B');
 const offline=await req('challenge',{token:a.token,body:op({to:third.id})});
 check(offline.http===409,'Duelo entre turmas não pode começar com offline');
 const c=await req('identify',{body:{id:third.id}});
 check(c.http===200,'Aluno de outra turma não identificado');
 const cross=await req('challenge',{token:a.token,body:op({to:third.id})});
 check(cross.http===200&&cross.match.status==='PENDENTE','Desafio entre turmas online falhou');
 const crossAccept=await req('answer',{token:c.token,body:op({id:cross.match.id,decision:'accept'})});
 check(crossAccept.http===200&&crossAccept.match.status==='EM_ANDAMENTO','Aceite interturmas falhou');
 const html=await fetch(base+'/online.html');
 check(html.ok&&(await html.text()).includes('ClassMana'),'Frontend Cloudflare não está servindo');
 const leaderboard=await req('ranking');
 check(leaderboard.http===200&&leaderboard.groups.length===6,'Ranking não disponível');
 console.log('✅ Cloudflare local E2E: D1, roster 78, mesma turma/equipe, sininho, turnos, D1 concorrência e atomicidade, sync, interturmas online, seis grupos, HTML.');
}
try{await run()}catch(e){
 console.error('❌ Teste Cloudflare: '+e.stack);
 if(debug)console.error('Wrangler (últimos logs):\n'+debug.slice(-5000));
 process.exitCode=1;
}finally{
 if(child){child.kill('SIGTERM');await sleep(350);}
 rmSync(state,{recursive:true,force:true});
}
