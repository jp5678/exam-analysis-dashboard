// ═══════════════════════════════════════════
// parse.js — 파일 업로드 · 엑셀 파싱
// ═══════════════════════════════════════════

// 파일별 건너뛸 행 수 (1행~N행 제외 → N+1행부터 읽음)
// slot 0(문항분석표): 1~5행 제외, 6~7행이 머리글 → 열 이름은 6행에서 읽고(range:5),
//   7행(머리글 연속행)은 f1DataRows()·parseFile1()에서 자동 제외 → 실제 데이터는 8행부터
// slot 1(성적분포도): 1~6행 제외 → 7행이 머리글 → range:6
// slot 2(종합성적현황): Sheet1(전체)만 1~6행 제외(7행 머리글), 반별 시트는 첫 행이 머리글
const SKIP_ROWS = [5, 6, 6];

// 파일1 데이터 행 필터: 숫자 값이 2개 미만인 행은 머리글 연속행(7행)·빈 행으로 간주하고 제외
// 실제 문항 행은 최소 문항번호·정답률 등 숫자 2개 이상을 가짐
function f1DataRows(rows){
  return (rows || []).filter(r => Object.values(r)
    .filter(v => v !== '' && v != null && !isNaN(parseFloat(v))).length >= 2);
}

// 전체(통합) 시트명 패턴
const TOTAL_PAT = /^sheet\d+$|^전체$|^종합$|^all$|^total$/i;

function loadFile(inp, slot){
  const f = inp.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onerror = () => toast(`❌ 파일을 읽지 못했습니다: ${f.name}`);
  rd.onload = e => {
    try {
      const buf  = new Uint8Array(e.target.result);
      const wb   = XLSX.read(buf, { type:'array' });
      const skip = SKIP_ROWS[slot] ?? 0;
      const opts = { defval:'', raw:false, range: skip };

      if (slot === 2){
        const sheets = wb.SheetNames
          .map(n => {
            const isTotal   = TOTAL_PAT.test(n.trim());
            const sheetOpts = { defval:'', raw:false, range: isTotal ? SKIP_ROWS[2] : 0 };
            return { name:n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], sheetOpts) };
          })
          .filter(s => s.rows.length > 0);
        if (!sheets.length) throw new Error('읽을 수 있는 시트가 없습니다. 헤더 행 위치를 확인하세요.');
        S.raw[2] = { name: f.name, sheets };
        document.getElementById('ico2').textContent = '✅';
        document.getElementById('st2').textContent  = `${sheets.length}개 반, 총 ${sheets.reduce((n,s)=>n+s.rows.length,0)}행`;
        document.getElementById('stags2').innerHTML = sheets.map(s => `<span class="stag">${esc(s.name)}</span>`).join('');
      } else {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], opts);
        if (!rows.length) throw new Error('데이터 행이 없습니다. 헤더 행 위치를 확인하세요.');
        S.raw[slot] = { name: f.name, rows };
        document.getElementById(`ico${slot}`).textContent = '✅';
        document.getElementById(`st${slot}`).textContent  = `${rows.length}행 로드됨`;
      }
      document.getElementById(`fn${slot}`).textContent = f.name;
      document.getElementById(`drop${slot}`).className = `up-card ok${slot+1}`;
      if (S.raw.some(r => r)) document.getElementById('runBtn').classList.add('show');

      // 파일1 업로드 시: 문항 수 자동 감지(수동 설정이 없을 때만) + 응시과목 탐지
      if (slot === 0 && S.raw[0]?.rows?.length){
        // 이중 머리글(6~7행) 파일 대응: 실제 파싱에 성공한 문항 수로 감지
        // (7행에 답지반응률 번호 등 숫자가 있어도 정답률·변별도가 없는 행은 문항으로 세지 않음)
        const parsed    = parseFile1(S.raw[0].rows);
        const detectedN = parsed?.items.length
                       || f1DataRows(S.raw[0].rows).length
                       || S.raw[0].rows.length;
        document.getElementById('st0').textContent = `문항 ${detectedN}개 인식됨`;
        if (!S.maxManual){
          applyMaxScore(detectedN, false);
          const note = document.getElementById('maxAutoNote');
          if (note) note.textContent = `파일1에서 ${detectedN}문항 자동 감지됨 · 성취기준 ${PASS_RAW}점(환산 ${PASS_CONV}점)`;
        }
        // 건너뛴 1~5행에서 응시과목 탐지
        try {
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const ref   = sheet['!ref'] || 'A1';
          const range = XLSX.utils.decode_range(ref);
          const subjectPat = /응시과목|교과목명|과목명|subject/i;
          let foundSubject = null;
          outer: for (let r = 0; r <= Math.min(SKIP_ROWS[0]-1, range.e.r); r++){
            for (let c = range.s.c; c <= range.e.c; c++){
              const cell = sheet[XLSX.utils.encode_cell({r, c})];
              if (cell && subjectPat.test(String(cell.v || ''))){
                const next = sheet[XLSX.utils.encode_cell({r, c: c+1})]
                          || sheet[XLSX.utils.encode_cell({r: r+1, c})];
                if (next && String(next.v || '').trim()){
                  foundSubject = String(next.v).trim();
                  break outer;
                }
              }
            }
          }
          S.raw[0]._subject = foundSubject;
        } catch(_){}
      }
      toast(`✅ ${f.name} 업로드 완료`);
    } catch(ex){
      toast('❌ ' + ex.message);
      console.error(ex);
    }
  };
  rd.readAsArrayBuffer(f);
}

// 드래그 & 드롭
[0,1,2].forEach(i => {
  const el = document.getElementById(`drop${i}`);
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const inp = document.getElementById(`f${i}`);
    const dt  = new DataTransfer();
    dt.items.add(f);
    inp.files = dt.files;
    loadFile(inp, i);
  });
});

// ═══════════════════════════
// PARSE FILE 1: 문항분석표
// ═══════════════════════════
function parseFile1(rows){
  rows = f1DataRows(rows);   // 머리글 연속행(7행)·빈 행 제거 — 데이터는 8행부터
  if (!rows || !rows.length) return null;
  const hdrs = Object.keys(rows[0]);

  // 헤더 정규화
  const hn = h => h.toString().replace(/[\s()（）%\[\]·\-_]/g,'').toLowerCase();

  // 유일 감지: 긴 패턴 우선, 이미 배정된 열 건너뜀
  const taken = new Set();
  function findUniq(...pats){
    const sorted = [...pats].sort((a,b) => b.length - a.length);
    const col = hdrs.find(h => !taken.has(h) && sorted.some(p => hn(h).includes(p)));
    if (col) taken.add(col);
    return col || null;
  }

  const qCol   = findUniq('문항번호','번호','순번','문항no','item');
  // '정답' 단독 제외 — 정답수/정답지와 혼동 방지
  const crCol  = findUniq('정답률','정답율','정답비율','correctrate','correct');
  const discCol= findUniq('문항변별도','변별도','변별력','변별지수','discrimination','disc','변별','d지수','점이분');
  const diffCol= findUniq('난이도','difficulty','level','난이');
  const avgCol = findUniq('평균','mean','average','avg');
  const sdCol  = findUniq('표준편차','표준','stddev','deviation','편차');

  // 수치형 열 목록 (순차 정수 열 제외)
  const numericCols = hdrs.filter(h => {
    if (taken.has(h) || h === qCol) return false;
    const vals = rows.map(r => parseFloat(r[h])).filter(v => !isNaN(v));
    if (vals.length < Math.floor(rows.length * 0.6)) return false;
    const isSeq = vals.every((v,i) => i === 0 || Math.abs(v - vals[i-1] - 1) < 0.01);
    return !isSeq;
  });

  // positional fallback: 미감지 열에 순서대로 배정
  const res = { cr: crCol, disc: discCol, avg: avgCol, sd: sdCol };
  let fi = 0;
  ['cr','disc','avg','sd'].forEach(k => { if (!res[k] && numericCols[fi]) res[k] = numericCols[fi++]; });
  const { cr: rCrCol, disc: rDiscCol, avg: rAvgCol, sd: rSdCol } = res;

  // 스케일 판별: 최대값 > 1 이면 0~100 스케일
  function colMax(col){
    if (!col) return 0;
    const v = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v) && isFinite(v));
    return v.length ? Math.max(...v) : 0;
  }
  const crPct   = colMax(rCrCol)   > 1;
  const discPct = colMax(rDiscCol) > 1;
  const avgPct  = colMax(rAvgCol)  > 1;

  // 난이도 정규화
  function normDiff(raw){
    if (raw == null || String(raw).trim() === '') return null;
    const str = String(raw).trim(), n = parseFloat(str);
    if (!isNaN(n)){
      if (n >= 1 && n <= 5) return ['매우 쉬움','쉬움','보통','어려움','매우 어려움'][Math.round(n)-1];
      return diffLevel(1 - (n > 1 ? n/100 : n)).lbl;
    }
    const l = str.toLowerCase().replace(/\s/g,'');
    if (/매우쉬움|매우쉬|veryeasy|최상/.test(l))   return '매우 쉬움';
    if (/^쉬움$|^쉬$|^easy$|^상$/.test(l))          return '쉬움';
    if (/보통|^중$|normal|medium/.test(l))           return '보통';
    if (/매우어려움|매우어렵|veryhard|최하/.test(l)) return '매우 어려움';
    if (/어려움|어렵|^하$|^hard$|difficult/.test(l)) return '어려움';
    return null;
  }
  function diffStyle(lbl){
    return lbl === '매우 쉬움'   ? { cls:'b-ve', col:'#16a34a' }
         : lbl === '쉬움'        ? { cls:'b-e',  col:'#22c55e' }
         : lbl === '보통'        ? { cls:'b-m',  col:'#f59e0b' }
         : lbl === '어려움'      ? { cls:'b-h',  col:'#f97316' }
         : lbl === '매우 어려움' ? { cls:'b-vh', col:'#dc2626' }
         :                        { cls:'',     col:'#94a3b8' };
  }

  // 행별 파싱
  const items = rows.map((row, idx) => {
    const rawNum = qCol ? String(row[qCol]).replace(/[번항문\s]/g,'').trim() : String(idx+1);
    const qName  = `문항${rawNum || idx+1}`;

    let cr = rCrCol ? parseFloat(row[rCrCol]) : null;
    if (cr != null && !isNaN(cr)) cr = crPct ? cr/100 : cr; else cr = null;

    let disc = rDiscCol ? parseFloat(row[rDiscCol]) : null;
    if (disc != null && !isNaN(disc)) disc = discPct ? disc/100 : disc; else disc = null;

    let avg = rAvgCol ? parseFloat(row[rAvgCol]) : null;
    if (avg != null && isNaN(avg)) avg = null;
    if (avg != null && avgPct) avg /= 100;

    let sd = rSdCol ? parseFloat(row[rSdCol]) : null;
    if (sd != null && isNaN(sd)) sd = null;
    if (sd != null && sd > 2) sd /= 100;

    let diffLbl = normDiff(diffCol ? row[diffCol] : null);
    if (!diffLbl && cr != null) diffLbl = diffLevel(1-cr).lbl;
    const st = diffStyle(diffLbl);
    return { qName, cr, wr: cr != null ? 1-cr : null, disc, avg, sd,
             diffLbl, diffCls: st.cls, diffColor: st.col };
  });

  // 파싱 후 cr 검증: 여전히 >1 이면 다시 /100
  const crVals = items.filter(i => i.cr != null).map(i => i.cr);
  if (crVals.length && Math.max(...crVals) > 1)
    items.forEach(it => { if (it.cr != null){ it.cr /= 100; it.wr = 1 - it.cr; } });
  // cr이 너무 작으면 *100
  const crVals2 = items.filter(i => i.cr != null).map(i => i.cr);
  if (crVals2.length && Math.max(...crVals2) < 0.02 && Math.max(...crVals2) > 0)
    items.forEach(it => { if (it.cr != null){ it.cr *= 100; it.wr = 1 - it.cr; } });
  // 보정 후 난이도·색상 재계산
  items.forEach(it => {
    if (it.cr != null) it.diffLbl = diffLevel(1 - it.cr).lbl;
    const s = diffStyle(it.diffLbl);
    it.diffCls = s.cls; it.diffColor = s.col;
  });

  const valid = items.filter(i => i.cr != null || i.disc != null || i.diffLbl != null);
  if (!valid.length) return null;
  return { type:'precomputed', items: valid,
    detected: { qCol, crCol: rCrCol, discCol: rDiscCol, diffCol, avgCol: rAvgCol, sdCol: rSdCol } };
}

// ═══════════════════════════
// PARSE FILE 2: 성적분포도
// ═══════════════════════════
function parseFile2(rows){
  if (!rows || !rows.length) return null;
  const hdrs = Object.keys(rows[0]);
  const find = (...pats) => hdrs.find(h => {
    const hl = h.toString().replace(/[\s()（）%]/g,'').toLowerCase();
    return pats.some(p => hl.includes(p));
  });
  const scoreCol = find('점수','score','점','성적','grade','raw');
  const countCol = find('인원','빈도','명수','학생수','count','freq','num','인원수','명');
  const rateCol  = find('비율','율','rate','percent','퍼센트');
  const cumCol   = find('누적','cumul','cum');

  if (scoreCol && countCol){
    const dist = rows.map(r => ({
      score: parseFloat(r[scoreCol]),
      count: parseInt(r[countCol]) || 0,
      rate:  rateCol ? parseFloat(r[rateCol]) || 0 : 0,
      cum:   cumCol  ? parseFloat(r[cumCol])  || 0 : 0
    })).filter(d => !isNaN(d.score));
    if (dist.length) return { type:'freq', dist };
  }

  // 개인별 점수 목록
  const numCol = hdrs.find(h => {
    const vals = rows.map(r => parseFloat(r[h])).filter(v => !isNaN(v));
    return vals.length > rows.length * .5 && Math.max(...vals) <= 100 && Math.min(...vals) >= 0;
  });
  if (numCol){
    const scores = rows.map(r => parseFloat(r[numCol])).filter(v => !isNaN(v));
    return { type:'individual', scores };
  }
  return null;
}

// ═══════════════════════════
// PARSE FILE 3: 종합성적현황 (다중 시트)
// ═══════════════════════════
// ms: 이 데이터에 적용할 만점 (기본 = 전역 MAX_SCORE)
// 만점 초과 점수는 자르지 않고 그대로 두며 overMax로 집계 → 사용자에게 경고
function parseClassSheet(rows, label, ms = MAX_SCORE){
  if (!rows || !rows.length) return null;
  const hdrs = Object.keys(rows[0]);
  const find = (...pats) => hdrs.find(h => {
    const hl = h.toString().replace(/[\s()（）]/g,'').toLowerCase();
    return pats.some(p => hl.includes(p));
  });
  const idCol    = find('번호','no','num','#','순번','학번');
  const nameCol  = find('이름','성명','name','학생명');
  const scoreCol = find('점수','score','raw','원점수','성적');

  // Fallback: 점수처럼 보이는 첫 수치 열 (1차: 만점 이내, 2차: 100 이내)
  let sCol = scoreCol;
  if (!sCol){
    sCol = hdrs.find(h => {
      const vals = rows.map(r => parseFloat(r[h])).filter(v => !isNaN(v));
      return vals.length > rows.length * .5 && Math.max(...vals) <= ms + 1 && Math.min(...vals) >= 0;
    });
  }
  if (!sCol){
    sCol = hdrs.find(h => {
      const vals = rows.map(r => parseFloat(r[h])).filter(v => !isNaN(v));
      return vals.length > rows.length * .5 && Math.max(...vals) <= 100 && Math.min(...vals) >= 0;
    });
  }
  if (!sCol) return null;

  let overMax = 0;
  const students = rows.map((row, idx) => {
    const total = parseFloat(row[sCol]);
    if (isNaN(total)) return null;
    if (total > ms + 0.001) overMax++;
    return {
      id:   idCol   ? row[idCol]   : idx + 1,
      name: nameCol ? row[nameCol] : `학생${idx+1}`,
      total,                              // 원점수 그대로 (클램핑 없음)
      pct:  total / ms * 100,             // 환산점수
      cls:  label
    };
  }).filter(Boolean);

  return students.length ? { label, students, overMax } : null;
}
