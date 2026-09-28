import { CellValue } from './excel-compare.util';
import { compareCells, describeFilter, matchesFilter, rowMatches } from './excel-filter.util';

describe('excel filter', () => {
  it('tests each operator without case or outer spaces', () => {
    expect(matchesFilter(' ฝ่ายบัญชี ', { column: 0, op: 'contains', value: 'บัญชี' })).toBe(true);
    expect(matchesFilter('ABC', { column: 0, op: 'equals', value: ' abc ' })).toBe(true);
    expect(matchesFilter('ABC', { column: 0, op: 'notContains', value: 'b' })).toBe(false);
    expect(matchesFilter(12, { column: 0, op: 'notEquals', value: '12' })).toBe(false);
    expect(matchesFilter(null, { column: 0, op: 'empty', value: '' })).toBe(true);
    expect(matchesFilter('  ', { column: 0, op: 'notEmpty', value: '' })).toBe(false);
  });

  it('needs every filter and, when searching, one cell with the search text', () => {
    const row: CellValue[] = ['A01', 'บัญชี', 1500];
    expect(rowMatches(row, '', [])).toBe(true);
    expect(rowMatches(row, '150', [])).toBe(true);
    expect(rowMatches(row, 'ไอที', [])).toBe(false);
    expect(rowMatches(row, 'a01', [{ column: 1, op: 'contains', value: 'บัญ' }])).toBe(true);
    expect(rowMatches(row, '', [{ column: 1, op: 'contains', value: 'บัญ' }, { column: 2, op: 'empty', value: '' }])).toBe(false);
  });

  it('sorts numbers by value, text in natural order and blanks last', () => {
    const values: CellValue[] = [10, null, 2, 33];
    expect([...values].sort(compareCells)).toEqual([2, 10, 33, null]);
    expect(['A10', '', 'A2', 'a1'].sort(compareCells)).toEqual(['a1', 'A2', 'A10', '']);
    expect(compareCells(new Date(Date.UTC(2026, 0, 2)), new Date(Date.UTC(2026, 0, 1)))).toBeGreaterThan(0);
  });

  it('describes a filter for its chip', () => {
    const headers = ['รหัส', 'แผนก'];
    expect(describeFilter({ column: 1, op: 'contains', value: 'บัญชี' }, headers)).toBe('แผนก มีคำว่า "บัญชี"');
    expect(describeFilter({ column: 0, op: 'empty', value: '' }, headers)).toBe('รหัส ว่าง');
  });
});
