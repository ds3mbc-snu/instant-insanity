import { describe, expect, it } from 'vitest';
import {
  generateSeed,
  getIncompleteFaces,
  isCompletePuzzle,
  normalizePuzzleColorInput,
  parseSeed,
} from './puzzle';

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

  it('rejects seed generation for incomplete or unsupported colors', () => {
    const incompletePuzzle = PUZZLE.map((faces) => [...faces]);
    incompletePuzzle[0][0] = '';
    const unsupportedPuzzle = PUZZLE.map((faces) => [...faces]);
    unsupportedPuzzle[0][0] = 'X';

    expect(() => generateSeed(incompletePuzzle)).toThrow();
    expect(() => generateSeed(unsupportedPuzzle)).toThrow();
  });
});

describe('custom puzzle validation', () => {
  it('normalizes supported colors and rejects every other value', () => {
    expect(normalizePuzzleColorInput('r')).toBe('R');
    expect(normalizePuzzleColorInput('Y')).toBe('Y');
    expect(normalizePuzzleColorInput('X')).toBe('');
    expect(normalizePuzzleColorInput('blue')).toBe('');
  });

  it('reports the exact incomplete face locations', () => {
    const puzzle = PUZZLE.map((faces) => [...faces]);
    puzzle[0][2] = '';
    puzzle[3][5] = 'X';

    expect(isCompletePuzzle(puzzle)).toBe(false);
    expect(getIncompleteFaces(puzzle)).toEqual([
      { cubeIndex: 0, faceIndex: 2 },
      { cubeIndex: 3, faceIndex: 5 },
    ]);
    expect(isCompletePuzzle(PUZZLE)).toBe(true);
  });
});
