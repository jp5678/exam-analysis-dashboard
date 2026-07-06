// ═══════════════════════════════════════════
// session.js — 세션 저장·복원 · 자동 저장 · 시험 비교
// ═══════════════════════════════════════════

const AUTOSAVE_KEY = 'examAnalysisAutosaveV2';

// ── CQI 폼 필드 수집/복원 ──
function collectCQIFormInputs(){
  const g = id => document.getElementById(id)?.value || '';
  const rep = (typeof collectCQIReportInputs === 'function') ? collectCQIReportInputs() : { issues:'', plan:'', goals:{} };
  return {
    subject: g('cqi-subject'), dept: g('cqi-dept'), type: g('cqi-type'),
    grade: g('cqi-grade'), credit: g('cqi-credit'), enroll: g('cqi-enroll'),
    professor: g('cqi-professor'), date: g('cqi-date'),
    issues: rep.issues, plan: rep.plan, goals: rep.goals,
  };
}

function applyCQIInputs(cqi){
  if (!cqi) return;
  const setV = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  setV('cqi-subject', cqi.subject); setV('cqi-dept', cqi.dept);
  setV('cqi-type', cqi.type);       setV('cqi-grade', cqi.grade);
  setV('cqi-credit', cqi.credit);   setV('cqi-enroll', cqi.enroll);
  setV('cqi-professor', cqi.professor); setV('cqi-date', cqi.date);
  // ⑥⑦⑧은 보고서 생성 시(generateCQI) 반영되도록 임시 저장
  S._cqiTextDraft = { issues: cqi.issues || '', plan: cqi.plan || '', goals: cqi.goals || {} };
}

// ── 세션 객체 ──
function buildSessionObj(){
  return {
    app: 'exam-analysis',
    version: 2,
    savedAt: new Date().toISOString(),
    label: document.getElementById('cqi-subject')?.value || '',
    maxScore: MAX_SCORE,
    maxManual: S.maxManual,
    raw: S.raw,
    cqi: collectCQIFormInputs(),
  };
}

// 세션 → JSON 파일 저장
function saveSessionFile(){
  if (!S.raw.some(r => r)){ toast('❌ 저장할 데이터가 없습니다. 먼저 파일을 업로드하세요.'); return; }
  const obj = buildSessionObj();
  const label = (obj.label || '분석').replace(/[\\/:*?"<>|]/g, '');
  downloadBlob(new Blob([JSON.stringify(obj)], { type:'application/json' }),
    `세션_${label}_${new Date().toISOString().slice(0,10)}.json`);
  toast('💾 세션 파일 저장 완료 — 나중에 [세션 불러오기]로 복원할 수 있습니다');
}

// localStorage 자동 저장 (분석·CQI 생성 시 호출)
function autoSaveSession(){
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildSessionObj()));
  } catch(e){
    // 용량 초과 등 — 자동 저장만 건너뜀 (기능 자체는 정상)
    console.warn('자동 저장 실패:', e.message);
  }
}

// 세션 객체 → 상태 복원 + 재분석
function loadSessionObj(obj){
  if (!obj || obj.app !== 'exam-analysis' || !Array.isArray(obj.raw))
    throw new Error('이 대시보드의 세션 파일 형식이 아닙니다');
  S.raw = [obj.raw[0] || null, obj.raw[1] || null, obj.raw[2] || null];
  S.maxManual = !!obj.maxManual;
  applyMaxScore(obj.maxScore || 40, S.maxManual);

  // 업로드 카드 UI 복원
  S.raw.forEach((r, i) => {
    if (!r) return;
    document.getElementById(`ico${i}`).textContent = '✅';
    document.getElementById(`fn${i}`).textContent  = r.name || '(세션 복원)';
    document.getElementById(`st${i}`).textContent  = '세션에서 복원됨';
    document.getElementById(`drop${i}`).className  = `up-card ok${i+1}`;
  });
  if (S.raw[2]?.sheets)
    document.getElementById('stags2').innerHTML =
      S.raw[2].sheets.map(s => `<span class="stag">${esc(s.name)}</span>`).join('');

  if (obj.cqi) S._pendingCQI = obj.cqi;   // runAnalysis 완료 후 적용
  document.getElementById('runBtn').classList.add('show');
  runAnalysis();
}

// 파일 선택기로 세션 불러오기
function loadSessionFilePicker(){
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onerror = () => toast('❌ 파일을 읽지 못했습니다');
    rd.onload = e => {
      try {
        loadSessionObj(JSON.parse(e.target.result));
        toast(`📂 세션 복원: ${f.name}`);
      } catch(ex){
        toast('❌ 세션 불러오기 실패: ' + ex.message);
        console.error(ex);
      }
    };
    rd.readAsText(f);
  };
  inp.click();
}

// ── 자동 저장본 복원 배너 ──
function checkAutosave(){
  try {
    const s = localStorage.getItem(AUTOSAVE_KEY);
    if (!s) return;
    const obj = JSON.parse(s);
    if (!obj?.raw?.some(r => r)) return;
    const banner = document.getElementById('restoreBanner');
    const when = obj.savedAt ? new Date(obj.savedAt).toLocaleString('ko-KR') : '';
    document.getElementById('restoreInfo').textContent =
      `이전 작업 자동 저장본이 있습니다 — ${obj.label || '제목 없음'} (${when})`;
    banner.classList.add('show');
  } catch(_){}
}

function restoreAutosave(){
  try {
    const obj = JSON.parse(localStorage.getItem(AUTOSAVE_KEY));
    loadSessionObj(obj);
    document.getElementById('restoreBanner').classList.remove('show');
  } catch(e){
    toast('❌ 복원 실패: ' + e.message);
    console.error(e);
  }
}

function dismissRestore(){
  document.getElementById('restoreBanner').classList.remove('show');
}

// ═══════════════════════════
// 시험 비교 (추이 분석)
// ═══════════════════════════

// 세션 객체 → 요약 통계 (전역 상태를 건드리지 않는 순수 계산)
function summarizeSession(obj){
  const ms = obj.maxScore || 40;
  const passRaw = Math.round(ms * PASS_CONV / 100);

  // 파일3 우선
  let students = [];
  if (obj.raw?.[2]?.sheets){
    const parsed = obj.raw[2].sheets
      .map(s => parseClassSheet(s.rows, s.name, ms)).filter(Boolean);
    const totalIdx = parsed.findIndex(c => TOTAL_PAT.test(c.label.trim()));
    students = totalIdx >= 0
      ? parsed[totalIdx].students
      : parsed.flatMap(c => c.students);
  }

  let st = null, isConvSrc = false;
  if (students.length){
    st = calcStats(students.map(s => s.total), passRaw);
  } else if (obj.raw?.[1]?.rows){
    // 파일2 폴백
    const f2 = parseFile2(obj.raw[1].rows);
    if (f2){
      const maxSc = f2.type === 'freq'
        ? Math.max(...f2.dist.map(d => d.score))
        : Math.max(...f2.scores);
      isConvSrc = maxSc > ms;
      const thresh = isConvSrc ? PASS_CONV : passRaw;
      st = f2.type === 'freq'
        ? statsFromFreq(f2.dist.filter(d => d.count > 0), thresh)
        : calcStats(f2.scores, thresh);
    }
  }

  // 파일1: 평균 정답률
  let avgCr = null;
  if (obj.raw?.[0]?.rows){
    const f1 = parseFile1(obj.raw[0].rows);
    const crItems = f1?.items.filter(i => i.cr != null) || [];
    if (crItems.length) avgCr = crItems.reduce((s,i) => s + i.cr, 0)/crItems.length*100;
  }

  const toConv = v => isConvSrc ? v : v*100/ms;
  return {
    label: obj.label || '(제목 없음)',
    savedAt: obj.savedAt || '',
    maxScore: ms,
    n: st?.n ?? null,
    meanConv: st?.mean != null ? Math.round(toConv(st.mean)*10)/10 : null,
    sdConv:   st?.sd   != null ? Math.round(toConv(st.sd)*10)/10   : null,
    passRate: st?.passRate != null ? Math.round(st.passRate*10)/10 : null,
    avgCr:    avgCr != null ? Math.round(avgCr*10)/10 : null,
  };
}

function trendAddCurrent(){
  if (!S.analyzed){ toast('❌ 먼저 성적 분석을 실행하세요'); return; }
  const sum = summarizeSession(buildSessionObj());
  if (!sum.label || sum.label === '(제목 없음)') sum.label = '현재 분석';
  S.trend.push(sum);
  renderTrend();
  toast('➕ 현재 분석이 비교 목록에 추가되었습니다');
}

function trendLoadFiles(){
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json'; inp.multiple = true;
  inp.onchange = async () => {
    let ok = 0, fail = 0;
    for (const f of inp.files){
      try {
        const text = await f.text();
        const obj = JSON.parse(text);
        if (obj.app !== 'exam-analysis') throw new Error('형식 불일치');
        const sum = summarizeSession(obj);
        if (sum.label === '(제목 없음)') sum.label = f.name.replace(/\.json$/i,'');
        S.trend.push(sum);
        ok++;
      } catch(e){ fail++; console.error(f.name, e); }
    }
    renderTrend();
    toast(`📂 ${ok}개 세션 추가${fail ? ` · ${fail}개 실패` : ''}`);
  };
  inp.click();
}

function trendRemove(i){
  S.trend.splice(i, 1);
  renderTrend();
}

function trendClear(){
  if (S.trend.length && !confirm('비교 목록을 모두 비울까요?')) return;
  S.trend = [];
  renderTrend();
}

function renderTrend(){
  const box = document.getElementById('trendBody');
  killChart('chTrend');
  if (!S.trend.length){
    box.innerHTML = `<div class="no-data"><em>📈</em>
      비교할 시험이 없습니다.<br>
      <strong>💾 세션 저장</strong>으로 저장해 둔 이전 시험 JSON을 불러오거나,<br>
      <strong>➕ 현재 분석 추가</strong>로 현재 결과를 목록에 넣어 비교를 시작하세요.</div>`;
    return;
  }

  const fmt = v => v != null ? v.toFixed(1) : '-';
  const rows = S.trend.map((t, i) => `
    <tr>
      <td><strong>${esc(t.label)}</strong></td>
      <td>${t.savedAt ? new Date(t.savedAt).toLocaleDateString('ko-KR') : '-'}</td>
      <td>${t.n != null ? t.n + '명' : '-'}</td>
      <td>${t.maxScore}점</td>
      <td>${fmt(t.meanConv)}${t.meanConv != null ? '점' : ''}</td>
      <td>${fmt(t.sdConv)}</td>
      <td>${fmt(t.passRate)}${t.passRate != null ? '%' : ''}</td>
      <td>${fmt(t.avgCr)}${t.avgCr != null ? '%' : ''}</td>
      <td><button class="trend-del" onclick="trendRemove(${i})">삭제</button></td>
    </tr>`).join('');

  box.innerHTML = `
    <div class="ch" style="margin-bottom:14px"><canvas id="chTrend"></canvas></div>
    <div class="tbl-wrap"><table id="tTrend">
      <thead><tr>
        <th>시험(세션)</th><th>저장일</th><th>학생수</th><th>만점</th>
        <th>환산평균</th><th>표준편차(환산)</th><th>성취율</th><th>평균정답률</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="exp-btns"><button class="exp-btn" onclick="saveCsv('tTrend','시험비교')">CSV</button></div>`;

  S.charts.chTrend = new Chart(document.getElementById('chTrend'), {
    type:'bar',
    data:{
      labels: S.trend.map(t => t.label),
      datasets:[
        { label:'환산평균(점)', data: S.trend.map(t => t.meanConv),
          backgroundColor:'rgba(59,130,246,.75)', borderRadius:5 },
        { label:`성취율(%)`, data: S.trend.map(t => t.passRate),
          type:'line', borderColor:'#059669', backgroundColor:'rgba(5,150,105,.1)',
          borderWidth:2, pointRadius:5, tension:.3 },
        { label:'평균정답률(%)', data: S.trend.map(t => t.avgCr),
          type:'line', borderColor:'#d97706', backgroundColor:'transparent',
          borderWidth:2, borderDash:[5,4], pointRadius:4, tension:.3 },
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top', labels:{font:{size:10}}} },
      scales:{ y:{ min:0, max:100, title:{display:true, text:'점수 · 비율 (0~100)'} } }
    }
  });
}

// ── 초기화: 자동 저장본 확인 · CQI 입력 변경 시 자동 저장 ──
checkAutosave();
renderTrend();
document.getElementById('tp-cqi').addEventListener('change', () => {
  if (S.analyzed) autoSaveSession();
});
