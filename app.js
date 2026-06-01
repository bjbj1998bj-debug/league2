const DATA = window.INITIAL_DATA || {season1:[],season2:[],total:[],pairs:[],recentMatches:[]};
let state = { tab: 'dashboard', season: 'season2', players: loadPlayers('season2'), selectedPlayer: null };
let pairScope = 'total';
let detailScope = 'total';

// 저장 기능 비활성화 버전: 브라우저 localStorage를 사용하지 않고, 항상 엑셀 원본 기반 data.js만 읽습니다.
function loadMatchRecords(scope){
  const s = scope || state.season;
  if(s === 'total') return DATA.recentMatchesTotal || [];
  return s === 'season2' ? (DATA.recentMatches || []) : (DATA.recentMatchesSeason1 || []);
}
function loadPlayers(season){
  return JSON.parse(JSON.stringify(DATA[season] || []));
}
function savePlayers(){ /* disabled: no localStorage write */ }
function resetPlayers(){
  state.players = loadPlayers(state.season);
  render();
}
function getPlayerSnapshot(name){
  return state.players.find(x=>x.name===name) || {name, elo:1500, win:0, lose:0, winRate:0, kda:0, k:0, d:0, a:0, tier:'언랭크'};
}
function pct(n){ return (n ?? 0).toFixed ? n.toFixed(1) : Number(n||0).toFixed(1); }
function byElo(players){ return [...players].sort((a,b)=>(b.elo||0)-(a.elo||0)); }
function tierClass(t){
  const s = String(t||'').toLowerCase();
  if(s.includes('마스터')) return 'tier-master'; if(s.includes('다이아')) return 'tier-diamond'; if(s.includes('플래')) return 'tier-platinum';
  if(s.includes('골드')) return 'tier-gold'; if(s.includes('실버')) return 'tier-silver'; if(s.includes('브론즈')) return 'tier-bronze'; if(s.includes('아이언')) return 'tier-iron';
  return 'tier-silver';
}
function kda(p){ return Number(p.kda || ((p.k+p.a)/Math.max(1,p.d)) || 0).toFixed(2); }
function totalGames(p){ return Number(p.win||0)+Number(p.lose||0); }
function winRate(p){ return totalGames(p) ? ((p.win/totalGames(p))*100).toFixed(1) : '0.0'; }

function getAllPlayerNames(){
  return Array.from(new Set([...(DATA.season1||[]), ...(DATA.season2||[]), ...(DATA.total||[]), ...loadMatchRecords('total').flatMap(m=>[...(m.winTeam||[]), ...(m.loseTeam||[])])].map(p=>typeof p==='string'?p:p.name).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ko'));
}
function recordDateValue(m){ return String(m.dateSort || m.date || ''); }
function playerInMatch(m, name){ return (m.winTeam||[]).includes(name) || (m.loseTeam||[]).includes(name); }
function playerWonMatch(m, name){ return (m.winTeam||[]).includes(name); }
function getDetail(m, name){ return (m.details||[]).find(x=>x.name===name) || null; }
function detailHasStats(d){ return !!d && d.hasDetail !== false && d.k !== undefined && d.k !== null; }
function numDelta(d){ return Number((d && d.delta) || 0); }
function recentPlayerMetrics(scope, lastN=5){
  const map = {};
  loadMatchRecords(scope).forEach(m=>{
    [...(m.winTeam||[]), ...(m.loseTeam||[])].forEach(name=>{
      if(!map[name]) map[name] = {name, games:0, win:0, lose:0, k:0, d:0, a:0, delta:0, records:[]};
      const d = getDetail(m,name);
      map[name].records.push({m,d});
    });
  });
  Object.values(map).forEach(x=>{
    x.records = x.records.sort((a,b)=>recordDateValue(b.m).localeCompare(recordDateValue(a.m))).slice(0,lastN);
    x.games = x.records.length;
    x.records.forEach(({m,d})=>{
      if(playerWonMatch(m,x.name)) x.win++; else x.lose++;
      if(detailHasStats(d)){ x.k += Number(d.k||0); x.d += Number(d.d||0); x.a += Number(d.a||0); x.delta += numDelta(d); }
    });
    x.kda = x.d === 0 ? (x.k + x.a) : (x.k + x.a) / x.d;
    x.winRate = x.games ? x.win/x.games*100 : 0;
  });
  return Object.values(map).filter(x=>x.games>0);
}
function miniRankList(rows, opts={}){
  const {valueKey='value', suffix='', decimals=1, high=true, sub=null} = opts;
  if(!rows.length) return `<div class="empty small">데이터가 없습니다.</div>`;
  return `<div class="metric-list">${rows.map((r,i)=>`<div class="metric-row"><div><b class="${high?'cyan':'red'}">${i+1}. ${r.name}</b><div class="small">${sub?sub(r):''}</div></div><div class="metric-value ${high?'cyan':'red'}">${Number(r[valueKey]||0).toFixed(decimals)}${suffix}</div></div>`).join('')}</div>`;
}
function opponentRows(name, scope){
  const map = {};
  loadMatchRecords(scope).forEach(m=>{
    if(!playerInMatch(m,name)) return;
    const opponents = playerWonMatch(m,name) ? (m.loseTeam||[]) : (m.winTeam||[]);
    opponents.forEach(o=>{
      if(!o || o===name) return;
      if(!map[o]) map[o] = {name:o, games:0, win:0, lose:0};
      map[o].games++;
      if(playerWonMatch(m,name)) map[o].win++; else map[o].lose++;
    });
  });
  return Object.values(map).map(r=>({...r, winRate: r.games? r.win/r.games*100:0})).filter(r=>r.games>0);
}
function opponentMiniTable(rows, good=true){
  if(!rows.length) return `<div class="empty small">상대 전적 데이터가 없습니다.</div>`;
  return `<div class="pair-mini-list">${rows.map((r,i)=>`<div class="pair-mini-row"><div><b class="${good?'cyan':'red'}">${i+1}. ${r.name}</b><div class="small">${r.games}경기 · ${r.win}승 ${r.lose}패</div></div><div class="pair-mini-rate">${pct(r.winRate)}%</div></div>`).join('')}</div>`;
}
function seasonChangeBlock(name){
  const s1 = playerSnapshotForScope(name,'season1');
  const s2 = playerSnapshotForScope(name,'season2');
  const rows = [
    {label:'ELO', before: Math.round(Number(s1.elo||0)), after: Math.round(Number(s2.elo||0)), diff: Number(s2.elo||0)-Number(s1.elo||0), unit:'', dec:0},
    {label:'승률', before: Number(winRate(s1)), after: Number(winRate(s2)), diff: Number(winRate(s2))-Number(winRate(s1)), unit:'%p', dec:1},
    {label:'KDA', before: Number(kda(s1)), after: Number(kda(s2)), diff: Number(kda(s2))-Number(kda(s1)), unit:'', dec:2},
    {label:'경기 수', before: totalGames(s1), after: totalGames(s2), diff: totalGames(s2)-totalGames(s1), unit:'', dec:0},
  ];
  return `<div class="change-grid">${rows.map(r=>`<div class="change-card"><div class="small">${r.label}</div><div><b>${Number(r.before).toFixed(r.dec)}</b> → <b class="gold">${Number(r.after).toFixed(r.dec)}</b></div><div class="${r.diff>=0?'cyan':'red'}"><b>${r.diff>=0?'+':''}${Number(r.diff).toFixed(r.dec)}${r.unit}</b></div></div>`).join('')}</div>`;
}
function personalRecords(name, scope){
  const rows=[];
  loadMatchRecords(scope).forEach(m=>{
    const d=getDetail(m,name);
    if(detailHasStats(d)) rows.push({date:m.date||'-', result:d.result || (playerWonMatch(m,name)?'승리':'패배'), position:d.position||'-', k:Number(d.k||0), d:Number(d.d||0), a:Number(d.a||0), kda:Number(d.kda||0), delta:numDelta(d)});
  });
  if(!rows.length) return `<div class="empty small">세부 기록이 없습니다.</div>`;
  const bestKda=[...rows].sort((a,b)=>b.kda-a.kda)[0];
  const mostKill=[...rows].sort((a,b)=>b.k-a.k)[0];
  const mostAssist=[...rows].sort((a,b)=>b.a-a.a)[0];
  const bestDelta=[...rows].sort((a,b)=>b.delta-a.delta)[0];
  const worstDelta=[...rows].sort((a,b)=>a.delta-b.delta)[0];
  const card=(title,r,value,cls='cyan')=>`<div class="record-card"><div class="small">${title}</div><div class="record-main ${cls}">${value}</div><div>${r.date} · ${r.result} · ${r.position}</div><div class="small">K/D/A ${r.k}/${r.d}/${r.a} · KDA ${r.kda.toFixed(2)} · ELO ${r.delta>=0?'+':''}${r.delta.toFixed(1)}</div></div>`;
  return `<div class="record-card-grid">${card('최고 KDA 경기',bestKda,bestKda.kda.toFixed(2))}${card('최다 킬 경기',mostKill,mostKill.k+'킬')}${card('최다 어시스트 경기',mostAssist,mostAssist.a+'어시')}${card('최대 ELO 상승',bestDelta,(bestDelta.delta>=0?'+':'')+bestDelta.delta.toFixed(1))}${card('최대 ELO 하락',worstDelta,worstDelta.delta.toFixed(1),'red')}</div>`;
}
function teamAvgElo(team){ return team.reduce((s,n)=>s+Number(playerSnapshotForScope(n,state.season).elo||1500),0)/Math.max(1,team.length); }
function expectedFromAvg(a,b){ return 1/(1+Math.pow(10,(b-a)/400)); }
function combinations(arr,k){
  const res=[]; const rec=(start,combo)=>{ if(combo.length===k){res.push([...combo]); return;} for(let i=start;i<arr.length;i++){ combo.push(arr[i]); rec(i+1,combo); combo.pop(); } };
  rec(0,[]); return res;
}
function sectionTitle(icon, text){ return `<h1 class="title"><span>${icon}</span>${text}</h1>`; }
function escAttr(v){ return String(v ?? '').replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function openPlayer(name){ state.selectedPlayer = name; state.tab = 'player'; render(); window.scrollTo({top:0, behavior:'smooth'}); }

function dashboard(){
  const players = byElo(state.players);
  const top = players.slice(0,3);
  const recent = loadMatchRecords();
  const recentMetrics = recentPlayerMetrics(state.season, 5);
  const recentKdaTop = [...recentMetrics].filter(x=>x.games>0).sort((a,b)=>b.kda-a.kda || b.games-a.games).slice(0,5).map(x=>({...x,value:x.kda}));
  const deltaSorted = [...recentMetrics].filter(x=>x.games>0).sort((a,b)=>b.delta-a.delta);
  const deltaTop = deltaSorted.slice(0,5).map(x=>({...x,value:x.delta}));
  const deltaWorst = [...deltaSorted].reverse().slice(0,5).map(x=>({...x,value:x.delta}));
  return `${sectionTitle('⌚','대시보드')}
  <div class="grid grid-3 dashboard-grid">
    <div class="card card-pad">
      <div class="card-title">👑 TOP 3 플레이어</div>
      <div class="top-list">${top.map((p,i)=>`<div class="top-row"><div class="top-left"><div class="rank-num">${i+1}</div><div><div class="name">${p.name}</div><div class="elo">${p.elo} ELO</div></div></div><div class="subtle"><div>${p.win}승 ${p.lose}패</div><div>승률 ${winRate(p)}%</div></div></div>`).join('')}</div>
    </div>
    <div class="card card-pad"><div class="card-title">🔥 최근 5경기 KDA TOP 5</div>${miniRankList(recentKdaTop,{valueKey:'value',decimals:2,high:true,sub:r=>`${r.games}경기 · ${r.win}승 ${r.lose}패 · ${r.k}/${r.d}/${r.a}`})}</div>
    <div class="card card-pad"><div class="card-title">📈 최근 5경기 ELO 변동</div><div class="split-metric"><div><div class="small gold">TOP 5</div>${miniRankList(deltaTop,{valueKey:'value',decimals:1,high:true,sub:r=>`${r.games}경기 · 승률 ${pct(r.winRate)}%`})}</div><div><div class="small red">WORST 5</div>${miniRankList(deltaWorst,{valueKey:'value',decimals:1,high:false,sub:r=>`${r.games}경기 · 승률 ${pct(r.winRate)}%`})}</div></div></div>
  </div>
  <div style="height:28px"></div>
  <div class="card card-pad"><div class="card-title">↻ 최근 경기 기록</div>
    ${recent.length ? `<div class="recent-grid">${recent.slice(0,8).map(m=>`<div class="recent-card"><div class="recent-meta"><span>${m.date}</span><span>승리확률 ${m.prob||'-'} · 기준변동치 ${m.baseDelta||'-'}</span></div><div class="recent-teams"><div><b class="cyan">승리</b> ${m.winTeam.join(', ')}</div><div><b class="red">패배</b> ${m.loseTeam.join(', ')}</div></div></div>`).join('')}</div>` : `<div class="empty">경기 기록이 없습니다.</div>`}
  </div>`;
}

function ranking(){
  const tiers = ['전체','그랜드 마스터','마스터','다이아몬드','플래티넘','골드','실버','브론즈','아이언'];
  const rankSource = state.season === 'season1' ? '시즌1 랭킹 출처: Summary-시즌1 시트 기준 25명' : '시즌2 랭킹 출처: 최신 시즌2 랭킹 기준 30명';
  return `${sectionTitle('🏆','랭킹표')}
    <div class="notice small">${rankSource}</div>
    <button class="btn" onclick="alert('정적 버전에서는 경기 입력 탭에서 신규 이름을 입력하면 자동 등록됩니다.')">👥 신규 플레이어 등록</button>
    <div style="height:16px"></div>
    <div class="card card-pad">
      <div class="controls"><input class="searchbox" id="rankSearch" placeholder="🔍 플레이어 검색..." oninput="renderRankTable()" /><div class="pill-wrap">${tiers.map((t,i)=>`<button class="pill ${i===0?'active':''}" onclick="setTierFilter(this,'${t}')">${t}</button>`).join('')}</div></div>
      <div id="rankTable"></div>
      <div class="footer-actions"><button class="btn" onclick="resetPlayers()">엑셀 원본 데이터 다시 불러오기</button></div>
    </div>`;
}
let tierFilter = '전체';
function setTierFilter(btn,t){ tierFilter=t; document.querySelectorAll('.pill').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); renderRankTable(); }
function renderRankTable(){
  const el=document.getElementById('rankTable'); if(!el) return;
  const q=(document.getElementById('rankSearch')?.value||'').trim();
  const rows=byElo(state.players).filter(p=>(!q||p.name.includes(q)) && (tierFilter==='전체'||String(p.tier||'').includes(tierFilter.replace('몬드',''))));
  el.innerHTML = `<div class="table-wrap"><table><thead><tr>${['순위','플레이어','티어','ELO','승','패','승률','KDA','누적 K','누적 D','누적 A'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((p,i)=>`<tr class="rank-${i+1}"><td><b>${i+1}</b></td><td><button class="player-cell player-link" onclick="openPlayer('${escAttr(p.name)}')"><span class="avatar">${p.name[0]||'?'}</span><span>${p.name}</span></button></td><td><span class="tier ${tierClass(p.tier)}">${p.tier||'언랭크'}</span></td><td class="gold"><b>${Math.round(p.elo||0)}</b></td><td class="cyan">${p.win||0}</td><td class="red">${p.lose||0}</td><td>${winRate(p)}%</td><td class="cyan"><b>${kda(p)}</b></td><td>${p.k||0}</td><td>${p.d||0}</td><td>${p.a||0}</td></tr>`).join('')}</tbody></table></div>`;
}

function pair(){
  const names = ['전체', ...Array.from(new Set(DATA.pairs.flatMap(p=>[p.p1,p.p2]))).sort((a,b)=>a.localeCompare(b,'ko'))];
  return `${sectionTitle('👥','페어 승률')}
    <div class="card card-pad">
      <div class="controls">
        <div>
          <b class="gold">동팀 페어 승률</b>
          <div class="small">시즌1, 시즌2, 전체 통합 기준을 버튼으로 전환해서 볼 수 있습니다.</div>
        </div>
        <select class="select" id="pairPlayer" onchange="renderPairs()">${names.map(n=>`<option>${n}</option>`).join('')}</select>
      </div>
      <div class="scope-tabs">
        <button class="scope-btn active" onclick="setPairScope(this,'total')">전체 통합</button>
        <button class="scope-btn" onclick="setPairScope(this,'season1')">시즌1</button>
        <button class="scope-btn" onclick="setPairScope(this,'season2')">시즌2</button>
      </div>
      <div id="pairBody"></div>
    </div>`;
}
function pairStats(r, scope){
  if(scope === 'season1'){
    const games = Number(r.pastGames || 0), win = Number(r.pastWin || 0), lose = Number(r.pastLose ?? Math.max(0, games-win));
    return {games, win, lose, rate: r.pastWinRate};
  }
  if(scope === 'season2'){
    const games = Number(r.currentGames || 0), win = Number(r.currentWin || 0), lose = Number(r.currentLose ?? Math.max(0, games-win));
    return {games, win, lose, rate: r.currentWinRate};
  }
  return {games: Number(r.games || 0), win: Number(r.win || 0), lose: Number(r.lose || 0), rate: r.winRate};
}
function setPairScope(btn, scope){
  pairScope = scope;
  document.querySelectorAll('.scope-btn').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  renderPairs();
}
function scopeLabel(scope){ return scope === 'season1' ? '시즌1' : scope === 'season2' ? '시즌2' : '전체 통합'; }
function renderPairs(){
  const el=document.getElementById('pairBody'); if(!el) return;
  const selected=document.getElementById('pairPlayer')?.value||'전체';
  let rows=DATA.pairs
    .filter(r=>selected==='전체'||r.p1===selected||r.p2===selected)
    .map(r=>({...r, scoped: pairStats(r, pairScope)}))
    .filter(r=>r.scoped.games > 0)
    .sort((a,b)=>(b.scoped.rate??-1)-(a.scoped.rate??-1) || b.scoped.games-a.scoped.games);
  const top=rows.slice(0,3);
  el.innerHTML = `${top.length?`<div class="pair-cards">${top.map(r=>`<div class="pair-card"><div class="pair-badge">${scopeLabel(pairScope)}</div><div class="pair-title">${r.p1} + ${r.p2}</div><div class="pair-rate">${pct(r.scoped.rate || 0)}%</div><div class="subtle">${r.scoped.games}경기 · ${r.scoped.win}승 ${r.scoped.lose}패</div><div class="small">전체 ${pct(r.winRate || 0)}% · 시즌1 ${r.pastWinRate??'-'}${r.pastWinRate!=null?'%':''} · 시즌2 ${r.currentWinRate??'-'}${r.currentWinRate!=null?'%':''}</div></div>`).join('')}</div>`:`<div class="empty">해당 조건의 페어 기록이 없습니다.</div>`}
  <div class="table-wrap"><table><thead><tr>${['플레이어1','플레이어2','선택 기준','경기','승','패','승률','시즌1 경기','시즌1 승률','시즌2 경기','시즌2 승률','통합 승률'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td><b>${r.p1}</b></td><td><b>${r.p2}</b></td><td class="gold"><b>${scopeLabel(pairScope)}</b></td><td>${r.scoped.games}</td><td class="cyan">${r.scoped.win}</td><td class="red">${r.scoped.lose}</td><td class="gold"><b>${pct(r.scoped.rate || 0)}%</b></td><td>${r.pastGames}</td><td>${r.pastWinRate??'-'}${r.pastWinRate!=null?'%':''}</td><td>${r.currentGames}</td><td>${r.currentWinRate??'-'}${r.currentWinRate!=null?'%':''}</td><td>${pct(r.winRate || 0)}%</td></tr>`).join('')}</tbody></table></div>`;
}

function match(){
  const roles=['탑','정글','미드','원딜','서폿'];
  const playerOptions = byElo(state.players).map(p=>`<option value="${p.name}"></option>`).join('');
  const side = (key,title,cls)=>`<div><div class="team-title ${cls}">⚔ ${title}</div>${roles.map((r,i)=>`<div class="input-row"><label>${r}</label><input list="players" id="${key}_name_${i}" placeholder="이름"><input id="${key}_k_${i}" type="number" min="0" placeholder="K"><input id="${key}_d_${i}" type="number" min="0" placeholder="D"><input id="${key}_a_${i}" type="number" min="0" placeholder="A"></div>`).join('')}</div>`;
  return `${sectionTitle('✎','경기 입력')}
    <div class="notice">저장 기능은 비활성화되어 있습니다. 입력값으로 승리확률과 예상 ELO 변동만 계산하며, 랭킹표·경기 기록·브라우저 저장소에는 반영하지 않습니다.</div>
    <div class="card card-pad"><datalist id="players">${playerOptions}</datalist><div class="match-grid">${side('win','승리 팀','win')}${side('lose','패배 팀','lose')}</div><div class="footer-actions"><button class="btn" onclick="fillSample()">현재 입력 예시 불러오기</button><button class="btn gold" onclick="submitMatch()">승률 및 ELO 변동 계산</button></div><div id="matchResult" style="margin-top:20px"></div></div>`;
}
function getOrCreatePlayer(name){
  return getPlayerSnapshot(name);
}
function submitMatch(){
  const baseK=40; const teamNames={win:[],lose:[]}; const stat={};
  for(const side of ['win','lose']) for(let i=0;i<5;i++){
    const name=document.getElementById(`${side}_name_${i}`).value.trim(); if(!name) return alert('10명의 이름을 모두 입력해주세요.');
    const k=Number(document.getElementById(`${side}_k_${i}`).value||0), d=Number(document.getElementById(`${side}_d_${i}`).value||0), a=Number(document.getElementById(`${side}_a_${i}`).value||0);
    teamNames[side].push(name); stat[name]={k,d,a,side};
  }
  const winAvg=teamNames.win.reduce((s,n)=>s+getPlayerSnapshot(n).elo,0)/5;
  const loseAvg=teamNames.lose.reduce((s,n)=>s+getPlayerSnapshot(n).elo,0)/5;
  const expectedWin=1/(1+Math.pow(10,(loseAvg-winAvg)/400));
  const details=[]; const positions=['탑','정글','미드','원딜','서폿'];
  for(const side of ['win','lose']) for(let idx=0; idx<teamNames[side].length; idx++){
    const name=teamNames[side][idx];
    const p=getPlayerSnapshot(name); const old=Number(p.elo||1500); const games=totalGames(p); const personalK=games<10?baseK*4:games<25?baseK*2:baseK;
    const delta = side==='win' ? personalK*(1-expectedWin) : personalK*(expectedWin-1);
    const newElo = Math.round((old + delta)*10)/10;
    const rowKda = stat[name].d === 0 ? stat[name].k + stat[name].a : (stat[name].k + stat[name].a) / stat[name].d;
    details.push({result: side==='win'?'승리':'패배', position: positions[idx], name, k: stat[name].k, d: stat[name].d, a: stat[name].a, kda: rowKda, oldElo: old, newElo, delta});
  }
  const rows = details.map(r=>`<tr><td class="${r.result==='승리'?'cyan':'red'}"><b>${r.result}</b></td><td>${r.position}</td><td><b>${r.name}</b></td><td>${r.k}</td><td>${r.d}</td><td>${r.a}</td><td class="cyan"><b>${Number(r.kda||0).toFixed(2)}</b></td><td>${Math.round(r.oldElo)}</td><td>${Math.round(r.newElo)}</td><td class="${r.delta>=0?'cyan':'red'}"><b>${r.delta>=0?'+':''}${r.delta.toFixed(1)}</b></td></tr>`).join('');
  document.getElementById('matchResult').innerHTML = `<div class="notice"><b>계산 완료</b> · 승리팀 예상 승률 ${(expectedWin*100).toFixed(1)}% · 기준 변동치 ${(baseK*(1-expectedWin)).toFixed(1)}<br>이 결과는 저장되지 않으며 화면을 새로고침하면 사라집니다.</div><div class="table-wrap detail-table"><table><thead><tr>${['결과','포지션','이름','K','D','A','KDA','이전 ELO','예상 이후 ELO','예상 변동폭'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function fillSample(){
  const m=(DATA.recentMatches||[])[0]; if(!m) return;
  ['win','lose'].forEach(side=>{ const arr=side==='win'?m.winTeam:m.loseTeam; arr.forEach((n,i)=>{ const e=document.getElementById(`${side}_name_${i}`); if(e) e.value=n; }); });
}


function setDetailScope(scope){
  detailScope = scope;
  render();
}
function playerSnapshotForScope(name, scope){
  const arr = DATA[scope] || [];
  const found = arr.find(x=>x.name===name);
  if(found) return found;
  const fallback = (DATA.season2||[]).find(x=>x.name===name) || (DATA.season1||[]).find(x=>x.name===name) || (DATA.total||[]).find(x=>x.name===name);
  return fallback || {name, elo:0, win:0, lose:0, winRate:0, kda:0, k:0, d:0, a:0, tier:'언랭크'};
}
function detailScopeLabel(scope){ return scope === 'season1' ? '시즌1' : scope === 'season2' ? '시즌2' : '전체 시즌'; }
function detailScopeNote(scope){
  if(scope === 'season1') return '과거데이터 + 경기기록 시트 기준 2026-05-23 이전 경기';
  if(scope === 'season2') return '경기기록 시트 기준 2026-05-23부터의 경기';
  return '과거데이터와 경기기록 시트 전체 경기 통합';
}
function playerDetail(){
  const name = state.selectedPlayer;
  if(!name) return `${sectionTitle('👤','플레이어 상세')}<div class="empty">선택된 플레이어가 없습니다.</div>`;
  const scope = detailScope || 'total';
  const p = playerSnapshotForScope(name, scope);
  const records = loadMatchRecords(scope).filter(m=>[...(m.winTeam||[]), ...(m.loseTeam||[])].includes(name));
  const posRows = (((DATA.positionStats||{})[scope]||{})[name]||[]);
  const pairRows = (DATA.pairs||[])
    .filter(r=>r.p1===name||r.p2===name)
    .map(r=>({...r, partner: r.p1===name ? r.p2 : r.p1, scoped: pairStats(r, scope)}))
    .filter(r=>r.scoped.games > 0);
  const topPairs = [...pairRows].sort((a,b)=>(b.scoped.rate??-1)-(a.scoped.rate??-1) || b.scoped.games-a.scoped.games).slice(0,3);
  const worstPairs = [...pairRows].sort((a,b)=>(a.scoped.rate??999)-(b.scoped.rate??999) || b.scoped.games-a.scoped.games).slice(0,3);
  const opponents = opponentRows(name, scope);
  const goodOpp = [...opponents].sort((a,b)=>b.winRate-a.winRate || b.games-a.games).slice(0,3);
  const badOpp = [...opponents].sort((a,b)=>a.winRate-b.winRate || b.games-a.games).slice(0,3);
  return `${sectionTitle('👤', `${name} 상세 정보`)}
    <button class="btn ghost" onclick="state.tab='ranking'; render();">← 랭킹표로 돌아가기</button>
    <div style="height:16px"></div>
    <div class="scope-tabs detail-scope-tabs">
      <button class="scope-btn ${scope==='total'?'active':''}" onclick="setDetailScope('total')">전체 시즌</button>
      <button class="scope-btn ${scope==='season1'?'active':''}" onclick="setDetailScope('season1')">시즌1</button>
      <button class="scope-btn ${scope==='season2'?'active':''}" onclick="setDetailScope('season2')">시즌2</button>
    </div>
    <div class="notice"><b>${detailScopeLabel(scope)}</b> · ${detailScopeNote(scope)}</div>
    <div style="height:16px"></div>
    <div class="player-hero card card-pad">
      <div class="player-profile">
        <span class="avatar big">${name[0]||'?'}</span>
        <div><div class="profile-name">${name}</div><span class="tier ${tierClass(p.tier)}">${p.tier||'언랭크'}</span></div>
      </div>
      <div class="mini-stat"><span>ELO</span><b class="gold">${Math.round(p.elo||0)}</b></div>
      <div class="mini-stat"><span>전적</span><b>${p.win||0}승 ${p.lose||0}패</b></div>
      <div class="mini-stat"><span>승률</span><b class="cyan">${winRate(p)}%</b></div>
      <div class="mini-stat"><span>KDA</span><b class="cyan">${kda(p)}</b></div>
    </div>
    <div class="detail-grid">
      <div class="card card-pad"><div class="card-title">📌 최근 5게임 기록 <span class="small">${detailScopeLabel(scope)} 기준</span></div>${playerRecentTable(records.slice(0,5), name)}</div>
      <div class="card card-pad"><div class="card-title">🎯 포지션별 KDA / 승률 <span class="small">${detailScopeLabel(scope)} 기준</span></div>${positionTable(posRows)}</div>
    </div>
    <div class="detail-grid">
      <div class="card card-pad"><div class="card-title">🔥 함께 했을 때 승률 TOP 3 <span class="small">${detailScopeLabel(scope)} 기준</span></div>${pairMiniTable(topPairs, true)}</div>
      <div class="card card-pad"><div class="card-title">❄ 함께 했을 때 승률 WORST 3 <span class="small">${detailScopeLabel(scope)} 기준</span></div>${pairMiniTable(worstPairs, false)}</div>
    </div>
    <div class="detail-grid">
      <div class="card card-pad"><div class="card-title">🗡 잘 잡는 상대 TOP 3 <span class="small">${detailScopeLabel(scope)} 기준</span></div>${opponentMiniTable(goodOpp, true)}</div>
      <div class="card card-pad"><div class="card-title">🛡 어려운 상대 TOP 3 <span class="small">${detailScopeLabel(scope)} 기준</span></div>${opponentMiniTable(badOpp, false)}</div>
    </div>
    <div class="card card-pad" style="margin-bottom:24px"><div class="card-title">📊 시즌1 → 시즌2 변화</div>${seasonChangeBlock(name)}</div>
    <div class="card card-pad"><div class="card-title">🏅 개인 기록 <span class="small">${detailScopeLabel(scope)} 기준</span></div>${personalRecords(name, scope)}</div>`;
}

function playerRecentTable(records, name){
  if(!records.length) return `<div class="empty small">최근 경기 기록이 없습니다.</div>`;
  return `<div class="table-wrap"><table class="compact-table"><thead><tr>${['날짜','결과','포지션','K/D/A','KDA','ELO 변동'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${records.map(m=>{
    const d=(m.details||[]).find(x=>x.name===name) || {};
    const inferredResult = d.result || ((m.winTeam||[]).includes(name) ? '승리' : ((m.loseTeam||[]).includes(name) ? '패배' : '-'));
    const hasStat = d.hasDetail !== false && d.k !== undefined && d.k !== null;
    return `<tr><td>${m.date||'-'}</td><td class="${inferredResult==='승리'?'cyan':'red'}"><b>${inferredResult}</b></td><td>${hasStat ? (d.position||'-') : '기록 없음'}</td><td>${hasStat ? `${d.k??0}/${d.d??0}/${d.a??0}` : '-'}</td><td class="cyan"><b>${hasStat ? Number(d.kda||0).toFixed(2) : '-'}</b></td><td class="${Number(d.delta||0)>=0?'cyan':'red'}"><b>${hasStat ? `${Number(d.delta||0)>=0?'+':''}${Number(d.delta||0).toFixed(1)}` : '-'}</b></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function positionTable(rows){
  if(!rows.length) return `<div class="empty small">선택 시즌의 세부 경기기록 기반 포지션 통계가 없습니다.</div>`;
  return `<div class="table-wrap"><table class="compact-table"><thead><tr>${['포지션','경기','승','패','승률','KDA','K','D','A'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td class="gold"><b>${r.position}</b></td><td>${r.games}</td><td class="cyan">${r.win}</td><td class="red">${r.lose}</td><td><b>${pct(r.winRate)}%</b></td><td class="cyan"><b>${Number(r.kda||0).toFixed(2)}</b></td><td>${r.k}</td><td>${r.d}</td><td>${r.a}</td></tr>`).join('')}</tbody></table></div>`;
}
function pairMiniTable(rows, high=true){
  if(!rows.length) return `<div class="empty small">페어 기록이 없습니다.</div>`;
  return `<div class="pair-mini-list">${rows.map((r,i)=>`<div class="pair-mini-row"><div><b class="${high?'cyan':'red'}">${i+1}. ${r.partner}</b><div class="small">${r.scoped.games}경기 · ${r.scoped.win}승 ${r.scoped.lose}패</div></div><div class="pair-mini-rate">${pct(r.scoped.rate||0)}%</div></div>`).join('')}</div>`;
}

function records(){
  const players = Array.from(new Set(loadMatchRecords().flatMap(m=>[...(m.winTeam||[]), ...(m.loseTeam||[])]))).sort((a,b)=>a.localeCompare(b,'ko'));
  return `${sectionTitle('📜','경기 기록')}
    <div class="card card-pad">
      <div class="controls">
        <div><b class="gold">세부 경기 내용</b><div class="small">경기별 승패 팀, 포지션, K/D/A, KDA, ELO 변동을 확인할 수 있습니다.</div></div>
        <div class="record-filters">
          <input class="searchbox" id="recordSearch" placeholder="플레이어 또는 날짜 검색..." oninput="renderRecords()" />
          <select class="select" id="recordPlayer" onchange="renderRecords()"><option>전체</option>${players.map(n=>`<option>${n}</option>`).join('')}</select>
        </div>
      </div>
      <div id="recordBody"></div>
    </div>`;
}
function matchSummary(m, idx){
  const win = (m.winTeam||[]).join(', ');
  const lose = (m.loseTeam||[]).join(', ');
  return `<div class="match-record">
    <button class="match-head" onclick="toggleRecord(${idx})">
      <div><b class="gold">${m.date || '-'}</b><span class="small"> · 승리확률 ${m.prob || '-'} · 기준변동치 ${m.baseDelta || '-'}</span></div>
      <div class="small">상세 보기/닫기</div>
    </button>
    <div class="record-teams"><div><b class="cyan">승리</b> ${win}</div><div><b class="red">패배</b> ${lose}</div></div>
    <div class="record-detail" id="record_detail_${idx}">${recordDetailTable(m)}</div>
  </div>`;
}
function recordDetailTable(m){
  const rows = m.details || [];
  if(!rows.length) return `<div class="empty small">세부 K/D/A 기록이 없습니다.</div>`;
  return `<div class="table-wrap detail-table"><table><thead><tr>${['결과','포지션','이름','K','D','A','KDA','이전 ELO','이후 ELO','변동폭'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td class="${r.result==='승리'?'cyan':'red'}"><b>${r.result}</b></td><td>${r.position||'-'}</td><td><b>${r.name||'-'}</b></td><td>${r.k??0}</td><td>${r.d??0}</td><td>${r.a??0}</td><td class="cyan"><b>${Number(r.kda||0).toFixed(2)}</b></td><td>${Math.round(r.oldElo||0)}</td><td>${Math.round(r.newElo||0)}</td><td class="${Number(r.delta||0)>=0?'cyan':'red'}"><b>${Number(r.delta||0)>=0?'+':''}${Number(r.delta||0).toFixed(1)}</b></td></tr>`).join('')}</tbody></table></div>`;
}
function toggleRecord(idx){
  const el=document.getElementById('record_detail_'+idx); if(el) el.classList.toggle('open');
}
function renderRecords(){
  const el=document.getElementById('recordBody'); if(!el) return;
  const q=(document.getElementById('recordSearch')?.value||'').trim();
  const selected=document.getElementById('recordPlayer')?.value||'전체';
  const rows=loadMatchRecords().filter(m=>{
    const names=[...(m.winTeam||[]), ...(m.loseTeam||[])];
    const qHit=!q || String(m.date||'').includes(q) || names.some(n=>n.includes(q));
    const pHit=selected==='전체' || names.includes(selected);
    return qHit && pHit;
  });
  el.innerHTML = rows.length ? rows.map((m,i)=>matchSummary(m,i)).join('') : `<div class="empty">경기 기록이 없습니다.</div>`;
}


function matchup(){
  const names = getAllPlayerNames();
  return `${sectionTitle('⚔','매치업 분석')}
    <div class="card card-pad">
      <div class="controls"><div><b class="gold">두 플레이어의 동팀/상대 전적 분석</b><div class="small">같은 팀일 때 승률, 서로 상대했을 때 승률, 평균 KDA를 확인합니다.</div></div></div>
      <div class="analysis-controls">
        <select class="select" id="matchupA">${names.map(n=>`<option>${n}</option>`).join('')}</select>
        <span class="vs-label">VS</span>
        <select class="select" id="matchupB">${names.map((n,i)=>`<option ${i===1?'selected':''}>${n}</option>`).join('')}</select>
        <select class="select" id="matchupScope"><option value="total">전체 시즌</option><option value="season1">시즌1</option><option value="season2" selected>시즌2</option></select>
        <button class="btn gold" onclick="renderMatchupResult()">분석하기</button>
      </div>
      <div id="matchupResult" style="margin-top:22px"></div>
    </div>`;
}
function calcPlayerAvgInMatches(name, matches){
  let k=0,d=0,a=0,delta=0,detailGames=0;
  matches.forEach(m=>{ const x=getDetail(m,name); if(detailHasStats(x)){ k+=Number(x.k||0); d+=Number(x.d||0); a+=Number(x.a||0); delta+=numDelta(x); detailGames++; }});
  return {detailGames,k,d,a,kda:d===0?k+a:(k+a)/d,delta};
}
function renderMatchupResult(){
  const a=document.getElementById('matchupA')?.value, b=document.getElementById('matchupB')?.value, scope=document.getElementById('matchupScope')?.value||'total';
  const el=document.getElementById('matchupResult'); if(!el) return;
  if(!a || !b || a===b){ el.innerHTML='<div class="empty small">서로 다른 두 명을 선택해주세요.</div>'; return; }
  const matches=loadMatchRecords(scope).filter(m=>playerInMatch(m,a)&&playerInMatch(m,b));
  const same=matches.filter(m=>(m.winTeam||[]).includes(a)&&(m.winTeam||[]).includes(b) || (m.loseTeam||[]).includes(a)&&(m.loseTeam||[]).includes(b));
  const versus=matches.filter(m=>!same.includes(m));
  const sameWin=same.filter(m=>(m.winTeam||[]).includes(a)&&(m.winTeam||[]).includes(b)).length;
  const aWin=versus.filter(m=>playerWonMatch(m,a)).length;
  const bWin=versus.filter(m=>playerWonMatch(m,b)).length;
  const aAvg=calcPlayerAvgInMatches(a,versus), bAvg=calcPlayerAvgInMatches(b,versus);
  const sameAvgA=calcPlayerAvgInMatches(a,same), sameAvgB=calcPlayerAvgInMatches(b,same);
  const recentRows=[...matches].sort((x,y)=>recordDateValue(y).localeCompare(recordDateValue(x))).slice(0,8);
  el.innerHTML = `<div class="matchup-summary">
      <div class="mini-stat"><span>같은 팀 전적</span><b class="cyan">${same.length?`${sameWin}승 ${same.length-sameWin}패`: '-'}</b><div class="small">승률 ${same.length?pct(sameWin/same.length*100)+'%':'-'}</div></div>
      <div class="mini-stat"><span>상대 전적</span><b>${versus.length}경기</b><div class="small">${a} ${aWin}승 · ${b} ${bWin}승</div></div>
      <div class="mini-stat"><span>${a} 상대 KDA</span><b class="cyan">${aAvg.detailGames?aAvg.kda.toFixed(2):'-'}</b><div class="small">ELO ${aAvg.delta>=0?'+':''}${aAvg.delta.toFixed(1)}</div></div>
      <div class="mini-stat"><span>${b} 상대 KDA</span><b class="cyan">${bAvg.detailGames?bAvg.kda.toFixed(2):'-'}</b><div class="small">ELO ${bAvg.delta>=0?'+':''}${bAvg.delta.toFixed(1)}</div></div>
    </div>
    <div class="detail-grid" style="margin-top:22px">
      <div class="card card-pad inner-card"><div class="card-title">🤝 같은 팀일 때 평균</div><div class="small">${a}: KDA ${sameAvgA.detailGames?sameAvgA.kda.toFixed(2):'-'} / ELO ${sameAvgA.delta>=0?'+':''}${sameAvgA.delta.toFixed(1)}<br>${b}: KDA ${sameAvgB.detailGames?sameAvgB.kda.toFixed(2):'-'} / ELO ${sameAvgB.delta>=0?'+':''}${sameAvgB.delta.toFixed(1)}</div></div>
      <div class="card card-pad inner-card"><div class="card-title">⚔ 상대했을 때 승률</div><div class="small">${a} 승률 ${versus.length?pct(aWin/versus.length*100)+'%':'-'}<br>${b} 승률 ${versus.length?pct(bWin/versus.length*100)+'%':'-'}</div></div>
    </div>
    <div class="table-wrap"><table><thead><tr>${['날짜','관계','승리팀','패배팀','결과'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${recentRows.map(m=>{ const isSame=same.includes(m); const result=isSame?((m.winTeam||[]).includes(a)?'같은 팀 승리':'같은 팀 패배'):(playerWonMatch(m,a)?`${a} 승리`:`${b} 승리`); return `<tr><td>${m.date||'-'}</td><td class="gold"><b>${isSame?'같은 팀':'상대'}</b></td><td class="cyan">${(m.winTeam||[]).join(', ')}</td><td class="red">${(m.loseTeam||[]).join(', ')}</td><td><b>${result}</b></td></tr>`; }).join('')}</tbody></table></div>`;
}
function balance(){
  const names=getAllPlayerNames();
  return `${sectionTitle('⚖','팀 밸런스 계산기')}
    <div class="card card-pad">
      <div class="notice">참가자 10명을 선택하면 현재 선택된 시즌의 ELO를 기준으로 평균 ELO 차이가 가장 작은 5:5 조합을 추천합니다. 저장 기능은 없습니다.</div>
      <div class="balance-top"><select class="select" id="balancePreset" onchange="applyBalancePreset()"><option value="">최근 경기 참가자 불러오기</option>${loadMatchRecords('total').slice(0,8).map((m,i)=>`<option value="${i}">${m.date} 경기 참가자</option>`).join('')}</select><button class="btn" onclick="clearBalanceChecks()">선택 초기화</button><button class="btn gold" onclick="renderBalanceResult()">팀 생성</button></div>
      <div class="player-check-grid">${names.map(n=>`<label class="player-check"><input type="checkbox" value="${n}" onchange="updateBalanceCount()"><span>${n}</span><small>${Math.round(playerSnapshotForScope(n,state.season).elo||1500)} ELO</small></label>`).join('')}</div>
      <div id="balanceCount" class="small" style="margin-top:14px">0명 선택</div>
      <div id="balanceResult" style="margin-top:22px"></div>
    </div>`;
}
function selectedBalancePlayers(){ return Array.from(document.querySelectorAll('.player-check input:checked')).map(x=>x.value); }
function updateBalanceCount(){ const el=document.getElementById('balanceCount'); if(el) el.textContent=`${selectedBalancePlayers().length}명 선택`; }
function clearBalanceChecks(){ document.querySelectorAll('.player-check input').forEach(x=>x.checked=false); updateBalanceCount(); document.getElementById('balanceResult').innerHTML=''; }
function applyBalancePreset(){
  const idx=document.getElementById('balancePreset')?.value; if(idx==='') return;
  const m=loadMatchRecords('total')[Number(idx)]; if(!m) return;
  const set=new Set([...(m.winTeam||[]), ...(m.loseTeam||[])]);
  document.querySelectorAll('.player-check input').forEach(x=>x.checked=set.has(x.value)); updateBalanceCount();
}
function renderBalanceResult(){
  const selected=selectedBalancePlayers(); const el=document.getElementById('balanceResult'); if(!el) return;
  if(selected.length!==10){ el.innerHTML=`<div class="empty small">정확히 10명을 선택해주세요. 현재 ${selected.length}명 선택됨.</div>`; return; }
  let best=null; combinations(selected,5).forEach(teamA=>{
    const setA=new Set(teamA); const teamB=selected.filter(n=>!setA.has(n));
    const avgA=teamAvgElo(teamA), avgB=teamAvgElo(teamB), diff=Math.abs(avgA-avgB);
    if(!best || diff<best.diff) best={teamA,teamB,avgA,avgB,diff,probA:expectedFromAvg(avgA,avgB)};
  });
  const teamCard=(title,team,avg,prob,cls)=>`<div class="team-card"><div class="team-card-title ${cls}">${title}</div><div class="team-avg">${Math.round(avg)} ELO</div><div class="small">예상 승률 ${pct(prob*100)}%</div>${team.map(n=>`<div class="team-player"><span>${n}</span><b>${Math.round(playerSnapshotForScope(n,state.season).elo||1500)}</b></div>`).join('')}</div>`;
  el.innerHTML=`<div class="notice"><b>추천 완료</b> · 평균 ELO 차이 ${best.diff.toFixed(1)} · ${state.season==='season1'?'시즌1':'시즌2'} 랭킹 ELO 기준</div><div class="balance-result-grid">${teamCard('1팀',best.teamA,best.avgA,best.probA,'cyan')}${teamCard('2팀',best.teamB,best.avgB,1-best.probA,'red')}</div>`;
}
function render(){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===state.tab));
  document.querySelectorAll('.season-btn').forEach(b=>b.classList.toggle('active', b.dataset.season===state.season));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active', p.id===state.tab));
  const target=document.getElementById(state.tab);
  if(state.tab==='dashboard') target.innerHTML=dashboard();
  if(state.tab==='ranking') { target.innerHTML=ranking(); setTimeout(renderRankTable); }
  if(state.tab==='pair') { target.innerHTML=pair(); setTimeout(renderPairs); }
  if(state.tab==='records') { target.innerHTML=records(); setTimeout(renderRecords); }
  if(state.tab==='player') target.innerHTML=playerDetail();
  if(state.tab==='match') target.innerHTML=match();
  if(state.tab==='matchup') target.innerHTML=matchup();
  if(state.tab==='balance') target.innerHTML=balance();
}
document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>{state.tab=btn.dataset.tab; render();}));
document.querySelectorAll('.season-btn').forEach(btn=>btn.addEventListener('click',()=>{state.season=btn.dataset.season; state.players=loadPlayers(state.season); tierFilter='전체'; render();}));
render();
