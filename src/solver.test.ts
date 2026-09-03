import { describe, expect, it } from 'vitest';
import { parseSeed } from './puzzle';
import {
  applyMatrixToVector,
  getAllRotations,
  getRotationMatrix,
  getSnappedDragAngle,
  IDENTITY_MATRIX,
  INITIAL_NORMALS,
  interpolateRotationMatrix,
  normalizeRotationMatrix,
} from './rotation';
import {
  orientGraphSolution,
  solveGraph,
  type Edge,
  type Subgraph,
} from './solver';

const COLORS = ['R', 'G', 'P', 'Y'];

const PRESET_PUZZLES = [
  [
    ['P', 'G', 'Y', 'R', 'G', 'R'],
    ['R', 'G', 'G', 'G', 'P', 'Y'],
    ['G', 'Y', 'P', 'R', 'P', 'Y'],
    ['P', 'G', 'R', 'P', 'Y', 'R'],
  ],
  [
    ['P', 'R', 'Y', 'G', 'P', 'R'],
    ['R', 'R', 'Y', 'P', 'G', 'Y'],
    ['G', 'P', 'P', 'R', 'Y', 'G'],
    ['P', 'G', 'Y', 'R', 'G', 'Y'],
  ],
  [
    ['Y', 'G', 'R', 'P', 'G', 'R'],
    ['R', 'P', 'G', 'Y', 'R', 'Y'],
    ['G', 'Y', 'P', 'R', 'Y', 'P'],
    ['P', 'R', 'Y', 'G', 'P', 'G'],
  ],
];

const expectRegularSubgraph = (subgraph: Subgraph) => {
  const degrees = Object.fromEntries(COLORS.map((color) => [color, 0]));

  expect(subgraph).toHaveLength(4);
  expect(new Set(subgraph.map((edge) => edge.cubeIdx)).size).toBe(4);

  for (const edge of subgraph) {
    degrees[edge.u]++;
    degrees[edge.v]++;
  }

  expect(degrees).toEqual({ R: 2, G: 2, P: 2, Y: 2 });
};

const expectValidSolution = (solution: {
  g1: Subgraph;
  g2: Subgraph;
  allEdges: Edge[];
} | null) => {
  expect(solution).not.toBeNull();
  if (!solution) return;

  expectRegularSubgraph(solution.g1);
  expectRegularSubgraph(solution.g2);
  expect(solution.g1.some((edge) => solution.g2.includes(edge))).toBe(false);
};

const expectValidOrientation = (
  puzzle: string[][],
  solution: NonNullable<ReturnType<typeof solveGraph>>,
) => {
  const matrices = orientGraphSolution(puzzle, solution.g1, solution.g2);

  expect(matrices).not.toBeNull();
  if (!matrices) return;

  const frontColors = new Set<string>();
  const leftColors = new Set<string>();

  matrices.forEach((matrix, cubeIdx) => {
    INITIAL_NORMALS.forEach((normal, faceIdx) => {
      const worldNormal = applyMatrixToVector(matrix, normal);
      if (worldNormal[2] > 0.9) frontColors.add(puzzle[cubeIdx][faceIdx]);
      if (worldNormal[0] < -0.9) leftColors.add(puzzle[cubeIdx][faceIdx]);
    });
  });

  expect(frontColors).toEqual(new Set(COLORS));
  expect(leftColors).toEqual(new Set(COLORS));
};

describe('graph solver', () => {
  it.each(PRESET_PUZZLES.map((puzzle) => [puzzle]))('solves a preset puzzle', (puzzle) => {
    const solution = solveGraph(puzzle);

    expectValidSolution(solution);
    if (solution) expectValidOrientation(puzzle, solution);
  });

  it('tries another first subgraph when the initial candidate has no partner', () => {
    const puzzle = parseSeed('FD81F29052D3');

    expect(puzzle).not.toBeNull();
    const solution = solveGraph(puzzle ?? []);
    expectValidSolution(solution);
    if (puzzle && solution) expectValidOrientation(puzzle, solution);
  });

  it('rejects a puzzle without two spanning regular subgraphs', () => {
    const puzzle = Array.from({ length: 4 }, () => Array(6).fill('R'));

    expect(solveGraph(puzzle)).toBeNull();
  });

  it('rejects colors outside the supported puzzle palette', () => {
    const puzzle = PRESET_PUZZLES[0].map((faces) => [...faces]);
    puzzle[0][0] = 'X';

    expect(solveGraph(puzzle)).toBeNull();
  });
});

describe('cube rotations', () => {
  it('snaps an unrestricted drag to the nearest quarter turn', () => {
    expect(getSnappedDragAngle(44.9)).toBe(0);
    expect(getSnappedDragAngle(45)).toBe(90);
    expect(getSnappedDragAngle(180)).toBe(180);
    expect(getSnappedDragAngle(280)).toBe(270);
    expect(getSnappedDragAngle(-45)).toBe(-90);
    expect(getSnappedDragAngle(-180)).toBe(-180);
    expect(getSnappedDragAngle(-280)).toBe(-270);
  });

  it('generates all 24 unique cube orientations', () => {
    const rotations = getAllRotations();
    const normalizedMatrices = rotations.map((matrix) =>
      matrix.map((value) => Math.round(value)).join(','),
    );

    expect(rotations).toHaveLength(24);
    expect(new Set(normalizedMatrices).size).toBe(24);
  });

  it('interpolates solution rotations without deforming the cube', () => {
    const halfway = interpolateRotationMatrix(
      IDENTITY_MATRIX,
      getRotationMatrix('y', 180),
      0.5,
    );
    const xAxis = halfway.slice(0, 3);
    const yAxis = halfway.slice(4, 7);
    const zAxis = halfway.slice(8, 11);
    const dot = (a: number[], b: number[]) => a.reduce(
      (sum, value, index) => sum + value * b[index],
      0,
    );
    const determinant =
      xAxis[0] * (yAxis[1] * zAxis[2] - yAxis[2] * zAxis[1])
      - yAxis[0] * (xAxis[1] * zAxis[2] - xAxis[2] * zAxis[1])
      + zAxis[0] * (xAxis[1] * yAxis[2] - xAxis[2] * yAxis[1]);

    expect(Math.hypot(...xAxis)).toBeCloseTo(1, 10);
    expect(Math.hypot(...yAxis)).toBeCloseTo(1, 10);
    expect(Math.hypot(...zAxis)).toBeCloseTo(1, 10);
    expect(dot(xAxis, yAxis)).toBeCloseTo(0, 10);
    expect(dot(xAxis, zAxis)).toBeCloseTo(0, 10);
    expect(dot(yAxis, zAxis)).toBeCloseTo(0, 10);
    expect(determinant).toBeCloseTo(1, 10);
  });

  it('finishes an interpolated rotation on an exact quarter-turn matrix', () => {
    const target = getRotationMatrix('x', 270);

    expect(interpolateRotationMatrix(IDENTITY_MATRIX, target, 1)).toEqual(
      normalizeRotationMatrix(target),
    );
    expect(normalizeRotationMatrix(target).every((value) => [-1, 0, 1].includes(value))).toBe(true);
  });
});
