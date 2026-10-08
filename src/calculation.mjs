const DAY_MS = 24 * 60 * 60 * 1000;
export const COMPARISON_TOLERANCE = 1e-10;
const CEILING_INCREMENT_HOURS = 0.125;

function ceilingToEighthHour(value) {
  const units = value / CEILING_INCREMENT_HOURS;
  const nearestUnits = Math.round(units);
  // Summation can leave an exact eighth-hour total a few binary ULPs above
  // its boundary. Snap only that machine-scale noise before applying CEILING.
  const machineNoise = Number.EPSILON * Math.max(1, Math.abs(units)) * 8;
  const roundedUnits = Math.abs(units - nearestUnits) <= machineNoise ? nearestUnits : Math.ceil(units);
  return roundedUnits * CEILING_INCREMENT_HOURS;
}

function parseDate(value, label, errors) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${label}: YYYY-MM-DD 형식의 날짜를 입력하세요.`);
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    errors.push(`${label}: 실제 달력에 있는 날짜를 입력하세요.`);
    return null;
  }
  return date;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

// Excel EDATE semantics: move by whole calendar months and clamp to month end.
export function addMonths(date, months) {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

function daysInclusive(start, end) {
  return Math.max(0, Math.floor((end - start) / DAY_MS) + 1);
}

export function validateInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['입력 데이터가 올바르지 않습니다.'];
  if (typeof input.employeeId !== 'string' || !input.employeeId.trim()) errors.push('직원 식별자를 입력하세요.');
  const hireDate = parseDate(input.hireDate, '입사일', errors);
  const endDate = parseDate(input.endDate, '퇴사일', errors);
  if (hireDate && endDate && hireDate > endDate) errors.push('입사일은 퇴사일보다 늦을 수 없습니다.');
  if (!Array.isArray(input.histories) || input.histories.length === 0) {
    errors.push('근무 이력을 한 건 이상 입력하세요.');
  } else {
    if (input.histories.length > 10) errors.push('근무 이력은 최대 10건까지 입력할 수 있습니다.');
    const parsed = [];
    input.histories.forEach((row, index) => {
      const n = index + 1;
      if (!row || typeof row !== 'object') {
        errors.push(`근무 이력 ${n}: 행이 올바르지 않습니다.`);
        return;
      }
      const start = parseDate(row.startDate, `근무 이력 ${n} 시작일`, errors);
      const end = parseDate(row.endDate, `근무 이력 ${n} 종료일`, errors);
      if (typeof row.weeklyHours !== 'number' || !Number.isFinite(row.weeklyHours)) errors.push(`근무 이력 ${n}: 주간 근로시간은 유한한 숫자여야 합니다.`);
      else if (row.weeklyHours < 0) errors.push(`근무 이력 ${n}: 주간 근로시간은 0 이상이어야 합니다.`);
      if (start && end) {
        if (start > end) errors.push(`근무 이력 ${n}: 시작일이 종료일보다 늦습니다.`);
        parsed.push({ index, start, end });
        if (hireDate && start < hireDate) errors.push(`근무 이력 ${n}: 입사일보다 앞선 이력입니다.`);
        if (endDate && end > endDate) errors.push(`근무 이력 ${n}: 퇴사일보다 뒤의 이력입니다.`);
      }
    });
    parsed.sort((a, b) => a.start - b.start);
    if (hireDate && endDate && hireDate <= endDate && parsed.length === input.histories.length && parsed.length > 0) {
      if (parsed[0].start.getTime() !== hireDate.getTime()) errors.push('근무 이력이 입사일부터 시작해야 합니다.');
      if (parsed.at(-1).end.getTime() !== endDate.getTime()) errors.push('근무 이력이 퇴사일까지 이어져야 합니다.');
      for (let i = 1; i < parsed.length; i++) {
        const prior = parsed[i - 1];
        const expectedNext = new Date(prior.end.getTime() + DAY_MS);
        if (parsed[i].start < expectedNext) errors.push(`근무 이력 ${prior.index + 1}과 ${parsed[i].index + 1}이 겹칩니다.`);
        else if (parsed[i].start > expectedNext) errors.push(`근무 이력 ${prior.index + 1}과 ${parsed[i].index + 1} 사이에 날짜 누락이 있습니다.`);
      }
    }
  }
  if (!input.expected || typeof input.expected !== 'object' || Array.isArray(input.expected)) {
    errors.push('확정 정답 3개 값을 입력하세요.');
  } else {
    for (const key of ['monthlyHours', 'annualHours', 'totalHours']) {
      const value = input.expected[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) errors.push(`확정 정답 ${key}: 0 이상의 유한한 숫자를 입력하세요.`);
    }
  }
  return errors;
}

function periodList(hire, count, monthsPerPeriod, baseDays) {
  const periods = [];
  let start = hire;
  for (let index = 0; index < count; index++) {
    const nextStart = addMonths(start, monthsPerPeriod);
    const end = new Date(nextStart.getTime() - DAY_MS);
    periods.push({ index: index + 1, startDate: formatDate(start), endDate: formatDate(end), start, end, baseDays: baseDays[index] });
    start = nextStart;
  }
  return periods;
}

function calculatePeriods(periods, histories, endDate) {
  return periods.map(period => {
    let weightedHours = 0;
    let overlapDays = 0;
    const overlaps = histories.map((history, index) => {
      const start = parseDate(history.startDate, '', []);
      const end = parseDate(history.endDate, '', []);
      const days = daysInclusive(new Date(Math.max(start, period.start)), new Date(Math.min(end, period.end)));
      if (days > 0) {
        overlapDays += days;
        weightedHours += days * history.weeklyHours;
      }
      return { history: index + 1, days };
    }).filter(overlap => overlap.days > 0);
    const averageWeeklyHours = overlapDays === 0 ? 0 : weightedHours / overlapDays;
    const accrues = endDate.getTime() >= period.end.getTime() + DAY_MS;
    const accruedHours = accrues ? period.baseDays * 8 * (averageWeeklyHours / 40) : 0;
    return { index: period.index, startDate: period.startDate, endDate: period.endDate, baseDays: period.baseDays, overlaps, overlapDays, averageWeeklyHours, accrues, accruedHours };
  });
}

export function calculate(input) {
  const errors = validateInput(input);
  if (errors.length) return { errors };
  const hire = parseDate(input.hireDate, '', []);
  const end = parseDate(input.endDate, '', []);
  const histories = [...input.histories].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const monthly = calculatePeriods(periodList(hire, 11, 1, Array(11).fill(1)), histories, end);
  const annual = calculatePeriods(periodList(hire, 5, 12, [15, 15, 16, 16, 17]), histories, end);
  const periods = [...monthly, ...annual];
  if (periods.some(item => !Number.isFinite(item.averageWeeklyHours) || !Number.isFinite(item.accruedHours))) {
    return { errors: ['계산 결과가 유한한 숫자가 아닙니다. 근무시간 값을 확인하세요.'] };
  }
  const rawMonthlyHours = monthly.reduce((sum, item) => sum + item.accruedHours, 0);
  const rawAnnualHours = annual.reduce((sum, item) => sum + item.accruedHours, 0);
  const unroundedTotalHours = rawMonthlyHours + rawAnnualHours;
  const monthlyHours = ceilingToEighthHour(rawMonthlyHours);
  const annualHours = ceilingToEighthHour(rawAnnualHours);
  const totalHours = monthlyHours + annualHours;
  const differences = {
    monthlyHours: monthlyHours - input.expected.monthlyHours,
    annualHours: annualHours - input.expected.annualHours,
    totalHours: totalHours - input.expected.totalHours,
  };
  if (![rawMonthlyHours, rawAnnualHours, unroundedTotalHours, monthlyHours, annualHours, totalHours, ...Object.values(differences)].every(Number.isFinite)) {
    return { errors: ['합계 또는 정답 차이가 유한한 숫자가 아닙니다. 입력값 규모를 확인하세요.'] };
  }
  const matches = Object.values(differences).every(value => Math.abs(value) <= COMPARISON_TOLERANCE);
  return { employeeId: input.employeeId.trim(), monthly, annual, rawMonthlyHours, rawAnnualHours, monthlyHours, annualHours, unroundedTotalHours, totalHours, differences, matches, tolerance: COMPARISON_TOLERANCE };
}
