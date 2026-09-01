import { describe, expect, it } from 'vitest';
import { generateSeed, parseSeed } from './puzzle';

const PUZZLE = [
  ['P', 'G', 'Y', 'R', 'G', 'R'],
  ['R', 'G', 'G', 'G', 'P', 'Y'],
  ['G', 'Y', 'P', 'R', 'P', 'Y'],
  ['P', 'G', 'R', 'P', 'Y', 'R'],
];

describe('puzzle seed', () => {
  it('round-trips a valid four-cube puzzle', () => {
    const seed = generateSeed(PUZZLE);

    expect(seed).toHaveLength(12);
    expect(parseSeed(seed)).toEqual(PUZZLE);
  });

  it('parses lowercase seeds and ignores separators', () => {
    const seed = generateSeed(PUZZLE);
    const formattedSeed = seed.toLowerCase().match(/.{1,3}/g)?.join('-') ?? '';

    expect(parseSeed(formattedSeed)).toEqual(PUZZLE);
  });

  it('rejects a seed that does not contain twelve hexadecimal digits', () => {
    expect(parseSeed('1234')).toBeNull();
  });
});
