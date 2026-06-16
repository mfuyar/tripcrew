import { parsePackingNames } from '../../utils/packing';

describe('parsePackingNames', () => {
  it('splits comma, semicolon, and newline separated packing items', () => {
    expect(parsePackingNames('Masa örtüsü, çöp poşeti\nbulaşık süngeri; deterjan')).toEqual([
      'Masa örtüsü',
      'çöp poşeti',
      'bulaşık süngeri',
      'deterjan',
    ]);
  });

  it('trims empty values and removes duplicates case-insensitively', () => {
    expect(parsePackingNames('Towel, towel,  , Soap')).toEqual(['Towel', 'Soap']);
  });
});
