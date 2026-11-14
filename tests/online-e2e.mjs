import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {legalMoves} from '../regras.js';
const testRoot=mkdtempSync(join(tmpdir(),'dama-classmana-api-'));
const dbPath=join(testRoot,'isolated-dama.sqlite');
const pass='SenhaDoProfessor2026!';
const passwordHash=createHash('sha256').update(pass).digest('hex');
const port=18773,base=`http://127.0.0.1:${port}/api`;
let child;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let count=0;
function start(){
 child=spawn(process.execPath,['duel-api/server.mjs'],{
   cwd:new URL('../',import.meta.url).pathname,
   env:{...process.env,PORT:String(port),DAMA_DB_PATH:dbPath,DAMA_TEACHER_PASSWORD_SHA256:passwordHash},
   stdio:['ignore','pipe','pipe']
 });
 child.stderr.on('data',x=>{if(String(x).includes('Dama API:'))process.stderr.write(x)});
}
async function ready(){for(let i=0;i<80;i++){
 try{const r=await fetch(base+'?action=ping');if(r.ok)return;}catch{}
 if(child.exitCode!==null)throw Error('Backend encerrou antes de iniciar');
 await delay(100);
}throw Error('Servidor não iniciou');}
async function request(action,{token=null,body=null,teacher=null,qs={}}={}){
 const url=new URL(base);url.searchParams.set('action',action);Object.entries(qs).forEach(([k,v])=>url.searchParams.set(k,String(v)));
 const res=await fetch(url,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(teacher?{'X-ClassMana-Teacher':teacher}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 return {statusCode:res.status,...await res.json()};
}
const op=(data={})=>({...data,requestId:`dama-qa-${++count}-${randomUUID()}`});
async function run(){
 start();await ready();
 const ping=await request('ping');assert.equal(ping.api,'dama-v2');
 const roster=await request('roster');assert.equal(roster.players.length,78);
 const A=roster.players.find(p=>p.id==='A03'),B=roster.players.find(p=>p.id==='A07');
 assert.equal(A.team,'Fadas Guerreiras');assert.equal(B.team,'Chama Congelante');
 assert.equal(A.hero,0);assert.equal(B.hero,1);
 let rank=await request('ranking');assert.equal(rank.games,0);assert.equal(rank.groups.length,6);
 let a=await request('identify',{body:{id:'A03'}}),b=await request('identify',{body:{id:'A07'}});
 const aToken=a.token,bToken=b.token;assert(aToken&&bToken);
 // Colegas da mesma turma podem jogar, inclusive quando pertencem à mesma equipe.
 const sameGroup=await request('challenge',{token:aToken,body:op({to:'A08'})});
 assert.equal(sameGroup.statusCode,200,'same group and same class should be allowed');
 const teammate=await request('identify',{body:{id:'A08'}});
 const declineSame=await request('answer',{token:teammate.token,body:op({id:sameGroup.match.id,decision:'decline'})});
 assert.equal(declineSame.match.status,'RECUSADO');
 // Eventos entre turmas: não permitir convidar um estudante offline.
 const crossPlayer=roster.players.find(p=>p.house==='B');
 assert(crossPlayer);
 const offlineCross=await request('challenge',{token:aToken,body:op({to:crossPlayer.id})});
 assert.equal(offlineCross.statusCode,409,'cross-class duel should require online presence');
 const crossSession=await request('identify',{body:{id:crossPlayer.id}});
 const onlineList=await request('presence',{token:aToken});
 assert(onlineList.onlinePlayerIds.includes(crossPlayer.id));
 const crossInvitation=await request('challenge',{token:aToken,body:op({to:crossPlayer.id})});
 assert.equal(crossInvitation.statusCode,200,'online cross-class invitations should be supported');
 const crossDecline=await request('answer',{token:crossSession.token,body:op({id:crossInvitation.match.id,decision:'decline'})});
 assert.equal(crossDecline.match.status,'RECUSADO');
 const rejectedSelf=await request('challenge',{token:aToken,body:op({to:'A03'})});
 assert.equal(rejectedSelf.statusCode,400);
 const reqId=op({to:'A07'});
 let proposed=await request('challenge',{token:aToken,body:reqId});
 assert.equal(proposed.match.status,'PENDENTE');
 const mId=proposed.match.id;
 const same=await request('challenge',{token:aToken,body:reqId});assert.deepEqual(same.match,proposed.match);
 const original=await request('match',{token:bToken,qs:{id:mId}});
 assert.equal(original.match.board.flat().filter(p=>p?.hero===0).length,12);
 assert.equal(original.match.board.flat().filter(p=>p?.hero===1).length,12);
 const inbox=await request('inbox',{token:bToken});assert(inbox.matches.some(m=>m.id===mId));
 const premature=await request('move',{token:aToken,body:op({id:mId,path:[{r:5,c:0},{r:4,c:1}],expectedVersion:0})});
 assert.equal(premature.statusCode,409);
 const accepted=await request('answer',{token:bToken,body:op({id:mId,decision:'accept'})});
 assert.equal(accepted.match.status,'EM_ANDAMENTO');
 let current=(await request('match',{token:aToken,qs:{id:mId}})).match;
 assert.equal(current.version,1);
 const opponentTurn=await request('move',{token:bToken,body:op({id:mId,expectedVersion:1,path:[{r:2,c:1},{r:3,c:0}]})});
 assert.equal(opponentTurn.statusCode,409);
 const illegal=await request('move',{token:aToken,body:op({id:mId,expectedVersion:1,path:[{r:5,c:0},{r:2,c:3}]})});
 assert.equal(illegal.statusCode,409);
 assert.equal((await request('ranking')).games,0,'Unfinished challenges should not affect leaderboard');
 let completed=false,attempts=0;
 while(current.status==='EM_ANDAMENTO'&&attempts<305){
   attempts++;
   const actor=current.turn==='white'?aToken:bToken;
   const moves=legalMoves(current.board,current.turn);
   assert(moves.length>0,`No valid move while match in progress at ply ${current.ply}`);
   // Prefer captures and allow deterministic variety. Every submitted path is produced by the official rules.
   const chosen=moves[(attempts*19+7)%moves.length];
   const payload=op({id:mId,path:chosen.path,expectedVersion:current.version});
   const response=await request('move',{token:actor,body:payload});
   assert.equal(response.statusCode,200,`Move ${attempts}: ${response.error}`);
   current=response.match;
   if(attempts===1){
     const repeated=await request('move',{token:actor,body:payload});
     assert.equal(repeated.match.version,current.version,'Idempotent retry must not record two moves');
     const stale=await request('move',{token:actor,body:op({id:mId,path:chosen.path,expectedVersion:1})});
     assert.equal(stale.statusCode,409);
   }
   if(attempts===12){
     // Restart backend to test real persistence, including student session tokens.
     child.kill('SIGTERM');await delay(250);start();await ready();
     const resumed=await request('match',{token:aToken,qs:{id:mId}});
     assert.equal(resumed.match.version,current.version,'Board not persisted on restart');
     assert.equal(resumed.match.ply,current.ply);
   }
 }
 assert.equal(current.status,'CONCLUIDO',`Match did not complete after ${attempts} moves`);
 assert(['white','black','draw'].includes(current.outcome.result));
 rank=await request('ranking');assert.equal(rank.games,1);
 assert.equal(rank.players.filter(p=>p.plays>0).length,2);
 const groupA=rank.groups.find(x=>x.name==='Fadas Guerreiras');
 const groupB=rank.groups.find(x=>x.name==='Chama Congelante');
 assert.equal(groupA.plays,1);assert.equal(groupB.plays,1);
 assert.equal(groupA.points+groupB.points,current.outcome.result==='draw'?2:3);
 const readFinished=await request('match',{token:bToken,qs:{id:mId}});
 assert.equal(readFinished.match.moves.length,attempts);
 const afterDone=await request('move',{token:aToken,body:op({id:mId,path:[{r:5,c:0},{r:4,c:1}],expectedVersion:current.version})});
 assert.equal(afterDone.statusCode,409);
 // Professor: change season without deleting completed matches.
 const admin=await request('teacherLogin',{body:{password:pass}});assert(admin.token);
 const wrongSeason=await request('teacherNewSeason',{teacher:admin.token,body:{label:'Temporada 2',confirmation:'ZERAR V2'}});
 assert.equal(wrongSeason.statusCode,400);
 const season=await request('teacherNewSeason',{teacher:admin.token,body:{label:'Temporada 2',confirmation:'NOVA TEMPORADA'}});
 assert.equal(season.historyPreserved,true);
 const fresh=await request('ranking');assert.equal(fresh.games,0);
 const db=new DatabaseSync(dbPath,{readOnly:true});
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM matches WHERE status='CONCLUIDO'").get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM moves').get().n,attempts);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM seasons').get().n,2);
 db.close();
 // Não há senha ou PIN de estudante: outra sessão do mesmo nome deve funcionar.
 const secondSession=await request('identify',{body:{id:'A03'}});
 assert.equal(secondSession.statusCode,200);
 assert(secondSession.token,'Selecionar nome deve criar sessão sem código');
 const oldPinEndpoint=await request('teacherSetPin',{teacher:admin.token,body:{id:'A03',pin:'6372'}});
 assert.notEqual(oldPinEndpoint.statusCode,200,'A API não pode voltar a exigir PINs');
 const selected=await request('me',{token:secondSession.token});
 assert.equal(selected.player.id,'A03');
 console.log(`✅ Damas API isolated HTTP E2E: 78 roster, teams, invite, acceptance, ${attempts} validated moves, server restart, official outcome, 6-group rankings, season history, teacher-only password, student selection without PIN.`);
}
try{await run()}catch(e){console.error('❌ E2E:',e);process.exitCode=1}
finally{if(child){child.kill('SIGTERM');await delay(150)}rmSync(testRoot,{recursive:true,force:true})}
