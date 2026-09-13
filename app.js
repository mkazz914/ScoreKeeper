const STORAGE_KEY = 'rummy-score-pwa-v1';
const HISTORY_KEY = 'rummy-score-history-v1';
const COLORS = ['red','blue','green','yellow','purple','orange'];
const AVATARS = ['🐱','🤖','🐻','🐶','🦊','🐼','🐸','🦁'];

const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const defaultState = () => ({
  screen: 'setup',
  gameName: 'Rummy',
  winMode: 'low',
  endMode: 'score',
  scoreLimit: 500,
  fixedRounds: 15,
  players: [
    {id: uid(), name:'Mia', avatar:'🐱', color:'red'},
    {id: uid(), name:'Alex', avatar:'🤖', color:'blue'},
    {id: uid(), name:'Sam', avatar:'🐻', color:'green'},
    {id: uid(), name:'Chris', avatar:'🐶', color:'yellow'}
  ],
  dealerIndex: 0,
  startingDealerIndex: 0,
  rounds: [],
  currentScores: {},
  completed: false,
  startedAt: null,
  finishedAt: null,
  archivedGameId: null,
  editingRoundIndex: null,
  historyOpenId: null,
  toast: ''
});

let state = loadState();
let historyDB = loadHistory();
const app = document.getElementById('app');

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {...defaultState(), ...parsed};
  }catch{ return defaultState(); }
}
function loadHistory(){
  try{
    const raw = localStorage.getItem(HISTORY_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch{ return []; }
}
function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function persistHistory(){
  try{
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyDB));
    return true;
  }catch(err){
    console.error('History save failed', err);
    return false;
  }
}
function setToast(msg){ state.toast = msg; render(); setTimeout(()=>{ if(state.toast===msg){state.toast=''; render();}},2200); }
function totals(rounds = state.rounds, players = state.players){
  return players.map((p,pi)=>rounds.reduce((sum,r)=>sum + Number(r.scores?.[pi]||0),0));
}
function leaderIndexes(){
  if(!state.rounds.length) return [];
  const t = totals();
  const target = state.winMode==='low' ? Math.min(...t) : Math.max(...t);
  return t.map((v,i)=>v===target?i:-1).filter(i=>i>=0);
}
function roundNumber(){ return state.rounds.length + 1; }
function currentDealerName(){ return state.players[state.dealerIndex]?.name || '—'; }
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function formatDate(iso){
  if(!iso) return 'Unknown date';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(d);
}
function clone(v){ return JSON.parse(JSON.stringify(v)); }

function buildArchiveRecord(existingId = null){
  const t = totals();
  const target = t.length ? (state.winMode==='low' ? Math.min(...t) : Math.max(...t)) : 0;
  const winners = state.players.filter((_,i)=>t[i]===target).map(p=>p.id);
  return {
    id: existingId || uid(),
    gameName: state.gameName || 'Rummy',
    startedAt: state.startedAt,
    finishedAt: state.finishedAt || new Date().toISOString(),
    winMode: state.winMode,
    endMode: state.endMode,
    scoreLimit: state.scoreLimit,
    fixedRounds: state.fixedRounds,
    startingDealerIndex: state.startingDealerIndex,
    players: clone(state.players),
    rounds: clone(state.rounds),
    finalTotals: t,
    winnerIds: winners,
    roundCount: state.rounds.length
  };
}
function archiveCurrentGame(){
  if(!state.completed) return;
  const existingId = state.archivedGameId;
  const record = buildArchiveRecord(existingId);
  const existingIndex = historyDB.findIndex(g=>g.id===record.id);
  if(existingIndex>=0) historyDB[existingIndex]=record;
  else historyDB.unshift(record);
  state.archivedGameId = record.id;
  persistHistory();
  persist();
}
function syncArchiveIfNeeded(){
  if(state.completed && state.archivedGameId) archiveCurrentGame();
}

function nav(){
  if(state.screen==='setup') return '';
  return `<nav class="bottom-nav" aria-label="Main navigation">
    ${navBtn('score','⌂','Score')}
    ${navBtn('rounds','▥','Rounds')}
    ${navBtn('stats','▤','Stats')}
    ${navBtn('game','🏆','Game')}
  </nav>`;
}
function navBtn(screen,ico,label){
  return `<button class="nav-btn ${state.screen===screen?'active':''}" data-nav="${screen}"><span class="ico">${ico}</span>${label}</button>`;
}
function toast(){ return state.toast ? `<div class="toast">${esc(state.toast)}</div>` : ''; }
function header(sub=''){
  return `<header class="topbar"><div class="brand"><h1>${esc(state.gameName||'Rummy')}</h1><p>${sub}</p></div><button class="icon-btn" data-action="options" aria-label="Options">•••</button></header>`;
}

function renderSetup(){
  app.innerHTML = `${toast()}<header class="topbar"><div class="brand"><h1>Game Setup</h1><p>Configure the game, players and starting dealer</p></div></header>
  <section class="panel">
    <div class="field"><label for="gameName">Game Name</label><input id="gameName" value="${esc(state.gameName || 'Rummy')}" placeholder="Rummy" maxlength="30" autocomplete="off"><p class="field-hint">This name appears at the top of the scoreboard and is saved with completed-game history.</p></div>
    <div class="field"><label>Winning type</label><div class="segmented"><button data-win="low" class="${state.winMode==='low'?'active':''}">Lowest Score</button><button data-win="high" class="${state.winMode==='high'?'active':''}">Highest Score</button></div></div>
    <div class="field"><label>End game</label><select id="endMode"><option value="manual" ${state.endMode==='manual'?'selected':''}>Manual</option><option value="score" ${state.endMode==='score'?'selected':''}>Score Limit</option><option value="rounds" ${state.endMode==='rounds'?'selected':''}>Fixed Rounds</option></select></div>
    ${state.endMode==='score'?`<div class="field"><label>Score limit</label><input id="scoreLimit" type="number" min="1" max="99999" inputmode="numeric" value="${state.scoreLimit}"></div>`:''}
    ${state.endMode==='rounds'?`<div class="field"><label>Number of rounds</label><input id="fixedRounds" type="number" min="1" max="100" inputmode="numeric" value="${state.fixedRounds}"></div>`:''}
  </section>
  <section class="panel"><h2>Players</h2><div class="player-setup">${state.players.map((p,i)=>`<div class="player-setup-row"><div class="mini-avatar">${p.avatar}</div><input data-player-name="${i}" value="${esc(p.name)}" maxlength="24"><button class="remove-btn" data-remove="${i}" aria-label="Remove ${esc(p.name)}">×</button></div>`).join('')}</div>
    <div class="divider"></div><div class="add-row"><input id="newPlayerName" placeholder="New player"><button class="secondary-btn" data-action="add-player">Add</button></div>
  </section>
  <section class="panel"><div class="field"><label>Starting dealer</label><select id="dealerSelect">${state.players.map((p,i)=>`<option value="${i}" ${i===state.startingDealerIndex?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div></section>
  <button class="primary-btn" data-action="start-game">Start Game</button>`;
  bindCommon(); bindSetup();
}

function renderScore(){
  const t=totals(), leaders=leaderIndexes();
  app.innerHTML = `${toast()}${header(state.endMode==='score'?`First to ${state.scoreLimit}`:state.endMode==='rounds'?`${state.fixedRounds} rounds`:'Manual finish')}
  <section class="summary"><div class="summary-item"><span class="summary-label">Round</span><span class="summary-value">${roundNumber()}</span></div><div class="summary-item"><span class="summary-label">Dealer</span><span class="summary-value" style="color:#54baff">${esc(currentDealerName())}</span></div><div class="summary-item"><span class="summary-label">Leader</span><span class="summary-value">${leaders.length?esc(state.players[leaders[0]].name):'—'}</span></div></section>
  <section class="player-list">${state.players.map((p,i)=>`<article class="player-card ${p.color}"><div class="avatar">${p.avatar}</div><div><h2 class="player-name">${esc(p.name)}</h2><div class="meta-row">${i===state.dealerIndex?'<span class="badge dealer">♛ DEALER</span>':''}${leaders.includes(i)?'<span class="badge leader">🏆 LEADER</span>':''}</div><div class="total-label">Total</div><div class="total">${t[i]}</div></div><div class="score-box"><label for="score-${i}">Round ${roundNumber()}</label><input id="score-${i}" class="score-input" data-score="${i}" type="number" min="0" max="9999" inputmode="numeric" pattern="[0-9]*" value="${state.currentScores[i]??''}" placeholder="0"></div></article>`).join('')}</section>
  <button class="primary-btn" data-action="save-round">Save Round</button>${nav()}`;
  bindCommon(); bindScore();
}

function renderRoundEditor(){
  const i = state.editingRoundIndex;
  if(i===null || !state.rounds[i]) return '';
  const r = state.rounds[i];
  return `<section class="panel round-editor"><div class="editor-head"><div><h2>Edit Round ${i+1}</h2><p class="muted small">Dealer that round: ${esc(state.players[r.dealerIndex]?.name || '—')}</p></div><button class="icon-btn small-icon" data-action="cancel-edit" aria-label="Close editor">×</button></div>
    <div class="edit-score-list">${state.players.map((p,pi)=>`<label class="edit-score-row"><span>${p.avatar} ${esc(p.name)}</span><input data-edit-score="${pi}" type="number" min="0" max="9999" inputmode="numeric" value="${Number(r.scores[pi]||0)}"></label>`).join('')}</div>
    <div class="round-actions"><button class="secondary-btn" data-action="cancel-edit">Cancel</button><button class="primary-btn compact" data-action="save-edit-round">Save Changes</button></div>
  </section>`;
}

function renderRounds(){
  const t=totals();
  app.innerHTML = `${toast()}${header('Scores by round')}<section class="panel"><p class="tap-hint">Tap any round to edit it.</p><div class="table-wrap"><table class="score-table"><thead><tr><th>Rnd</th>${state.players.map(p=>`<th>${p.avatar}<br>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${state.rounds.length?state.rounds.map((r,ri)=>`<tr data-edit-round="${ri}" class="round-row ${ri===state.editingRoundIndex?'selected':''}" tabindex="0" role="button" aria-label="Edit round ${ri+1}"><td>${ri+1}</td>${r.scores.map(s=>`<td>${s}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${state.players.length+1}" class="empty">No rounds saved yet.</td></tr>`}<tr class="total-row"><th>Total</th>${t.map(v=>`<th>${v}</th>`).join('')}</tr></tbody></table></div>${state.rounds.length?`<div class="round-actions"><button class="secondary-btn" data-action="undo-round">Undo Last Round</button></div>`:''}</section>${renderRoundEditor()}${nav()}`;
  bindCommon(); bindRounds();
}

function renderHistory(){
  if(!historyDB.length) return `<section class="panel"><div class="history-head"><h2>Completed Game History</h2></div><p class="empty-history">Completed games will appear here automatically.</p></section>`;
  return `<section class="panel"><div class="history-head"><h2>Completed Game History</h2><span class="history-count">${historyDB.length} game${historyDB.length===1?'':'s'}</span></div><div class="history-list">${historyDB.map(game=>renderHistoryCard(game)).join('')}</div></section>`;
}
function renderHistoryCard(game){
  const open = state.historyOpenId===game.id;
  const totalsList = Array.isArray(game.finalTotals) ? game.finalTotals : totals(game.rounds||[],game.players||[]);
  const winnerNames = (game.players||[]).filter(p=>(game.winnerIds||[]).includes(p.id)).map(p=>p.name).join(', ') || '—';
  return `<article class="history-card ${open?'open':''}">
    <button class="history-summary" data-history-toggle="${game.id}" aria-expanded="${open}">
      <div><strong>${esc(game.gameName||'Rummy')}</strong><span>${formatDate(game.finishedAt)}</span></div>
      <div class="history-meta"><span>${game.roundCount ?? game.rounds?.length ?? 0} rnd</span><span class="history-winner">🏆 ${esc(winnerNames)}</span><span>${open?'⌃':'⌄'}</span></div>
    </button>
    ${open?`<div class="history-detail">
      <div class="history-standings">${(game.players||[]).map((p,i)=>({p,score:totalsList[i]||0})).sort((a,b)=>game.winMode==='high'?b.score-a.score:a.score-b.score).map((o,rank)=>`<div><span>${rank+1}. ${o.p.avatar} ${esc(o.p.name)}</span><strong>${o.score}</strong></div>`).join('')}</div>
      <div class="history-table-wrap"><table class="mini-history-table"><thead><tr><th>Rnd</th>${(game.players||[]).map(p=>`<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${(game.rounds||[]).map((r,ri)=>`<tr><td>${ri+1}</td>${r.scores.map(s=>`<td>${s}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <button class="danger-link" data-delete-history="${game.id}">Delete this game</button>
    </div>`:''}
  </article>`;
}

function buildPlayerStats(){
  const map = new Map();
  historyDB.forEach(game=>{
    const players = Array.isArray(game.players) ? game.players : [];
    const finals = Array.isArray(game.finalTotals) ? game.finalTotals : totals(game.rounds||[], players);
    const sorted = players.map((p,i)=>({id:p.id,name:p.name,avatar:p.avatar||'🙂',score:Number(finals[i]||0),index:i}))
      .sort((a,b)=>game.winMode==='high'?b.score-a.score:a.score-b.score);
    const rankMap = new Map();
    let rank = 1;
    sorted.forEach((o,i)=>{
      if(i>0 && o.score!==sorted[i-1].score) rank=i+1;
      rankMap.set(o.id,rank);
    });
    players.forEach((p,i)=>{
      const key=p.id || `name:${String(p.name||'Player').trim().toLowerCase()}`;
      const existing=map.get(key) || {
        id:key,
        name:p.name||'Player',
        avatar:p.avatar||'🙂',
        games:0,
        wins:0,
        totalFinalScore:0,
        totalFinish:0,
        rounds:0,
        totalRoundScore:0,
        recent:[]
      };
      existing.name=p.name||existing.name;
      existing.avatar=p.avatar||existing.avatar;
      existing.games += 1;
      existing.wins += (game.winnerIds||[]).includes(p.id) ? 1 : 0;
      existing.totalFinalScore += Number(finals[i]||0);
      existing.totalFinish += rankMap.get(p.id) || players.length;
      existing.rounds += Array.isArray(game.rounds) ? game.rounds.length : 0;
      existing.totalRoundScore += (game.rounds||[]).reduce((sum,r)=>sum+Number(r.scores?.[i]||0),0);
      existing.recent.push({
        finishedAt:game.finishedAt,
        won:(game.winnerIds||[]).includes(p.id),
        finish:rankMap.get(p.id)||players.length
      });
      map.set(key,existing);
    });
  });
  return [...map.values()].map(s=>({
    ...s,
    winPct:s.games ? (s.wins/s.games)*100 : 0,
    avgFinal:s.games ? s.totalFinalScore/s.games : 0,
    avgFinish:s.games ? s.totalFinish/s.games : 0,
    avgRound:s.rounds ? s.totalRoundScore/s.rounds : 0
  })).sort((a,b)=>b.wins-a.wins || b.winPct-a.winPct || a.avgFinish-b.avgFinish || a.name.localeCompare(b.name));
}

function renderStats(){
  const stats=buildPlayerStats();
  const totalGames=historyDB.length;
  const totalRounds=historyDB.reduce((sum,g)=>sum+Number(g.roundCount ?? g.rounds?.length ?? 0),0);
  const mostWins=stats.length?Math.max(...stats.map(s=>s.wins)):0;
  app.innerHTML = `${toast()}${header('Player statistics')}
  <section class="stats-summary">
    <div><span>Games</span><strong>${totalGames}</strong></div>
    <div><span>Rounds</span><strong>${totalRounds}</strong></div>
    <div><span>Players</span><strong>${stats.length}</strong></div>
  </section>
  ${stats.length?`<section class="stats-list">${stats.map((s,i)=>`<article class="stat-card ${s.wins===mostWins&&mostWins>0?'top-stat':''}">
    <div class="stat-card-head"><div class="stat-avatar">${s.avatar}</div><div class="stat-name-wrap"><h2>${esc(s.name)}</h2><p>${s.games} completed game${s.games===1?'':'s'}</p></div>${s.wins===mostWins&&mostWins>0?'<span class="badge leader">🏆 MOST WINS</span>':''}</div>
    <div class="stat-grid">
      <div><span>Wins</span><strong>${s.wins}</strong></div>
      <div><span>Win %</span><strong>${s.winPct.toFixed(0)}%</strong></div>
      <div><span>Avg Finish</span><strong>${s.avgFinish.toFixed(1)}</strong></div>
      <div><span>Avg Final</span><strong>${s.avgFinal.toFixed(1)}</strong></div>
      <div><span>Rounds</span><strong>${s.rounds}</strong></div>
      <div><span>Avg / Round</span><strong>${s.avgRound.toFixed(1)}</strong></div>
    </div>
  </article>`).join('')}</section>`:`<section class="panel"><div class="empty"><strong>No player statistics yet.</strong><br><span>Finish a game and it will appear here automatically.</span></div></section>`}
  <p class="stats-note">Statistics use completed-game history only. Tied winners each receive a win.</p>${nav()}`;
  bindCommon();
}

function renderGame(){
  const t=totals();
  const order = state.players.map((p,i)=>({p,i,score:t[i]})).sort((a,b)=>state.winMode==='low'?a.score-b.score:b.score-a.score);
  app.innerHTML = `${toast()}${header(state.completed?'Game over':'Game status')}<section class="panel"><h2>${state.completed?'🏆 Final Standings':'Current Standings'}</h2><div class="standings">${order.map((o,rank)=>`<div class="standing"><div class="rank">${rank+1}</div><div class="standing-name">${o.p.avatar} ${esc(o.p.name)} ${o.i===state.dealerIndex&&!state.completed?'<span class="badge dealer">DEALER</span>':''}</div><div class="standing-score">${o.score}</div></div>`).join('')}</div></section>
  <section class="panel"><h2>Game</h2><div class="actions">${!state.completed?'<button class="secondary-btn" data-action="change-dealer">Change Dealer</button><button class="secondary-btn" data-action="undo-round">Undo Last Round</button><button class="primary-btn" data-action="end-game">End Game</button>':'<button class="primary-btn" data-action="new-game">New Game</button><button class="secondary-btn" data-nav="rounds">View Rounds</button>'}</div></section>
  ${renderHistory()}
  <section class="panel"><button class="danger-btn" data-action="reset-game">Reset Game & Setup</button></section>${nav()}`;
  bindCommon(); bindGame(); bindHistory();
}

function renderOptions(){
  app.innerHTML = `${toast()}${header('More options')}<section class="panel"><div class="actions"><button class="secondary-btn" data-action="change-dealer">Change Dealer</button><button class="secondary-btn" data-action="undo-round">Undo Last Round</button><button class="secondary-btn" data-nav="setup">Game Settings</button><button class="danger-btn" data-action="reset-game">Reset Game</button></div></section>${nav()}`;
  bindCommon(); bindGame();
}

function render(){
  if(state.screen==='setup') return renderSetup();
  if(state.screen==='score') return renderScore();
  if(state.screen==='rounds') return renderRounds();
  if(state.screen==='stats') return renderStats();
  if(state.screen==='game') return renderGame();
  if(state.screen==='options') return renderOptions();
}

function bindCommon(){
  app.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>{ state.screen=b.dataset.nav; state.editingRoundIndex=null; persist(); render(); }));
  app.querySelectorAll('[data-action="options"]').forEach(b=>b.addEventListener('click',()=>{state.screen='options';state.editingRoundIndex=null;persist();render();}));
}
function bindSetup(){
  const gameName=app.querySelector('#gameName'); if(gameName) gameName.addEventListener('input',e=>{state.gameName=e.target.value;persist();});
  app.querySelectorAll('[data-win]').forEach(b=>b.addEventListener('click',()=>{state.winMode=b.dataset.win;persist();render();}));
  const end=app.querySelector('#endMode'); if(end) end.addEventListener('change',e=>{state.endMode=e.target.value;persist();render();});
  const limit=app.querySelector('#scoreLimit'); if(limit) limit.addEventListener('input',e=>{state.scoreLimit=Math.max(1,Number(e.target.value)||1);persist();});
  const fixed=app.querySelector('#fixedRounds'); if(fixed) fixed.addEventListener('input',e=>{state.fixedRounds=Math.max(1,Number(e.target.value)||1);persist();});
  app.querySelectorAll('[data-player-name]').forEach(inp=>inp.addEventListener('input',e=>{state.players[Number(inp.dataset.playerName)].name=e.target.value;persist();}));
  app.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click',()=>{if(state.players.length<=2)return setToast('At least 2 players are required.'); const i=Number(btn.dataset.remove);state.players.splice(i,1);state.startingDealerIndex=Math.min(state.startingDealerIndex,state.players.length-1);persist();render();}));
  const dealer=app.querySelector('#dealerSelect'); if(dealer) dealer.addEventListener('change',e=>{state.startingDealerIndex=Number(e.target.value);persist();});
  app.querySelector('[data-action="add-player"]')?.addEventListener('click',()=>{const input=app.querySelector('#newPlayerName');const name=input.value.trim();if(!name)return setToast('Enter a player name.');if(state.players.length>=8)return setToast('Maximum 8 players.');const idx=state.players.length;state.players.push({id:uid(),name,avatar:AVATARS[idx%AVATARS.length],color:COLORS[idx%COLORS.length]});persist();render();});
  app.querySelector('[data-action="start-game"]')?.addEventListener('click',()=>{state.gameName=(state.gameName||'').trim()||'Rummy';if(state.players.length<2)return setToast('Add at least 2 players.');if(state.players.some(p=>!p.name.trim()))return setToast('Every player needs a name.');state.dealerIndex=state.startingDealerIndex;state.rounds=[];state.currentScores={};state.completed=false;state.startedAt=new Date().toISOString();state.finishedAt=null;state.archivedGameId=null;state.editingRoundIndex=null;state.screen='score';persist();render();});
}
function bindScore(){
  app.querySelectorAll('[data-score]').forEach(inp=>inp.addEventListener('input',e=>{const i=Number(inp.dataset.score);let v=e.target.value;if(v===''){delete state.currentScores[i];} else {v=Math.max(0,Math.min(9999,Number(v)||0));state.currentScores[i]=v;}persist();}));
  app.querySelector('[data-action="save-round"]')?.addEventListener('click',()=>{
    const scores=state.players.map((_,i)=>state.currentScores[i]);
    if(scores.some(v=>v===undefined || v===null || v===''))return setToast('Enter a score for every player.');
    const normalized=scores.map(v=>Math.max(0,Math.min(9999,Number(v)||0)));
    const dealerBefore=state.dealerIndex;
    state.rounds.push({scores:normalized,dealerIndex:dealerBefore,savedAt:new Date().toISOString()});
    state.currentScores={};
    state.dealerIndex=(state.dealerIndex+1)%state.players.length;
    let shouldEnd=false;
    if(state.endMode==='rounds' && state.rounds.length>=state.fixedRounds) shouldEnd=true;
    if(state.endMode==='score'){
      const t=totals();
      shouldEnd = t.some(v=>v>=state.scoreLimit);
    }
    if(shouldEnd){state.completed=true;state.finishedAt=new Date().toISOString();state.screen='game';archiveCurrentGame();}
    persist();render();
  });
}
function undoRound(){
  if(!state.rounds.length) return setToast('No round to undo.');
  const r=state.rounds.pop();
  state.dealerIndex=r.dealerIndex;
  state.currentScores={};
  state.editingRoundIndex=null;
  if(state.completed){
    state.completed=false;
    state.finishedAt=null;
    if(state.archivedGameId){ historyDB=historyDB.filter(g=>g.id!==state.archivedGameId); persistHistory(); state.archivedGameId=null; }
  }
  persist();render();
}
function bindRounds(){
  app.querySelector('[data-action="undo-round"]')?.addEventListener('click',undoRound);
  app.querySelectorAll('[data-edit-round]').forEach(row=>{
    const open=()=>{state.editingRoundIndex=Number(row.dataset.editRound);persist();render();};
    row.addEventListener('click',open);
    row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
  });
  app.querySelectorAll('[data-action="cancel-edit"]').forEach(b=>b.addEventListener('click',()=>{state.editingRoundIndex=null;persist();render();}));
  app.querySelector('[data-action="save-edit-round"]')?.addEventListener('click',()=>{
    const ri=state.editingRoundIndex;
    if(ri===null || !state.rounds[ri]) return;
    const inputs=[...app.querySelectorAll('[data-edit-score]')];
    const values=inputs.map(inp=>inp.value);
    if(values.some(v=>v==='')) return setToast('Enter a score for every player.');
    const scores=values.map(v=>Math.max(0,Math.min(9999,Number(v)||0)));
    state.rounds[ri].scores=scores;
    state.rounds[ri].editedAt=new Date().toISOString();
    state.editingRoundIndex=null;
    syncArchiveIfNeeded();
    persist();
    setToast(`Round ${ri+1} updated.`);
  });
}
function bindHistory(){
  app.querySelectorAll('[data-history-toggle]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.historyToggle;
    state.historyOpenId=state.historyOpenId===id?null:id;
    persist();render();
  }));
  app.querySelectorAll('[data-delete-history]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.deleteHistory;
    const game=historyDB.find(g=>g.id===id);
    if(!game) return;
    if(!confirm(`Delete completed game from ${formatDate(game.finishedAt)}?`)) return;
    historyDB=historyDB.filter(g=>g.id!==id);
    if(state.archivedGameId===id) state.archivedGameId=null;
    if(state.historyOpenId===id) state.historyOpenId=null;
    persistHistory();persist();render();
  }));
}
function bindGame(){
  app.querySelectorAll('[data-action="undo-round"]').forEach(b=>b.addEventListener('click',undoRound));
  app.querySelectorAll('[data-action="change-dealer"]').forEach(b=>b.addEventListener('click',()=>{state.dealerIndex=(state.dealerIndex+1)%state.players.length;persist();setToast(`Dealer: ${currentDealerName()}`);}));
  app.querySelector('[data-action="end-game"]')?.addEventListener('click',()=>{if(!confirm('End the current game?'))return;state.completed=true;state.finishedAt=new Date().toISOString();archiveCurrentGame();persist();render();});
  app.querySelector('[data-action="new-game"]')?.addEventListener('click',()=>{state.rounds=[];state.currentScores={};state.completed=false;state.dealerIndex=state.startingDealerIndex;state.startedAt=new Date().toISOString();state.finishedAt=null;state.archivedGameId=null;state.editingRoundIndex=null;state.screen='score';persist();render();});
  app.querySelectorAll('[data-action="reset-game"]').forEach(b=>b.addEventListener('click',()=>{if(!confirm('Reset this game and return to setup? Completed game history will be kept.'))return;const fresh=defaultState();fresh.gameName=state.gameName;fresh.winMode=state.winMode;fresh.endMode=state.endMode;fresh.scoreLimit=state.scoreLimit;fresh.fixedRounds=state.fixedRounds;fresh.players=clone(state.players);fresh.startingDealerIndex=Math.min(state.startingDealerIndex,fresh.players.length-1);state=fresh;persist();render();}));
}

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
render();
