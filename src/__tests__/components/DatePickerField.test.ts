import { formatDateOnly, getSafePickerDate } from '../../components/DatePickerField';

describe('DatePickerField date helpers', () => {
  it('formats picked dates as local YYYY-MM-DD values', () => {
    expect(formatDateOnly(new Date('2026-07-15T12:00:00'))).toBe('2026-07-15');
  });

  it('uses the selected date when it is inside the picker bounds', () => {
    const selected = getSafePickerDate(
      '2026-07-15',
      new Date('2026-07-01T12:00:00'),
      new Date('2026-07-31T12:00:00')
    );

    expect(formatDateOnly(selected)).toBe('2026-07-15');
  });

  it('clamps a blank or too-early value to the minimum date before opening native picker', () => {
    const min = new Date('2026-07-15T12:00:00');

    expect(formatDateOnly(getSafePickerDate('', min))).toBe('2026-07-15');
    expect(formatDateOnly(getSafePickerDate('2026-07-01', min))).toBe('2026-07-15');
  });

  it('clamps a too-late value to the maximum date before opening native picker', () => {
    const max = new Date('2026-07-20T12:00:00');

    expect(formatDateOnly(getSafePickerDate('2026-07-30', undefined, max))).toBe('2026-07-20');
  });
});
