const COLOR_TO_BIT: Record<string, number> = {
  R: 0,
  G: 1,
  P: 2,
  Y: 3,
  X: 0,
};

const BIT_TO_COLOR = ['R', 'G', 'P', 'Y'];

export const generateSeed = (data: string[][]): string => {
  let seed = '';

  for (const cube of data) {
    let value = 0;

    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const color = cube[faceIndex] || 'R';
      const bit = COLOR_TO_BIT[color] || 0;
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
