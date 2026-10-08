import { calculate } from './calculation.mjs';

const root = document.querySelector('#app');
let inputData = null;
let notice = '';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const num = value => Number.isFinite(value) ? (Math.abs(value) < 0.0000005 ? 0 : value).toFixed(6) : '—';
const raw = value => Number.isFinite(value) ? String(value) : '—';

function numberOrNaN(value) {
  return value === '' || value == null ? NaN : Number(value);
}

function readForm() {
  return {
    employeeId: root.querySelector('[name="employeeId"]').value,
    hireDate: root.querySelector('[name="hireDate"]').value,
    endDate: root.querySelector('[name="endDate"]').value,
    histories: [...root.querySelectorAll('.history-row')].map(row => ({
      startDate: row.querySelector('[name="startDate"]').value,
      endDate: row.querySelector('[name="historyEndDate"]').value,
      weeklyHours: numberOrNaN(row.querySelector('[name="weeklyHours"]').value),
    })),
  };
}

function hasCompleteInput(input) {
  return Boolean(input.employeeId.trim() && input.hireDate && input.endDate && input.histories.length && input.histories.every(row => row.startDate && row.endDate && Number.isFinite(row.weeklyHours)));
}

function historyRows(rows) {
  return rows.map((row, index) => `<div class="history-row" role="group" aria-label="근무 이력 ${index + 1}">
    <label>시작일<input name="startDate" type="date" value="${escapeHtml(row.startDate)}" required></label>
    <label>종료일<input name="historyEndDate" type="date" value="${escapeHtml(row.endDate)}" required></label>
    <label>주간 시간<input name="weeklyHours" type="number" min="0" step="any" value="${escapeHtml(row.weeklyHours)}" required></label>
    <button class="remove-row" type="button" aria-label="근무 이력 ${index + 1} 삭제">삭제</button>
  </div>`).join('');
}

function rowTable(title, rows, total) {
  return `<div class="table-wrap"><h3>${title}</h3><table><thead><tr><th>회차</th><th>기간</th><th>겹침일수</th><th>가중 주시간</th><th>기준일수</th><th>발생시간</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.index}</td><td>${row.startDate} – ${row.endDate}</td><td>${row.overlapDays.toLocaleString('ko-KR')}</td><td>${num(row.averageWeeklyHours)}</td><td>${row.baseDays}</td><td>${num(row.accruedHours)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="5">${title} 합계(CEILING)</th><th>${num(total)}</th></tr></tfoot></table></div>`;
}

function resultColumnMarkup(input) {
  if (!hasCompleteInput(input)) {
    return `<section class="card result-card" aria-live="polite"><div class="section-kicker">자동 계산</div><h2>근무 이력을 입력해 주세요</h2><p class="status-note">${escapeHtml(notice || '직원 식별자, 입사일·퇴사일과 모든 근무 이력을 입력하면 월별·연별 합계가 자동 계산됩니다.')}</p><p class="muted">입력이 완성되기 전에는 계산 결과를 표시하지 않습니다.</p></section>`;
  }

  const result = calculate(input);
  if (result.errors) {
    return `<section class="card result-card" aria-live="polite"><div class="section-kicker">계산 중단</div><h2>입력 내용을 확인해 주세요</h2><ul class="errors">${result.errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')}</ul></section>`;
  }

  const subtotal = (label, value, rawValue) => `<div class="compare-line"><span>${label}</span><strong>${num(value)}시간</strong><details><summary>올림 전 정밀값</summary><code>${raw(rawValue)}시간</code></details></div>`;
  return `<section class="card result-card" aria-live="polite" aria-label="자동 계산 결과"><div class="section-kicker">${escapeHtml(result.employeeId)} · 자동 계산 완료</div><h2 class="total">${num(result.totalHours)}<small> 시간</small></h2>
    <p class="muted">월별·연별 소계 각각에 0.125시간 단위 CEILING을 적용하고, 총합은 두 올림 소계의 합입니다.</p>
    <div class="compare-list">${subtotal('월별 합계', result.monthlyHours, result.rawMonthlyHours)}${subtotal('연별 합계', result.annualHours, result.rawAnnualHours)}${subtotal('총합', result.totalHours, result.unroundedTotalHours)}</div>
    <details class="breakdown"><summary>기간별 계산 내역 보기</summary>${rowTable('월별 11구간', result.monthly, result.monthlyHours)}${rowTable('연별 5구간', result.annual, result.annualHours)}</details>
  </section>`;
}

function updateResult() {
  inputData = readForm();
  notice = '';
  root.querySelector('.right-column').innerHTML = `${resultColumnMarkup(inputData)}<section class="card reference"><div class="section-kicker">자동 계산 기준</div><h2>결과 표시</h2><p>입사일·퇴사일과 근무 이력을 모두 입력하면 월별·연별 합계가 자동으로 갱신됩니다.</p><p class="muted">구간별 계산은 정밀값을 유지합니다. 필수 입력 누락·날짜 오류·이력 누락 또는 중첩은 계산을 중단하고 안내합니다.</p></section>`;
}

function render() {
  const data = inputData ?? { employeeId: '', hireDate: '', endDate: '', histories: [{ startDate: '', endDate: '', weeklyHours: '' }] };
  root.innerHTML = `<header class="topbar"><div class="brand">연차 검산</div><span>직원 1명 · 자동 계산</span></header><main>
    <div class="intro"><span class="tag">자동 계산</span><h1>근무 이력을 입력하면 합계를 계산합니다</h1><p>근무기간별 주간 시간을 날짜로 가중평균해 월별·연별 비례 연차 시간을 계산합니다.</p></div>
    <div class="layout"><div class="left-column"><section class="card"><div class="section-kicker">입력</div><h2>직원 정보와 근무 이력</h2><div class="actions"><button id="load-sample" class="secondary" type="button">가상 정상 샘플 불러오기</button><span class="muted">샘플을 불러온 뒤 값을 직접 수정할 수 있습니다.</span></div><form autocomplete="off">
      <div class="form-grid"><label>직원 식별자<input name="employeeId" value="${escapeHtml(data.employeeId)}" required></label><label>입사일<input name="hireDate" type="date" value="${escapeHtml(data.hireDate)}" required></label><label>퇴사일<input name="endDate" type="date" value="${escapeHtml(data.endDate)}" required></label></div>
      <div class="history-heading"><h3>근무 이력 <span>${data.histories.length}/10</span></h3><button id="add-row" class="ghost" type="button" ${data.histories.length >= 10 ? 'disabled' : ''}>＋ 이력 추가</button></div><div class="history-list">${historyRows(data.histories)}</div>
    </form></section>
    <section class="card rationale"><div class="section-kicker">계산 근거</div><h2>원본 수식 구조 재현</h2><p>월별 11구간은 입사일부터 매월 EDATE(시작일, 1)로 이동하고, 연별 5구간은 EDATE(시작일, 12)로 이동합니다. 각 종료일은 다음 시작일 하루 전입니다.</p><div class="formula">기준일수 × 8 × (겹침일수 가중평균 주간시간 ÷ 40)</div><p class="muted">연별 기준일수: 15, 15, 16, 16, 17일 · 매월 개근 전제</p><p class="muted">개별 구간은 정밀값을 유지합니다. 월별·연별 소계에 각각 0.125시간 단위 CEILING을 적용하고, 총합은 두 올림 소계의 합으로 계산합니다.</p><p class="muted">양끝 날짜 포함 · 날짜는 UTC 기준 · 월말 이동은 EDATE처럼 대상 월 말일로 보정 · 퇴사일 ≥ 구간 종료일 + 1일일 때 발생</p><p class="muted">이력 누락·중첩·범위 밖 날짜가 있으면 계산을 중단합니다.</p></section></div>
    <div class="right-column">${resultColumnMarkup(data)}<section class="card reference"><div class="section-kicker">자동 계산 기준</div><h2>결과 표시</h2><p>입사일·퇴사일과 근무 이력을 모두 입력하면 월별·연별 합계가 자동으로 갱신됩니다.</p><p class="muted">구간별 계산은 정밀값을 유지합니다. 필수 입력 누락·날짜 오류·이력 누락 또는 중첩은 계산을 중단하고 안내합니다.</p></section></div></div>
    <footer>이번 범위: 직원 1명 근무 이력 자동 계산</footer></main>`;
  root.querySelector('#load-sample').addEventListener('click', loadSample);
  root.querySelector('#add-row').addEventListener('click', () => {
    inputData = readForm();
    if (inputData.histories.length < 10) inputData.histories.push({ startDate: '', endDate: '', weeklyHours: '' });
    notice = '';
    render();
  });
  root.querySelectorAll('.remove-row').forEach(button => button.addEventListener('click', () => {
    inputData = readForm();
    const index = Number(button.closest('.history-row').getAttribute('aria-label').match(/\d+/)[0]) - 1;
    inputData.histories.splice(index, 1);
    if (inputData.histories.length === 0) inputData.histories.push({ startDate: '', endDate: '', weeklyHours: '' });
    notice = '';
    render();
  }));
  root.querySelector('form').addEventListener('input', updateResult);
  root.querySelector('form').addEventListener('change', updateResult);
}

async function loadSample() {
  const button = root.querySelector('#load-sample');
  button.disabled = true;
  button.textContent = '샘플 불러오는 중…';
  try {
    const response = await fetch('./samples/employee-001.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    inputData = await response.json();
    delete inputData.expected;
    notice = '가상 정상 샘플을 불러왔습니다. 합계가 자동 계산됐습니다.';
  } catch (error) {
    inputData = { employeeId: '', hireDate: '', endDate: '', histories: [{ startDate: '', endDate: '', weeklyHours: '' }] };
    notice = `샘플을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요. (${error.message})`;
  }
  render();
}

render();
