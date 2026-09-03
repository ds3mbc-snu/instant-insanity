export const IDENTITY_MATRIX = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

export const INITIAL_NORMALS = [
  [0, -1, 0, 0],
  [-1, 0, 0, 0],
  [0, 0, 1, 0],
  [1, 0, 0, 0],
  [0, 0, -1, 0],
  [0, 1, 0, 0],
];

export const multiplyMatrix = (a: number[], b: number[]) => {
  const result = new Array(16).fill(0);

  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      let sum = 0;
      for (let index = 0; index < 4; index++) {
        sum += a[index * 4 + row] * b[column * 4 + index];
      }
      result[column * 4 + row] = sum;
    }
  }

  return result;
};

export const applyMatrixToVector = (matrix: number[], vector: number[]) => {
  const result = [0, 0, 0, 0];

  for (let row = 0; row < 4; row++) {
    let sum = 0;
    for (let column = 0; column < 4; column++) {
      sum += matrix[column * 4 + row] * vector[column];
    }
    result[row] = sum;
  }

  return result;
};

export const getRotationMatrix = (axis: 'x' | 'y' | 'z', angle: number) => {
  const radians = (angle * Math.PI) / 180;
  const sine = Math.sin(radians);
  const cosine = Math.cos(radians);
  const matrix = [...IDENTITY_MATRIX];

  if (axis === 'x') {
    matrix[5] = cosine;
    matrix[9] = -sine;
    matrix[6] = sine;
    matrix[10] = cosine;
  } else if (axis === 'y') {
    matrix[0] = cosine;
    matrix[8] = sine;
    matrix[2] = -sine;
    matrix[10] = cosine;
  } else {
    matrix[0] = cosine;
    matrix[4] = -sine;
    matrix[1] = sine;
    matrix[5] = cosine;
  }

  return matrix;
};

export const getSnappedDragAngle = (angle: number) =>
  Math.sign(angle) * Math.round(Math.abs(angle) / 90) * 90;

export const getAllRotations = () => {
  const rotations: number[][] = [];
  const faceToFront = [
    getRotationMatrix('y', 0),
    getRotationMatrix('y', 180),
    getRotationMatrix('y', -90),
    getRotationMatrix('y', 90),
    getRotationMatrix('x', 90),
    getRotationMatrix('x', -90),
  ];

  for (const frontRotation of faceToFront) {
    for (const angle of [0, 90, 180, 270]) {
      rotations.push(
        multiplyMatrix(getRotationMatrix('z', angle), frontRotation),
      );
    }
  }

  return rotations;
};
