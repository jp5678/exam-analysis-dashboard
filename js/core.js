// ═══════════════════════════════════════════
// core.js — 상수 · 상태 · 통계 · 공통 유틸
// ═══════════════════════════════════════════

// 성취기준: 환산점수(100점 만점) 기준 70점
const PASS_CONV = 70;

let MAX_SCORE = 40;                                    // 시험 만점(문항 수) — 파일1 자동 감지 또는 수동 입력
let PASS_RAW  = Math.round(MAX_SCORE * PASS_CONV / 100); // 원점수 기준 성취기준점

// ── 전역 상태 ──
const S = {
  raw: [null, null, null],       // 업로드 원본 (파일1·2·3)
  f1: null, f2: null, f3: null,
  f3Total: null,                 // 전체(Sheet1) 시트
  charts: {},
  activeClass: 'all',
  maxManual: false,              // 만점을 수동으로 지정했는지
  analyzed: false,
  trend: [],                     // 시험 비교 데이터
};

// ── 성취수준 7등급 정의 (모든 곳에서 이 정의 하나만 사용) ──
const GRADE_DEFS = [
  { lbl: 'A+',           min: 95, col: '#1d4ed8', cls: 'b-su' },
  { lbl: 'A',            min: 90, col: '#3b82f6', cls: 'b-su' },
  { lbl: 'B+',           min: 85, col: '#7c3aed', cls: 'b-u'  },
  { lbl: 'B',            min: 80, col: '#8b5cf6', cls: 'b-u'  },
  { lbl: 'C+',           min: 75, col: '#059669', cls: 'b-mi' },
  { lbl: 'C',            min: 70, col: '#34d399', cls: 'b-mi' },
  { lbl: '미성취(환류)', min: 0,  col: '#dc2626', cls: 'b-hw' },
];

// 반별 차트 팔레트
const PAL = ['rgba(59,130,246,.85)','rgba(139,92,246,.85)','rgba(16,185,129,.85)',
             'rgba(245,158,11,.85)','rgba(239,68,68,.85)','rgba(8,145,178,.85)'];

// ═══════════════════════════
// 유틸
// ═══════════════════════════

// HTML 이스케이프 — 엑셀 셀 값 등 외부 데이터를 innerHTML에 넣기 전 반드시 통과
function esc(v){
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

// Blob 다운로드 (ObjectURL 해제 포함)
function downloadBlob(blob, filename){
  const a   = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.download = filename;
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ═══════════════════════════
// 만점 설정
// ═══════════════════════════
function applyMaxScore(v, manual){
  const n = parseInt(v, 10);
  if (isNaN(n) || n < 1 || n > 1000){
    toast('❌ 만점은 1~1000 사이 숫자로 입력하세요');
    return false;
  }
  MAX_SCORE = n;
  PASS_RAW  = Math.round(n * PASS_CONV / 100);
  if (manual) S.maxManual = true;
  const inp = document.getElementById('maxScoreInput');
  if (inp) inp.value = n;
  updateDynamicLabels();
  return true;
}

// [적용] 버튼 — 수동 설정
function setMaxScoreManual(){
  const v = document.getElementById('maxScoreInput').value;
  if (applyMaxScore(v, true)){
    const note = document.getElementById('maxAutoNote');
    if (note) note.textContent = `수동 설정됨 · 성취기준 ${PASS_RAW}점(환산 ${PASS_CONV}점)`;
    toast(`✅ 만점 ${MAX_SCORE}점으로 설정되었습니다`);
    if (S.analyzed) runAnalysis();   // 이미 분석했다면 새 만점으로 재분석
  }
}

// .ms-dyn 스팬 전체를 현재 MAX_SCORE 값으로 갱신
function updateDynamicLabels(){
  document.querySelectorAll('.ms-dyn').forEach(el => { el.textContent = MAX_SCORE; });
}

function resetAll(){
  if (!confirm('모든 업로드 파일·분석 결과·CQI 입력 내용이 초기화됩니다.\n계속할까요?\n(저장하지 않은 내용은 복구할 수 없습니다)')) return;
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch(_){}
  S._skipWarn = true;
  window.location.reload();
}

// 데이터가 있는 상태에서 실수로 창을 닫는 것 방지
window.addEventListener('beforeunload', e => {
  if (S.raw.some(r => r) && !S._skipWarn){
    e.preventDefault();
    e.returnValue = '';
  }
});

// ═══════════════════════════
// 통계 헬퍼
// ═══════════════════════════

// passThresh: vals와 같은 단위의 성취기준점 (원점수 데이터 → PASS_RAW, 환산 데이터 → PASS_CONV)
function calcStats(vals, passThresh = PASS_RAW){
  if (!vals.length) return {};
  const n = vals.length, s = [...vals].sort((a,b) => a-b);
  const mean = vals.reduce((a,b) => a+b, 0) / n;
  const sd   = Math.sqrt(vals.reduce((v,x) => v + (x-mean)**2, 0) / n);
  const med  = n % 2 ? s[Math.floor(n/2)] : (s[n/2-1] + s[n/2]) / 2;
  return { n, mean, sd, med, min: s[0], max: s[n-1],
    q1: s[Math.floor(n*.25)], q3: s[Math.floor(n*.75)],
    passRate: vals.filter(v => v >= passThresh).length / n * 100 };
}

// 빈도표 기반 통계 — passThresh는 dist.score와 같은 단위로 전달
function statsFromFreq(dist, passThresh){
  const asc = [...dist].sort((a,b) => a.score - b.score);
  const n   = asc.reduce((s,d) => s + d.count, 0);
  if (!n) return {};
  const mean = asc.reduce((s,d) => s + d.score*d.count, 0) / n;
  const sd   = Math.sqrt(asc.reduce((s,d) => s + d.count*(d.score-mean)**2, 0) / n);
  // 사분위수: 0점도 유효한 값이므로 null 체크로만 판정
  let cum = 0, med = null, q1 = null, q3 = null;
  for (const d of asc){
    cum += d.count;
    if (q1  === null && cum >= n*.25) q1  = d.score;
    if (med === null && cum >= n*.5)  med = d.score;
    if (q3  === null && cum >= n*.75) q3  = d.score;
  }
  const passN = asc.filter(d => d.score >= passThresh).reduce((s,d) => s + d.count, 0);
  return { n, mean, sd, med,
    min: asc[0].score, max: asc[asc.length-1].score,
    q1, q3, passRate: passN / n * 100 };
}

function diffLevel(wr){
  if (wr < .15) return { lbl:'매우 쉬움',   cls:'b-ve', col:'#16a34a' };
  if (wr < .30) return { lbl:'쉬움',        cls:'b-e',  col:'#22c55e' };
  if (wr < .60) return { lbl:'보통',        cls:'b-m',  col:'#f59e0b' };
  if (wr < .80) return { lbl:'어려움',      cls:'b-h',  col:'#f97316' };
  return              { lbl:'매우 어려움', cls:'b-vh', col:'#dc2626' };
}

// p = 환산점수(100점 기준)
function gradeOf(p){
  return GRADE_DEFS.find(g => p >= g.min) || GRADE_DEFS[GRADE_DEFS.length-1];
}
// 등급 인덱스 (0=A+ … 6=미성취)
function gradeIdx(p){
  const i = GRADE_DEFS.findIndex(g => p >= g.min);
  return i < 0 ? GRADE_DEFS.length - 1 : i;
}

function discEval(d){
  if (d >= .4) return { lbl:'우수',     col:'#22c55e' };
  if (d >= .3) return { lbl:'양호',     col:'#84cc16' };
  if (d >= .2) return { lbl:'보통',     col:'#eab308' };
  return             { lbl:'개선필요', col:'#ef4444' };
}

function killChart(id){
  if (S.charts[id]){
    try { S.charts[id].destroy(); } catch(e){}
    delete S.charts[id];
  }
}

// ═══════════════════════════
// UI 헬퍼
// ═══════════════════════════
function tab(name, btn){
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('on'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('on'));
  document.getElementById('tp-' + name).classList.add('on');
  btn.classList.add('on');
}

function setNoData(paneId, icon, msg){
  const pane = document.getElementById(paneId);
  if (!pane.querySelector('.no-data')){
    const d = document.createElement('div');
    d.className = 'no-data';
    d.innerHTML = `<em>${icon}</em>${msg}`;
    pane.appendChild(d);
  }
}

const sortState = {};
function sortTbl(id, col){
  const tbl = document.getElementById(id);
  const key = `${id}_${col}`;
  const asc = sortState[key] !== 'asc';
  sortState[key] = asc ? 'asc' : 'desc';
  tbl.querySelectorAll('th').forEach((th,i) => {
    th.classList.remove('sa','sd');
    if (i === col) th.classList.add(asc ? 'sa' : 'sd');
  });
  const rows = [...tbl.querySelector('tbody').querySelectorAll('tr')];
  rows.sort((a,b) => {
    const va = a.cells[col]?.textContent.replace(/[%명점위\/]/g,'').trim();
    const vb = b.cells[col]?.textContent.replace(/[%명점위\/]/g,'').trim();
    const na = parseFloat(va), nb = parseFloat(vb);
    if (!isNaN(na) && !isNaN(nb)) return asc ? na-nb : nb-na;
    return asc ? va.localeCompare(vb,'ko') : vb.localeCompare(va,'ko');
  });
  rows.forEach(r => tbl.querySelector('tbody').appendChild(r));
}
