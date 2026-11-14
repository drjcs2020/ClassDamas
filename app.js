

// Seis personagens OFICIAIS da Batalha dos Monstros V2 — somente os heróis desta batalha.
// Origem: github.com/drjcs2020/classmana-batalha-dos-monstros-V2/tree/main/assets
const BATALHA_BASE='https://raw.githubusercontent.com/drjcs2020/classmana-batalha-dos-monstros-V2/main/assets/';
const HEROES=[
 {id:'fada',name:'Fada Guerreira',file:'hero_fada.png',abbr:'FG'},
 {id:'chama',name:'Chama Congelante',file:'hero_chama.png',abbr:'CC'},
 {id:'lobo',name:'Lobo Gatuno',file:'hero_lobo.png',abbr:'LG'},
 {id:'cavaleiro',name:'Cavaleiro Guerreiro',file:'hero_cavaleiro.png',abbr:'CG'},
 {id:'dragao',name:'Dragão de Combate',file:'hero_dragao.png',abbr:'DC'},
 {id:'maga',name:'Maga Engenheira',file:'hero_maga.png',abbr:'ME'}
];
// Em cada lado, 12 peças do MESMO personagem.
// Os dois exércitos rivais têm personagens diferentes.
// As Casas e os personagens são seleções independentes.
const heroFaces=new Map();
const heroPictures=new Map();
function localFace(hero){return 'assets/monstros/rosto_'+hero.id+'.webp';}
function officialHero(hero){return BATALHA_BASE+hero.file;}
function assetFor(hero){return heroFaces.get(hero.id)||officialHero(hero);}
function setHeroImage(img,hero){
 img.dataset.personagem=hero.id;img.onload=()=>img.classList.add('is-loaded');img.src=assetFor(hero);
 img.addEventListener('error',()=>{img.classList.remove('is-loaded');if(!img.dataset.fallback){img.dataset.fallback='yes';img.src=officialHero(hero);}}, {once:true});
 return img;
}
function refreshHeroImages(){
 document.querySelectorAll('img[data-personagem]').forEach(img=>{
  const h=HEROES.find(h=>h.id===img.dataset.personagem);
  if(h&&heroFaces.has(h.id))img.src=heroFaces.get(h.id);
 });
 if(view3d)view3d.refreshPortraits();
}
// Recorta um retrato quadrado priorizando a cabeça, em vez do personagem de corpo inteiro.
// A extração acontece no navegador a partir do arquivo oficial, sem gerar personagem novo.
function cutFace(source,hero){
 const scan=document.createElement('canvas');scan.width=256;scan.height=256;
 const sx=scan.getContext('2d',{willReadFrequently:true});
 const ratio=256/Math.max(source.naturalWidth,source.naturalHeight);
 const w=source.naturalWidth*ratio,h=source.naturalHeight*ratio;
 sx.clearRect(0,0,256,256);sx.drawImage(source,(256-w)/2,(256-h)/2,w,h);
 const pix=sx.getImageData(0,0,256,256).data;
 let xmin=256,ymin=256,xmax=0,ymax=0,n=0;
 for(let y=0;y<256;y+=2)for(let x=0;x<256;x+=2){
  const i=(y*256+x)*4;
  if(pix[i+3]>80){xmin=Math.min(xmin,x);ymin=Math.min(ymin,y);xmax=Math.max(xmax,x);ymax=Math.max(ymax,y);n++;}
 }
 if(n<90){xmin=0;ymin=0;xmax=255;ymax=255;}
 const bw=xmax-xmin+1,bh=ymax-ymin+1;
 const side=Math.min(256,Math.max(55,Math.min(bw*0.67,bh*0.51)));
 const cx=(xmin+xmax)/2,cy=ymin+bh*0.31;
 const x=Math.max(0,Math.min(256-side,cx-side/2));
 const y=Math.max(0,Math.min(256-side,cy-side/2));
 const out=document.createElement('canvas');out.width=256;out.height=256;
 const g=out.getContext('2d');g.clearRect(0,0,256,256);
 g.drawImage(scan,x,y,side,side,0,0,256,256);
 return out.toDataURL('image/webp',0.92);
}
async function loadMonsterFaces(){
  const tip=$('assets-tip');
  const loadImg=src=>new Promise((resolve,reject)=>{
    const img=new Image();if(/^https?:/.test(src))img.crossOrigin='anonymous';
    img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Imagem não carregada'));
    img.src=src;
  });
  const failed=[];
  await Promise.all(HEROES.map(async hero=>{
    const cropped=localFace(hero);
    try {await loadImg(cropped);heroFaces.set(hero.id,cropped);refreshHeroImages();return;} catch(e){}
    for(const src of [`assets/monstros/${hero.file}`,officialHero(hero)]){
      try {const picture=await loadImg(src);let face;try{face=cutFace(picture,hero);}catch(e){face=src;}heroFaces.set(hero.id,face);refreshHeroImages();return;}
      catch(e){}
    }
    failed.push(hero.name);
  }));
  if(failed.length){
    tip.hidden=false;
    tip.textContent=`Retratos oficiais não carregados: ${failed.join(', ')}. As peças continuam jogáveis, mas é necessário acesso aos arquivos dos personagens. Execute INSTALAR_ARTES.bat no Windows para baixar as seis imagens oficiais.`;
  }else tip.hidden=true;
}

const HOUSES={aguia:{name:'Águia Dourada',classroom:'4º A',color:'#52a8ff'},leao:{name:'Leão de Fogo',classroom:'4º B',color:'#ff7756'},dragao:{name:'Dragão de Esmeralda',classroom:'4º C',color:'#54da9a'}};
const $=id=>document.getElementById(id);
const match=new LocalMatch();
const roundName=(p)=>p==='white'?'Jogador 1':'Jogador 2';
const place=(p)=>String.fromCharCode(65+p.c)+(8-p.r);
const pointEq=(a,b)=>!!a&&!!b&&a.r===b.r&&a.c===b.c;
const getHouse=(side)=>HOUSES[$('house-'+side).value];
let pending=null, view3d=null, displayMode='2d', statusText='Selecione um herói destacado no tabuleiro.';
const STORE='dama-classmana-monstros-equipes-v3';
const RESULTS='dama-classmana-placar-monstros-equipes-v3';
let resultLogged=false;

function selectedHeroIndex(side){return HEROES.findIndex(h=>h.id===$('hero-'+side).value);}
function sideHero(side){return HEROES[match.teams[side]];}
function teamName(side){return sideHero(side).name+' · '+getHouse(side).name;}
function selectedTeamsValid(){return selectedHeroIndex('white')>=0&&selectedHeroIndex('black')>=0&&selectedHeroIndex('white')!==selectedHeroIndex('black');}
function syncHeroSelection(){
 for(const side of ['white','black']){
  const h=HEROES.find(h=>h.id===$('hero-'+side).value);
  const portrait=$('chosen-portrait-'+side);
  if(h){if(portrait.dataset.personagem!==h.id)setHeroImage(portrait,h);portrait.alt='Rosto da equipe '+h.name;}
  $('hero-caption-'+side).textContent=h?'12 peças · '+h.name:'';
 }
}
function roster(){
  const frag=document.createDocumentFragment();
  HEROES.forEach(hero=>{
    const card=document.createElement('div');card.className='roster-unit';
    const art=document.createElement('div');art.className='roster-portrait';
    const img=document.createElement('img');setHeroImage(img,hero);img.alt='';img.loading='lazy';const fallback=document.createElement('span');fallback.className='roster-monogram';fallback.textContent=hero.abbr;art.append(fallback,img);
    const n=document.createElement('strong');n.textContent=hero.name;
    const grp=document.createElement('small');grp.textContent='Batalha dos Monstros';
    card.append(art,n,grp);frag.appendChild(card);
  });
  $('hero-roster').appendChild(frag);
}
function buildBoard(){
  const frag=document.createDocumentFragment();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const cell=document.createElement('button');cell.type='button';cell.className='cell '+(((r+c)%2)?'dark':'light');
    cell.dataset.r=r;cell.dataset.c=c;cell.setAttribute('role','gridcell');
    cell.setAttribute('aria-label',`Casa ${place({r,c})}`);
    cell.addEventListener('click',()=>clickCell(r,c));frag.appendChild(cell);
  }
  $('board-grid').replaceChildren(frag);
}
function inProgressBoard(){
  const b=copyBoard(match.board);
  if(pending&&pending.path.length>1){
    const from=pending.path[0],to=pending.path.at(-1);
    b[to.r][to.c]=b[from.r][from.c];b[from.r][from.c]=null;
  }
  return b;
}
function highlights(){
  const paths=match.possible();
  const targets=pending?pending.candidates.filter(m=>m.path.length>pending.path.length).map(m=>m.path[pending.path.length]):[];
  const marked=pending&&pending.path.length>1 ? pending.candidates[0].captures.slice(0,pending.path.length-1) : [];
  return {targets:new Set(targets.map(p=>keyOf(p.r,p.c))),from:new Set(paths.map(m=>keyOf(m.from.r,m.from.c))),marked:new Set(marked.map(p=>keyOf(p.r,p.c))),selected:pending?.path.at(-1)||null,last:match.moves.at(-1)?.move||null};
}
function clickCell(r,c){
  if(match.outcome)return;
  const p={r,c};
  if(pending){
    const matches=pending.candidates.filter(m=>m.path.length>pending.path.length&&pointEq(m.path[pending.path.length],p));
    if(matches.length){
      pending={path:[...pending.path,p],candidates:matches};
      const full=matches.find(m=>m.path.length===pending.path.length);
      if(full && matches.every(m=>m.path.length===pending.path.length)){
        try{match.play(full);pending=null;statusText=full.captures.length?`Captura confirmada: ${full.captures.length} peça(s).`:'Movimento confirmado.';saveLocal();maybeRecordResult();}
        catch(e){pending=null;statusText=e.message;}
      } else statusText='Continue a sequência de capturas. Os alvos dourados indicam as próximas casas.';
      render();return;
    }
    if(pending.path.length>1){statusText='A sequência de capturas deve ser concluída. Pressione Esc para cancelar a seleção.';render();return;}
    if(pointEq(p,pending.path[0])){pending=null;statusText='Seleção cancelada.';render();return;}
  }
  const next=match.possible().filter(m=>pointEq(m.from,p));
  if(!next.length){statusText=match.possible().some(m=>m.captures.length)?'Captura obrigatória: selecione uma peça com destaque azul.':'Selecione uma peça destacada da vez.';render();return;}
  pending={path:[p],candidates:next};
  statusText=next[0].captures.length?'Captura obrigatória! Toque em uma casa dourada.':'Escolha a casa dourada para movimentar.';
  render();
}
function tokenFor(p){
  const root=document.createElement('span');root.className='unit-piece '+p.side+(p.king?' king':'');
  root.dataset.hero=HEROES[p.hero??0]?.id||HEROES[0].id;
  const houseKey=$('house-'+p.side).value;root.style.setProperty('--token-accent',HOUSES[houseKey].color);
  const imgwrap=document.createElement('span');imgwrap.className='unit-portrait';
  const img=document.createElement('img');const h=HEROES[p.hero??0]||HEROES[0];setHeroImage(img,h);img.alt='Rosto de '+h.name;img.draggable=false;const letters=document.createElement('span');letters.className='face-letters';letters.textContent=h.abbr;imgwrap.appendChild(letters);
  imgwrap.appendChild(img);root.appendChild(imgwrap);
  const badge=document.createElement('img');badge.className='unit-house';badge.src=({aguia:'https://raw.githubusercontent.com/drjcs2020/classmana-torneio-arco-e-flecha-V2/main/assets/ui/crests/brasao-aguia-dourada.png',leao:'https://raw.githubusercontent.com/drjcs2020/classmana-torneio-arco-e-flecha-V2/main/assets/ui/crests/brasao-leao-de-fogo.png',dragao:'https://raw.githubusercontent.com/drjcs2020/classmana-torneio-arco-e-flecha-V2/main/assets/ui/crests/brasao-dragao-esmeralda.png'}[houseKey]);badge.alt='';badge.draggable=false;root.appendChild(badge);
  if(p.king){const crown=document.createElement('span');crown.className='king-crown';crown.textContent='♛';root.appendChild(crown);}
  return root;
}
function draw2d(board,h){
 const last=new Set(h.last?[keyOf(h.last.from.r,h.last.from.c),keyOf(h.last.to.r,h.last.to.c)]:[]);
 $('board-grid').querySelectorAll('.cell').forEach(cell=>{
   const r=+cell.dataset.r,c=+cell.dataset.c,k=keyOf(r,c),p=board[r][c];
   cell.classList.toggle('source',h.from.has(k)&&!pending);
   cell.classList.toggle('selected',pointEq(h.selected,{r,c}));
   cell.classList.toggle('legal',h.targets.has(k));
   cell.classList.toggle('last',last.has(k));
   cell.replaceChildren();
   if(p){const tk=tokenFor(p);if(h.marked.has(k))tk.classList.add('marked');cell.appendChild(tk);}
   cell.setAttribute('aria-label',`Casa ${place({r,c})}${p?', '+(HEROES[p.hero??0]?.name||'Herói')+', '+(p.side==='white'?'jogador 1':'jogador 2')+(p.king?', Dama':''):''}${h.targets.has(k)?', destino permitido':''}`);
 });
}
function syncHouses(){
 for(const side of ['white','black']){
   const key=$('house-'+side).value,h=HOUSES[key];
   $('team-'+side).dataset.house=key;
   $('crest-'+side).src=({aguia:'https://raw.githubusercontent.com/drjcs2020/classmana-torneio-arco-e-flecha-V2/main/assets/ui/crests/brasao-aguia-dourada.png',leao:'https://raw.githubusercontent.com/drjcs2020/classmana-torneio-arco-e-flecha-V2/main/assets/ui/crests/brasao-leao-de-fogo.png',dragao:'https://raw.githubusercontent.com/drjcs2020/classmana-torneio-arco-e-flecha-V2/main/assets/ui/crests/brasao-dragao-esmeralda.png'}[key]);
   $('crest-'+side).alt=`Brasão ${h.name}`;
   $('house-label-'+side).firstChild.nodeValue=h.name+' ';
   $('stage-crest-'+(side==='white'?'left':'right')).src=({aguia:'https://raw.githubusercontent.com/drjcs2020/classmana-torneio-arco-e-flecha-V2/main/assets/ui/crests/brasao-aguia-dourada.png',leao:'https://raw.githubusercontent.com/drjcs2020/classmana-torneio-arco-e-flecha-V2/main/assets/ui/crests/brasao-leao-de-fogo.png',dragao:'https://raw.githubusercontent.com/drjcs2020/classmana-torneio-arco-e-flecha-V2/main/assets/ui/crests/brasao-dragao-esmeralda.png'}[key]);
 }
 document.body.dataset.casa=$('house-white').value;
}
function render(){
  syncHouses();syncHeroSelection();
  const board=inProgressBoard(),h=highlights();draw2d(board,h);
  if(view3d&&displayMode==='3d')view3d.update(board,h);
  const white=board.flat().filter(p=>p?.side==='white');const black=board.flat().filter(p=>p?.side==='black');
  $('pieces-white').textContent=white.length;$('pieces-black').textContent=black.length;
  $('kings-white').textContent=white.filter(p=>p.king).length;
  $('kings-black').textContent=black.filter(p=>p.king).length;
  $('turn-counter').textContent=match.ply;
  $('turn-title').textContent=match.outcome?'DUELO ENCERRADO':teamName(match.turn);
  $('turn-subtitle').textContent=match.outcome?'Confira o resultado no placar':'Agora joga a equipe '+sideHero(match.turn).name;
  $('turn-gem').style.background=`radial-gradient(circle,${getHouse(match.turn).color},#0b1c38)`;
  $('game-message').textContent=statusText;
  $('game-message').classList.toggle('important',!!match.outcome||match.possible().some(m=>m.captures.length));
  $('undo-move').disabled=!pending&&!match.history.length;
  const log=$('move-log');log.replaceChildren();
  if(!match.moves.length){const li=document.createElement('li');li.textContent='A partida ainda não começou.';log.appendChild(li);}
  else match.moves.slice(-7).reverse().forEach((entry,index)=>{
    const li=document.createElement('li');const house=getHouse(entry.side);
    li.textContent=`${match.moves.length-index}. ${sideHero(entry.side).name} (${house.name}) · ${entry.move.path.map(place).join(' → ')}${entry.move.captures.length?' · '+entry.move.captures.length+' captura(s)':''}${entry.crowned?' · ♛ DAMA':''}`;
    log.appendChild(li);
  });
  if(match.outcome){
    const tie=match.outcome.type==='draw';
    $('status-title').textContent=tie?'Empate entre as equipes':`Vitória: ${teamName(match.outcome.winner)}`;
    $('status-description').textContent=match.outcome.reason;
    $('game-message').textContent=tie?'Empate registrado no placar local.':'🏆 Vitória da equipe '+sideHero(match.outcome.winner).name+'!';
  } else if(match.possible().some(m=>m.captures.length)){
    $('status-title').textContent='Captura obrigatória';$('status-description').textContent='Lei da Maioria ativa: escolha a sequência com mais capturas.';
  } else {$('status-title').textContent='Duelo em andamento';$('status-description').textContent='O '+roundName(match.turn)+' deve mover a equipe '+sideHero(match.turn).name+' da '+getHouse(match.turn).name+'.';}
}
function saveLocal(){
 try{localStorage.setItem(STORE,JSON.stringify({v:2,houses:{white:$('house-white').value,black:$('house-black').value},heroes:{white:sideHero('white').id,black:sideHero('black').id},moves:match.moves.map(x=>serializeMove(x.move)),resultLogged}));}catch(e){console.warn('Armazenamento local indisponível',e);}
}
function restore(){
 try{
   const raw=localStorage.getItem(STORE);if(!raw)return;
   const data=JSON.parse(raw);if(data.v!==2||!Array.isArray(data.moves)||data.moves.length>300)return;
   if(HOUSES[data.houses?.white])$('house-white').value=data.houses.white;
   if(HOUSES[data.houses?.black])$('house-black').value=data.houses.black;
   if(HEROES.some(h=>h.id===data.heroes?.white))$('hero-white').value=data.heroes.white;
   if(HEROES.some(h=>h.id===data.heroes?.black))$('hero-black').value=data.heroes.black;
   if(!selectedTeamsValid()) throw new Error('Duelo salvo com equipes inválidas');
   match.reset(selectedHeroIndex('white'),selectedHeroIndex('black'));
   for(const id of data.moves){const valid=match.possible().find(m=>serializeMove(m)===id);if(!valid)throw Error('Partida armazenada com movimento inválido.');match.play(valid);}
   resultLogged=!!data.resultLogged;
   if(match.ply)statusText='Partida local recuperada. Continue o duelo.';
 }catch(e){console.warn('O estado local foi ignorado.',e);$('hero-white').value='fada';$('hero-black').value='chama';match.reset(0,1);}
}
function readResults(){try{const r=JSON.parse(localStorage.getItem(RESULTS)||'[]');return Array.isArray(r)?r:[];}catch(e){return [];}}
function maybeRecordResult(){
 if(!match.outcome||resultLogged)return;
 const results=readResults(),entry={house1:$('house-white').value,house2:$('house-black').value,hero1:sideHero('white').id,hero2:sideHero('black').id,won:match.outcome.type==='win'?match.outcome.winner:'draw',moves:match.ply,date:new Date().toISOString()};
 results.unshift(entry);try{localStorage.setItem(RESULTS,JSON.stringify(results.slice(0,60)));}catch(e){console.warn(e);}
 resultLogged=true;saveLocal();drawResults();
}
function drawResults(){
 const results=readResults();$('score-empty').hidden=!!results.length;
 const output=$('score-rows');output.replaceChildren();
 for(const r of results.slice(0,12)){
   if(!HOUSES[r.house1]||!HOUSES[r.house2])continue;
   const row=document.createElement('div');row.className='score-row';
   const desc=document.createElement('b');desc.textContent=`${HEROES.find(h=>h.id===r.hero1)?.name||'Equipe 1'} (${HOUSES[r.house1].name}) × ${HEROES.find(h=>h.id===r.hero2)?.name||'Equipe 2'} (${HOUSES[r.house2].name})`;
   const outcome=document.createElement('span');outcome.textContent=(r.won==='draw'?'Empate':`Vitória: ${HEROES.find(h=>h.id===(r.won==='white'?r.hero1:r.hero2))?.name||'Equipe'}`)+` · ${r.moves} jogadas · ${new Date(r.date).toLocaleDateString('pt-BR')}`;
   row.append(desc,outcome);output.appendChild(row);
 }
}
function toggle3D(force){
 displayMode=force||((displayMode==='2d'&&view3d)?'3d':'2d');
 const mode3=displayMode==='3d'&&!!view3d;
 $('board-frame').hidden=mode3;$('game-canvas').hidden=!mode3;
 $('view-toggle').textContent=mode3?'◈ VISUAL ILUSTRADO':'◈ VISUAL 3D';
 $('view-status').textContent=mode3?'PLAYCANVAS ENGINE · 3D':'MODO ILUSTRADO · HERÓIS';
 if(mode3){view3d.resize();view3d.update(inProgressBoard(),highlights());}
}
function newGame(){
 if(match.ply&&!match.outcome&&!confirm('Iniciar um novo duelo? O progresso da partida atual será substituído.'))return;
 if(!selectedTeamsValid()){statusText='Escolha dois personagens diferentes: um para cada equipe.';render();return;}
 match.reset(selectedHeroIndex('white'),selectedHeroIndex('black'));pending=null;resultLogged=false;statusText='Duelo iniciado: '+sideHero('white').name+' contra '+sideHero('black').name+'.';
 saveLocal();render();
}
$('new-game').addEventListener('click',newGame);
$('undo-move').addEventListener('click',()=>{if(pending){pending=null;statusText='Seleção cancelada.';}else if(match.undo()){statusText='Movimento desfeito.';resultLogged=false;saveLocal();}render();});
for(const side of ['white','black'])$('house-'+side).addEventListener('change',()=>{if(match.ply&&!match.outcome){statusText='Casa alterada apenas na aparência desta partida local.';}saveLocal();render();});
for(const side of ['white','black'])$('hero-'+side).addEventListener('change',()=>{
 const old=HEROES[match.teams[side]].id;
 if(!selectedTeamsValid()){$('hero-'+side).value=old;statusText='Cada equipe deve ter um personagem diferente. Escolha outro herói.';render();return;}
 if(match.ply&&!match.outcome&&!confirm('Trocar o personagem reiniciará a partida atual. Deseja continuar?')){$('hero-'+side).value=old;render();return;}
 match.reset(selectedHeroIndex('white'),selectedHeroIndex('black'));pending=null;resultLogged=false;
 statusText='Duelo entre equipes: '+sideHero('white').name+' × '+sideHero('black').name+'.';saveLocal();render();
});
$('view-toggle').addEventListener('click',()=>toggle3D());
$('clear-score').addEventListener('click',()=>{if(confirm('Limpar apenas o placar de partidas locais deste navegador?')){localStorage.removeItem(RESULTS);drawResults();}});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&pending){pending=null;statusText='Seleção cancelada.';render();}});

// PlayCanvas Engine: o motor gráfico é compartilhado com o Torneio das Três Casas.
// O núcleo legal do tabuleiro é único em 2D ou em 3D.
async function init3D(){
 try{
   if(!window.pc){await new Promise((resolve,reject)=>{
     const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/playcanvas@2.23.3/build/playcanvas.min.js';s.async=true;s.crossOrigin='anonymous';
     const timeout=setTimeout(()=>{s.remove();reject(new Error('PlayCanvas não carregou.'));},8500);
     s.onload=()=>{clearTimeout(timeout);resolve();};s.onerror=()=>{clearTimeout(timeout);reject(new Error('Biblioteca PlayCanvas indisponível.'));};document.head.appendChild(s);
   });}
   if(!window.pc)throw Error('PlayCanvas ausente.');
   view3d=new Fantasy3DBoard($('game-canvas'),clickCell);
   $('view-toggle').disabled=false;$('view-toggle').title='Alternar entre arte dos personagens e tabuleiro 3D do PlayCanvas';
 }catch(e){console.info('O jogo ilustrado funciona sem carregar a biblioteca 3D:',e.message);$('view-toggle').disabled=true;$('view-toggle').title='PlayCanvas requer acesso à biblioteca pela internet';}
}
class Fantasy3DBoard{
 constructor(canvas,onClick){
   this.canvas=canvas;this.pc=window.pc;this.onClick=onClick;
   const pc=this.pc;canvas.hidden=false;
   const app=new pc.Application(canvas,{graphicsDeviceOptions:{antialias:true,alpha:true}});this.app=app;
   app.setCanvasFillMode(pc.FILLMODE_NONE);app.setCanvasResolution(pc.RESOLUTION_AUTO);app.start();
   app.scene.ambientLight=new pc.Color(.6,.55,.48);
   this.cam=new pc.Entity('Câmera isométrica');this.cam.addComponent('camera',{projection:pc.PROJECTION_ORTHOGRAPHIC,orthoHeight:6.9,nearClip:.1,farClip:100,clearColor:new pc.Color(.06,.09,.13)});app.root.addChild(this.cam);
   this.cam.setPosition(0,11,9.9);this.cam.lookAt(0,0,0);
   const lamp=new pc.Entity('Luz dourada');lamp.addComponent('light',{type:'directional',color:new pc.Color(1,.88,.63),intensity:2});app.root.addChild(lamp);lamp.setEulerAngles(55,38,15);
   const fill=new pc.Entity('Luz celeste');fill.addComponent('light',{type:'directional',color:new pc.Color(.52,.75,1),intensity:.75});app.root.addChild(fill);fill.setEulerAngles(20,-55,20);
   this.gold=this.mat('#e4b858',.6);this.outer=this.mat('#3f201c',.3);this.dark=this.mat('#1b4755',.15);this.light=this.mat('#dbbc80',.16);
   this.edge=this.mat('#e4c87c',.42);this.face0=this.mat('#295f8c',.26);this.face1=this.mat('#8c342e',.26);
   this.target=this.mat('#f0d76b',0,true);this.selected=this.mat('#fff1a1',0,true);
   this.root=new pc.Entity('Tabuleiro das Três Casas');app.root.addChild(this.root);
   this.mesh('box',this.root,0,-.26,0,8.8,.46,8.8,this.outer);
   this.mesh('box',this.root,0,-.07,0,8.45,.11,8.45,this.gold);
   for(let r=0;r<8;r++)for(let c=0;c<8;c++)this.mesh('box',this.root,c-3.5,.02,r-3.5,.99,.08,.99,(r+c)%2?this.dark:this.light);
   this.dynamic=new pc.Entity('Personagens');this.root.addChild(this.dynamic);
   this.portraits=HEROES.map(()=>null);
   this.refreshPortraits();
   this.pick=ev=>{if(this.canvas.hidden)return;const box=this.canvas.getBoundingClientRect();const x=ev.clientX-box.left,y=ev.clientY-box.top;const near=this.cam.camera.screenToWorld(x,y,this.cam.camera.nearClip);const far=this.cam.camera.screenToWorld(x,y,this.cam.camera.farClip);const direction=far.clone().sub(near);if(Math.abs(direction.y)<.000001)return;const k=(.1-near.y)/direction.y;const pt=near.clone().add(direction.mulScalar(k));const c=Math.floor(pt.x+4),r=Math.floor(pt.z+4);if(r>=0&&r<8&&c>=0&&c<8)this.onClick(r,c);};
   canvas.addEventListener('pointerdown',this.pick);this.observer=new ResizeObserver(()=>this.resize());this.observer.observe($('board-stage'));
   canvas.hidden=true;
 }
 refreshPortraits(){
   const pc=this.pc,app=this.app;
   HEROES.forEach((hero,i)=>{
     const img=new Image();img.crossOrigin='anonymous';
     img.onload=()=>{try{
       const tex=new pc.Texture(app.graphicsDevice,{mipmaps:true});tex.setSource(img);
       const m=new pc.StandardMaterial();m.diffuse=new pc.Color(1,1,1);
       m.emissive=new pc.Color(.3,.3,.3);m.diffuseMap=tex;
       m.opacityMap=tex;m.blendType=pc.BLEND_NORMAL;m.cull=pc.CULLFACE_NONE;m.update();
       this.portraits[i]=m;if(displayMode==='3d')this.update(inProgressBoard(),highlights());
     }catch(e){console.info('Retrato oficial 3D indisponível',hero.name,e.message);}};
     img.src=assetFor(hero);
   });
 }
 mat(hex,metal=.15,glow=false){const rgb=hex.replace('#','');const color=new this.pc.Color(parseInt(rgb.slice(0,2),16)/255,parseInt(rgb.slice(2,4),16)/255,parseInt(rgb.slice(4,6),16)/255);const m=new this.pc.StandardMaterial();m.diffuse=color;m.useMetalness=true;m.metalness=metal;m.gloss=.6;if(glow)m.emissive=new this.pc.Color(color.r*.6,color.g*.6,color.b*.6);m.update();return m;}
 mesh(type,parent,x,y,z,sx,sy,sz,material){const o=new this.pc.Entity(type);o.addComponent('render',{type});o.render.meshInstances[0].material=material;o.setLocalPosition(x,y,z);o.setLocalScale(sx,sy,sz);parent.addChild(o);return o;}
 update(board,h){if(!this.app)return;this.dynamic.destroy();this.dynamic=new this.pc.Entity('Personagens');this.root.addChild(this.dynamic);for(let r=0;r<8;r++)for(let c=0;c<8;c++){
   const k=keyOf(r,c),x=c-3.5,z=r-3.5,p=board[r][c];
   if(h.targets.has(k))this.mesh('cylinder',this.dynamic,x,.12,z,.28,.04,.28,this.target);
   if(pointEq(h.selected,{r,c}))this.mesh('box',this.dynamic,x,.075,z,.96,.015,.96,this.selected);
   if(!p)continue;
   this.mesh('cylinder',this.dynamic,x,.165,z,.80,.22,.80,this.gold);
   this.mesh('cylinder',this.dynamic,x,.29,z,.69,.08,.69,p.side==='white'?this.face0:this.face1);
   if(this.portraits[p.hero??0])this.mesh('plane',this.dynamic,x,.345,z,.60,1,.60,this.portraits[p.hero??0]);
   else this.mesh('cylinder',this.dynamic,x,.345,z,.36,.06,.36,this.edge);
   if(p.king){this.mesh('cylinder',this.dynamic,x,.38,z,.72,.048,.72,this.gold);this.mesh('sphere',this.dynamic,x,.43,z,.23,.23,.23,this.target);}
   if(h.from.has(k)&&!h.selected)this.mesh('sphere',this.dynamic,x,.46,z,.08,.08,.08,this.selected);
 }}
 resize(){if(this.canvas.clientWidth&&this.canvas.clientHeight)this.app.resizeCanvas(this.canvas.clientWidth,this.canvas.clientHeight);}
}
roster();buildBoard();restore();drawResults();render();toggle3D('2d');init3D();loadMonsterFaces();
