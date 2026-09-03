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

type Quaternion = [number, number, number, number];

const normalizeQuaternion = ([x, y, z, w]: Quaternion): Quaternion => {
  const length = Math.hypot(x, y, z, w) || 1;
  return [x / length, y / length, z / length, w / length];
};

const matrixToQuaternion = (matrix: number[]): Quaternion => {
  const m00 = matrix[0];
  const m01 = matrix[4];
  const m02 = matrix[8];
  const m10 = matrix[1];
  const m11 = matrix[5];
  const m12 = matrix[9];
  const m20 = matrix[2];
  const m21 = matrix[6];
  const m22 = matrix[10];
  const trace = m00 + m11 + m22;

  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    return normalizeQuaternion([
      (m21 - m12) / scale,
      (m02 - m20) / scale,
      (m10 - m01) / scale,
      scale / 4,
    ]);
  }

  if (m00 > m11 && m00 > m22) {
    const scale = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return normalizeQuaternion([
      scale / 4,
      (m01 + m10) / scale,
      (m02 + m20) / scale,
      (m21 - m12) / scale,
    ]);
  }

  if (m11 > m22) {
    const scale = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return normalizeQuaternion([
      (m01 + m10) / scale,
      scale / 4,
      (m12 + m21) / scale,
      (m02 - m20) / scale,
    ]);
  }

  const scale = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return normalizeQuaternion([
    (m02 + m20) / scale,
    (m12 + m21) / scale,
    scale / 4,
    (m10 - m01) / scale,
  ]);
};

const quaternionToMatrix = ([x, y, z, w]: Quaternion) => [
  1 - 2 * (y * y + z * z),
  2 * (x * y + z * w),
  2 * (x * z - y * w),
  0,
  2 * (x * y - z * w),
  1 - 2 * (x * x + z * z),
  2 * (y * z + x * w),
  0,
  2 * (x * z + y * w),
  2 * (y * z - x * w),
  1 - 2 * (x * x + y * y),
  0,
  0, 0, 0, 1,
];

export const normalizeRotationMatrix = (matrix: number[], epsilon = 1e-10) =>
  matrix.map((value) => {
    for (const exactValue of [-1, 0, 1]) {
      if (Math.abs(value - exactValue) < epsilon) return exactValue;
    }
    return value;
  });

export const interpolateRotationMatrix = (
  fromMatrix: number[],
  toMatrix: number[],
  progress: number,
) => {
  if (progress <= 0) return [...fromMatrix];
  if (progress >= 1) return normalizeRotationMatrix(toMatrix);

  const from = matrixToQuaternion(fromMatrix);
  let to = matrixToQuaternion(toMatrix);
  let dot = from.reduce((sum, value, index) => sum + value * to[index], 0);

  if (dot < 0) {
    to = to.map((value) => -value) as Quaternion;
    dot = -dot;
  }

  let interpolated: Quaternion;
  if (dot > 0.9995) {
    interpolated = normalizeQuaternion(
      from.map((value, index) => value + (to[index] - value) * progress) as Quaternion,
    );
  } else {
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    const sine = Math.sin(angle);
    const fromWeight = Math.sin((1 - progress) * angle) / sine;
    const toWeight = Math.sin(progress * angle) / sine;
    interpolated = from.map(
      (value, index) => value * fromWeight + to[index] * toWeight,
    ) as Quaternion;
  }

  return normalizeRotationMatrix(quaternionToMatrix(interpolated));
};

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
