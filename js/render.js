// ═══════════════════════════════════════════
// render.js — 분석 실행 · 대시보드 렌더링
// ═══════════════════════════════════════════

function runAnalysis(){
  document.getElementById('loading').classList.add('show');
  document.getElementById('dash').classList.remove('show');
  setTimeout(() => {
    try {
      S.f1 = S.raw[0] ? parseFile1(S.raw[0].rows) : null;

      // File1 파싱 후 실제 문항 수로 자동 보정 (수동 설정이 없을 때만)
      if (S.f1 && S.f1.items.length && !S.maxManual){
        applyMaxScore(S.f1.items.length, false);
      }

      S.f2 = S.raw[1] ? parseFile2(S.raw[1].rows) : null;
      S.f3 = null; S.f3Total = null;

      let overMaxTotal = 0, overMaxPeak = 0;
      if (S.raw[2]){
        const allParsed = S.raw[2].sheets
          .map(s => parseClassSheet(s.rows, s.name)).filter(Boolean);
        allParsed.forEach(c => {
          overMaxTotal += c.overMax || 0;
          c.students.forEach(s => { if (s.total > overMaxPeak) overMaxPeak = s.total; });
        });
        const totalIdx = allParsed.findIndex(c => TOTAL_PAT.test(c.label.trim()));
        if (totalIdx >= 0){
          S.f3Total = allParsed[totalIdx];
          S.f3 = allParsed.filter((_, i) => i !== totalIdx);
        } else {
          S.f3 = allParsed;
        }
      }

      if (!S.f1 && !S.f2 && !S.f3 && !S.f3Total) throw new Error('분석할 데이터가 없습니다.');

      // 만점 초과 점수 경고 배너 (데이터는 자르지 않음)
      const wb = document.getElementById('warnBanner');
      if (overMaxTotal > 0){
        let msg = `⚠️ <strong>만점(${MAX_SCORE}점)을 초과하는 점수가 ${overMaxTotal}건</strong> 발견되었습니다 (최대 ${overMaxPeak}점). `
                + `점수는 자르지 않고 그대로 분석에 사용했지만, 환산점수·성취율이 왜곡될 수 있습니다. `
                + `상단 도구막대에서 <strong>시험 만점</strong>을 확인·수정한 뒤 다시 분석하세요.`;
        if (!S.raw[0] && overMaxPeak <= 100)
          msg += ` 파일3의 점수가 100점 만점(환산점수)이라면 만점을 <strong>100</strong>으로 설정하세요.`;
        wb.innerHTML = msg;
        wb.classList.add('show');
      } else {
        wb.classList.remove('show');
      }

      // 전체 학생 목록: S.f3Total 우선, 없으면 반별 합산
      const allStudents = S.f3Total
        ? S.f3Total.students.map(s => ({ ...s, cls:'전체' }))
        : (S.f3 ? S.f3.flatMap(c => c.students) : []);

      if (allStudents.length){
        // File 3 데이터: 원점수 기준 → 성취기준 PASS_RAW
        renderSummary(calcStats(allStudents.map(s => s.total), PASS_RAW), S.f3?.length || 0, false);
      } else if (S.f2){
        // File 3 없을 때 File 2 통계로 요약 카드 채우기
        // 스케일을 먼저 감지한 뒤, 같은 단위의 성취기준점으로 통계 계산
        const maxS2 = S.f2.type === 'freq'
          ? Math.max(...S.f2.dist.map(d => d.score))
          : Math.max(...S.f2.scores);
        const ic = maxS2 > MAX_SCORE;                    // true: 0~100 환산 스케일
        const thresh = ic ? PASS_CONV : PASS_RAW;
        const f2st = S.f2.type === 'freq'
          ? statsFromFreq(S.f2.dist.filter(d => d.count > 0), thresh)
          : calcStats(S.f2.scores, thresh);
        if (f2st.n){
          const toR = v => ic ? Math.round(v*MAX_SCORE/100*10)/10 : Math.round(v*10)/10;
          const rawSt = {
            n: f2st.n, mean: toR(f2st.mean), max: toR(f2st.max),
            min: toR(f2st.min), sd: toR(f2st.sd), passRate: f2st.passRate
          };
          renderSummary(rawSt, 0, false);
          document.getElementById('c-cls').textContent = '성적분포도';
        }
      } else if (S.f1 && S.f1.items.length){
        renderSummaryF1(S.f1.items);
      }

      // 반 선택기: 반별 시트만 표시
      const classesForSelector = S.f3 || [];
      if (classesForSelector.length) buildClassSelectors(classesForSelector);
      S.activeClass = 'all';

      renderItems(S.f1);
      renderScores(S.f2);
      renderTop10(S.f1);
      renderDisc(S.f1);
      renderCompare(classesForSelector);
      renderRank(allStudents, 'all');

      // 데이터 없는 탭 비활성화
      ['items','top10','disc'].forEach(t =>
        document.getElementById(`tbtn-${t}`).classList.toggle('dim', !S.f1));
      document.getElementById('tbtn-scores').classList.toggle('dim', !S.f2);
      const hasF3 = !!(S.f3Total || classesForSelector.length);
      ['compare','rank'].forEach(t =>
        document.getElementById(`tbtn-${t}`).classList.toggle('dim', !hasF3));
      document.getElementById('tbtn-cqi').classList.remove('dim');
      document.getElementById('tbtn-trend').classList.remove('dim');

      document.getElementById('loading').classList.remove('show');
      document.getElementById('dash').classList.add('show');

      // CQI 폼 표시 + 자동 입력
      document.getElementById('cqiInitMsg').style.display  = 'none';
      document.getElementById('cqiFormArea').style.display = 'block';
      const _cqiSt = S.f3Total ? S.f3Total.students : (S.f3?.flatMap(c => c.students) || []);
      const _enrollEl = document.getElementById('cqi-enroll');
      if (_enrollEl && !_enrollEl.value) _enrollEl.value = _cqiSt.length ? _cqiSt.length + '명' : '';
      const _dateEl = document.getElementById('cqi-date');
      if (_dateEl && !_dateEl.value){
        const _now = new Date();
        _dateEl.value = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
      }
      const _subjectEl = document.getElementById('cqi-subject');
      if (_subjectEl && !_subjectEl.value && S.raw[0]?._subject)
        _subjectEl.value = S.raw[0]._subject;

      S.analyzed = true;

      // 세션에서 불러온 CQI 입력값 복원
      if (S._pendingCQI){
        applyCQIInputs(S._pendingCQI);
        S._pendingCQI = null;
      }

      // 자동 저장 (localStorage)
      autoSaveSession();

      toast('✅ 분석 완료!');
    } catch(ex){
      document.getElementById('loading').classList.remove('show');
      toast('❌ ' + ex.message);
      console.error(ex);
    }
  }, 80);
}

// ═══════════════════════════
// SUMMARY CARDS
// ═══════════════════════════
function resetSumLabels(){
  document.getElementById('c-n-lbl').textContent    = '총 학생 수';
  document.getElementById('c-avg-lbl').textContent  = '평균 점수';
  document.getElementById('c-max-lbl').textContent  = '최고점';
  document.getElementById('c-min-lbl').textContent  = '최저점';
  document.getElementById('c-sd-lbl').textContent   = '표준편차';
  document.getElementById('c-pass-lbl').textContent = `성취율 (환산 ${PASS_CONV}점↑)`;
}

// isConvScale: true → st 값이 0~100 환산점수 기준 / false → 원점수 기준
function renderSummary(st, numClasses, isConvScale = false){
  resetSumLabels();
  const toRaw  = v => isConvScale ? Math.round(v*MAX_SCORE/100*10)/10 : Math.round(v*10)/10;
  const toConv = v => isConvScale ? Math.round(v*10)/10 : Math.round(v*100/MAX_SCORE*10)/10;
  const fmt    = v => v != null && !isNaN(v) ? v.toFixed(1) : '-';

  document.getElementById('c-n').textContent   = st.n ?? '-';
  document.getElementById('c-cls').textContent = numClasses ? `${numClasses}개 반`
                                               : (isConvScale ? '성적분포도' : '-');
  const setCard = (valId, subId, raw, conv) => {
    document.getElementById(valId).textContent = `${fmt(raw)}점`;
    const sub = document.getElementById(subId);
    if (sub) sub.textContent = `(환산 ${fmt(conv)}점)`;
  };
  setCard('c-avg','c-avg-sub', toRaw(st.mean), toConv(st.mean));
  setCard('c-max','c-max-sub', toRaw(st.max),  toConv(st.max));
  setCard('c-min','c-min-sub', toRaw(st.min),  toConv(st.min));
  document.getElementById('c-sd').textContent   = `${fmt(toRaw(st.sd))}점`;
  document.getElementById('c-pass').textContent = st.passRate != null ? st.passRate.toFixed(1) : '-';
}

// 파일1(문항분석표) 전용 요약
function renderSummaryF1(items){
  const crItems = items.filter(i => i.cr != null);
  if (!crItems.length) return;

  const pcts = crItems.map(i => i.cr*100);
  const n    = crItems.length;
  const avg  = pcts.reduce((a,b) => a+b, 0)/n;
  const max  = Math.max(...pcts);
  const min  = Math.min(...pcts);
  const sd   = Math.sqrt(pcts.reduce((v,x) => v + (x-avg)**2, 0)/n);
  const discVals = crItems.filter(i => i.disc != null).map(i => i.disc);
  const avgDisc  = discVals.length ? discVals.reduce((a,b) => a+b, 0)/discVals.length : null;
  const hardN    = items.filter(i => i.diffLbl === '어려움' || i.diffLbl === '매우 어려움').length;

  document.getElementById('c-n-lbl').textContent    = '총 문항 수';
  document.getElementById('c-avg-lbl').textContent  = '평균 정답률';
  document.getElementById('c-max-lbl').textContent  = '최고 정답률';
  document.getElementById('c-min-lbl').textContent  = '최저 정답률';
  document.getElementById('c-sd-lbl').textContent   = '정답률 표준편차';
  document.getElementById('c-pass-lbl').textContent = '어려운 문항 수';

  document.getElementById('c-n').textContent   = n;
  document.getElementById('c-cls').textContent = '문항분석표';

  const fmt1 = v => v != null ? v.toFixed(1) : '-';
  const setStat = (valId, subId, val, sub) => {
    document.getElementById(valId).textContent = val;
    const el = document.getElementById(subId); if (el) el.textContent = sub;
  };
  setStat('c-avg','c-avg-sub', `${fmt1(avg)}%`, `(원점수 ${fmt1(avg*MAX_SCORE/100)}점)`);
  setStat('c-max','c-max-sub', `${fmt1(max)}%`, '(가장 쉬운 문항)');
  setStat('c-min','c-min-sub', `${fmt1(min)}%`, '(가장 어려운 문항)');
  document.getElementById('c-sd').textContent   = `${fmt1(sd)}%`;
  document.getElementById('c-pass').textContent =
    avgDisc != null ? `${hardN}문항 / D=${avgDisc.toFixed(2)}` : `${hardN}문항`;
}

// ═══════════════════════════
// CLASS SELECTOR
// ═══════════════════════════
function buildClassSelectors(classes){
  ['clsBar1','clsBar2'].forEach(id => {
    const bar = document.getElementById(id);
    bar.innerHTML = '<label>반 선택:</label>';
    const all = document.createElement('button');
    all.className = 'cls-btn on'; all.textContent = '전체'; all.dataset.cls = 'all';
    all.onclick = () => selectClass('all');
    bar.appendChild(all);
    classes.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'cls-btn'; btn.textContent = c.label; btn.dataset.cls = c.label;
      btn.onclick = () => selectClass(c.label);
      bar.appendChild(btn);
    });
  });
}

function selectClass(cls){
  S.activeClass = cls;
  document.querySelectorAll('.cls-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.cls === cls));

  const students = cls === 'all'
    ? (S.f3Total ? S.f3Total.students.map(s => ({ ...s, cls:'전체' }))
                 : (S.f3 || []).flatMap(c => c.students))
    : ((S.f3 || []).find(c => c.label === cls)?.students || []);

  if (cls !== 'all' && students.length){
    renderSummary(calcStats(students.map(s => s.total), PASS_RAW), 1, false);
    document.getElementById('c-cls').textContent = cls;
  } else if (cls === 'all'){
    const src = S.f3Total ? S.f3Total.students : (S.f3 || []).flatMap(c => c.students);
    renderSummary(calcStats(src.map(s => s.total), PASS_RAW), S.f3?.length || 0, false);
  }

  const classesToShow = cls === 'all' ? (S.f3 || []) : (S.f3 || []).filter(c => c.label === cls);
  renderCompare(classesToShow);
  renderRank(students, cls);
  document.getElementById('rankTitle').textContent = cls === 'all' ? '전체' : cls;
}

// ═══════════════════════════
// RENDER: FILE 1 — 문항분석
// ═══════════════════════════
function renderItems(f1){
  if (!f1){
    setNoData('tp-items','📋','파일1 (문항분석표)를 업로드하면 분석이 표시됩니다.');
    return;
  }
  const items = f1.items;

  // 감지된 열 정보 패널
  const det = f1.detected || {};
  const fields = [
    { k:'crCol',  lbl:'정답률' }, { k:'discCol', lbl:'변별도' }, { k:'diffCol', lbl:'난이도' },
    { k:'avgCol', lbl:'평균' },   { k:'sdCol',   lbl:'표준편차' },{ k:'qCol',   lbl:'문항번호' },
  ];
  const badges = fields.map(({k, lbl}) =>
    det[k] ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#f0f9ff;border:1px solid #bae6fd;color:#0369a1;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:600">${lbl}<span style="opacity:.6">→ ${esc(det[k])}</span></span>`
           : `<span style="display:inline-flex;align-items:center;gap:4px;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:2px 8px;border-radius:100px;font-size:10px">${lbl}<span style="opacity:.7">미감지</span></span>`
  ).join('');
  document.getElementById('tp-items').querySelector('.det-panel')?.remove();
  const detEl = document.createElement('div');
  detEl.className = 'det-panel';
  detEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;align-items:center';
  detEl.innerHTML = `<span style="font-size:10px;color:var(--muted);font-weight:600;margin-right:2px">📌 감지된 열:</span>${badges}`;
  document.getElementById('tp-items').querySelector('.src-bdg')?.insertAdjacentElement('afterend', detEl);

  const DLBLS = ['매우 쉬움','쉬움','보통','어려움','매우 어려움'];
  const DCOLS = ['#16a34a','#22c55e','#f59e0b','#f97316','#dc2626'];

  function stdDiff(it){
    if (it.diffLbl && DLBLS.includes(it.diffLbl)) return it.diffLbl;
    if (it.cr != null) return diffLevel(1 - it.cr).lbl;
    return null;
  }

  const dcnt = {}; DLBLS.forEach(l => dcnt[l] = 0);
  items.forEach(i => { const k = stdDiff(i); if (k) dcnt[k] = (dcnt[k] || 0) + 1; });

  document.getElementById('diffRow').innerHTML = DLBLS.map((l,i) => `
    <div class="diff-mini">
      <div class="diff-num" style="color:${DCOLS[i]}">${dcnt[l] || 0}</div>
      <div class="diff-lbl">${l}</div>
      <div class="diff-pct" style="color:${DCOLS[i]}">${(((dcnt[l] || 0)/items.length)*100).toFixed(0)}%</div>
    </div>`).join('');

  // 정답률 bar
  killChart('chItem');
  S.charts.chItem = new Chart(document.getElementById('chItem'), {
    type:'bar',
    data:{ labels: items.map(i => i.qName), datasets:[{
      label:'정답률(%)',
      data: items.map(i => i.cr != null ? Math.round(i.cr*1000)/10 : null),
      backgroundColor: items.map(i => (i.diffColor || '#94a3b8') + 'bb'),
      borderColor: items.map(i => i.diffColor || '#94a3b8'), borderWidth:1, borderRadius:3
    }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{
        afterLabel: c => { const it = items[c.dataIndex]; return `오답률: ${it.wr != null ? (it.wr*100).toFixed(1)+'%' : '-'}\n변별도: ${it.disc != null ? it.disc.toFixed(3) : '-'}\n난이도: ${it.diffLbl || '-'}`; }
      }}},
      scales:{ y:{ min:0, max:100, title:{display:true, text:'정답률(%)'}, grid:{color:'#f1f5f9'} },
        x:{ ticks:{ maxRotation:70, font:{size:9} } } }
    }
  });

  // 난이도 pie
  killChart('chDiffPie');
  const pL = DLBLS.filter(l => (dcnt[l] || 0) > 0);
  S.charts.chDiffPie = new Chart(document.getElementById('chDiffPie'), {
    type:'doughnut',
    data:{ labels: pL, datasets:[{
      data: pL.map(l => dcnt[l] || 0),
      backgroundColor: DLBLS.map((l,i) => (dcnt[l] || 0) > 0 ? DCOLS[i] : null).filter(Boolean),
      borderWidth:2, borderColor:'#fff'
    }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom', labels:{font:{size:10}}},
        tooltip:{ callbacks:{ label: c => `${c.label}: ${c.parsed}문항` } }
      }
    }
  });

  // 정답률 분포 (10% bins)
  const crBins = Array(10).fill(0);
  items.filter(i => i.cr != null).forEach(i => crBins[Math.min(9, Math.floor(i.cr*10))]++);
  killChart('chCrDist');
  S.charts.chCrDist = new Chart(document.getElementById('chCrDist'), {
    type:'bar',
    data:{ labels:['0–10%','10–20%','20–30%','30–40%','40–50%','50–60%','60–70%','70–80%','80–90%','90–100%'],
      datasets:[{ label:'문항 수', data: crBins,
        backgroundColor: Array(10).fill(0).map((_,i) => {
          const m = (i+.5)*10;
          return m < 40 ? 'rgba(239,68,68,.7)' : m < 70 ? 'rgba(245,158,11,.7)' : 'rgba(34,197,94,.7)';
        }), borderWidth:0, borderRadius:3 }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{ y:{ beginAtZero:true, title:{display:true, text:'문항 수'} }, x:{ ticks:{ font:{size:8}, maxRotation:45 } } }
    }
  });

  // 난이도 분류 카드
  const DIFF_META = [
    { lbl:'매우 쉬움',   bg:'#f0fdf4', col:'#15803d', border:'#bbf7d0' },
    { lbl:'쉬움',        bg:'#f0fdf4', col:'#059669', border:'#a7f3d0' },
    { lbl:'보통',        bg:'#fefce8', col:'#92400e', border:'#fde68a' },
    { lbl:'어려움',      bg:'#fff7ed', col:'#c2410c', border:'#fed7aa' },
    { lbl:'매우 어려움', bg:'#fef2f2', col:'#dc2626', border:'#fecaca' },
  ];
  const grouped = {};
  DIFF_META.forEach(m => grouped[m.lbl] = []);
  items.forEach(it => {
    const key = stdDiff(it);
    if (key && grouped[key] !== undefined) grouped[key].push(it);
  });

  document.getElementById('diffClassify').innerHTML = DIFF_META.map(m => {
    const grp = grouped[m.lbl] || [];
    const avgCr = grp.length ? grp.reduce((s,i) => s + (i.cr || 0), 0) / grp.length : null;
    const discGrp = grp.filter(i => i.disc != null);
    const avgDisc = discGrp.length ? discGrp.reduce((s,i) => s + i.disc, 0) / discGrp.length : null;
    return `
      <div class="diff-group" style="background:${m.bg};border:1px solid ${m.border}">
        <div class="diff-g-ttl" style="color:${m.col}">${m.lbl}</div>
        <div class="diff-g-count" style="color:${m.col}">${grp.length}</div>
        <div class="diff-g-avgcr" style="color:${m.col}">
          정답률 평균 ${avgCr != null ? (avgCr*100).toFixed(1)+'%' : '—'}
          ${avgDisc != null ? ` · 변별도 ${avgDisc.toFixed(2)}` : ''}
        </div>
        <div class="diff-g-sep"></div>
        <div class="diff-q-list">
          ${grp.length ? grp.map(i => `<span class="diff-q-chip" style="color:${m.col}" title="${esc(i.qName)} · 정답률 ${i.cr != null ? (i.cr*100).toFixed(1)+'%' : '?'}">${esc(i.qName)}</span>`).join('') : '<span style="font-size:10px;opacity:.5">—</span>'}
        </div>
      </div>`;
  }).join('');

  // 난이도 순 정렬 차트
  const sortedItems = items.filter(i => i.cr != null).sort((a,b) => a.cr - b.cr);
  killChart('chDiffSorted');
  S.charts.chDiffSorted = new Chart(document.getElementById('chDiffSorted'), {
    type:'bar',
    data:{
      labels: sortedItems.map(i => i.qName),
      datasets:[{
        label:'정답률(%)',
        data: sortedItems.map(i => Math.round(i.cr*1000)/10),
        backgroundColor: sortedItems.map(i => (i.diffColor || '#94a3b8') + 'cc'),
        borderColor: sortedItems.map(i => i.diffColor || '#94a3b8'),
        borderWidth:1, borderRadius:3
      }]
    },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{
        afterLabel: c => {
          const it = sortedItems[c.dataIndex];
          return `오답률: ${(it.wr*100).toFixed(1)}%\n난이도: ${it.diffLbl || '-'}\n변별도: ${it.disc != null ? it.disc.toFixed(3) : '-'}`;
        }
      }}},
      scales:{ x:{ min:0, max:100, title:{display:true, text:'정답률(%)'} }, y:{ ticks:{ font:{size:9} } } }
    }
  });

  // 난이도별 통계 요약
  document.getElementById('diffStatSummary').innerHTML = DIFF_META.map(m => {
    const grp = grouped[m.lbl] || [];
    if (!grp.length) return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:5px;border-radius:8px;background:${m.bg};border:1px solid ${m.border}">
        <span style="font-size:11px;font-weight:700;color:${m.col};flex:1">${m.lbl}</span>
        <span style="font-size:11px;color:${m.col};opacity:.6">0문항</span>
      </div>`;
    const crVals   = grp.filter(i => i.cr != null).map(i => i.cr);
    const discVals = grp.filter(i => i.disc != null).map(i => i.disc);
    const avgCr    = crVals.length   ? crVals.reduce((a,b) => a+b, 0)/crVals.length : null;
    const maxCr    = crVals.length   ? Math.max(...crVals) : null;
    const minCr    = crVals.length   ? Math.min(...crVals) : null;
    const avgDisc  = discVals.length ? discVals.reduce((a,b) => a+b, 0)/discVals.length : null;
    return `
      <div style="margin-bottom:8px;border-radius:9px;overflow:hidden;border:1px solid ${m.border}">
        <div style="background:${m.col};color:#fff;padding:6px 10px;font-size:11px;font-weight:700;display:flex;justify-content:space-between">
          <span>${m.lbl}</span><span>${grp.length}문항</span>
        </div>
        <div class="diff-stat-row" style="padding:7px;background:${m.bg};gap:5px">
          <div class="diff-stat-cell">
            <div class="dsc-lbl">정답률 평균</div>
            <div class="dsc-val" style="color:${m.col}">${avgCr != null ? (avgCr*100).toFixed(1)+'%' : '—'}</div>
          </div>
          <div class="diff-stat-cell">
            <div class="dsc-lbl">최고 / 최저</div>
            <div class="dsc-val" style="color:${m.col};font-size:11px">
              ${maxCr != null ? (maxCr*100).toFixed(0)+'%' : '—'} / ${minCr != null ? (minCr*100).toFixed(0)+'%' : '—'}
            </div>
          </div>
          <div class="diff-stat-cell">
            <div class="dsc-lbl">평균 변별도</div>
            <div class="dsc-val" style="color:${m.col}">${avgDisc != null ? avgDisc.toFixed(3) : '—'}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  // 상세표
  document.getElementById('tbItem').innerHTML = items.map(it => `
    <tr>
      <td><strong>${esc(it.qName)}</strong></td>
      <td>${it.cr != null ? (it.cr*100).toFixed(1)+'%' : '-'}
        <div class="pb"><div class="pf" style="width:${it.cr != null ? Math.min(100, it.cr*100) : 0}%;background:#22c55e"></div></div></td>
      <td>${it.wr != null ? (it.wr*100).toFixed(1)+'%' : '-'}
        <div class="pb"><div class="pf" style="width:${it.wr != null ? Math.min(100, it.wr*100) : 0}%;background:#ef4444"></div></div></td>
      <td>${it.disc != null ? it.disc.toFixed(3) : '-'}</td>
      <td>${it.avg != null ? (it.avg*100).toFixed(1)+'%' : '-'}</td>
      <td>${it.sd != null ? it.sd.toFixed(3) : '-'}</td>
      <td><span class="bdg ${it.diffCls || ''}" style="${!it.diffCls && it.diffColor ? `background:${it.diffColor}22;color:${it.diffColor}` : ''}">${it.diffLbl || '-'}</span></td>
    </tr>`).join('');
}

// ═══════════════════════════
// RENDER: FILE 2 — 성적분포
// ═══════════════════════════
function renderScores(f2){
  if (!f2){ setNoData('tp-scores','📊','파일2 (성적분포도)를 업로드하면 분포가 표시됩니다.'); return; }

  // ── 분포 구성 + 스케일 감지 → 같은 단위의 성취기준으로 통계 계산 ──
  let dist = [], isConv = false;
  let st = { n:null, mean:null, sd:null, med:null, min:null, max:null, q1:null, q3:null, passRate:null };

  if (f2.type === 'freq'){
    dist = f2.dist;
    const maxSc = dist.length ? Math.max(...dist.map(d => d.score)) : 0;
    isConv = maxSc > MAX_SCORE;
    const tmp = statsFromFreq(dist.filter(d => d.count > 0), isConv ? PASS_CONV : PASS_RAW);
    if (Object.keys(tmp).length) st = tmp;
  } else {
    const scores = f2.scores;
    const maxSc = scores.length ? Math.max(...scores) : 0;
    isConv = maxSc > MAX_SCORE;
    st = calcStats(scores, isConv ? PASS_CONV : PASS_RAW);
    const tmp = {};
    scores.forEach(s => { const k = Math.round(s); tmp[k] = (tmp[k] || 0) + 1; });
    dist = Array.from({length:101}, (_,i) => ({ score:i, count: tmp[i] || 0 }));
  }

  // 환산점수 기준으로 dist 점수 정규화
  const toConvScore = s => isConv ? s : Math.round(s*100/MAX_SCORE*10)/10;

  // 각 구간 레이블: 등급(원점수/환산점수)
  const gradeBandLabels = GRADE_DEFS.map(b => {
    const raw = Math.round(b.min * MAX_SCORE/100);
    if (b.lbl === '미성취(환류)') return `미성취(<${Math.round(PASS_CONV*MAX_SCORE/100)}점/<${PASS_CONV}점)`;
    return `${b.lbl}(${raw}점/${b.min}점)`;
  });

  // 각 구간별 학생 수
  const gradeCounts = GRADE_DEFS.map((b, i) => {
    const upperMin = i === 0 ? Infinity : GRADE_DEFS[i-1].min;
    return dist.filter(d => {
      const s = toConvScore(d.score);
      return s >= b.min && s < upperMin;
    }).reduce((sum, d) => sum + d.count, 0);
  });

  // 히스토그램: 성취수준 등급 구간
  killChart('chHist');
  S.charts.chHist = new Chart(document.getElementById('chHist'), {
    type:'bar',
    data:{ labels: gradeBandLabels, datasets:[{
      label:'학생 수', data: gradeCounts,
      backgroundColor: GRADE_DEFS.map(b => b.col + 'cc'),
      borderColor: GRADE_DEFS.map(b => b.col),
      borderWidth:1, borderRadius:4
    }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{
        label: c => `${c.label}: ${c.parsed.y}명`,
        afterLabel: c => st.n ? `비율: ${((c.parsed.y/st.n)*100).toFixed(1)}%` : ''
      }}},
      scales:{ y:{ beginAtZero:true, title:{display:true, text:'학생 수(명)'} },
        x:{ ticks:{ font:{size:9}, maxRotation:30 } } }
    }
  });

  // 성취수준 파이
  const pCnt = GRADE_DEFS.map(() => 0);
  dist.forEach(d => {
    if (!d.count) return;
    pCnt[gradeIdx(toConvScore(d.score))] += d.count;
  });
  killChart('chGrade');
  const pieLabels = gradeBandLabels.filter((_, i) => pCnt[i] > 0);
  S.charts.chGrade = new Chart(document.getElementById('chGrade'), {
    type:'doughnut',
    data:{ labels: pieLabels, datasets:[{
      data: pCnt.filter(v => v > 0),
      backgroundColor: GRADE_DEFS.map((b, i) => pCnt[i] > 0 ? b.col : null).filter(Boolean),
      borderWidth:2, borderColor:'#fff'
    }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom', labels:{font:{size:9}, boxWidth:12}},
        tooltip:{ callbacks:{ label: c => st.n ? `${c.label}: ${c.parsed}명 (${((c.parsed/st.n)*100).toFixed(1)}%)` : '' } }
      }
    }
  });

  // 누적 분포 곡선
  const cdfPts = []; let cum = 0;
  dist.filter(d => d.score >= 0).sort((a,b) => a.score - b.score).forEach(d => {
    cum += d.count;
    if (d.count > 0 || cdfPts.length === 0) cdfPts.push({ x: d.score, y: st.n ? cum/st.n*100 : 0 });
  });
  killChart('chCdf');
  S.charts.chCdf = new Chart(document.getElementById('chCdf'), {
    type:'line',
    data:{ labels: cdfPts.map(p => p.x), datasets:[{
      label:'누적 비율(%)',
      data: cdfPts.map(p => Math.round(p.y*10)/10),
      borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,.1)', fill:true, tension:.35, pointRadius:0
    }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{ y:{ min:0, max:100, title:{display:true, text:'누적 비율(%)'} },
        x:{ title:{display:true, text: isConv ? '점수 (환산 0~100)' : `점수 (원점수 0~${MAX_SCORE})`}, ticks:{maxTicksLimit:11} } }
    }
  });

  // 통계 요약: 원점수(환산점수) 병기
  function fmtDual(val){
    if (val == null || isNaN(val)) return '-';
    const conv = isConv ? Math.round(val*10)/10 : Math.round(val*100/MAX_SCORE*10)/10;
    const raw  = isConv ? Math.round(val*MAX_SCORE/100*10)/10 : Math.round(val*10)/10;
    return `<span style="font-weight:700">${raw.toFixed(1)}점</span>`
         + `<span style="color:var(--p1);font-size:10px;margin-left:3px">(환산 ${conv.toFixed(1)}점)</span>`;
  }

  const statRows = [
    ['평균',              fmtDual(st.mean), st.mean],
    ['중앙값',            fmtDual(st.med),  st.med],
    ['표준편차',          st.sd != null ? `${st.sd.toFixed(2)}` : '-', st.sd],
    ['최고점',            fmtDual(st.max),  st.max],
    ['최저점',            fmtDual(st.min),  st.min],
    ['범위',              (st.max != null && st.min != null) ? fmtDual(st.max - st.min) : '-', st.max != null && st.min != null ? st.max - st.min : null],
    ['Q1 (하위25%)',      fmtDual(st.q1),   st.q1],
    ['Q3 (상위75%)',      fmtDual(st.q3),   st.q3],
    [`성취율(환산≥${PASS_CONV}점)`, st.passRate != null ? st.passRate.toFixed(1)+'%' : '-', 'PASS'],
    ['총 학생',           st.n != null ? st.n+'명' : '-', 'COUNT'],
  ];

  document.getElementById('statGrid').innerHTML = statRows
    .map(([l, v]) => `<div class="stat-item"><span class="stat-lbl">${l}</span><span class="stat-val" style="text-align:right">${v}</span></div>`)
    .join('');

  // CSV용 통계 테이블
  const toR = v => v != null ? Math.round(v*MAX_SCORE/100*10)/10 : '-';
  const toC = v => v != null ? Math.round(v*10)/10 : '-';
  const passN = st.n != null && st.passRate != null ? Math.round(st.n*st.passRate/100) : null;
  document.getElementById('tbScores').innerHTML = statRows.map(([l, disp, raw]) => {
    if (raw === 'PASS')  return `<tr><td>${l}</td><td>${disp}</td><td>${passN != null ? passN+'명' : '-'} / 기준 ${PASS_RAW}점(환산${PASS_CONV}점)</td></tr>`;
    if (raw === 'COUNT') return `<tr><td>${l}</td><td>${disp}</td><td>-</td></tr>`;
    if (raw == null)     return `<tr><td>${l}</td><td colspan="2">-</td></tr>`;
    const rv = isConv ? toR(raw) : raw, cv = isConv ? toC(raw) : Math.round(raw*100/MAX_SCORE*10)/10;
    return `<tr><td>${l}</td><td>${typeof rv === 'number' ? rv.toFixed(1) : rv}</td><td>${typeof cv === 'number' ? cv.toFixed(1) : cv}</td></tr>`;
  }).join('');

  // 분포 데이터를 S에 저장 (saveDistCsv에서 사용)
  S._scores = { dist, isConv };
}

// ═══════════════════════════
// RENDER: TOP 10 (파일1)
// ═══════════════════════════
function renderTop10(f1){
  if (!f1){ setNoData('tp-top10','📋','파일1 (문항분석표)를 업로드하면 오답 분석이 표시됩니다.'); return; }
  const items = f1.items.filter(i => i.cr != null);
  const top = [...items].sort((a,b) => a.cr - b.cr).slice(0, 10);

  killChart('chTop10');
  S.charts.chTop10 = new Chart(document.getElementById('chTop10'), {
    type:'bar',
    data:{ labels: top.map(i => i.qName), datasets:[{
      label:'정답률(%)', data: top.map(i => Math.round(i.cr*1000)/10),
      backgroundColor: top.map(i => (i.diffColor || '#94a3b8') + 'bb'),
      borderColor: top.map(i => i.diffColor || '#94a3b8'),
      borderWidth:1, borderRadius:3
    }]},
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{
        afterLabel: c => `오답률: ${(top[c.dataIndex].wr*100).toFixed(1)}% | 변별도: ${top[c.dataIndex].disc != null ? top[c.dataIndex].disc.toFixed(3) : '-'}`
      }}},
      scales:{ x:{ min:0, max:100, title:{display:true, text:'정답률(%)'} } }
    }
  });

  const wBins = Array(10).fill(0);
  items.forEach(i => wBins[Math.min(9, Math.floor(i.wr*10))]++);
  killChart('chWrDist');
  S.charts.chWrDist = new Chart(document.getElementById('chWrDist'), {
    type:'bar',
    data:{ labels:['0–10','10–20','20–30','30–40','40–50','50–60','60–70','70–80','80–90','90–100%'],
      datasets:[{ label:'문항 수', data: wBins,
        backgroundColor: Array(10).fill(0).map((_,i) => { const r = (i+.5)*10; return r < 30 ? 'rgba(34,197,94,.7)' : r < 60 ? 'rgba(245,158,11,.7)' : 'rgba(239,68,68,.7)'; }),
        borderWidth:0, borderRadius:3 }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{ y:{ beginAtZero:true, title:{display:true, text:'문항 수'} }, x:{ ticks:{ font:{size:8} } } }
    }
  });

  document.getElementById('tbTop10').innerHTML = top.map((it, i) => `
    <tr>
      <td><strong>${i+1}위</strong></td>
      <td><strong>${esc(it.qName)}</strong></td>
      <td style="color:#16a34a;font-weight:700">${(it.cr*100).toFixed(1)}%</td>
      <td style="color:#dc2626;font-weight:700">${(it.wr*100).toFixed(1)}%</td>
      <td>${it.disc != null ? it.disc.toFixed(3) : '-'}</td>
      <td><span class="bdg ${it.diffCls || ''}">${it.diffLbl || '-'}</span></td>
    </tr>`).join('');
}

// ═══════════════════════════
// RENDER: DISCRIMINATION (파일1)
// ═══════════════════════════
function renderDisc(f1){
  if (!f1){ setNoData('tp-disc','🎯','파일1 (문항분석표)를 업로드하면 변별도 분석이 표시됩니다.'); return; }

  let items = f1.items.filter(i => i.disc != null);
  let computed = false;

  // 변별도 열이 없으면 정답률·표준편차 기반 근사 계산
  if (!items.length && f1.items.some(i => i.cr != null)){
    f1.items.forEach(it => {
      if (it.disc == null && it.cr != null){
        const p = it.cr;
        const sdVal = it.sd != null ? it.sd : Math.sqrt(p*(1-p));
        it.disc = parseFloat(Math.min(1, Math.max(0, sdVal*2*(1-Math.abs(2*p-1)))).toFixed(3));
      }
    });
    items = f1.items.filter(i => i.disc != null);
    computed = true;
  }

  if (!items.length){ setNoData('tp-disc','🎯','변별도 데이터가 없습니다. (파일1에 변별도 열 또는 정답률 열이 필요합니다)'); return; }

  const detInfo = f1.detected || {};
  const infoHtml = `
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:11px;color:#0369a1;line-height:1.7">
      <strong>📌 감지된 열:</strong>
      정답률=${esc(detInfo.crCol || '없음')} · 변별도=${esc(detInfo.discCol || '없음')} · 난이도=${esc(detInfo.diffCol || '없음')} · 평균=${esc(detInfo.avgCol || '없음')} · 표준편차=${esc(detInfo.sdCol || '없음')}
      ${computed ? '&nbsp;|&nbsp;<span style="color:#d97706">⚠️ 변별도 열 없음 → 정답률·표준편차 기반 근사 계산</span>' : '&nbsp;|&nbsp;<span style="color:#059669">✅ 파일의 변별도 값 사용</span>'}
    </div>`;

  document.getElementById('tp-disc').querySelector('.disc-info')?.remove();
  const infoEl = document.createElement('div');
  infoEl.className = 'disc-info'; infoEl.innerHTML = infoHtml;
  const srcBdg = document.getElementById('tp-disc').querySelector('.src-bdg');
  srcBdg ? srcBdg.insertAdjacentElement('afterend', infoEl)
         : document.getElementById('tp-disc').prepend(infoEl);

  const discColor = d => {
    if (d >= .4) return 'rgba(34,197,94,.8)';
    if (d >= .3) return 'rgba(132,204,22,.8)';
    if (d >= .2) return 'rgba(234,179,8,.8)';
    return 'rgba(239,68,68,.8)';
  };

  killChart('chDisc');
  S.charts.chDisc = new Chart(document.getElementById('chDisc'), {
    type:'bar',
    data:{ labels: items.map(i => i.qName), datasets:[{
      label:'변별도', data: items.map(i => Math.round(i.disc*1000)/1000),
      backgroundColor: items.map(i => discColor(i.disc)),
      borderWidth:0, borderRadius:3
    }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{
        label: c => `${items[c.dataIndex].qName} — 변별도: ${Number(items[c.dataIndex].disc).toFixed(3)}`,
        afterLabel: c => `정답률: ${items[c.dataIndex].cr != null ? (items[c.dataIndex].cr*100).toFixed(1)+'%' : '-'}\n평가: ${discEval(items[c.dataIndex].disc).lbl}`
      }}},
      scales:{ y:{ beginAtZero:true, title:{display:true, text:'변별도 지수'},
        ticks:{ callback: v => Number(v).toFixed(1) } },
        x:{ ticks:{ maxRotation:70, font:{size:9} } } }
    }
  });

  // Scatter: 정답률(x) vs 변별도(y)
  const crDiscItems = items.filter(i => i.cr != null);
  killChart('chScatter');
  S.charts.chScatter = new Chart(document.getElementById('chScatter'), {
    type:'scatter',
    data:{ datasets:[{
      label:'문항',
      data: crDiscItems.map(i => ({ x: Math.round(i.cr*1000)/10, y: Math.round(i.disc*1000)/1000, label: i.qName })),
      backgroundColor: crDiscItems.map(i => discColor(i.disc)),
      pointRadius:6, pointHoverRadius:8
    }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{
        label: c => `${c.raw.label} — 정답률: ${c.raw.x}%, 변별도: ${c.raw.y}`
      }}},
      scales:{
        x:{ min:0, max:100, title:{display:true, text:'정답률(%)'}, grid:{color:'#f1f5f9'} },
        y:{ title:{display:true, text:'변별도'}, grid:{color:'#f1f5f9'} }
      }
    }
  });

  document.getElementById('tbDisc').innerHTML = items.map(it => {
    const ev = discEval(it.disc);
    return `<tr>
      <td><strong>${esc(it.qName)}</strong></td>
      <td>${it.cr != null ? (it.cr*100).toFixed(1)+'%' : '-'}</td>
      <td style="color:${ev.col};font-weight:700">${it.disc.toFixed(3)}</td>
      <td><span class="bdg" style="background:${ev.col}22;color:${ev.col}">${ev.lbl}</span></td>
      <td>${it.avg != null ? (it.avg*100).toFixed(1)+'%' : '-'}</td>
      <td>${it.sd != null ? it.sd.toFixed(3) : '-'}</td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════
// RENDER: 반별 분석 (파일3)
// ═══════════════════════════
function renderCompare(classes){
  if (!classes || !classes.length){ setNoData('tp-compare','🗂️','파일3 (종합성적현황)을 업로드하면 반별 분석이 표시됩니다.'); return; }
  const stList = classes.map(c => ({ lbl: c.label, ...calcStats(c.students.map(s => s.total), PASS_RAW) }));

  // Avg/median/SD comparison
  killChart('chCmpAvg');
  S.charts.chCmpAvg = new Chart(document.getElementById('chCmpAvg'), {
    type:'bar',
    data:{ labels: stList.map(s => s.lbl),
      datasets:[
        { label:'평균',   data: stList.map(s => Math.round(s.mean*100)/100), backgroundColor: PAL.slice(0, stList.length), borderWidth:0, borderRadius:5 },
        { label:'중앙값', data: stList.map(s => Math.round(s.med*10)/10), backgroundColor: PAL.slice(0, stList.length).map(c => c.replace('.85','.4')),
          borderColor: PAL.slice(0, stList.length), borderWidth:2, borderRadius:5 },
        { label:'표준편차', data: stList.map(s => Math.round(s.sd*100)/100),
          type:'line', borderColor:'#1d4ed8', backgroundColor:'transparent', borderWidth:2, pointRadius:4, yAxisID:'y' }
      ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top', labels:{font:{size:10}}} },
      scales:{ y:{ min:0, max:MAX_SCORE, title:{display:true, text:`점수 (0~${MAX_SCORE})`} } }
    }
  });

  // 성취수준 분포 — 반마다 고유 색상 (등급은 x축으로 구분)
  killChart('chCmpGrade');
  S.charts.chCmpGrade = new Chart(document.getElementById('chCmpGrade'), {
    type:'bar',
    data:{ labels: GRADE_DEFS.map(g => g.lbl), datasets: classes.map((c, ci) => {
      const cnt = Array(GRADE_DEFS.length).fill(0);
      c.students.forEach(s => cnt[gradeIdx(s.pct)]++);
      const n = c.students.length;
      return { label: c.label, data: cnt.map(v => n ? Math.round((v/n)*1000)/10 : 0),
        backgroundColor: PAL[ci % PAL.length], borderWidth:0, borderRadius:3 };
    })},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top', labels:{font:{size:10}}},
        tooltip:{ callbacks:{ label: c => `${c.dataset.label}: ${c.parsed.y}%` } } },
      scales:{ y:{ beginAtZero:true, title:{display:true, text:'비율(%)'} } }
    }
  });

  // 반별 히스토그램 — MAX_SCORE 기반 동적 구간
  const binSize = MAX_SCORE / 10;
  const dynBinLabels = Array.from({length:10}, (_,i) => {
    const lo = Math.round(i*binSize), hi = Math.round((i+1)*binSize);
    return `${lo}–${hi}`;
  });
  killChart('chCmpHist');
  S.charts.chCmpHist = new Chart(document.getElementById('chCmpHist'), {
    type:'line',
    data:{ labels: dynBinLabels, datasets: classes.map((c, ci) => {
      const bins = Array(10).fill(0);
      c.students.forEach(s => { bins[Math.max(0, Math.min(9, Math.floor(s.total/binSize)))]++; });
      const col = PAL[ci % PAL.length];
      return { label: c.label, data: bins, borderColor: col.replace('.85','1'),
        backgroundColor: col.replace('.85','.15'), fill:true, tension:.35, pointRadius:3 };
    })},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top', labels:{font:{size:10}}} },
      scales:{ y:{ beginAtZero:true, title:{display:true, text:'학생 수(명)'} },
        x:{ title:{display:true, text:`점수 구간 (${MAX_SCORE}점 만점)`} } }
    }
  });

  // Stats table
  document.getElementById('tbCmp').innerHTML = stList.map(s => `
    <tr>
      <td><strong>${esc(s.lbl)}</strong></td><td>${s.n}명</td>
      <td>${s.mean != null ? s.mean.toFixed(2) : '-'}<small style="color:var(--muted)">/${MAX_SCORE}</small></td>
      <td>${s.med != null ? s.med.toFixed(1) : '-'}</td>
      <td>${s.sd != null ? s.sd.toFixed(2) : '-'}</td>
      <td>${s.max != null ? s.max.toFixed(1) : '-'}</td>
      <td>${s.min != null ? s.min.toFixed(1) : '-'}</td>
      <td>${s.passRate != null ? s.passRate.toFixed(1)+'%' : '-'}</td>
    </tr>`).join('');

  renderRemedial(classes);
}

function renderRemedial(classes){
  if (!classes || !classes.length) return;

  const allRemedial = classes.flatMap(c =>
    c.students
      .filter(s => s.pct < PASS_CONV)
      .sort((a,b) => a.pct - b.pct)
      .map(s => ({ ...s, cls: c.label }))
  );
  document.getElementById('tbRemedial').innerHTML = allRemedial.map(s => {
    const conv = Math.round(s.pct*10)/10;
    return `<tr><td>${esc(s.cls)}</td><td>${esc(s.id)}</td><td>${esc(s.name)}</td>`
         + `<td>${s.total.toFixed(1)}</td><td>${conv.toFixed(1)}</td><td>미성취(환류)</td></tr>`;
  }).join('');

  if (!allRemedial.length){
    document.getElementById('remedialByClass').innerHTML =
      '<div style="text-align:center;padding:24px;color:var(--ok);font-weight:600">✅ 미성취 학생이 없습니다.</div>';
    return;
  }

  const CPAL = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
  let html = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:4px">`;

  classes.forEach((c, ci) => {
    const list = c.students.filter(s => s.pct < PASS_CONV).sort((a,b) => a.pct - b.pct);
    const col  = CPAL[ci % CPAL.length];
    const pct  = c.students.length ? ((list.length/c.students.length)*100).toFixed(1) : 0;

    html += `<div style="border:2px solid ${col}33;border-radius:10px;overflow:hidden">
      <div style="background:${col};color:#fff;padding:9px 14px;display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700">
        <span>${esc(c.label)}반</span>
        <span>${list.length}명 (${pct}%)</span>
      </div>`;

    if (!list.length){
      html += `<div style="padding:12px 14px;font-size:11px;color:var(--ok)">✅ 미성취 학생 없음</div>`;
    } else {
      html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:6px 8px;text-align:center;border-bottom:1px solid var(--border)">학번</th>
          <th style="padding:6px 8px;text-align:center;border-bottom:1px solid var(--border)">이름</th>
          <th style="padding:6px 8px;text-align:center;border-bottom:1px solid var(--border)">점수</th>
          <th style="padding:6px 8px;text-align:center;border-bottom:1px solid var(--border)">환산</th>
        </tr></thead>
        <tbody>`;
      list.forEach(s => {
        const conv = Math.round(s.pct*10)/10;
        html += `<tr>
          <td style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--border)">${esc(s.id)}</td>
          <td style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--border);font-weight:600">${esc(s.name)}</td>
          <td style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--border)">${s.total.toFixed(1)}</td>
          <td style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--border);color:#dc2626;font-weight:700">${conv.toFixed(1)}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }
    html += `</div>`;
  });
  html += `</div>
    <div style="margin-top:10px;padding:10px 14px;background:#fef2f2;border-radius:8px;font-size:11px;color:#dc2626;font-weight:600">
      ⚠️ 전체 미성취 학생: ${allRemedial.length}명 — 환산점수 ${PASS_CONV}점 미만, 환류 교육 대상자
    </div>`;

  document.getElementById('remedialByClass').innerHTML = html;
}

// ═══════════════════════════
// RENDER: 성적 현황 (파일3)
// ═══════════════════════════
function renderRank(students, cls){
  if (!students || !students.length){
    S._rankStudents = [];
    setNoData('tp-rank','🏆','파일3 (종합성적현황)을 업로드하면 성적 현황이 표시됩니다.');
    return;
  }
  const sorted = [...students].sort((a,b) => b.total - a.total);
  S._rankStudents = sorted;   // 개인별 리포트 PDF에서 사용
  document.getElementById('tbRank').innerHTML = sorted.map((s, i) => {
    const rank = i + 1;
    const converted = s.total/MAX_SCORE*100;
    const g = gradeOf(converted);
    return `<tr>
      <td><strong>${rank}</strong></td>
      <td>${esc(s.cls || '-')}</td>
      <td>${esc(s.id)}</td><td>${esc(s.name)}</td>
      <td>${typeof s.total === 'number' ? s.total.toFixed(1) : esc(s.total)} <small style="color:var(--muted)">/${MAX_SCORE}</small></td>
      <td><strong>${converted.toFixed(1)}</strong></td>
      <td><span class="bdg ${g.cls}">${g.lbl}</span></td>
    </tr>`;
  }).join('');
}
