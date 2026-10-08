import { calculate, COMPARISON_TOLERANCE } from './calculation.mjs';

const root = document.querySelector('#app');
let inputData = null;
let latestResult = null;
let notice = '';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const num = value => Number.isFinite(value) ? (Math.abs(value) < 0.0000005 ? 0 : value).toFixed(6) : '—';
const raw = value => Number.isFinite(value) ? String(value) : '—';

function readForm() {
  const form = root.querySelector('form');
  if (!form) return inputData;
  const data = new FormData(form);
  const histories = [...root.querySelectorAll('.history-row')].map(row => ({
    startDate: row.querySelector('[name="startDate"]').value,
    endDate: row.querySelector('[name="historyEndDate"]').value,
    weeklyHours: numberOrNaN(row.querySelector('[name="weeklyHours"]').value),
  }));
  return {
    employeeId: data.get('employeeId') ?? '', hireDate: data.get('hireDate') ?? '', endDate: data.get('endDate') ?? '', histories,
    expected: {
      monthlyHours: numberOrNaN(data.get('monthlyHours')),
      annualHours: numberOrNaN(data.get('annualHours')),
      totalHours: numberOrNaN(data.get('totalHours')),
    },
  };
}

function numberOrNaN(value) {
  return value === '' || value == null ? NaN : Number(value);
}

function invalidate() {
  inputData = readForm();
  latestResult = null;
  notice = '입력이 바뀌었습니다. 정답과 다시 비교해 주세요.';
  root.querySelector('.right-column').innerHTML = `${resultMarkup()}<section class="card reference"><div class="section-kicker">비교 정밀도</div><p>월별·연별 소계 각각을 0.125시간 단위로 올림해 비교하고, 총합은 두 올림 소계의 합입니다.</p><p class="muted">기술 허용오차는 ±1e-10시간이며, 표시 소수점 6자리는 업무 올림 기준을 대신하지 않습니다.</p></section>`;
}

function historyRows(rows) {
  return rows.map((row, index) => `<div class="history-row" role="group" aria-label="근무 이력 ${index + 1}">
    <label>시작일<input name="startDate" type="date" value="${escapeHtml(row.startDate)}" required></label>
    <label>종료일<input name="historyEndDate" type="date" value="${escapeHtml(row.endDate)}" required></label>
    <label>주간 시간<input name="weeklyHours" type="number" step="any" value="${escapeHtml(row.weeklyHours)}" required></label>
    <button class="remove-row" type="button" aria-label="근무 이력 ${index + 1} 삭제">삭제</button>
  </div>`).join('');
}

function resultMarkup() {
  if (!latestResult) return `<section class="card result-card" aria-label="정답 비교 결과"><div class="section-kicker">검산 결과</div><h2>아직 비교 전입니다</h2><p id="notice" tabindex="-1" class="status-note">${escapeHtml(notice || '입력값을 확인한 뒤 “정답과 비교하기”를 누르세요.')}</p><p class="muted">계산 실행 전에는 완료나 일치 상태를 표시하지 않습니다.</p></section>`;
  const result = latestResult;
  if (result.errors) return `<section class="card result-card" aria-label="입력 검증 결과"><div class="section-kicker">검증 중단</div><h2>입력 내용을 확인해 주세요</h2><ul class="errors">${result.errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')}</ul></section>`;
  const rowTable = (title, rows, total) => `<div class="table-wrap"><h3>${title}</h3><table><thead><tr><th>회차</th><th>기간</th><th>겹침일수</th><th>가중 주시간</th><th>기준일수</th><th>발생시간</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.index}</td><td>${row.startDate} – ${row.endDate}</td><td>${row.overlapDays.toLocaleString('ko-KR')}</td><td>${num(row.averageWeeklyHours)}</td><td>${row.baseDays}</td><td>${num(row.accruedHours)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="5">${title} 합계</th><th>${num(total)}</th></tr></tfoot></table></div>`;
  const compare = (label, key) => {
    const displayedCalculation = result[key];
    const rawSubtotal = key === 'monthlyHours' ? result.rawMonthlyHours : key === 'annualHours' ? result.rawAnnualHours : result.unroundedTotalHours;
    const calculationLabel = key === 'monthlyHours' || key === 'annualHours'
      ? `원시 소계 ${raw(rawSubtotal)} → 0.125시간 단위 올림 ${raw(displayedCalculation)}`
      : `원시 월별 소계 ${raw(result.rawMonthlyHours)} + 원시 연별 소계 ${raw(result.rawAnnualHours)} = ${raw(result.unroundedTotalHours)} → 올림 소계 합계 ${raw(displayedCalculation)}`;
    return `<div class="compare-line"><span>${label}</span><strong>${num(displayedCalculation)}시간</strong><span>정답 ${num(inputData.expected[key])} · 차이 ${num(result.differences[key])}</span><details><summary>원시값</summary><code>${calculationLabel} / 정답 ${raw(inputData.expected[key])} / 차이 ${raw(result.differences[key])}</code></details></div>`;
  };
  return `<section class="card result-card" aria-label="정답 비교 결과"><div class="section-kicker">${escapeHtml(result.employeeId)} · 검산 완료</div><h2 class="total">${num(result.totalHours)}<small> 시간</small></h2><p class="match ${result.matches ? 'yes' : 'no'}">${result.matches ? '확정 정답과 일치' : '확정 정답과 차이가 있습니다'}</p>
    <p class="muted">월별·연별 소계 각각에 0.125시간 단위 올림을 적용하고, 총합은 두 올림 소계의 합입니다. 기술 비교 허용오차 ±${COMPARISON_TOLERANCE}시간과 화면 소수점 6자리는 업무 올림 기준과 별개입니다.</p>
    <div class="compare-list">${compare('월별 합계', 'monthlyHours')}${compare('연별 합계', 'annualHours')}${compare('총합', 'totalHours')}</div>
    <details class="breakdown"><summary>기간별 계산 내역 보기</summary>${rowTable('월별 11구간', result.monthly, result.monthlyHours)}${rowTable('연별 5구간', result.annual, result.annualHours)}</details>
  </section>`;
}

function render() {
  const data = inputData ?? { employeeId: '', hireDate: '', endDate: '', histories: [{ startDate: '', endDate: '', weeklyHours: '' }], expected: { monthlyHours: '', annualHours: '', totalHours: '' } };
  root.innerHTML = `<header class="topbar"><div class="brand">연차 검산</div><span>직원 1명 · 계산식 검증</span></header><main>
    <div class="intro"><span class="tag">첫 검산 단계</span><h1>근무 이력과 확정 정답을 확인합니다</h1><p>근무기간별 주간 시간을 날짜로 가중평균해 원본 계산식에 따라 시간 단위로 비교합니다.</p></div>
    <div class="layout"><div class="left-column"><section class="card"><div class="section-kicker">입력</div><h2>직원 정보와 근무 이력</h2><div class="actions"><button id="load-sample" class="secondary" type="button">가상 정상 샘플 불러오기</button><span class="muted">샘플을 불러온 뒤 값을 직접 수정할 수 있습니다.</span></div><form autocomplete="off">
      <div class="form-grid"><label>직원 식별자<input name="employeeId" value="${escapeHtml(data.employeeId)}" required></label><label>입사일<input name="hireDate" type="date" value="${escapeHtml(data.hireDate)}" required></label><label>퇴사일<input name="endDate" type="date" value="${escapeHtml(data.endDate)}" required></label></div>
      <div class="history-heading"><h3>근무 이력 <span>${data.histories.length}/10</span></h3><button id="add-row" class="ghost" type="button" ${data.histories.length >= 10 ? 'disabled' : ''}>＋ 이력 추가</button></div><div class="history-list">${historyRows(data.histories)}</div>
      <div class="expected-block"><h3>확정 정답 <span>시간 단위</span></h3><div class="form-grid three"><label>월별 합계<input name="monthlyHours" type="number" min="0" step="any" value="${escapeHtml(data.expected.monthlyHours)}" required></label><label>연별 합계<input name="annualHours" type="number" min="0" step="any" value="${escapeHtml(data.expected.annualHours)}" required></label><label>총합<input name="totalHours" type="number" min="0" step="any" value="${escapeHtml(data.expected.totalHours)}" required></label></div></div>
      <button class="primary compare-button" type="submit">정답과 비교하기</button></form></section>
      <section class="card rationale"><div class="section-kicker">계산 근거</div><h2>원본 수식 구조 재현</h2><p>월별 11구간은 입사일부터 매월 EDATE(시작일, 1)로 이동하고, 연별 5구간은 EDATE(시작일, 12)로 이동합니다. 각 종료일은 다음 시작일 하루 전입니다.</p><div class="formula">기준일수 × 8 × (겹침일수 가중평균 주간시간 ÷ 40)</div><p class="muted">연별 기준일수: 15, 15, 16, 16, 17일 · 매월 개근 전제</p><p class="muted">개별 구간은 정밀값을 유지합니다. 월별·연별 소계에 각각 0.125시간 단위 CEILING을 적용하고, 총합은 두 올림 소계의 합으로 계산합니다.</p><p class="muted">양끝 날짜 포함 · 날짜는 UTC 기준 · 월말 이동은 EDATE처럼 대상 월 말일로 보정 · 퇴사일 ≥ 구간 종료일 + 1일일 때 발생</p><p class="muted">이력 누락·중첩·범위 밖 날짜가 있으면 계산을 중단합니다.</p></section></div>
      <div class="right-column">${resultMarkup()}<section class="card reference"><div class="section-kicker">검산 기준</div><h2>비교 정밀도</h2><p>월별·연별 소계 각각의 0.125시간 단위 올림값을 비교하고, 최종 총합은 두 올림 소계의 합입니다.</p><p class="muted">기술 비교 허용오차 ±1e-10시간이며, 표시는 소수점 6자리입니다. 원시 소계·총합과 차이는 상세값에서 확인할 수 있습니다.</p></section></div></div>
      <footer>이번 범위: 직원 1명 계산식·정답 검증</footer></main>`;
  root.querySelector('#load-sample').addEventListener('click', loadSample);
  root.querySelector('#add-row').addEventListener('click', () => { inputData = readForm(); if (inputData.histories.length < 10) inputData.histories.push({ startDate: '', endDate: '', weeklyHours: '' }); latestResult = null; notice = '입력이 바뀌었습니다. 정답과 다시 비교해 주세요.'; render(); });
  root.querySelectorAll('.remove-row').forEach(button => button.addEventListener('click', () => { inputData = readForm(); inputData.histories.splice(Number(button.closest('.history-row').getAttribute('aria-label').match(/\d+/)[0]) - 1, 1); latestResult = null; notice = '입력이 바뀌었습니다. 정답과 다시 비교해 주세요.'; render(); }));
  root.querySelector('form').addEventListener('input', invalidate);
  root.querySelector('form').addEventListener('change', invalidate);
  root.querySelector('form').addEventListener('submit', event => { event.preventDefault(); inputData = readForm(); latestResult = calculate(inputData); notice = ''; render(); });
}

async function loadSample() {
  const button = root.querySelector('#load-sample');
  button.disabled = true;
  button.textContent = '샘플 불러오는 중…';
  try {
    const response = await fetch('./samples/employee-001.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    inputData = await response.json();
    latestResult = null;
    notice = '가상 정상 샘플을 불러왔습니다. 내용을 확인한 뒤 정답과 비교해 주세요.';
  } catch (error) {
    notice = `샘플을 불러오지 못했습니다. 로컬 서버 경로를 확인하세요. (${error.message})`;
  }
  render();
}

render();
