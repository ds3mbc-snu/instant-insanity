export const PUZZLE_COLORS = ['R', 'G', 'P', 'Y'] as const;
export type PuzzleColor = (typeof PUZZLE_COLORS)[number];

export type IncompleteFace = {
  cubeIndex: number;
  faceIndex: number;
};

const COLOR_TO_BIT: Record<PuzzleColor, number> = {
  R: 0,
  G: 1,
  P: 2,
  Y: 3,
};

const BIT_TO_COLOR: PuzzleColor[] = [...PUZZLE_COLORS];

export const isPuzzleColor = (value: string): value is PuzzleColor =>
  PUZZLE_COLORS.includes(value as PuzzleColor);

export const normalizePuzzleColorInput = (value: string): PuzzleColor | '' => {
  const color = value.slice(-1).toUpperCase();
  return isPuzzleColor(color) ? color : '';
};

export const getIncompleteFaces = (data: string[][]): IncompleteFace[] => {
  const incompleteFaces: IncompleteFace[] = [];

  for (let cubeIndex = 0; cubeIndex < 4; cubeIndex++) {
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      if (!isPuzzleColor(data[cubeIndex]?.[faceIndex] ?? '')) {
        incompleteFaces.push({ cubeIndex, faceIndex });
      }
    }
  }

  return incompleteFaces;
};

export const isCompletePuzzle = (data: string[][]): boolean =>
  data.length === 4
  && data.every((faces) => faces.length === 6)
  && getIncompleteFaces(data).length === 0;

export const generateSeed = (data: string[][]): string => {
  if (!isCompletePuzzle(data)) {
    throw new Error('A seed can only be generated from a complete R/G/P/Y puzzle.');
  }

  let seed = '';

  for (const cube of data) {
    let value = 0;

    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const color = cube[faceIndex] as PuzzleColor;
      const bit = COLOR_TO_BIT[color];
      value = (value << 2) | bit;
    }

    seed += value.toString(16).toUpperCase().padStart(3, '0');
  }

  return seed;
};

export const parseSeed = (seed: string): string[][] | null => {
  const cleanSeed = seed.replace(/[^0-9A-F]/gi, '').toUpperCase();
  if (cleanSeed.length !== 12) return null;

  const result: string[][] = [];

  for (let cubeIndex = 0; cubeIndex < 4; cubeIndex++) {
    const chunk = cleanSeed.slice(cubeIndex * 3, (cubeIndex + 1) * 3);
    const value = Number.parseInt(chunk, 16);
    const faces: string[] = [];

    for (let faceIndex = 5; faceIndex >= 0; faceIndex--) {
      const bit = (value >> (faceIndex * 2)) & 3;
      faces.push(BIT_TO_COLOR[bit]);
    }

    result.push(faces);
  }

  return result;
};
