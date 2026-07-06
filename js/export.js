// ═══════════════════════════════════════════
// export.js — PNG · CSV · PDF · 인쇄 · 개인별 리포트
// ═══════════════════════════════════════════

function savePng(id){
  const canvas = document.getElementById(id);
  if (!canvas){ toast('❌ 차트를 찾을 수 없습니다'); return; }
  const a = document.createElement('a');
  a.download = `${id}_${new Date().toISOString().slice(0,10)}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
  toast('PNG 저장 완료');
}

function saveCsv(tblId, fname){
  const tbl = document.getElementById(tblId);
  if (!tbl){ toast('❌ 데이터가 없습니다'); return; }
  const rows = [...tbl.querySelectorAll('tr')];
  if (!rows.length){ toast('❌ 데이터가 없습니다'); return; }
  const csv = rows.map(r => [...r.querySelectorAll('th,td')]
    .map(c => `"${c.textContent.trim().replace(/"/g,'""')}"`)
    .join(',')).join('\n');
  downloadBlob(new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' }),
    `${fname}_${new Date().toISOString().slice(0,10)}.csv`);
  toast('CSV 다운로드 완료');
}

// 점수별 분포 CSV (성적분포도)
function saveDistCsv(){
  const sd = S._scores;
  if (!sd || !sd.dist || !sd.dist.length){ toast('❌ 성적분포 데이터가 없습니다'); return; }
  const rows = [['점수(환산)','원점수','학생수','비율(%)']];
  const total = sd.dist.reduce((n,d) => n + d.count, 0) || 1;
  const sorted = [...sd.dist].sort((a,b) => a.score - b.score);
  sorted.forEach(d => {
    if (d.count <= 0) return;
    const raw  = sd.isConv ? (d.score*MAX_SCORE/100).toFixed(1) : d.score.toFixed(1);
    const conv = sd.isConv ? d.score : (d.score*100/MAX_SCORE).toFixed(1);
    rows.push([conv, raw, d.count, (d.count/total*100).toFixed(1)]);
  });
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  downloadBlob(new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' }),
    `성적분포_${new Date().toISOString().slice(0,10)}.csv`);
  toast('CSV 다운로드 완료');
}

// ═══════════════════════════
// PDF 공통
// ═══════════════════════════
const TAB_INFO = {
  'tp-items':   { title:'문항분석 & 난이도', file:'문항분석_난이도' },
  'tp-scores':  { title:'성적분포',          file:'성적분포' },
  'tp-top10':   { title:'오답 TOP 10',       file:'오답TOP10' },
  'tp-disc':    { title:'문항 변별도',       file:'문항변별도' },
  'tp-compare': { title:'반별 분석',         file:'반별분석' },
  'tp-rank':    { title:'성적 현황',         file:'성적현황' },
  'tp-trend':   { title:'시험 비교',         file:'시험비교' },
  'tp-cqi':     { title:'CQI 보고서',        file:'CQI보고서' },
};

function showPdfLoading(status, sub){
  document.getElementById('pdfOverlay').classList.add('show');
  document.getElementById('pdfStatus').textContent = status;
  document.getElementById('pdfSub').textContent    = sub;
}
function hidePdfLoading(){
  document.getElementById('pdfOverlay').classList.remove('show');
}

// 캔버스를 A4 페이지들로 잘라 PDF에 추가 (모든 PDF 내보내기의 공통 코어)
// state.used: 현재 페이지에 이미 내용이 있는지 (첫 호출 전 {used:false})
function addCanvasToPdf(pdf, canvas, state, quality = 0.93){
  const pdfW = 210, pdfH = 297, margin = 8;
  const avW = pdfW - margin*2, avH = pdfH - margin*2;
  const pxPerMm = canvas.width / avW;
  let yOff = 0, remPx = canvas.height;
  while (remPx > 0){
    if (state.used) pdf.addPage();
    state.used = true;
    const sliceHpx = Math.min(remPx, avH*pxPerMm);
    const sc = document.createElement('canvas');
    sc.width = canvas.width; sc.height = sliceHpx;
    sc.getContext('2d').drawImage(canvas, 0, yOff, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx);
    pdf.addImage(sc.toDataURL('image/jpeg', quality), 'JPEG', margin, margin, avW, sliceHpx/pxPerMm);
    yOff += sliceHpx; remPx -= sliceHpx;
  }
}

// 임시 헤더 삽입 → 캡처 → 제거
function makeTmpHeader(title){
  const el = document.createElement('div');
  el.className = 'pdf-tmp-hdr';
  el.style.cssText = [
    'background:linear-gradient(135deg,#1e40af,#5b21b6)',
    'color:#fff','padding:11px 18px','margin-bottom:12px',
    'border-radius:8px','display:flex','justify-content:space-between',
    'align-items:center',
    "font-family:-apple-system,'Malgun Gothic','Apple SD Gothic Neo',sans-serif",
  ].join(';');
  const date = new Date().toLocaleDateString('ko-KR');
  el.innerHTML =
    `<strong style="font-size:14px">시험 성적 분석 대시보드 — ${esc(title)}</strong>` +
    `<span style="font-size:10px;opacity:.85">생성일: ${date}</span>`;
  return el;
}

async function capturePane(pane){
  return await html2canvas(pane, {
    scale:2, useCORS:true, backgroundColor:'#f0f4f8',
    logging:false, allowTaint:true,
  });
}

async function exportTabPDF(tabId){
  const info = TAB_INFO[tabId] || { title:tabId, file:tabId };
  const pane = document.getElementById(tabId);
  if (!pane){ toast('❌ 탭을 먼저 열어주세요'); return; }

  showPdfLoading(`${info.title} PDF 생성 중…`, '화면 캡처 중');
  await new Promise(r => setTimeout(r, 200));

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p','mm','a4');
    const state = { used:false };

    const hdr = makeTmpHeader(info.title);
    pane.insertBefore(hdr, pane.firstChild);
    const canvas = await capturePane(pane);
    pane.removeChild(hdr);

    addCanvasToPdf(pdf, canvas, state, 0.95);
    pdf.save(`${info.file}_${new Date().toISOString().slice(0,10)}.pdf`);
    hidePdfLoading();
    toast(`✅ ${info.title} PDF 저장 완료 (${pdf.getNumberOfPages()}페이지)`);
  } catch(e){
    hidePdfLoading(); toast('❌ PDF 생성 실패: ' + e.message); console.error(e);
  }
}

async function exportCurrentTabPDF(){
  const active = document.querySelector('.tab-pane.on');
  if (!active){ toast('❌ 표시된 탭이 없습니다'); return; }
  await exportTabPDF(active.id);
}

async function exportAllPDF(){
  const ids = Object.keys(TAB_INFO).filter(id => {
    if (id === 'tp-trend' && !S.trend.length) return false;   // 비교 데이터 없으면 제외
    const btnId = 'tbtn-' + id.replace('tp-','');
    return !document.getElementById(btnId)?.classList.contains('dim');
  });
  if (!ids.length){ toast('❌ 분석 데이터가 없습니다'); return; }

  showPdfLoading('전체 분석 PDF 생성 중…', `총 ${ids.length}개 탭 준비 중`);
  await new Promise(r => setTimeout(r, 200));

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p','mm','a4');
    const state = { used:false };

    for (let ti = 0; ti < ids.length; ti++){
      const tabId = ids[ti];
      const info  = TAB_INFO[tabId];
      const pane  = document.getElementById(tabId);

      document.getElementById('pdfSub').textContent =
        `${ti+1}/${ids.length}: ${info.title} 캡처 중`;

      // 숨겨진 탭 임시 표시
      const hidden = !pane.classList.contains('on');
      if (hidden){
        pane.style.cssText = 'display:block;position:fixed;left:-9999px;top:0;width:' +
          (document.getElementById('dash').offsetWidth) + 'px;z-index:-1;visibility:visible';
      }

      const hdr = makeTmpHeader(info.title);
      pane.insertBefore(hdr, pane.firstChild);
      await new Promise(r => setTimeout(r, 100));   // 차트 렌더링 대기
      const canvas = await capturePane(pane);
      pane.removeChild(hdr);

      if (hidden) pane.style.cssText = '';

      addCanvasToPdf(pdf, canvas, state, 0.92);
    }

    pdf.save(`시험성적분석_전체_${new Date().toISOString().slice(0,10)}.pdf`);
    hidePdfLoading();
    toast(`✅ 전체 분석 PDF 저장 완료 (${pdf.getNumberOfPages()}페이지)`);
  } catch(e){
    hidePdfLoading(); toast('❌ PDF 생성 실패: ' + e.message); console.error(e);
  }
}

// ═══════════════════════════
// 브라우저 인쇄 (텍스트 선택 가능한 벡터 PDF)
// ═══════════════════════════
// 인쇄 대화상자에서 "PDF로 저장"을 선택하면 텍스트 검색·복사가 가능한 PDF가 됩니다.
function printAll(){
  if (!S.analyzed){ toast('❌ 먼저 성적 분석을 실행하세요'); return; }
  document.body.classList.add('print-all');
  toast('🖨️ 인쇄 준비 중… (인쇄 대화상자에서 "PDF로 저장" 선택 가능)');
  // 숨겨져 있던 탭이 펼쳐지며 차트가 리사이즈될 시간 확보
  setTimeout(() => window.print(), 900);
}
window.addEventListener('afterprint', () => document.body.classList.remove('print-all'));

// ═══════════════════════════
// 개인별 리포트 PDF (학생 1명 = 1페이지)
// ═══════════════════════════
async function exportStudentReports(){
  const students = S._rankStudents || [];
  if (!students.length){ toast('❌ 성적 현황 데이터가 없습니다 (파일3 필요)'); return; }
  if (students.length > 60 &&
      !confirm(`${students.length}명의 개인별 리포트를 생성합니다.\n인원이 많으면 수 분이 걸릴 수 있습니다. 계속할까요?`)) return;

  const subject = document.getElementById('cqi-subject')?.value || '';
  const stAll   = calcStats(students.map(s => s.total), PASS_RAW);
  const clsStats = {};
  (S.f3 || []).forEach(c => clsStats[c.label] = calcStats(c.students.map(s => s.total), PASS_RAW));

  showPdfLoading('개인별 리포트 생성 중…', '준비 중');
  await new Promise(r => setTimeout(r, 100));

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p','mm','a4');
    const state = { used:false };

    for (let i = 0; i < students.length; i++){
      const s = students[i];
      document.getElementById('pdfSub').textContent = `${i+1}/${students.length}: ${s.name}`;
      const el = buildStudentCard(s, i+1, students.length, stAll, clsStats[s.cls], subject);
      document.body.appendChild(el);
      const canvas = await html2canvas(el, { scale:2, backgroundColor:'#fff', logging:false });
      document.body.removeChild(el);
      addCanvasToPdf(pdf, canvas, state, 0.93);
    }

    pdf.save(`개인별리포트${subject ? '_'+subject.replace(/[\\/:*?"<>|]/g,'') : ''}_${new Date().toISOString().slice(0,10)}.pdf`);
    hidePdfLoading();
    toast(`✅ 개인별 리포트 ${students.length}명 저장 완료`);
  } catch(e){
    hidePdfLoading(); toast('❌ 리포트 생성 실패: ' + e.message); console.error(e);
  }
}

function buildStudentCard(s, rank, total, stAll, stCls, subject){
  const conv = s.total/MAX_SCORE*100;
  const g    = gradeOf(conv);
  const isPass = conv >= PASS_CONV;
  const date = new Date().toLocaleDateString('ko-KR');
  const fmt  = v => v != null && !isNaN(v) ? v.toFixed(1) : '-';

  const box = (lbl, val, sub, col) => `
    <div style="flex:1;background:#f8fafc;border-radius:10px;padding:14px 10px;text-align:center;border-top:3px solid ${col}">
      <div style="font-size:11px;color:#64748b;margin-bottom:4px">${lbl}</div>
      <div style="font-size:22px;font-weight:800;color:${col}">${val}</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px">${sub || ''}</div>
    </div>`;

  const cmpRow = (lbl, mine, avg) => {
    if (avg == null || isNaN(avg)) return '';
    const diff = mine - avg;
    const dCol = diff >= 0 ? '#059669' : '#dc2626';
    const dTxt = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}점`;
    return `<tr>
      <td style="padding:7px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;text-align:left">${lbl}</td>
      <td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center">${fmt(mine)}점</td>
      <td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center">${fmt(avg)}점</td>
      <td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:${dCol}">${dTxt}</td>
    </tr>`;
  };

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:780px;background:#fff;' +
    "font-family:-apple-system,'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#1e293b";
  el.innerHTML = `
    <div style="background:linear-gradient(135deg,#1e40af,#5b21b6);color:#fff;padding:20px 28px">
      <div style="font-size:17px;font-weight:800">📊 개인별 성적 리포트${subject ? ' — ' + esc(subject) : ''}</div>
      <div style="font-size:11px;opacity:.85;margin-top:4px">청암대학교 간호학과 · 발행일: ${date}</div>
    </div>
    <div style="padding:24px 28px">
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">
        <tr>
          <td style="padding:8px 14px;border:1px solid #e2e8f0;background:#f1f5f9;font-weight:700;width:16%">이름</td>
          <td style="padding:8px 14px;border:1px solid #e2e8f0;width:34%;font-weight:700;font-size:15px">${esc(s.name)}</td>
          <td style="padding:8px 14px;border:1px solid #e2e8f0;background:#f1f5f9;font-weight:700;width:16%">학번</td>
          <td style="padding:8px 14px;border:1px solid #e2e8f0">${esc(s.id)}</td>
        </tr>
        <tr>
          <td style="padding:8px 14px;border:1px solid #e2e8f0;background:#f1f5f9;font-weight:700">반</td>
          <td style="padding:8px 14px;border:1px solid #e2e8f0">${esc(s.cls || '-')}</td>
          <td style="padding:8px 14px;border:1px solid #e2e8f0;background:#f1f5f9;font-weight:700">석차</td>
          <td style="padding:8px 14px;border:1px solid #e2e8f0"><strong>${rank}위</strong> / ${total}명</td>
        </tr>
      </table>
      <div style="display:flex;gap:10px;margin-bottom:18px">
        ${box('원점수', `${fmt(s.total)}점`, `${MAX_SCORE}점 만점`, '#2563eb')}
        ${box('환산점수', `${fmt(conv)}점`, '100점 만점', '#7c3aed')}
        ${box('성취수준', g.lbl, `기준: 환산 ${PASS_CONV}점`, g.col)}
        ${box('성취 여부', isPass ? '성취' : '미성취', isPass ? '기준 충족' : '환류 교육 대상', isPass ? '#059669' : '#dc2626')}
      </div>
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#1e40af">📊 평균과의 비교 (원점수 기준)</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px">
        <tr style="background:#f1f5f9">
          <th style="padding:7px 12px;border:1px solid #e2e8f0;text-align:left">비교 대상</th>
          <th style="padding:7px 12px;border:1px solid #e2e8f0">내 점수</th>
          <th style="padding:7px 12px;border:1px solid #e2e8f0">평균</th>
          <th style="padding:7px 12px;border:1px solid #e2e8f0">차이</th>
        </tr>
        ${cmpRow('전체 평균', s.total, stAll?.mean)}
        ${stCls ? cmpRow(`${esc(s.cls)}반 평균`, s.total, stCls.mean) : ''}
      </table>
      <div style="background:${isPass ? '#f0fdf4' : '#fef2f2'};border:1px solid ${isPass ? '#bbf7d0' : '#fecaca'};border-radius:10px;padding:14px 18px;font-size:12px;line-height:1.8;color:${isPass ? '#15803d' : '#dc2626'}">
        ${isPass
          ? `✅ 성취 기준(환산 ${PASS_CONV}점)을 충족했습니다. 현재 수준을 유지하며 부족한 영역을 보완하세요.`
          : `⚠️ 성취 기준(환산 ${PASS_CONV}점)에 도달하지 못했습니다. 환류 교육 대상자이며, 담당 교수의 안내에 따라 보충 학습 및 재평가에 참여하세요.`}
      </div>
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center">
        본 리포트는 시험 성적 분석 대시보드에서 자동 생성되었습니다 · 참고용
      </div>
    </div>`;
  return el;
}
