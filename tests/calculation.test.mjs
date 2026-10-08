import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addMonths, calculate, validateInput } from '../src/calculation.mjs';

const samplePath = new URL('../samples/employee-001.json', import.meta.url);
const demoSample = JSON.parse(readFileSync(samplePath, 'utf8'));

const sourceWorkbookCase = {
  employeeId: 'TEST-ORIGINAL',
  hireDate: '2025-02-21',
  endDate: '2026-04-10',
  histories: [
    { startDate: '2025-02-21', endDate: '2025-09-10', weeklyHours: 20 },
    { startDate: '2025-09-11', endDate: '2025-11-10', weeklyHours: 30 },
    { startDate: '2025-11-11', endDate: '2026-04-10', weeklyHours: 20 },
  ],
  expected: { monthlyHours: 48, annualHours: 65.125, totalHours: 113.125 },
};

const almost = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('reproduces the original workbook inputs and saved totals', () => {
  const result = calculate(sourceWorkbookCase);
  assert.equal(result.errors, undefined);
  almost(result.rawMonthlyHours, 48);
  assert.equal(result.rawAnnualHours, 65.013698630136986);
  assert.equal(result.monthlyHours, 48);
  assert.equal(result.annualHours, 65.125);
  almost(result.unroundedTotalHours, 113.01369863013699);
  almost(result.totalHours, 113.125);
  assert.equal(result.matches, true);
  assert.equal(result.monthly.length, 11);
  assert.equal(result.annual.length, 5);
});

test('calculates the fictional browser sample and matches its three expected totals', () => {
  const sampleWithApprovedTotals = { ...demoSample, expected: { monthlyHours: 68, annualHours: 89.875, totalHours: 157.875 } };
  const result = calculate(sampleWithApprovedTotals);
  assert.equal(result.errors, undefined);
  assert.equal(result.rawMonthlyHours, 68);
  almost(result.rawAnnualHours, 89.75342465753425);
  assert.equal(result.monthlyHours, 68);
  assert.equal(result.annualHours, 89.875);
  almost(result.unroundedTotalHours, 157.75342465753425);
  almost(result.totalHours, 157.875);
  assert.equal(result.matches, true);
});

test('calculates monthly, annual, and overall totals without user-provided expected answers', () => {
  const { expected: _expected, ...inputWithoutExpected } = demoSample;
  const result = calculate(inputWithoutExpected);
  assert.equal(result.errors, undefined);
  assert.equal(result.monthlyHours, 68);
  almost(result.annualHours, 89.875);
  assert.equal(result.totalHours, 157.875);
  assert.equal(result.matches, undefined);
  assert.equal(result.differences, undefined);
});

test('compares both rounded subtotals and their sum against expected values', () => {
  const changedHistory = { ...demoSample, histories: [demoSample.histories[0], { ...demoSample.histories[1], weeklyHours: 21 }], expected: { monthlyHours: 69, annualHours: 91.375, totalHours: 160.375 } };
  const result = calculate(changedHistory);
  assert.equal(result.errors, undefined);
  assert.equal(result.monthlyHours, 69);
  assert.equal(result.annualHours, 91.375);
  assert.equal(result.totalHours, 160.375);
  assert.equal(result.matches, true);
});

test('matches subtotals after independent ceiling; a one-field expected mismatch remains visible', () => {
  const editedExpected = { ...demoSample, expected: { monthlyHours: 68, annualHours: 89.875, totalHours: 160.375 } };
  const result = calculate(editedExpected);
  assert.equal(result.monthlyHours, 68);
  assert.equal(result.annualHours, 89.875);
  almost(result.rawAnnualHours, 89.75342465753425);
  almost(result.unroundedTotalHours, 157.75342465753425);
  assert.equal(result.totalHours, 157.875);
  assert.equal(result.differences.monthlyHours, 0);
  assert.equal(result.differences.annualHours, 0);
  assert.equal(result.differences.totalHours, -2.5);
  assert.equal(result.matches, false);
});

test('rounds the monthly subtotal only while preserving individual interval precision', () => {
  const makeCase = weeklyHours => ({
    employeeId: 'ROUNDING', hireDate: '2025-01-01', endDate: '2025-02-01',
    histories: [{ startDate: '2025-01-01', endDate: '2025-02-01', weeklyHours }],
    expected: { monthlyHours: 0.25, annualHours: 0, totalHours: 0.25 },
  });
  const exact = calculate(makeCase(0.625));
  assert.equal(exact.unroundedTotalHours, 0.125);
  assert.equal(exact.rawMonthlyHours, 0.125);
  assert.equal(exact.monthlyHours, 0.125);
  assert.equal(exact.monthly[0].accruedHours, 0.125);
  const machineNoiseBelow = calculate(makeCase(0.6249999999999999));
  assert.ok(machineNoiseBelow.rawMonthlyHours < 0.125);
  assert.equal(machineNoiseBelow.monthlyHours, 0.125);
  const aboveBoundary = calculate(makeCase(0.6250000000001));
  assert.ok(aboveBoundary.rawMonthlyHours > 0.125);
  assert.ok(aboveBoundary.monthly[0].accruedHours > 0.125);
  assert.equal(aboveBoundary.monthlyHours, 0.25);
  assert.equal(aboveBoundary.monthly[0].accruedHours, aboveBoundary.rawMonthlyHours);
  assert.equal(aboveBoundary.totalHours, 0.25);
});

test('ceilings the sum of precise monthly intervals instead of ceiling each interval', () => {
  const input = {
    employeeId: 'MONTHLY-SUM', hireDate: '2025-01-01', endDate: '2025-04-01',
    histories: [{ startDate: '2025-01-01', endDate: '2025-04-01', weeklyHours: 0.25 }],
    expected: { monthlyHours: 0.25, annualHours: 0, totalHours: 0.25 },
  };
  const result = calculate(input);
  const accruedIntervals = result.monthly.filter(period => period.accrues);
  assert.equal(accruedIntervals.length, 3);
  assert.ok(accruedIntervals.every(period => Math.abs(period.accruedHours - 0.05) < 1e-12));
  almost(result.rawMonthlyHours, 0.15);
  assert.equal(result.monthlyHours, 0.25);
  assert.equal(result.totalHours, 0.25);
});

test('rounds the annual subtotal independently from monthly and leaves each annual interval precise', () => {
  const weeklyHours = 0.016;
  const input = {
    employeeId: 'ANNUAL-ROUNDING', hireDate: '2025-01-01', endDate: '2028-01-02',
    histories: [{ startDate: '2025-01-01', endDate: '2028-01-02', weeklyHours }],
    expected: { monthlyHours: 0.125, annualHours: 0.25, totalHours: 0.375 },
  };
  const result = calculate(input);
  assert.equal(result.errors, undefined);
  assert.ok(result.rawMonthlyHours < 0.125);
  assert.equal(result.monthlyHours, 0.125);
  assert.ok(result.rawAnnualHours > 0.125);
  assert.equal(result.annualHours, 0.25);
  const accruedAnnualPeriods = result.annual.filter(period => period.accrues);
  assert.equal(accruedAnnualPeriods.length, 3);
  assert.ok(accruedAnnualPeriods.every(period => period.accruedHours < 0.125));
  almost(accruedAnnualPeriods.reduce((sum, period) => sum + period.accruedHours, 0), result.rawAnnualHours);
  assert.equal(result.totalHours, 0.375);
});

test('EDATE clamps to month end and subsequent starts use the prior period start', () => {
  const jan31 = new Date(Date.UTC(2024, 0, 31));
  assert.equal(addMonths(jan31, 1).toISOString().slice(0, 10), '2024-02-29');
  const input = {
    employeeId: 'MONTH-END', hireDate: '2024-01-31', endDate: '2024-12-31',
    histories: [{ startDate: '2024-01-31', endDate: '2024-12-31', weeklyHours: 0 }],
    expected: { monthlyHours: 0, annualHours: 0, totalHours: 0 },
  };
  const result = calculate(input);
  assert.equal(result.monthly[0].startDate, '2024-01-31');
  assert.equal(result.monthly[1].startDate, '2024-02-29');
  assert.equal(result.monthly[2].startDate, '2024-03-29');
});

test('requires contiguous full employment coverage and rejects gaps, overlaps, and out-of-range rows', () => {
  const valid = {
    employeeId: 'COVERAGE', hireDate: '2025-01-01', endDate: '2025-01-04',
    histories: [
      { startDate: '2025-01-01', endDate: '2025-01-02', weeklyHours: 0 },
      { startDate: '2025-01-03', endDate: '2025-01-04', weeklyHours: 10 },
    ], expected: { monthlyHours: 0, annualHours: 0, totalHours: 0 },
  };
  assert.deepEqual(validateInput(valid), []);
  assert.ok(validateInput({ ...valid, histories: [valid.histories[0], { ...valid.histories[1], startDate: '2025-01-04' }] }).some(e => e.includes('누락')));
  assert.ok(validateInput({ ...valid, histories: [valid.histories[0], { ...valid.histories[1], startDate: '2025-01-02' }] }).some(e => e.includes('겹칩')));
  assert.ok(validateInput({ ...valid, histories: [{ ...valid.histories[0], startDate: '2024-12-31' }, valid.histories[1]] }).some(e => e.includes('입사일보다 앞선')));
});

test('applies the source accrual boundary: termination must reach the day after period end', () => {
  const atPeriodEnd = {
    employeeId: 'BOUNDARY', hireDate: '2025-01-01', endDate: '2025-01-31',
    histories: [{ startDate: '2025-01-01', endDate: '2025-01-31', weeklyHours: 40 }],
    expected: { monthlyHours: 0, annualHours: 0, totalHours: 0 },
  };
  const first = calculate(atPeriodEnd);
  assert.equal(first.monthly[0].accrues, false);
  assert.equal(first.monthly[0].accruedHours, 0);
  const nextDay = { ...atPeriodEnd, endDate: '2025-02-01', histories: [{ ...atPeriodEnd.histories[0], endDate: '2025-02-01' }], expected: { monthlyHours: 8, annualHours: 0, totalHours: 8 } };
  const second = calculate(nextDay);
  assert.equal(second.monthly[0].accrues, true);
  assert.equal(second.monthly[0].accruedHours, 8);
});

test('rejects malformed dates, missing values, non-finite or negative weekly hours, and more than 10 histories', () => {
  const base = demoSample;
  assert.ok(validateInput({ ...base, hireDate: '2025-02-30' }).some(e => e.includes('실제 달력')));
  assert.ok(validateInput({ ...base, employeeId: ' ' }).some(e => e.includes('식별자')));
  assert.ok(validateInput({ ...base, histories: [{ ...base.histories[0], weeklyHours: -1 }, base.histories[1]] }).some(e => e.includes('0 이상')));
  assert.ok(validateInput({ ...base, histories: Array(11).fill(base.histories[0]) }).some(e => e.includes('최대 10건')));
  assert.ok(validateInput({ ...base, expected: { ...base.expected, totalHours: NaN } }).some(e => e.includes('유한한 숫자')));
});

test('stops when finite inputs overflow to a non-finite calculation result', () => {
  const huge = {
    employeeId: 'OVERFLOW', hireDate: '2025-01-01', endDate: '2025-02-01',
    histories: [{ startDate: '2025-01-01', endDate: '2025-02-01', weeklyHours: 1e308 }],
    expected: { monthlyHours: 0, annualHours: 0, totalHours: 0 },
  };
  const result = calculate(huge);
  assert.ok(result.errors?.some(error => error.includes('유한한 숫자')));
});
