import {DAMA_API_URL} from './online-config.js';
import {initialBoard, legalMoves, applyMove, opposite} from './regras.js';
import {chooseBotMove} from './bot-ai.js';

const $=id=>document.getElementById(id);
const GROUPS=[
 ['Fadas Guerreiras','Fada Guerreira','fada','FG','hero_fada.png'],
 ['Chama Congelante','Chama Congelante','chama','CC','hero_chama.png'],
 ['Lobos e Gatunos','Lobo Gatuno','lobo','LG','hero_lobo.png'],
 ['Cavaleiros e Guerreiros','Cavaleiro Guerreiro','cavaleiro','CG','hero_cavaleiro.png'],
 ['Dragões de Combate','Dragão de Combate','dragao','DC','hero_dragao.png'],
 ['Mágicos e Engenheiros','Maga Engenheira','maga','ME','hero_maga.png']
];
const crestImages={A:'assets/brasao_aguia.png',B:'assets/brasao_leao.png',C:'assets/brasao_dragao.png'};
const HOUSES={A:{name:'Águia Dourada',slug:'aguia',color:'#69b9f9'},B:{name:'Leão de Fogo',slug:'leao',color:'#f0755c'},C:{name:'Dragão de Esmeralda',slug:'dragao',color:'#53d89d'}};
const tokenKey='classmana-dama-student-token-v2';
const status=$('connection');
const point=(r,c)=>({r,c});
const equal=(a,b)=>!!a&&!!b&&a.r===b.r&&a.c===b.c;
const key=p=>`${p.r},${p.c}`;
const square=p=>String.fromCharCode(65+p.c)+(8-p.r);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let players=[],apiReady=false,match=null,chosen=null,rankTab='groups',busy=false,notice='Selecione seu nome para consultar os desafios oficiais.';
let gameMode='duel',onlinePlayerIds=new Set(),lastInviteCount=0;
const faceURLs=new Map();
const faceBase='https://raw.githubusercontent.com/drjcs2020/classmana-batalha-dos-monstros-V2/main/assets/';
const api={url:DAMA_API_URL,token:sessionStorage.getItem(tokenKey)||'',user:null,teacherToken:'',
 async request(action,method='GET',data={},teacher=false){
   if(!this.url)throw Error('Configure a URL da API de damas em online-config.js.');
   const u=new URL(this.url);u.searchParams.set('action',action);
   if(method==='GET')Object.entries(data).forEach(([k,v])=>u.searchParams.set(k,String(v)));
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),14000);
   try{const res=await fetch(u,{method,signal:ctrl.signal,cache:'no-store',
     headers:{'Content-Type':'application/json',...(this.token?{'Authorization':'Bearer '+this.token}:{}),
       ...(teacher?{'X-ClassMana-Teacher':this.teacherToken}:{})},
     ...(method==='POST'?{body:JSON.stringify(data)}:{})});
     const result=await res.json();if(!res.ok||!result.ok)throw Error(result.error||'Erro de conexão.');
     return result;
   }catch(e){throw Error(e.name==='AbortError'?'Tempo de conexão esgotado.':e.message)}
   finally{clearTimeout(timer)}
 },
 get(a,d={}){return this.request(a,'GET',d)},
 post(a,d={},teacher=false){return this.request(a,'POST',{
   ...d,...(['teacherLogin','teacherNewSeason','identify'].includes(a)?{}:{requestId:crypto.randomUUID()})},teacher)}
};
function setState(value,text){status.className='online-badge '+value;status.textContent=text;}
function message(s,warn=false){notice=s;$('message').textContent=s;$('message').classList.toggle('warn',warn);}
function groupFor(heroIndex){return GROUPS[heroIndex]||GROUPS[0]}
function srcFor(index){const group=groupFor(index);return faceURLs.get(group[2])||'assets/monstros/'+group[4]}
async function faceLoad(){
 await Promise.all(GROUPS.map(async (g)=>{
   const load=src=>new Promise((resolve,reject)=>{
     const img=new Image();if(src.startsWith('http'))img.crossOrigin='anonymous';
     img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Imagem indisponível'));img.src=src;
   });
   let source;
   for(const src of ['assets/monstros/rosto_'+g[2]+'.webp','assets/monstros/'+g[4],faceBase+g[4]]){
     try{source=await load(src);if(src.includes('/rosto_')){faceURLs.set(g[2],src);renderAll();return;}break;}catch{}
   }
   if(!source)return;
   try{
     const c=document.createElement('canvas');c.width=c.height=768;
     const ctx=c.getContext('2d',{willReadFrequently:true});
     const sc=768/Math.max(source.naturalWidth,source.naturalHeight),w=source.naturalWidth*sc,h=source.naturalHeight*sc;
     ctx.drawImage(source,(768-w)/2,(768-h)/2,w,h);
     const pixels=ctx.getImageData(0,0,768,768).data;
     let x0=768,y0=768,x1=0,y1=0,count=0;
     for(let y=0;y<768;y+=2)for(let x=0;x<768;x+=2){if(pixels[(y*768+x)*4+3]>80){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++}}
     if(count<400){x0=0;y0=0;x1=767;y1=767;}
     const bw=x1-x0+1,bh=y1-y0+1;
     const side=Math.min(768,Math.max(160,Math.min(bw*.67,bh*.51)));
     const sx=Math.max(0,Math.min(768-side,(x0+x1)/2-side/2));
     const sy=Math.max(0,Math.min(768-side,y0+bh*.31-side/2));
     const out=document.createElement('canvas');out.width=out.height=512;
     out.getContext('2d').drawImage(c,sx,sy,side,side,0,0,512,512);
     faceURLs.set(g[2],out.toDataURL('image/webp',.95));
   }catch{faceURLs.set(g[2],source.src)}
   renderAll();
 }));
}
function faceImg(index,cls='face'){
 const h=groupFor(index),img=document.createElement('img');img.className=cls;
 img.alt=h[1];img.draggable=false;img.src=srcFor(index);
 img.onload=()=>img.classList.add('loaded');
 img.onerror=()=>{
   if(img.dataset.tried!=='1'){
     img.dataset.tried='1';img.src=faceBase+h[4];return;
   }
   // Se não houver acesso à arte oficial, mostrar somente a sigla, sem imagem quebrada.
   const letters=h[3],svg=`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><radialGradient id="g"><stop stop-color="#456484"/><stop offset="1" stop-color="#162535"/></radialGradient></defs><circle cx="60" cy="60" r="58" fill="url(#g)" stroke="#ddb46c" stroke-width="3"/><text x="60" y="71" text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="38" fill="#ffe19a">${letters}</text></svg>`;
   img.onerror=null;img.alt='';img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
 };
 return img;
}
function renderGallery(){const host=$('hero-gallery');host.replaceChildren();for(let i=0;i<6;i++){
 const c=document.createElement('div');c.append(faceImg(i));let name=document.createElement('small');name.textContent=GROUPS[i][1];c.append(name);host.append(c);
}}
function renderPortraits(){
 const whites=match?{hero:match.whiteHero,person:match.creator}:{hero:0,person:null};
 const blacks=match?{hero:match.blackHero,person:match.recipient}:{hero:1,person:null};
 for(const [side,info] of [['white',whites],['black',blacks]]){
   const portrait=$(side+'-portrait'),h=groupFor(info.hero);
   portrait.replaceWith(faceImg(info.hero,'avatar'));const newPic=document.querySelector('#'+side+'-banner img.avatar');newPic.id=side+'-portrait';
   $(side+'-title').textContent=h[1];
   $(side+'-meta').textContent=info.person?`${info.person.name} · 4º ${info.person.house}`:'Aguardando partida';
   const house=info.person?.house||(side==='white'?'A':'B');
   $('crest-'+side).src=crestImages[house];
 }
}
function myTurn(){
 if(gameMode==='bot')return match?.status==='EM_ANDAMENTO'&&match?.turn==='white';
 return match?.status==='EM_ANDAMENTO'&&api.user&&
   (match.turn==='white'?match.creator.id:match.recipient.id)===api.user.id;
}
function paths(){return match&&myTurn()?legalMoves(match.board,match.turn):[]}
function currentBoard(){return match?.board||initialBoard(0,1)}
function selectCell(r,c){
 if(busy||!myTurn()){message('Aguarde sua vez ou selecione uma partida ativa.',true);return;}
 const p=point(r,c),moves=paths();
 if(chosen){
   const filtered=chosen.candidates.filter(m=>m.path.length>chosen.path.length&&equal(m.path[chosen.path.length],p));
   if(filtered.length){
     chosen={path:[...chosen.path,p],candidates:filtered};
     const complete=filtered.find(m=>m.path.length===chosen.path.length);
     if(complete&&filtered.every(m=>m.path.length===chosen.path.length)){
       const wanted=complete.path;chosen=null;void sendMove(wanted);return;
     }
     message('Continue a sequência de capturas.');renderBoard();return;
   }
   if(chosen.path.length>1){message('Conclua a captura obrigatória ou pressione Esc para cancelar.',true);return;}
   if(equal(p,chosen.path[0])){chosen=null;message('Seleção cancelada.');renderBoard();return;}
 }
 const options=moves.filter(m=>equal(m.from,p));
 if(!options.length){message('Escolha uma peça destacada. Capturas obrigatórias têm prioridade.',true);return;}
 chosen={path:[p],candidates:options};message('Escolha a casa iluminada para mover o herói.');renderBoard();
}
async function sendMove(path){
 if(!match)return;
 if(gameMode==='bot'){await playAgainstBot(path);return;}
 busy=true;renderBoard();message('Validando jogada no servidor…');
 try{const result=await api.post('move',{id:match.id,path,expectedVersion:match.version});
   match=result.match;message(match.status==='CONCLUIDO'?'Partida concluída! Resultado confirmado pelo servidor.':'Jogada salva. Aguarde o adversário.');
   renderAll();await Promise.allSettled([loadInbox(),loadRanking()]);
 }catch(e){message(e.message,true);await reloadMatch();}
 finally{busy=false;renderBoard();}
}
function renderBoard(){
 const overlay=$('board-overlay');
 if(overlay){
  const blocked=!match||match.status==='PENDENTE'||match.status==='RECUSADO';
  overlay.hidden=!blocked;
  const statusTitle=overlay.querySelector('strong'),statusInfo=overlay.querySelector('span');
  if(statusTitle&&statusInfo){
   if(match?.status==='PENDENTE'){statusTitle.textContent='⏳ AGUARDANDO O CONVITE SER ACEITO';statusInfo.textContent=`${match.recipient.name} precisa entrar no jogo e aceitar pelo sininho.`;}
   else if(match?.status==='RECUSADO'){statusTitle.textContent='✕ CONVITE RECUSADO';statusInfo.textContent='Escolha outro colega ou treine com o robô.';}
   else{statusTitle.textContent='♟️ TABULEIRO EM ESPERA';statusInfo.textContent='Escolha um duelo aceito ou inicie treino contra o robô.';}
  }
 }
 const board=currentBoard(),allow=paths(),start=new Set(allow.map(m=>key(m.from)));
 const next=new Set(chosen?chosen.candidates.filter(m=>m.path.length>chosen.path.length).map(m=>key(m.path[chosen.path.length])):[]);
 const recent=match?.moves?.at(-1)?.path||[];
 const boardEl=$('board'),frag=document.createDocumentFragment();
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
   const p=board[r][c],pos=point(r,c),id=key(pos);
   const cell=document.createElement('button');cell.type='button';cell.className='square '+((r+c)%2?'dark':'light');
   cell.setAttribute('role','gridcell');cell.dataset.r=r;cell.dataset.c=c;
   cell.setAttribute('aria-label',`Casa ${square(pos)}${p?', '+groupFor(p.hero)[1]:''}`);
   if(start.has(id))cell.classList.add('movable');
   if(chosen&&equal(chosen.path.at(-1),pos))cell.classList.add('selected');
   if(next.has(id))cell.classList.add('legal');
   if(recent.some(s=>equal(s,pos)))cell.classList.add('recent');
   if(p){
     cell.classList.add('haspiece');
     const circle=document.createElement('span');circle.className='piece piece-'+p.side;
     const sideHouse=(p.side==='white'?match?.creator?.house:match?.recipient?.house)||(p.side==='white'?'A':'B');
     // Sempre distinguir os dois jogadores, inclusive quando são da mesma casa e equipe.
     circle.style.setProperty('--accent',p.side==='white'?'#69c7ff':'#ff8075');
     circle.append(faceImg(p.hero));
     const initials=document.createElement('span');initials.className='initial';initials.textContent=groupFor(p.hero)[3];circle.append(initials);
     // Brasões ficam nos painéis de cada casa: os rostos nas peças permanecem legíveis.
     if(p.king){const crown=document.createElement('span');crown.className='crown';crown.textContent='♛';circle.append(crown)}
     cell.append(circle);
   }
   cell.addEventListener('click',()=>selectCell(r,c));frag.append(cell);
 }
 boardEl.replaceChildren(frag);
 let title='Aguardando uma partida';
 if(match){
   title=match.status==='PENDENTE'?'Aguardando aceite do adversário':match.status==='RECUSADO'?'Convite recusado':
     match.status==='CONCLUIDO'?(match.outcome?.result==='draw'?'EMPATE':`VITÓRIA — ${match.outcome?.result==='white'?match.creator.name:match.recipient.name}`):
     match.turn==='white'?`${match.creator.name} · ${groupFor(match.whiteHero)[1]}`:`${match.recipient.name} · ${groupFor(match.blackHero)[1]}`;
 }
 $('turn-label').textContent=title;
 $('ply').textContent=`${match?.ply||0} jogadas`;
 $('match-state').textContent=match?.status||'SELECIONE UM DUELO';
 $('reload-match').disabled=!match||gameMode==='bot'||!apiReady;
 const panel=$('duel-status');
 if(panel){
  let desc='♟️ Escolha um duelo ou comece o treino individual contra o robô.';
  if(gameMode==='bot'&&match){desc=`🤖 TREINO ${$('bot-difficulty').selectedOptions[0].text} · ${myTurn()?'SUA VEZ':match.status==='CONCLUIDO'?'PARTIDA ENCERRADA':'O ROBÔ ESTÁ JOGANDO'} · Sem pontos oficiais`;}
  else if(match){
   const names=`${match.creator.name} (4º ${match.creator.house}) × ${match.recipient.name} (4º ${match.recipient.house})`;
   desc=match.status==='PENDENTE'?`🔔 CONVITE ENVIADO · ${names} · Aguardando aceite`:
    match.status==='EM_ANDAMENTO'?`⚔️ ${names} · ${myTurn()?'É A SUA VEZ!':'AGUARDANDO O OUTRO ALUNO'}`:
    match.status==='CONCLUIDO'?`🏆 PARTIDA CONCLUÍDA · ${names}`:`✕ CONVITE RECUSADO · ${names}`;
  }
  panel.textContent=desc;
  panel.dataset.phase=gameMode==='bot'?'bot':(match?.status||'sem-jogo').toLowerCase();
 }
}
function renderHistory(){const list=$('moves');list.replaceChildren();if(!match?.moves?.length){list.innerHTML='<li>Aguardando movimentos oficiais.</li>';return;}
 for(const m of [...match.moves].reverse().slice(0,12)){
   const li=document.createElement('li');li.textContent=`${m.ply}. ${m.playerId} · ${m.path.map(square).join(' → ')}${m.captures.length?` · ${m.captures.length} capturas`:''}${m.crowned?' · ♛ DAMA':''}`;list.append(li);
 }}
function renderAll(){renderPortraits();renderBoard();renderHistory();if($('hero-gallery').children.length!==6)renderGallery()}

// O robô usa o mesmo núcleo de regras, mas não cria duelos, convites ou pontos oficiais.
function setMode(mode){
 gameMode=mode;match=null;chosen=null;busy=false;
 $('mode-duel').classList.toggle('active',mode==='duel');
 $('mode-bot').classList.toggle('active',mode==='bot');
 $('robot-settings').hidden=mode!=='bot';
 $('challenge-panel').hidden=mode==='bot';
 $('inbox-panel').hidden=mode==='bot';
 if(mode==='bot')message('Treino individual: escolha a dificuldade e inicie uma partida contra o robô.');
 else message('Duelo entre alunos: confirme seu nome, escolha a turma adversária e envie o convite.');
 renderAll();
}
function startBot(){
 const hero=api.user?.hero??0;
 const level=$('bot-difficulty').value;
 const opponentHero=(hero+1)%6;
 gameMode='bot';busy=false;chosen=null;
 match={id:crypto.randomUUID(),status:'EM_ANDAMENTO',turn:'white',ply:0,version:0,
  creator:api.user||{id:'treino',name:'Você',house:'A',hero},
  recipient:{id:'robot',name:'Robô · '+$('bot-difficulty').selectedOptions[0].text,house:'C',hero:opponentHero},
  whiteHero:hero,blackHero:opponentHero,board:initialBoard(hero,opponentHero),moves:[],outcome:null,level};
 renderAll();message('Treino iniciado! Você joga com as peças de baixo. Sua vez.');
}
function botApply(move,side){
 const piece=match.board[move.from.r][move.from.c];
 const next=applyMove(match.board,side,move);
 const crowned=!piece.king&&!!next[move.to.r][move.to.c]?.king;
 match.board=next;match.ply++;match.version++;
 match.moves.push({ply:match.ply,playerId:side==='white'?'Você':'Robô',path:move.path,captures:move.captures,crowned});
 match.turn=opposite(side);
 if(!legalMoves(match.board,match.turn).length){
  match.status='CONCLUIDO';
  match.outcome={result:side,reason:'O adversário ficou sem jogadas legais.'};
 }else if(match.ply>=160){
  match.status='CONCLUIDO';match.outcome={result:'draw',reason:'Treino encerrado por limite de jogadas.'};
 }
}
async function playAgainstBot(path){
 if(!myTurn()||busy||!match)return;
 busy=true;
 const id=match.id;
 try{
  const legal=legalMoves(match.board,'white');
  const wanted=legal.find(m=>JSON.stringify(m.path)===JSON.stringify(path));
  if(!wanted)throw Error('Jogada inválida.');
  botApply(wanted,'white');renderAll();
  if(match.status==='CONCLUIDO'){message('Você venceu a partida de treino!');return;}
  message('O robô está pensando…');
  await new Promise(resolve=>setTimeout(resolve,420));
  if(gameMode!=='bot'||match?.id!==id)return;
  const answer=chooseBotMove(match.board,'black',match.level);
  if(answer)botApply(answer,'black');
  renderAll();
  message(match.status==='CONCLUIDO'?
   (match.outcome?.result==='draw'?'Treino empatado.':'O robô venceu este treino. Tente outra vez!'):
   'O robô jogou. Agora é a sua vez!');
 }catch(e){message(e.message,true)}
 finally{busy=false;if(gameMode==='bot'&&match?.id===id)renderAll();}
}

function renderIdentity(){
 $('change-student').hidden=!api.user;
 $('confirm-student').disabled=!apiReady||!!api.user;
 $('house').disabled=!!api.user;
 $('player').disabled=!!api.user;
 $('identity').textContent=api.user?`${api.user.name} · 4º ${api.user.house} · ${api.user.team}`:'Selecione sua turma e seu nome';
 $('opponent').disabled=!api.user;$('challenge').disabled=!api.user;
 if(api.user){
   $('house').value=api.user.house;
   populatePlayers(api.user.id);
   populateOpponents();
   renderHouseTiles();
 }
}
function populatePlayers(selectedId=''){
 const box=$('player'),house=$('house').value;
 const previous=selectedId||box.value;
 box.replaceChildren(new Option('Selecione seu nome — 4º '+house,''));
 for(const p of players.filter(p=>p.house===house))box.add(new Option(`${p.name} · ${p.team}`,p.id));
 if([...box.options].some(option=>option.value===previous))box.value=previous;
}
function renderHouseTiles(){
 const host=$('target-house-tiles');if(!host)return;
 const selected=$('target-house').value;
 host.replaceChildren();
 for(const house of ['A','B','C']){
  const button=document.createElement('button');button.type='button';
  button.className='house-tile '+(selected===house?'selected':'');
  const icon=document.createElement('img');icon.src=crestImages[house];icon.alt='';
  const text=document.createElement('span');text.innerHTML=`<b>4º ${house}</b><small>${esc(HOUSES[house].name)}</small>`;
  button.append(icon,text);
  const n=players.filter(p=>p.house===house&&onlinePlayerIds.has(p.id)).length;
  const counter=document.createElement('small');counter.textContent=`${n} online`;button.append(counter);
  button.addEventListener('click',()=>{$('target-house').value=house;populateOpponents();});
  host.append(button);
 }
 $('cross-house-note').textContent=!api.user?'Confirme seu nome para convidar colegas.':
   selected===api.user.house?'Duelo na mesma turma: você pode convidar colegas, mesmo quando estiverem offline.':
   'EVENTO ENTRE TURMAS: esta opção fica disponível quando o aluno adversário estiver online.';
}
async function refreshPresence(){
 if(!api.user)return;
 try{
  const r=await api.get('presence');onlinePlayerIds=new Set(r.onlinePlayerIds||[]);
  populateOpponents();
 }catch(e){console.warn('Presença indisponível:',e.message)}
}
function populateOpponents(){
 const box=$('opponent'),previous=box.value;
 const house=$('target-house').value;
 box.replaceChildren(new Option('Escolha um colega da turma',''));
 for(const p of players){
  if(!api.user||p.id===api.user.id||p.house!==house)continue;
  const online=onlinePlayerIds.has(p.id);
  box.add(new Option(`${online?'🟢':'⚪'} ${p.name} · ${p.team} · ${online?'ONLINE':'offline'}`,p.id));
 }
 if([...box.options].some(x=>x.value===previous))box.value=previous;
 renderHouseTiles();updateOpponent();
}
function updateOpponent(){
 const opponent=players.find(p=>p.id===$('opponent').value);
 if(!opponent){$('opponent-note').textContent='Escolha um adversário para enviar o desafio.';return;}
 const cross=opponent.house!==api.user.house;
 const online=onlinePlayerIds.has(opponent.id);
 $('opponent-note').textContent=`⚔ ${GROUPS[api.user.hero][1]} × ${GROUPS[opponent.hero][1]} · ${online?'🟢 ONLINE':'⚪ OFFLINE'}${cross?' · EVENTO ENTRE TURMAS':''}`;
 $('challenge').disabled=!api.user||(cross&&!online);
}
async function confirmStudent(){
 if(busy)return;
 try{
   busy=true;
   const id=$('player').value,person=players.find(p=>p.id===id);
   if(!person||person.house!==$('house').value)throw Error('Escolha sua turma e seu nome na lista.');
   const result=await api.post('identify',{id});
   api.user=result.player;api.token=result.token;
   sessionStorage.setItem(tokenKey,result.token);
   $('target-house').value=api.user.house;
   renderIdentity();message('Nome confirmado! Escolha um colega da turma ou prepare um evento entre turmas.');
   await api.post('heartbeat');await refreshPresence();await loadInbox();
 }catch(e){message(e.message,true)}finally{busy=false;}
}
function changeStudent(){
 api.token='';api.user=null;sessionStorage.removeItem(tokenKey);
 onlinePlayerIds=new Set();lastInviteCount=0;
 $('notification-count').hidden=true;$('inbox-alert').hidden=true;
 match=null;chosen=null;
 $('player').value='';
 renderIdentity();
 $('inbox').innerHTML='<p class="muted">Selecione seu nome para ver convites.</p>';
 renderAll();message('Escolha sua turma e selecione outro nome.');
}
async function loadInbox(){if(!api.user)return;const r=await api.get('inbox');const host=$('inbox');host.replaceChildren();
 const invites=r.matches.filter(m=>m.recipient.id===api.user.id&&m.status==='PENDENTE').length;
 const bell=$('notification-bell'),badge=$('notification-count'),counter=$('inbox-alert');
 badge.hidden=invites===0;counter.hidden=invites===0;
 badge.textContent=String(invites);counter.textContent=String(invites);
 bell.classList.toggle('ringing',invites>0);
 if(invites>lastInviteCount)bell.classList.add('new-invite');
 else bell.classList.remove('new-invite');
 lastInviteCount=invites;
 if(!r.matches.length){host.innerHTML='<p class="muted">Nenhum desafio recebido ou enviado.</p>';return;}
 for(const m of r.matches){
   const mine=m.creator.id===api.user.id,opponent=mine?m.recipient:m.creator;
   const card=document.createElement('div');card.className='invite '+(m.id===match?.id?'active':'');
   card.innerHTML=`<b>${esc(opponent.name)} · ${esc(opponent.team)}</b><small>${mine?'Enviado':'Recebido'} · ${esc(m.status)} · ${new Date(m.createdAt).toLocaleDateString('pt-BR')}</small>`;
   const actions=document.createElement('div');actions.className='actions';
   const button=(caption,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=caption;b.addEventListener('click',fn);actions.append(b)};
   if(m.status==='PENDENTE'&&!mine){button('✓ Aceitar',()=>answer(m.id,'accept'));button('✕ Recusar',()=>answer(m.id,'decline'))}
   button('👁 Abrir',()=>openMatch(m.id));card.append(actions);host.append(card);
 }
}
async function sendChallenge(){const to=$('opponent').value;if(!to){message('Escolha o adversário.',true);return;}
 try{busy=true;
 await refreshPresence();
 const opponent=players.find(p=>p.id===to);
 if(!opponent)throw Error('Escolha um aluno da turma selecionada.');
 if(opponent.house!==api.user.house&&!onlinePlayerIds.has(to))
   throw Error('O aluno de outra turma está offline. Eventos entre turmas só funcionam com ambos online.');
const r=await api.post('challenge',{to});await openMatch(r.match.id);message(r.reused?'Desafio em andamento reaberto.':'Convite registrado no banco. Aguarde o aceite do adversário.');await loadInbox();}
 catch(e){message(e.message,true)}finally{busy=false}}
async function answer(id,decision){try{busy=true;const r=await api.post('answer',{id,decision});
 await openMatch(r.match.id);await loadInbox();message(decision==='accept'?'Convite aceito. A partida está aberta.':'Convite recusado.');
 }catch(e){message(e.message,true)}finally{busy=false}}
async function openMatch(id){try{
 if(gameMode==='bot')setMode('duel');
 const r=await api.get('match',{id});match=r.match;chosen=null;renderAll();
 if(match.status==='EM_ANDAMENTO')message(myTurn()?'Sua vez! Selecione uma peça do seu grupo.':'Aguarde a jogada do outro estudante.');
 else if(match.status==='CONCLUIDO')message(`Resultado confirmado: ${match.outcome?.result==='draw'?'empate':(match.outcome?.result==='white'?match.creator.name:match.recipient.name)+' venceu'}.`);
 else message(match.status==='PENDENTE'?'Convite enviado; aguardando aceite.':'Convite recusado.');
 }catch(e){message(e.message,true)}}
async function reloadMatch(){if(match)await openMatch(match.id)}
async function loadRanking(){try{const r=await api.get('ranking');
 $('season-label').textContent=`${r.season.label} · ${r.games} partidas concluídas`;
 for(const [id,records] of [['groups',r.groups],['players',r.players]]){
   const host=$(id+'-ranking');host.replaceChildren();
   if(!records?.length){host.innerHTML='<p class="muted">Ainda não há resultados oficiais.</p>';continue;}
   for(const [i,row] of records.slice(0,id==='players'?50:6).entries()){
     const div=document.createElement('div');div.className='rank-row';
     const who=id==='groups'?row.name:row.name;
     div.innerHTML=`<span class="pos">${i+1}º</span><span class="who"><b>${esc(who)}</b><small>${id==='players'?esc(row.team)+' · ':''}${row.plays} PJ · ${row.wins}V ${row.draws}E ${row.losses}D</small></span><strong>${row.points} pts</strong>`;
     host.append(div);
   }
 }
 }catch(e){message('Não foi possível carregar o ranking: '+e.message,true)}}
function showRankTab(tab){rankTab=tab;$('groups-ranking').hidden=tab!=='groups';$('players-ranking').hidden=tab!=='players';
 $('tab-groups').classList.toggle('active',tab==='groups');$('tab-players').classList.toggle('active',tab==='players');
 $('tab-groups').setAttribute('aria-selected',String(tab==='groups'));$('tab-players').setAttribute('aria-selected',String(tab==='players'));
}
async function teacherLogin(){try{const r=await api.post('teacherLogin',{password:$('teacher-password').value},true);api.teacherToken=r.token;
 $('teacher-password').value='';$('teacher-actions').hidden=false;$('teacher-message').textContent='Acesso administrativo autorizado por 30 minutos.';
 }catch(e){$('teacher-message').textContent=e.message}}
async function newSeason(){try{const r=await api.post('teacherNewSeason',{label:$('season-name').value,confirmation:$('season-confirm').value},true);
 $('teacher-message').textContent='Nova temporada criada. Histórico anterior preservado.';$('season-confirm').value='';await loadRanking();
 }catch(e){$('teacher-message').textContent=e.message}}
function bind(){
 $('confirm-student').addEventListener('click',confirmStudent);$('change-student').addEventListener('click',changeStudent);
 $('house').addEventListener('change',()=>populatePlayers());
 $('opponent').addEventListener('change',updateOpponent);
 $('target-house').addEventListener('change',populateOpponents);
 $('challenge').addEventListener('click',sendChallenge);
 $('mode-duel').addEventListener('click',()=>setMode('duel'));
 $('mode-bot').addEventListener('click',()=>setMode('bot'));
 $('bot-start').addEventListener('click',startBot);
 $('notification-bell').addEventListener('click',()=>{
  if(gameMode==='bot')setMode('duel');
  $('inbox-panel').scrollIntoView({behavior:'smooth',block:'start'});
 });
 $('refresh-inbox').addEventListener('click',()=>loadInbox().catch(e=>message(e.message,true)));
 $('reload-match').addEventListener('click',reloadMatch);$('refresh-ranking').addEventListener('click',loadRanking);
 $('open-ranking').addEventListener('click',()=>$('tab-groups').scrollIntoView({behavior:'smooth',block:'center'}));
 $('tab-groups').addEventListener('click',()=>showRankTab('groups'));
 $('tab-players').addEventListener('click',()=>showRankTab('players'));
 $('teacher-login').addEventListener('click',teacherLogin);$('new-season').addEventListener('click',newSeason);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&chosen){chosen=null;message('Seleção cancelada.');renderBoard();}});
}
async function init(){bind();renderAll();void faceLoad();showRankTab('groups');
 try{const ping=await api.get('ping');if(ping.api!=='dama-v2')throw Error('API incorreta — não use o servidor do arco e flecha.');
 apiReady=true;setState('good','● API DE DAMAS CONECTADA');
 const r=await api.get('roster');players=r.players;populatePlayers();renderIdentity();
 if(api.token){try{
  api.user=(await api.get('me')).player;
  $('target-house').value=api.user.house;
  await api.post('heartbeat');renderIdentity();await refreshPresence();await loadInbox();
 }catch{api.token='';sessionStorage.removeItem(tokenKey)}}
 await loadRanking();
 message('API conectada. Escolha sua turma e seu nome para começar — sem senha.');
 }catch(e){setState('bad','● API INDISPONÍVEL');message(e.message,true);}
 // Atualização rápida para sininho e turnos; não substitui nem antecipa a jogada do adversário.
 let ticks=0;
 setInterval(async()=>{
  if(!apiReady||busy||!api.user)return;
  try{
   if(ticks%3===0)await api.post('heartbeat');
   await loadInbox();
   if(ticks%3===0)await refreshPresence();
   if(gameMode==='duel'&&match&&['PENDENTE','EM_ANDAMENTO'].includes(match.status)){
    const detail=await api.get('match',{id:match.id});
    if(detail.match.version!==match.version){
     match=detail.match;chosen=null;renderAll();
     message(match.status==='CONCLUIDO'?'Partida encerrada e resultado registrado.':
      match.status==='EM_ANDAMENTO'?(myTurn()?'Seu adversário aceitou ou jogou. Sua vez!':'Aguarde a jogada do colega.'):
      'Aguardando resposta do colega.');
    }
   }
   if(ticks%4===0)await loadRanking();
  }catch(e){console.warn('Atualização dos duelos:',e.message)}
  ticks++;
 },4000);
}
init();
