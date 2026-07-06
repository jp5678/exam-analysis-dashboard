// ═══════════════════════════════════════════
// report.js — AI 분석 (내장 + Claude API) · CQI 보고서
// ═══════════════════════════════════════════

let _aiRawText = '';

// ═══════════════════════════
// 내장 규칙 기반 분석
// ═══════════════════════════
function runAIAnalysis(){
  if (!S.f1 && !S.f2 && !S.f3 && !S.f3Total){
    toast('❌ 먼저 파일을 업로드하고 분석을 실행하세요.'); return;
  }
  document.getElementById('aiContent').innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--muted)"><div class="spin" style="margin:0 auto 14px"></div>분석 중…</div>';
  document.getElementById('aiOverlay').classList.add('show');
  setTimeout(() => {
    try {
      const html = buildAIReport();
      document.getElementById('aiContent').innerHTML = html +
        `<div id="aiClaudeMount"></div>`;
    } catch(e){
      document.getElementById('aiContent').innerHTML = `<p style="color:red">분석 오류: ${esc(e.message)}</p>`;
      console.error(e);
    }
  }, 300);
}

function closeAIModal(){ document.getElementById('aiOverlay').classList.remove('show'); }

function copyAIReport(){
  navigator.clipboard.writeText(_aiRawText).then(() => toast('📋 텍스트 복사 완료'))
    .catch(() => { const ta = document.createElement('textarea'); ta.value = _aiRawText;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); toast('📋 텍스트 복사 완료'); });
}

function sec(icon, title, rows){
  const raw = rows.map(r => typeof r === 'string' ? r : `• ${r.label}: ${r.value}`).join('\n');
  _aiRawText += `\n${icon} ${title}\n${'─'.repeat(40)}\n${raw}\n`;
  const items = rows.map(r => {
    if (typeof r === 'string') return `<div class="ai-row" style="color:var(--muted);font-style:italic;font-size:11px">${r}</div>`;
    const tag = r.tag ? `<span class="ai-tag ${r.tag}">${r.tag === 'warn' ? '주의' : r.tag === 'err' ? '미흡' : r.tag === 'ok' ? '우수' : '정보'}</span>` : '';
    return `<div class="ai-row"><span class="ai-bullet">•</span><span><strong>${r.label}</strong>: ${r.value}${tag}</span></div>`;
  }).join('');
  return `<div class="ai-section"><h3>${icon} ${title}</h3>${items}</div>`;
}

function buildAIReport(){
  _aiRawText = `${'═'.repeat(50)}\n📊 시험 성적 종합 분석 보고서\n분석 일시: ${new Date().toLocaleDateString('ko-KR')}\n${'═'.repeat(50)}\n`;
  let html = '';
  const f  = v => v != null ? v.toFixed(1) : '-';
  const fp = v => v != null ? v.toFixed(1) + '%' : '-';

  // 1. 전체 성적 요약
  const allSt = S.f3Total ? S.f3Total.students
    : (S.f3 ? S.f3.flatMap(c => c.students) : []);

  if (allSt.length){
    const scores = allSt.map(s => s.total);
    const st = calcStats(scores, PASS_RAW);
    const convAvg = st.mean*100/MAX_SCORE;
    const perfTag = convAvg >= 80 ? 'ok' : convAvg >= 70 ? 'info' : convAvg >= 60 ? 'warn' : 'err';
    const perfLbl = convAvg >= 80 ? '우수' : convAvg >= 70 ? '양호' : convAvg >= 60 ? '보통' : '미흡';
    const passN   = scores.filter(v => v >= PASS_RAW).length;
    html += sec('📊','전체 성적 현황',[
      { label:'총 학생 수',        value:`${st.n}명 (${S.f3?.length || 1}개 반)` },
      { label:'평균 점수',         value:`${f(st.mean)}점 / 환산 ${f(convAvg)}점`, tag:perfTag },
      { label:'중앙값',            value:`${f(st.med)}점` },
      { label:'표준편차',          value:`${f(st.sd)}점` },
      { label:'최고점 / 최저점',   value:`${f(st.max)}점 / ${f(st.min)}점` },
      { label:'전체 성취수준',     value:perfLbl, tag:perfTag },
      { label:`통과(환산≥${PASS_CONV}점)`, value:`${passN}명 (${fp(st.passRate)})`,
        tag: st.passRate >= 80 ? 'ok' : st.passRate >= 60 ? 'warn' : 'err' },
    ]);
  }

  // 2. 문항 분석
  if (S.f1 && S.f1.items.length){
    const items = S.f1.items.filter(i => i.cr != null);
    const crArr = items.map(i => i.cr);
    const avgCr = crArr.reduce((a,b) => a+b, 0)/crArr.length;
    const sorted  = [...items].sort((a,b) => a.cr - b.cr);
    const hardTop = sorted.slice(0, 3);
    const easyTop = [...sorted].reverse().slice(0, 3);
    const discItems = items.filter(i => i.disc != null);
    const lowDisc   = discItems.filter(i => i.disc < 0.2);
    const diffCnt   = { 매우쉬움:0, 쉬움:0, 보통:0, 어려움:0, 매우어려움:0 };
    items.forEach(i => { if (i.diffLbl) diffCnt[i.diffLbl.replace(' ','')] = (diffCnt[i.diffLbl.replace(' ','')] || 0) + 1; });
    const rows = [
      { label:'총 문항 수',   value:`${items.length}문항` },
      { label:'평균 정답률',  value: fp(avgCr*100),
        tag: avgCr >= 0.7 ? 'ok' : avgCr >= 0.5 ? 'warn' : 'err' },
      { label:'어려운 문항(TOP 3)', value: hardTop.map(i => `${esc(i.qName)}(${fp(i.cr*100)})`).join(', '), tag:'warn' },
      { label:'쉬운 문항(TOP 3)',   value: easyTop.map(i => `${esc(i.qName)}(${fp(i.cr*100)})`).join(', '), tag:'ok' },
      { label:'난이도 분포',  value:`매우쉬움 ${diffCnt['매우쉬움'] || 0}·쉬움 ${diffCnt['쉬움'] || 0}·보통 ${diffCnt['보통'] || 0}·어려움 ${diffCnt['어려움'] || 0}·매우어려움 ${diffCnt['매우어려움'] || 0}` },
    ];
    if (lowDisc.length)
      rows.push({ label:'변별도 개선 필요 문항', value: lowDisc.map(i => `${esc(i.qName)}(D=${i.disc.toFixed(2)})`).join(', '), tag:'warn' });
    html += sec('📋','문항 분석', rows);
  }

  // 3. 반별 비교
  if (S.f3 && S.f3.length > 1){
    const stList = S.f3.map(c => ({ lbl: c.label, ...calcStats(c.students.map(s => s.total), PASS_RAW) }))
      .sort((a,b) => b.mean - a.mean);
    const best = stList[0], worst = stList[stList.length-1];
    const gap  = best.mean - worst.mean;
    html += sec('⚖️','반별 비교',[
      { label:'성적 우수 반', value:`${esc(best.lbl)}반 (평균 ${f(best.mean)}점)`, tag:'ok' },
      { label:'성적 저조 반', value:`${esc(worst.lbl)}반 (평균 ${f(worst.mean)}점)`, tag:'warn' },
      { label:'반간 평균 격차', value:`${f(gap)}점`, tag: gap > 5 ? 'warn' : 'ok' },
      ...stList.map(s => ({ label:`${esc(s.lbl)}반`,
        value:`평균 ${f(s.mean)}점, 성취율 ${fp(s.passRate)}, SD ${f(s.sd)}` })),
    ]);
  }

  // 4. 핵심 발견사항
  const findings = [];
  if (S.f1){
    const items = S.f1.items.filter(i => i.cr != null);
    const veryHard = items.filter(i => i.diffLbl === '매우 어려움');
    if (veryHard.length) findings.push({ label:`매우 어려운 문항 ${veryHard.length}개`, value: veryHard.map(i => esc(i.qName)).join(', '), tag:'err' });
    const lowDisc = items.filter(i => i.disc != null && i.disc < 0.2);
    if (lowDisc.length) findings.push({ label:`변별도 낮은 문항(D<0.2) ${lowDisc.length}개`, value: lowDisc.map(i => esc(i.qName)).join(', '), tag:'warn' });
    const easyWrongDisc = items.filter(i => i.cr > 0.85 && i.disc != null && i.disc < 0.3);
    if (easyWrongDisc.length) findings.push({ label:'쉬우나 변별력 낮은 문항', value: easyWrongDisc.map(i => esc(i.qName)).join(', '), tag:'warn' });
  }
  if (allSt.length){
    const rawScores = allSt.map(s => s.total);
    const st = calcStats(rawScores, PASS_RAW);
    const failN = rawScores.filter(v => v < PASS_RAW).length;
    if (failN > 0) findings.push({ label:`미성취 학생 ${failN}명`, value:`전체의 ${((failN/st.n)*100).toFixed(1)}% — 환류 교육 필요`, tag:'err' });
    if (st.sd > st.mean*0.25) findings.push({ label:'성적 편차 큼', value:`표준편차 ${f(st.sd)}점 — 수준별 지도 필요`, tag:'warn' });
  }
  if (!findings.length) findings.push('특이사항 없음 — 전반적으로 양호한 성취 수준입니다.');
  html += sec('⚠️','핵심 발견사항', findings);

  // 5. 권고사항
  const recs = [];
  if (S.f1){
    const items = S.f1.items.filter(i => i.cr != null);
    const hard5 = [...items].sort((a,b) => a.cr - b.cr).slice(0, 5);
    if (hard5.length) recs.push({ label:'오답률 높은 문항 재검토', value:`${hard5.map(i => esc(i.qName)).join(', ')} — 수업 내용 보강 권장` });
    const noDisc = items.filter(i => i.disc != null && i.disc < 0.2);
    if (noDisc.length) recs.push({ label:'변별도 낮은 문항 수정', value:'문항의 난이도 조정 또는 선택지 개선 검토' });
  }
  if (allSt.length){
    const failSt = allSt.filter(s => s.total < PASS_RAW);
    if (failSt.length) recs.push({ label:'미성취 학생 보충 지도', value:`${failSt.length}명 대상 개별 피드백 및 환류 교육 실시` });
  }
  if (S.f3 && S.f3.length > 1){
    const stList = S.f3.map(c => ({ lbl: c.label, ...calcStats(c.students.map(s => s.total), PASS_RAW) }));
    const gap = Math.max(...stList.map(s => s.mean)) - Math.min(...stList.map(s => s.mean));
    if (gap > 3) recs.push({ label:'반 간 격차 해소', value:`${f(gap)}점 격차 — 공동 수업 설계 및 자료 공유 권장` });
  }
  if (!recs.length) recs.push({ label:'현행 유지', value:'전반적으로 양호합니다. 지속적인 모니터링을 권장합니다.' });
  html += sec('💡','개선 권고사항', recs);

  _aiRawText += '\n[분석 완료]';
  return html;
}

// ═══════════════════════════
// Claude API 연동 (선택 기능)
// ═══════════════════════════
// 키는 이 브라우저의 localStorage에만 저장되며, API 요청에는
// 통계 요약(문항 번호·반 이름 수준)만 전송됩니다. 학생 이름·학번은 전송하지 않습니다.
const AI_KEY_STORAGE = 'claudeApiKey';
const AI_MODEL = 'claude-sonnet-5';

function getAIKey(){
  try { return localStorage.getItem(AI_KEY_STORAGE) || ''; } catch(_){ return ''; }
}
function configureAIKey(){
  const cur = getAIKey();
  const k = prompt(
    'Claude API 키를 입력하세요. (console.anthropic.com에서 발급)\n' +
    '키는 이 브라우저에만 저장되며 외부로 공유되지 않습니다.\n' +
    '비워두고 확인을 누르면 저장된 키가 삭제됩니다.', cur);
  if (k === null) return;
  const t = k.trim();
  try { t ? localStorage.setItem(AI_KEY_STORAGE, t) : localStorage.removeItem(AI_KEY_STORAGE); } catch(_){}
  toast(t ? '✅ API 키가 이 브라우저에 저장되었습니다' : '🗑️ API 키가 삭제되었습니다');
}

async function callClaude(userPrompt, maxTokens = 1800){
  const key = getAIKey();
  if (!key) throw new Error('API 키가 없습니다. [⚙️ API 키] 버튼으로 먼저 등록하세요.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: maxTokens,
      messages: [{ role:'user', content: userPrompt }],
    }),
  });
  if (!res.ok){
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch(_){}
    throw new Error(`Claude API 오류 (${res.status})${detail ? ': ' + detail : ''}`);
  }
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

// AI 모달: Claude 심층 분석
async function runClaudeDeepAnalysis(){
  if (!_aiRawText){ toast('❌ 먼저 AI 분석을 실행하세요'); return; }
  if (!getAIKey()){ configureAIKey(); if (!getAIKey()) return; }

  const mount = document.getElementById('aiClaudeMount');
  if (!mount){ toast('❌ 분석 결과 창을 다시 열어주세요'); return; }
  mount.innerHTML = `
    <div class="ai-claude-box">
      <div class="ai-claude-hdr">✨ Claude 심층 분석</div>
      <div class="ai-claude-body"><div class="spin" style="margin:8px auto"></div><div style="text-align:center;color:var(--muted)">Claude가 분석 중입니다… (수 초 소요)</div></div>
    </div>`;

  const promptText =
    `당신은 대학 간호학과 시험 결과를 해석하는 교육평가 전문가입니다. ` +
    `아래 통계 요약을 바탕으로 한국어로 간결하게 작성하세요:\n` +
    `1) 종합 총평 (3~4문장)\n2) 교수법·문항 개선 제안 (글머리표 3~5개)\n3) 환류(보충) 교육 운영 팁 (글머리표 2~3개)\n` +
    `과장 없이 데이터에 근거해 서술하고, 항목 제목을 붙이세요.\n\n${_aiRawText}`;

  try {
    const txt = await callClaude(promptText, 1500);
    const body = mount.querySelector('.ai-claude-body');
    body.textContent = txt;                              // textContent → XSS 안전
    _aiRawText += `\n\n✨ Claude 심층 분석\n${'─'.repeat(40)}\n${txt}\n`;
    toast('✅ Claude 심층 분석 완료');
  } catch(e){
    mount.querySelector('.ai-claude-body').innerHTML =
      `<span style="color:var(--err)">❌ ${esc(e.message)}</span>` +
      `<div style="margin-top:6px;color:var(--muted);font-size:11px">인터넷 연결과 API 키를 확인하세요. 키는 [⚙️ API 키] 버튼으로 등록/변경할 수 있습니다.</div>`;
    console.error(e);
  }
}

async function exportAIPDF(){
  const content = document.getElementById('aiContent');
  if (!content || !content.innerHTML.trim()){
    toast('❌ 먼저 AI 분석을 실행하세요'); return;
  }
  toast('PDF 생성 중…');
  try {
    const { jsPDF } = window.jspdf;
    const date = new Date().toLocaleDateString('ko-KR');

    const wrapper = document.createElement('div');
    wrapper.style.cssText = [
      'position:fixed','left:-9999px','top:0',
      'width:760px','background:#fff','padding:0','z-index:-1'
    ].join(';');

    const hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;padding:16px 22px;font-family:-apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
    hdr.innerHTML = `<div style="font-size:15px;font-weight:700">🤖 AI 분석 결과</div>`
                  + `<div style="font-size:11px;opacity:.85;margin-top:3px">청암대학교 간호학과 · 생성일: ${date}</div>`;
    wrapper.appendChild(hdr);

    const body = document.createElement('div');
    body.style.cssText = 'padding:18px 22px;font-family:-apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:13px;line-height:1.8;white-space:pre-wrap';
    body.innerHTML = content.innerHTML;
    wrapper.appendChild(body);

    document.body.appendChild(wrapper);
    await new Promise(r => setTimeout(r, 100));

    const canvas = await html2canvas(wrapper, {
      scale:2, useCORS:true, backgroundColor:'#fff', logging:false,
      width:760, scrollY:0
    });
    document.body.removeChild(wrapper);

    const pdf = new jsPDF('p','mm','a4');
    addCanvasToPdf(pdf, canvas, { used:false }, 0.95);
    pdf.save(`AI분석결과_${new Date().toISOString().slice(0,10)}.pdf`);
    toast(`✅ PDF 저장 완료 (${pdf.getNumberOfPages()}페이지)`);
  } catch(e){ toast('❌ PDF 생성 실패: ' + e.message); console.error(e); }
}

// ═══════════════════════════════════════════════
// CQI 보고서
// ═══════════════════════════════════════════════

// ⑥⑦⑧ 입력값 수집 (보고서 재생성 시 보존용)
function collectCQIReportInputs(){
  const g = id => document.getElementById(id)?.value;
  return {
    issues: g('cqi-issues') ?? S._cqiTextDraft?.issues ?? '',
    plan:   g('cqi-plan')   ?? S._cqiTextDraft?.plan   ?? '',
    goals: {
      rate:     g('cqi-goal-rate')      ?? S._cqiTextDraft?.goals?.rate     ?? '',
      ratePlan: g('cqi-goal-rate-plan') ?? S._cqiTextDraft?.goals?.ratePlan ?? '',
      avg:      g('cqi-goal-avg')       ?? S._cqiTextDraft?.goals?.avg      ?? '',
      avgPlan:  g('cqi-goal-avg-plan')  ?? S._cqiTextDraft?.goals?.avgPlan  ?? '',
      fail:     g('cqi-goal-fail')      ?? S._cqiTextDraft?.goals?.fail     ?? '',
      failPlan: g('cqi-goal-fail-plan') ?? S._cqiTextDraft?.goals?.failPlan ?? '',
    },
  };
}

// ⑥⑦⑧ 데이터 기반 자동 초안 (API 키 불필요 — 담당 교수가 검토·수정하는 용도)
function buildCQIDrafts(){
  const allSt = S.f3Total ? S.f3Total.students : (S.f3?.flatMap(c => c.students) || []);
  const n     = allSt.length;
  const st    = n ? calcStats(allSt.map(s => s.total), PASS_RAW) : null;
  const items = S.f1?.items.filter(i => i.cr != null) || [];
  const fail  = allSt.filter(s => s.pct < PASS_CONV);
  const failPct     = n ? fail.length / n * 100 : null;
  const achieveRate = n ? 100 - failPct : null;
  const convAvg     = st ? st.mean * 100 / MAX_SCORE : null;

  const hard    = [...items].sort((a,b) => a.cr - b.cr).filter(i => i.cr < 0.6).slice(0, 5);
  const lowDisc = items.filter(i => i.disc != null && i.disc < 0.2);

  // 공통 참조값
  const hardNames    = hard.slice(0, 3).map(i => i.qName).join(', ');
  const lowDiscNames = lowDisc.slice(0, 3).map(i => i.qName).join(', ');
  // 반별 미성취 분포 (예: A 7명, B 11명)
  const failByCls = (S.f3 || [])
    .map(c => ({ lbl: c.label, n: c.students.filter(s => s.pct < PASS_CONV).length }))
    .filter(x => x.n > 0);
  const failClsTxt = failByCls.length
    ? ` (반별: ${failByCls.map(x => `${x.lbl} ${x.n}명`).join(', ')})` : '';

  // ⑥ 문제점 및 개선 과제 — 수치 근거를 포함한 상세 초안
  const issues = [];
  if (hard.length)
    issues.push(`• 정답률 하위 문항 ${hard.length}개 — ${hard.map(i => `${i.qName}(${(i.cr*100).toFixed(1)}%)`).join(', ')} : 해당 단원의 개념 이해도가 낮아 수업 보강 및 보충 자료 제공이 필요함`);
  const diffHardN = items.filter(i => i.diffLbl === '어려움' || i.diffLbl === '매우 어려움').length;
  if (items.length && diffHardN / items.length > 0.25)
    issues.push(`• 어려움 이상 난이도 문항이 ${diffHardN}문항(전체의 ${(diffHardN/items.length*100).toFixed(0)}%)으로 편중 — 차기 출제 시 난이도 배분(쉬움·보통·어려움 비율) 조정 검토 필요`);
  if (lowDisc.length)
    issues.push(`• 변별도 미달 문항(D<0.2) ${lowDisc.length}개 — ${lowDisc.slice(0,5).map(i => `${i.qName}(D=${i.disc.toFixed(2)})`).join(', ')} : 선택지 매력도와 문두 표현을 재검토하여 상·하위 집단을 구분하는 문항으로 개선 필요`);
  if (fail.length)
    issues.push(`• 미성취(환산 ${PASS_CONV}점 미만) 학생 ${fail.length}명(${failPct.toFixed(1)}%)${failClsTxt} — 단순 보충을 넘어 오답 유형 분석에 기반한 체계적 환류 교육과 재평가가 필요함`);
  if (st && st.sd > st.mean * 0.25)
    issues.push(`• 표준편차 ${st.sd.toFixed(1)}점(평균 ${st.mean.toFixed(1)}점 대비 큼)으로 학생 간 성취 격차 뚜렷 — 수준별 학습 자료 제공 및 보충반 운영 등 이원화 지도 방안 마련 필요`);
  if (S.f3 && S.f3.length > 1){
    const list = S.f3.map(c => ({ lbl: c.label, ...calcStats(c.students.map(s => s.total), PASS_RAW) }))
      .sort((a,b) => b.mean - a.mean);
    const best = list[0], worst = list[list.length-1];
    const gap  = best.mean - worst.mean;
    if (gap > 3)
      issues.push(`• 반 간 평균 격차 ${gap.toFixed(1)}점 (최고 ${best.lbl}반 ${best.mean.toFixed(1)}점 ↔ 최저 ${worst.lbl}반 ${worst.mean.toFixed(1)}점) — 반별 수업 진도·강의 자료의 표준화 점검 및 공동 수업 설계 필요`);
  }
  if (!issues.length)
    issues.push('• 전반적으로 양호한 성취 수준이며, 특이 문제점은 발견되지 않음. 현행 교육과정 유지 및 지속적 모니터링 권장');

  // ⑦ 환류 교육 계획 — 단계별 상세 초안
  const plans = [];
  if (fail.length){
    plans.push(`• 대상: 환산점수 ${PASS_CONV}점 미만 미성취 학생 ${fail.length}명 (전체의 ${failPct.toFixed(1)}%)${failClsTxt}`);
    plans.push(`• 시기: 성적 공지 후 2주 이내 1차 실시, 필요 시 2차 진행 (학과 일정에 맞춰 조정)`);
    plans.push(`• 1단계(공통 보충): 오답률 상위 문항${hard.length ? `(${hardNames} 등)` : ''} 중심의 핵심 개념 보충 강의 1~2회 실시`);
    plans.push(`• 2단계(개별 지도): 학생별 오답 유형 분석 결과에 따른 개별 피드백 및 취약 영역 온라인 학습 자료 제공`);
    plans.push(`• 재평가: 환류 교육 이수 후 동일 범위 재평가 실시 — 성취기준(환산 ${PASS_CONV}점) 도달 확인, 미도달 학생은 추가 개별 지도`);
    plans.push(`• 사후 관리: 출석·재평가 결과를 기록 유지하고, 차기 학기 CQI 보고서에 개선 효과 반영`);
  } else {
    plans.push(`• 미성취 학생이 없어 별도 환류 교육은 불필요함`);
    plans.push(`• 우수 성취 수준 유지를 위한 심화 학습 자료 제공 및 차기 시험 난이도 적정성 검토`);
  }

  // ⑧ 다음 학기 개선 목표 (목표값 + 상세 개선 방안)
  const goals = st ? {
    rate: `${Math.min(95, Math.ceil((achieveRate + 10) / 5) * 5)}%`,
    ratePlan: [
      hard.length
        ? `• 정답률 하위 문항(${hardNames}) 관련 단원의 수업 시간 보강 및 핵심 개념 재강의`
        : `• 오답률 상위 학습 영역 중심의 수업 내용 보강`,
      `• 환류 교육 이수자 전원 재평가 실시로 성취기준(환산 ${PASS_CONV}점) 도달 여부 확인`,
      `• 학기 중 형성평가(복습 퀴즈) 정례화로 취약 학생 조기 발견·지도`,
    ].join('\n'),
    avg: `${Math.min(90, Math.round(convAvg + 5))}점`,
    avgPlan: [
      `• 핵심 개념 요약자료 배포 및 주차별 복습 퀴즈 운영으로 기초 이해도 향상`,
      lowDisc.length
        ? `• 변별도 낮은 문항(${lowDiscNames}) 재검토·선택지 개선으로 평가 정확도 향상`
        : `• 문항 난이도 균형 조정으로 평가 정확도 향상`,
      `• 성적 하위 학생 대상 문제풀이 특강 및 튜터링(멘토링) 연계`,
    ].join('\n'),
    fail: `${Math.max(5, Math.round(failPct - 5))}% 이하`,
    failPlan: [
      fail.length
        ? `• 이번 학기 미성취 ${fail.length}명(${failPct.toFixed(1)}%)의 오답 유형 분석 → 취약 영역별 맞춤 보충자료 제공`
        : `• 위험군 발생 시 즉시 개별 상담·보충 지도로 이어지는 체계 유지`,
      `• 중간 평가 직후 위험군(환산 75점 미만) 선별 → 개별 학습 상담 및 학습 계획 수립`,
      `• 환류 교육 출석·재평가 결과를 학기 말까지 추적 관리하여 재발 방지`,
    ].join('\n'),
  } : { rate:'', ratePlan:'', avg:'', avgPlan:'', fail:'', failPlan:'' };

  return { issues: issues.join('\n'), plan: plans.join('\n'), goals };
}

function generateCQI(){
  const subject   = document.getElementById('cqi-subject').value   || '(교과목명 미입력)';
  const dept      = document.getElementById('cqi-dept').value      || '간호학과';
  const type_     = document.getElementById('cqi-type')?.value     || '';
  const grade     = document.getElementById('cqi-grade').value     || '';
  const credit    = document.getElementById('cqi-credit').value    || '';
  const enroll    = document.getElementById('cqi-enroll').value    || '';
  const professor = document.getElementById('cqi-professor').value || '정종필 교수';
  const dateVal   = document.getElementById('cqi-date').value      || '';
  const date      = dateVal
    ? (() => { const d = new Date(dateVal); return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`; })()
    : new Date().toLocaleDateString('ko-KR');

  // 재생성 시 기존 ⑥⑦⑧ 입력값 보존
  const prev = collectCQIReportInputs();

  const f   = v => v != null && !isNaN(v) ? v.toFixed(1) : '-';
  const fp  = v => v != null && !isNaN(v) ? v.toFixed(1) + '%' : '-';
  const pct = (v, t) => t > 0 ? Math.round(v/t*1000)/10 : 0;

  // 데이터 수집
  const allSt  = S.f3Total ? S.f3Total.students : (S.f3?.flatMap(c => c.students) || []);
  const scores = allSt.map(s => s.total);
  const st     = scores.length ? calcStats(scores, PASS_RAW) : null;
  const items  = S.f1?.items.filter(i => i.cr != null) || [];
  const classes = S.f3 || [];
  const n      = allSt.length;
  const safeN  = n || 1;
  const achieveN    = allSt.filter(s => s.pct >= PASS_CONV).length;
  const remedialN   = n - achieveN;
  const achieveRate = pct(achieveN, safeN);

  // 성취수준 분포 (GRADE_DEFS 공통 기준)
  const gradeCnt = Array(GRADE_DEFS.length).fill(0);
  allSt.forEach(s => gradeCnt[gradeIdx(s.pct)]++);
  const GRADE_LBLS = ['A+ (95점↑)','A (90–94점)','B+ (85–89점)','B (80–84점)','C+ (75–79점)','C (70–74점)','미성취(환류)'];

  // 문항 분석
  const hardTop5 = [...items].sort((a,b) => a.cr - b.cr).slice(0, 5);
  const avgCr    = items.length ? items.reduce((s,i) => s + i.cr, 0)/items.length : null;
  const diffCnt  = { '매우쉬움':0,'쉬움':0,'보통':0,'어려움':0,'매우어려움':0 };
  items.forEach(i => { const k = (i.diffLbl || '').replace(' ',''); if (diffCnt[k] !== undefined) diffCnt[k]++; });
  const lowDisc  = items.filter(i => i.disc != null && i.disc < 0.2);

  const kvBox = (lbl, val, sub, cls = '') =>
    `<div class="cqi-kv ${cls}"><div class="cqi-kv-lbl">${lbl}</div><div class="cqi-kv-val">${val}</div><div class="cqi-kv-sub">${sub || ''}</div></div>`;

  let html = `<div class="cqi-report" id="cqiReportContent">`;

  // 헤더
  html += `<div class="cqi-report-hdr">
    <div class="cqi-report-title">교과목 학습성과 CQI 보고서</div>
    <div class="cqi-report-sub">${esc(dept)} · ${esc(professor)} · 작성일: ${esc(date)}</div>
    <div class="cqi-report-sub" style="font-size:13px;font-weight:700;margin-top:4px;color:var(--p1)">${esc(subject)}</div>
  </div>`;

  // ① 교과목 기본 정보
  const displayEnroll = enroll || (n > 0 ? n + '명' : '-');
  html += `<div class="cqi-section"><div class="cqi-section-title">① 교과목 기본 정보</div>
  <table class="cqi-table"><colgroup><col style="width:14%"><col style="width:22%"><col style="width:14%"><col style="width:22%"><col style="width:14%"><col></colgroup>
  <tbody>
    <tr><th>교과목명</th><td colspan="3"><strong>${esc(subject)}</strong></td><th>담당교수</th><td>${esc(professor)}</td></tr>
    <tr><th>대상학과</th><td>${esc(dept)}</td><th>이수구분</th><td>${esc(type_ || '-')}</td><th>수강학년</th><td>${esc(grade || '-')}</td></tr>
    <tr><th>학점/시수</th><td>${esc(credit || '-')}</td><th>수강인원</th><td>${esc(displayEnroll)}</td><th>평가방법</th><td>필기시험 (${MAX_SCORE}점 만점)</td></tr>
    <tr><th>작성일</th><td>${esc(date)}</td><th>성취기준점</th><td colspan="3">환산 ${PASS_CONV}점 이상 (원점수 ${PASS_RAW}점)</td></tr>
  </tbody></table></div>`;

  // ② 학습성과 달성 현황
  html += `<div class="cqi-section"><div class="cqi-section-title">② 학습성과 달성 현황</div>`;
  if (st){
    const convAvg = st.mean*100/MAX_SCORE;
    html += `<div class="cqi-kv-grid">
      ${kvBox('전체 수강인원', n + '명','','c-blue')}
      ${kvBox('평균점수', f(st.mean) + '점', `환산 ${f(convAvg)}점`, convAvg >= PASS_CONV ? 'hi' : 'lo')}
      ${kvBox(`성취율(≥${PASS_CONV}점)`, fp(achieveRate), `${achieveN}명 성취`, achieveRate >= 70 ? 'hi' : achieveRate >= 50 ? 'md' : 'lo')}
      ${kvBox('미성취(환류)', remedialN + '명', fp(pct(remedialN, safeN)), remedialN === 0 ? 'hi' : 'lo')}
    </div>
    <table class="cqi-table"><thead><tr>
      <th>최고점</th><th>최저점</th><th>중앙값</th><th>표준편차</th><th>Q1</th><th>Q3</th>
    </tr></thead><tbody><tr>
      <td>${f(st.max)}점</td><td>${f(st.min)}점</td><td>${f(st.med)}점</td>
      <td>${f(st.sd)}점</td><td>${f(st.q1)}점</td><td>${f(st.q3)}점</td>
    </tr></tbody></table>`;
  } else {
    html += `<p style="color:var(--muted);font-size:12px">※ 파일3(종합성적현황) 데이터 없음</p>`;
  }
  html += `</div>`;

  // ③ 성취수준 분포
  html += `<div class="cqi-section"><div class="cqi-section-title">③ 성취수준 분포</div>
  <table class="cqi-table"><thead><tr>
    <th>성취수준</th>${GRADE_LBLS.map(g => `<th>${g}</th>`).join('')}<th>합계</th>
  </tr></thead><tbody>
    <tr><th>인원(명)</th>${gradeCnt.map(v => `<td>${v}</td>`).join('')}<td><strong>${n}</strong></td></tr>
    <tr><th>비율(%)</th>${gradeCnt.map(v => `<td>${pct(v, safeN).toFixed(1)}%</td>`).join('')}<td>100%</td></tr>
  </tbody></table></div>`;

  // ④ 문항별 성취 분석
  html += `<div class="cqi-section"><div class="cqi-section-title">④ 문항별 성취 분석</div>`;
  if (items.length){
    html += `<div class="cqi-kv-grid" style="grid-template-columns:repeat(5,1fr)">
      ${kvBox('총 문항 수', items.length + '문항','','c-blue')}
      ${kvBox('평균 정답률', avgCr != null ? fp(avgCr*100) : '','', (avgCr || 0) >= 0.7 ? 'hi' : (avgCr || 0) >= 0.5 ? 'md' : 'lo')}
      ${kvBox('매우쉬움/쉬움', (diffCnt['매우쉬움'] + diffCnt['쉬움']) + '문항','','c-teal')}
      ${kvBox('보통', diffCnt['보통'] + '문항','','c-purple')}
      ${kvBox('어려움/매우어려움', (diffCnt['어려움'] + diffCnt['매우어려움']) + '문항','','lo')}
    </div>
    <div style="margin-top:8px;font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px">▸ 정답률 하위 5문항 (집중 지도 필요)</div>
    <table class="cqi-table"><thead><tr>
      <th>순위</th><th>문항</th><th>정답률</th><th>난이도</th><th>변별도</th>
    </tr></thead><tbody>
    ${hardTop5.map((it, i) => `<tr>
      <td>${i+1}위</td><td><strong>${esc(it.qName)}</strong></td>
      <td style="color:#dc2626;font-weight:700">${fp(it.cr*100)}</td>
      <td>${it.diffLbl || '-'}</td>
      <td>${it.disc != null ? it.disc.toFixed(3) : '-'}</td>
    </tr>`).join('')}
    </tbody></table>`;
    if (lowDisc.length){
      html += `<div style="margin-top:8px;font-size:11px;color:var(--warn);font-weight:600">⚠ 변별도 개선 필요 문항 (D&lt;0.2): ${lowDisc.map(i => esc(i.qName)).join(', ')}</div>`;
    }
  } else {
    html += `<p style="color:var(--muted);font-size:12px">※ 파일1(문항분석표) 데이터 없음</p>`;
  }
  html += `</div>`;

  // ⑤ 반별 성취 현황
  if (classes.length){
    html += `<div class="cqi-section"><div class="cqi-section-title">⑤ 반별 성취 현황</div>
    <table class="cqi-table"><thead><tr>
      <th>반</th><th>학생수</th><th>평균(원점수)</th><th>환산평균</th><th>성취율</th><th>미성취</th>
    </tr></thead><tbody>`;
    classes.forEach(cl => {
      const cs = calcStats(cl.students.map(s => s.total), PASS_RAW);
      const pass = cl.students.filter(s => s.pct >= PASS_CONV).length;
      const fail = cl.students.length - pass;
      html += `<tr>
        <td><strong>${esc(cl.label)}</strong></td><td>${cl.students.length}명</td>
        <td>${f(cs.mean)}점</td><td>${f(cs.mean*100/MAX_SCORE)}점</td>
        <td>${fp(pct(pass, cl.students.length))}</td>
        <td>${fail}명 (${fp(pct(fail, cl.students.length))})</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  // ⑥ 문제점 및 개선 과제
  html += `<div class="cqi-section"><div class="cqi-section-title">⑥ 문제점 및 개선 과제</div>
  <textarea class="cqi-textarea" id="cqi-issues" style="min-height:170px;line-height:1.8" placeholder="분석 결과에서 도출된 문제점을 입력하세요. (보고서 생성 시 자동 초안이 채워집니다)
예시:
• 문항 XX~XX번의 정답률이 낮아 해당 학습 영역에 대한 보충 학습이 필요함
• 미성취 학생 XX명에 대한 체계적인 환류 교육 필요
• 반 간 성취도 격차 해소 방안 필요"></textarea></div>`;

  // ⑦ 환류 교육 계획
  html += `<div class="cqi-section"><div class="cqi-section-title">⑦ 환류 교육 계획</div>
  <textarea class="cqi-textarea" id="cqi-plan" style="min-height:170px;line-height:1.8" placeholder="미성취 학생 대상 환류 교육 계획을 입력하세요. (보고서 생성 시 자동 초안이 채워집니다)
예시:
• 대상: 환산점수 ${PASS_CONV}점 미만 학생 XX명
• 일시: 20XX년 XX월 XX일
• 방법: 보충 강의 / 개별 피드백 / 온라인 학습 자료 제공
• 재평가 계획: 환류 교육 후 동일 범위 재시험 실시"></textarea></div>`;

  // ⑧ 다음 학기 개선 목표 — 개선 방안은 여러 줄 입력(textarea)
  const goalRow = (lbl, cur, goalId, goalPh, planId) => `
    <tr>
      <td style="font-weight:600">${lbl}</td>
      <td>${cur}</td>
      <td><input class="cqi-input" id="${goalId}" placeholder="${goalPh}" style="font-size:11px;text-align:center"></td>
      <td style="text-align:left"><textarea class="cqi-textarea" id="${planId}" placeholder="개선 방안 입력 (글머리표 • 로 여러 항목 작성 가능)" style="min-height:88px;font-size:11px;line-height:1.7"></textarea></td>
    </tr>`;
  html += `<div class="cqi-section"><div class="cqi-section-title">⑧ 다음 학기 개선 목표</div>
  <table class="cqi-table"><colgroup><col style="width:11%"><col style="width:11%"><col style="width:13%"><col></colgroup>
  <thead><tr><th>지표</th><th>현재</th><th>목표</th><th>개선 방안</th></tr></thead><tbody>
    ${goalRow('성취율',     st ? fp(achieveRate) : '-',                    'cqi-goal-rate', '예: 80%',      'cqi-goal-rate-plan')}
    ${goalRow('평균점수',   st ? f(st.mean*100/MAX_SCORE) + '점' : '-',    'cqi-goal-avg',  '예: 75점',     'cqi-goal-avg-plan')}
    ${goalRow('미성취 비율', st ? fp(pct(remedialN, safeN)) : '-',          'cqi-goal-fail', '예: 10% 이하', 'cqi-goal-fail-plan')}
  </tbody></table></div>`;

  html += `<div style="margin-top:16px;padding:10px 14px;background:#f1f5f9;border-radius:8px;font-size:10px;color:var(--muted);text-align:center">
    본 CQI 보고서는 업로드된 데이터를 기반으로 자동 생성되었습니다. 내용을 검토 후 PDF로 저장하세요.
  </div>`;

  html += `</div>`;

  document.getElementById('cqiReport').innerHTML = html;

  // 보존해 둔 ⑥⑦⑧ 입력값 복원 → 비어 있는 항목은 데이터 기반 자동 초안으로 채움
  const draft = buildCQIDrafts();
  const setV = (id, kept, fallback) => {
    const el = document.getElementById(id);
    if (el) el.value = kept || fallback || '';
  };
  setV('cqi-issues', prev.issues, draft.issues);
  setV('cqi-plan',   prev.plan,   draft.plan);
  setV('cqi-goal-rate',      prev.goals.rate,     draft.goals.rate);
  setV('cqi-goal-rate-plan', prev.goals.ratePlan, draft.goals.ratePlan);
  setV('cqi-goal-avg',       prev.goals.avg,      draft.goals.avg);
  setV('cqi-goal-avg-plan',  prev.goals.avgPlan,  draft.goals.avgPlan);
  setV('cqi-goal-fail',      prev.goals.fail,     draft.goals.fail);
  setV('cqi-goal-fail-plan', prev.goals.failPlan, draft.goals.failPlan);
  S._cqiTextDraft = null;

  document.getElementById('cqiExpBar').style.display = 'flex';
  autoSaveSession();
  toast('✅ CQI 보고서 생성 완료 — ⑥⑦⑧에 자동 초안이 입력되었습니다. 검토 후 수정하세요.');
}

// CQI ⑥⑦ AI 초안 생성 (Claude)
async function generateCQIDraft(){
  if (!S.analyzed){ toast('❌ 먼저 성적 분석을 실행하세요'); return; }
  if (!getAIKey()){ configureAIKey(); if (!getAIKey()) return; }
  if (!document.getElementById('cqi-issues')) generateCQI();   // 보고서가 없으면 먼저 생성

  toast('✨ AI 초안 생성 중… (수 초 소요)');
  buildAIReport();   // _aiRawText 최신화 (모달은 열지 않음)

  const promptText =
    `당신은 대학 간호학과의 교육평가 전문가입니다. 아래 시험 분석 요약을 바탕으로 ` +
    `CQI(지속적 질 개선) 보고서의 세 항목을 한국어로 작성하세요.\n\n${_aiRawText}\n\n` +
    `반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):\n` +
    `{"issues":"⑥ 문제점 및 개선 과제 — 글머리표(•) 3~5개, 데이터 근거 포함",` +
    `"plan":"⑦ 환류 교육 계획 — 대상·시기·방법·재평가 계획 포함, 글머리표(•) 3~5개",` +
    `"goals":{"rate":"성취율 목표값(예: 85%)","ratePlan":"성취율 개선 방안 — 글머리표(•) 2~3개, 구체적 실행 방법 포함",` +
    `"avg":"평균점수 목표값(예: 78점)","avgPlan":"평균점수 개선 방안 — 글머리표(•) 2~3개, 구체적 실행 방법 포함",` +
    `"fail":"미성취 비율 목표값(예: 10% 이하)","failPlan":"미성취 비율 개선 방안 — 글머리표(•) 2~3개, 구체적 실행 방법 포함"}}`;

  try {
    const txt = await callClaude(promptText, 1800);
    let issues = '', plan = '', goals = null;
    const m = txt.match(/\{[\s\S]*\}/);
    if (m){
      try {
        const j = JSON.parse(m[0]);
        issues = j.issues || ''; plan = j.plan || ''; goals = j.goals || null;
      } catch(_){}
    }
    if (!issues && !plan) issues = txt;   // JSON 파싱 실패 시 원문 사용
    const setV = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    setV('cqi-issues', issues);
    setV('cqi-plan',   plan);
    if (goals){
      setV('cqi-goal-rate',      goals.rate);
      setV('cqi-goal-rate-plan', goals.ratePlan);
      setV('cqi-goal-avg',       goals.avg);
      setV('cqi-goal-avg-plan',  goals.avgPlan);
      setV('cqi-goal-fail',      goals.fail);
      setV('cqi-goal-fail-plan', goals.failPlan);
    }
    autoSaveSession();
    toast('✅ AI 초안이 ⑥·⑦·⑧ 항목에 입력되었습니다. 반드시 내용을 검토·수정하세요.');
  } catch(e){
    toast('❌ AI 초안 생성 실패: ' + e.message);
    console.error(e);
  }
}

async function exportCQIPDF(){
  const content = document.getElementById('cqiReportContent');
  if (!content){ toast('❌ 먼저 CQI 보고서를 생성하세요'); return; }
  toast('PDF 생성 중…');
  try {
    const { jsPDF } = window.jspdf;

    // 원본 DOM 수정 → 클론 → 원본 즉시 복원
    // (cloneNode 후 수정은 이미 복사된 빈 값을 읽어 실패)

    // ① textarea → 높이 자동확장 div 로 임시 교체
    const taBackups = [];
    content.querySelectorAll('textarea').forEach(ta => {
      const val = ta.value || '';
      const div = document.createElement('div');
      div.style.cssText =
        'width:100%;height:auto;overflow:visible;padding:10px 12px;' +
        'border:1px solid #e2e8f0;border-radius:8px;font-size:12px;' +
        'line-height:1.6;white-space:pre-wrap;word-break:break-word;' +
        'background:#fff;font-family:inherit;box-sizing:border-box;' +
        (val ? 'color:#1e293b' : 'color:#94a3b8');
      div.textContent = val || ta.placeholder || '';
      taBackups.push({ ta, div, parent: ta.parentNode });
      ta.parentNode.replaceChild(div, ta);
    });

    // ② input value → attribute 반영
    const inpBackups = [];
    content.querySelectorAll('input:not([type="file"])').forEach(inp => {
      inpBackups.push({ inp, prev: inp.getAttribute('value') });
      inp.setAttribute('value', inp.value || '');
    });

    // ③ 수정된 원본을 클론
    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      'position:absolute;left:-9999px;top:0;width:900px;height:auto;overflow:visible;' +
      'background:#fff;padding:0;' +
      'font-family:-apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
    wrapper.appendChild(content.cloneNode(true));

    // ④ 원본 즉시 복원
    taBackups.forEach(({ ta, div, parent }) => parent.replaceChild(ta, div));
    inpBackups.forEach(({ inp, prev }) => {
      if (prev === null) inp.removeAttribute('value');
      else inp.setAttribute('value', prev);
    });

    // ⑤ 오프스크린 캡처
    document.body.appendChild(wrapper);
    await new Promise(r => setTimeout(r, 300));
    const wrapH = wrapper.scrollHeight;
    const canvas = await html2canvas(wrapper, {
      scale:2, useCORS:true, backgroundColor:'#fff', logging:false,
      width:900, height:wrapH, windowWidth:900, scrollX:0, scrollY:0
    });
    document.body.removeChild(wrapper);

    const pdf = new jsPDF('p','mm','a4');
    addCanvasToPdf(pdf, canvas, { used:false }, 0.95);
    const subject = document.getElementById('cqi-subject')?.value || '교과목';
    pdf.save(`CQI보고서_${subject.replace(/[\\/:*?"<>|]/g,'')}_${new Date().toISOString().slice(0,10)}.pdf`);
    toast(`✅ CQI PDF 저장 완료 (${pdf.getNumberOfPages()}페이지)`);
  } catch(e){ toast('❌ PDF 생성 실패: ' + e.message); console.error(e); }
}
