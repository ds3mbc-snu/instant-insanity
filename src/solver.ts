export type Edge = {
  u: string;
  v: string;
  cubeIdx: number;
  pairIdx: number;
};

export type Subgraph = Edge[];

const PUZZLE_COLORS = ['R', 'G', 'P', 'Y'] as const;
type PuzzleColor = (typeof PUZZLE_COLORS)[number];

const OPPOSITE_FACE_PAIRS = [
  [0, 5],
  [1, 3],
  [2, 4],
] as const;

const isPuzzleColor = (color: string): color is PuzzleColor =>
  PUZZLE_COLORS.includes(color as PuzzleColor);

export const extractEdges = (puzzleData: string[][]): Edge[] =>
  puzzleData.flatMap((colors, cubeIdx) =>
    OPPOSITE_FACE_PAIRS.map(([firstFace, secondFace], pairIdx) => ({
      u: colors[firstFace],
      v: colors[secondFace],
      cubeIdx,
      pairIdx,
    })),
  );

const findRegularSubgraphs = (
  edges: Edge[],
  excludedEdges: Edge[] = [],
): Subgraph[] => {
  const excluded = new Set(excludedEdges);
  const cubeEdges = Array.from({ length: 4 }, (_, cubeIdx) =>
    edges.filter((edge) => edge.cubeIdx === cubeIdx && !excluded.has(edge)),
  );

  if (cubeEdges.some((candidates) => candidates.length === 0)) return [];

  const selections: Subgraph[] = [];
  const currentSelection: Edge[] = [];
  const degrees: Record<PuzzleColor, number> = { R: 0, G: 0, P: 0, Y: 0 };

  const selectForCube = (cubeIdx: number) => {
    if (cubeIdx === 4) {
      if (PUZZLE_COLORS.every((color) => degrees[color] === 2)) {
        selections.push([...currentSelection]);
      }
      return;
    }

    for (const edge of cubeEdges[cubeIdx]) {
      if (!isPuzzleColor(edge.u) || !isPuzzleColor(edge.v)) continue;

      degrees[edge.u]++;
      degrees[edge.v]++;
      currentSelection.push(edge);

      if (degrees[edge.u] <= 2 && degrees[edge.v] <= 2) {
        selectForCube(cubeIdx + 1);
      }

      currentSelection.pop();
      degrees[edge.u]--;
      degrees[edge.v]--;
    }
  };

  selectForCube(0);
  return selections;
};

export const findRegularSubgraph = (
  edges: Edge[],
  excludedEdges: Edge[] = [],
): Subgraph | null => findRegularSubgraphs(edges, excludedEdges)[0] ?? null;

export const solveGraph = (puzzleData: string[][]) => {
  if (
    puzzleData.length !== 4
    || puzzleData.some(
      (faces) => faces.length !== 6 || faces.some((color) => !isPuzzleColor(color)),
    )
  ) {
    return null;
  }

  const allEdges = extractEdges(puzzleData);
  const firstSubgraphs = findRegularSubgraphs(allEdges);

  for (const g1 of firstSubgraphs) {
    const g2 = findRegularSubgraph(allEdges, g1);
    if (g2) return { g1, g2, allEdges };
  }

  return null;
};

const getLocalAxisVector = (pairIdx: number) => {
  if (pairIdx === 0) return [0, 1, 0, 0];
  if (pairIdx === 1) return [1, 0, 0, 0];
  if (pairIdx === 2) return [0, 0, 1, 0];
  return null;
};

export const orientGraphSolution = (
  puzzleData: string[][],
  g1: Subgraph,
  g2: Subgraph,
): number[][] | null => {
  const allRotations = getAllRotations();
  const cubeCandidates = puzzleData.map((_, cubeIdx) => {
    const firstEdge = g1.find((edge) => edge.cubeIdx === cubeIdx);
    const secondEdge = g2.find((edge) => edge.cubeIdx === cubeIdx);
    const firstAxis = firstEdge && getLocalAxisVector(firstEdge.pairIdx);
    const secondAxis = secondEdge && getLocalAxisVector(secondEdge.pairIdx);

    if (!firstAxis || !secondAxis) return [];

    return allRotations.filter((matrix) => {
      const firstVector = applyMatrixToVector(matrix, firstAxis);
      const firstOnZ = Math.abs(firstVector[0]) < 0.1
        && Math.abs(firstVector[1]) < 0.1
        && Math.abs(Math.abs(firstVector[2]) - 1) < 0.1;
      const secondVector = applyMatrixToVector(matrix, secondAxis);
      const secondOnX = Math.abs(Math.abs(secondVector[0]) - 1) < 0.1
        && Math.abs(secondVector[1]) < 0.1
        && Math.abs(secondVector[2]) < 0.1;

      return firstOnZ && secondOnX;
    });
  });

  if (cubeCandidates.some((candidates) => candidates.length === 0)) return null;

  const matrices: number[][] = [];
  const usedFrontColors = new Set<string>();
  const usedLeftColors = new Set<string>();

  const orientCube = (cubeIdx: number): boolean => {
    if (cubeIdx === 4) return true;

    for (const matrix of cubeCandidates[cubeIdx]) {
      let frontColor = '';
      let leftColor = '';

      for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
        const worldNormal = applyMatrixToVector(matrix, INITIAL_NORMALS[faceIdx]);
        if (worldNormal[2] > 0.9) frontColor = puzzleData[cubeIdx][faceIdx];
        if (worldNormal[0] < -0.9) leftColor = puzzleData[cubeIdx][faceIdx];
      }

      if (
        !frontColor
        || !leftColor
        || usedFrontColors.has(frontColor)
        || usedLeftColors.has(leftColor)
      ) {
        continue;
      }

      usedFrontColors.add(frontColor);
      usedLeftColors.add(leftColor);
      matrices[cubeIdx] = matrix;

      if (orientCube(cubeIdx + 1)) return true;

      usedFrontColors.delete(frontColor);
      usedLeftColors.delete(leftColor);
    }

    return false;
  };

  return orientCube(0) ? matrices : null;
};
import {
  INITIAL_NORMALS,
  applyMatrixToVector,
  getAllRotations,
} from './rotation';
