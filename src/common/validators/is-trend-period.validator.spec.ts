import { IsTrendPeriod } from './is-trend-period.validator';
import { validateSync } from 'class-validator';

class TestDto {
  granularity?: 'week' | 'month';

  @IsTrendPeriod()
  value!: string;
}

function makeDto(granularity: 'week' | 'month' | undefined, value: string) {
  const dto = new TestDto();
  dto.granularity = granularity;
  dto.value = value;
  return dto;
}

describe('IsTrendPeriod', () => {
  describe('granularity = month', () => {
    it('nên pass với định dạng YYYY-MM hợp lệ', () => {
      const errors = validateSync(makeDto('month', '2026-08'));
      expect(errors).toHaveLength(0);
    });

    it('nên fail nếu truyền định dạng YYYY-MM-DD (sai granularity)', () => {
      const errors = validateSync(makeDto('month', '2026-08-15'));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('nên fail với tháng ngoài khoảng 01-12', () => {
      const errors = validateSync(makeDto('month', '2026-13'));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('nên áp dụng rule month khi không truyền granularity (mặc định)', () => {
      const errors = validateSync(makeDto(undefined, '2026-08'));
      expect(errors).toHaveLength(0);
    });
  });

  describe('granularity = week', () => {
    it('nên pass với ngày hợp lệ định dạng YYYY-MM-DD', () => {
      const errors = validateSync(makeDto('week', '2026-08-30'));
      expect(errors).toHaveLength(0);
    });

    it('nên fail với ngày không tồn tại (2026-09-31)', () => {
      const errors = validateSync(makeDto('week', '2026-09-31'));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('nên fail với ngày không tồn tại ở tháng 2 năm không nhuận (2026-02-30)', () => {
      const errors = validateSync(makeDto('week', '2026-02-30'));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('nên pass với 29/02 của năm nhuận (2028)', () => {
      const errors = validateSync(makeDto('week', '2028-02-29'));
      expect(errors).toHaveLength(0);
    });

    it('nên fail với định dạng sai (thiếu số 0 đệm)', () => {
      const errors = validateSync(makeDto('week', '2026-8-5'));
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
