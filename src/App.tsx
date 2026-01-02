import React, { useState, useMemo, useEffect, useRef } from 'react';
import { RotateCcw, Home, Play, Settings, Grid3X3, ChevronLeft, ChevronRight, Check, Lightbulb, X as XIcon, Map as MapIcon } from 'lucide-react';

// ==========================================
// 1. 상수 및 데이터 정의
// ==========================================
const APP_VERSION = "v1.0.5"; // [수정] 버전 업데이트
const CUBE_SIZE = 100;
const GAP = 10;
const DRAG_SENSITIVITY = 0.8; 

const COLORS: Record<string, string> = {
  R: 'bg-orange-600', 
  G: 'bg-emerald-600',   
  B: 'bg-blue-700',    
  Y: 'bg-yellow-400', 
  X: 'bg-neutral-700 border-neutral-600',
};

const GRAPH_COLORS: Record<string, string> = {
  R: '#ea580c', 
  G: '#059669', 
  B: '#1d4ed8', 
  Y: '#facc15', 
};

const INPUT_COLORS: Record<string, string> = {
  R: 'bg-orange-600 text-white',
  G: 'bg-emerald-600 text-white',
  B: 'bg-blue-700 text-white',
  Y: 'bg-yellow-400 text-black', 
  DEFAULT: 'bg-neutral-800 text-neutral-400 border-neutral-600', 
};

const PUZZLE_1 = [
  ['B', 'R', 'Y', 'G', 'B', 'R'], 
  ['R', 'R', 'Y', 'B', 'G', 'Y'], 
  ['G', 'B', 'B', 'R', 'Y', 'G'], 
  ['B', 'G', 'Y', 'R', 'G', 'Y'], 
];

const PUZZLE_2 = [
  ['R', 'B', 'G', 'Y', 'R', 'G'],
  ['Y', 'R', 'B', 'R', 'G', 'Y'],
  ['G', 'Y', 'R', 'B', 'Y', 'B'],
  ['B', 'G', 'Y', 'G', 'R', 'R'],
];

const PUZZLE_3 = [
  ['Y', 'G', 'R', 'B', 'G', 'R'],
  ['R', 'B', 'G', 'Y', 'R', 'Y'],
  ['G', 'Y', 'B', 'R', 'Y', 'B'],
  ['B', 'R', 'Y', 'G', 'B', 'G'],
];

const PUZZLE_CUSTOM_DEFAULT = [
  ['', '', '', '', '', ''],
  ['', '', '', '', '', ''],
  ['', '', '', '', '', ''],
  ['', '', '', '', '', ''],
];

const PRESET_PUZZLES = {
  standard: PUZZLE_1,
  hard: PUZZLE_2,
  expert: PUZZLE_3,
  custom: PUZZLE_CUSTOM_DEFAULT,
};

// ==========================================
// 2. 타입 정의 (Types)
// ==========================================
type Edge = { u: string, v: string, cubeIdx: number, pairIdx: number };
type Subgraph = Edge[];

interface PlatformProps {
  onRotateStart: () => void;
  onRotate: (delta: number) => void;
  onRotateEnd: () => void;
}

// ==========================================
// 3. 유틸리티 함수 (Math & Logic)
// ==========================================
const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const multiplyMatrix = (a: number[], b: number[]) => {
  const out = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) { 
    for (let j = 0; j < 4; j++) { 
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + i] * b[j * 4 + k];
      out[j * 4 + i] = sum;
    }
  }
  return out;
};

const applyMatrixToVector = (m: number[], v: number[]) => {
  const out = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    let sum = 0;
    for (let j = 0; j < 4; j++) sum += m[j * 4 + i] * v[j];
    out[i] = sum;
  }
  return out;
};

const getRotationMatrix = (axis: 'x' | 'y' | 'z', angle: number) => {
  const rad = (angle * Math.PI) / 180;
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  const m = [...IDENTITY_MATRIX];
  if (axis === 'x') { m[5] = c; m[9] = -s; m[6] = s; m[10] = c; }
  else if (axis === 'y') { m[0] = c; m[8] = s; m[2] = -s; m[10] = c; }
  else { m[0] = c; m[4] = -s; m[1] = s; m[5] = c; }
  return m;
};

const getAllRotations = () => {
  const rotations: number[][] = [];
  const faceToFront = [
    getRotationMatrix('y', 0),    
    getRotationMatrix('y', 180),  
    getRotationMatrix('y', -90),  
    getRotationMatrix('y', 90),   
    getRotationMatrix('x', 90),   
    getRotationMatrix('x', -90),  
  ];

  faceToFront.forEach(m1 => {
    [0, 90, 180, 270].forEach(angle => {
      const m2 = getRotationMatrix('z', angle);
      rotations.push(multiplyMatrix(m2, m1));
    });
  });
  
  return rotations;
};

const INITIAL_NORMALS = [
  [0, -1, 0, 0], [-1, 0, 0, 0], [0, 0, 1, 0], 
  [1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0]
];

// --- Graph Solver Logic ---
const extractEdges = (puzzleData: string[][]): Edge[] => {
  const edges: Edge[] = [];
  puzzleData.forEach((colors, cubeIdx) => {
    const pairs = [[0, 5], [1, 3], [2, 4]];
    pairs.forEach((p, pairIdx) => {
      edges.push({ u: colors[p[0]], v: colors[p[1]], cubeIdx, pairIdx });
    });
  });
  return edges;
};

const findRegularSubgraph = (edges: Edge[], excludedEdges: Edge[] = []): Subgraph | null => {
  const cubeEdges = [0, 1, 2, 3].map(c => 
    edges.filter(e => e.cubeIdx === c && !excludedEdges.includes(e))
  );

  const currentSelection: Edge[] = [];
  const degrees: Record<string, number> = {};

  const solve = (depth: number): boolean => {
    if (depth === 4) {
      return Object.values(degrees).every(d => d === 2);
    }

    for (const edge of cubeEdges[depth]) {
      degrees[edge.u] = (degrees[edge.u] || 0) + 1;
      degrees[edge.v] = (degrees[edge.v] || 0) + 1;
      currentSelection.push(edge);

      if (degrees[edge.u] <= 2 && degrees[edge.v] <= 2) {
        if (solve(depth + 1)) return true;
      }

      currentSelection.pop();
      degrees[edge.u]--;
      degrees[edge.v]--;
    }
    return false;
  };

  if (solve(0)) return [...currentSelection];
  return null;
};

const solveGraph = (puzzleData: string[][]) => {
  const allEdges = extractEdges(puzzleData);
  const g1 = findRegularSubgraph(allEdges);
  if (!g1) return null;
  const g2 = findRegularSubgraph(allEdges, g1);
  if (!g2) return null;
  return { g1, g2, allEdges };
};

// ==========================================
// 4. 서브 컴포넌트 (UI Parts)
// ==========================================

const HintPanel = ({ 
  puzzleData, 
  onClose, 
  onApply 
}: { 
  puzzleData: string[][], 
  onClose: () => void, 
  onApply: (g1: Subgraph, g2: Subgraph) => void 
}) => {
  const [step, setStep] = useState(1);
  const solution = useMemo(() => solveGraph(puzzleData), [puzzleData]);

  const nodes = ['R', 'G', 'B', 'Y'];
  const nodePos = {
    R: { x: 50, y: 50 },
    G: { x: 250, y: 50 },
    B: { x: 250, y: 250 },
    Y: { x: 50, y: 250 },
  };

  const renderEdges = (edges: Edge[], highlight: boolean = false, type: 'g1'|'g2'|'none' = 'none') => {
    return edges.map((e, i) => {
      const p1 = nodePos[e.u as keyof typeof nodePos];
      const p2 = nodePos[e.v as keyof typeof nodePos];
      if(!p1 || !p2) return null;

      const isLoop = e.u === e.v;
      const offset = (e.cubeIdx - 1.5) * 40;
      
      let pathD = '';
      if (isLoop) {
        pathD = `M ${p1.x} ${p1.y} C ${p1.x-50-offset} ${p1.y-50}, ${p1.x+50+offset} ${p1.y-50}, ${p1.x} ${p1.y}`;
      } else {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const normX = -dy;
        const normY = dx;
        const len = Math.sqrt(normX*normX + normY*normY);
        const cpX = mx + (normX/len) * offset;
        const cpY = my + (normY/len) * offset;
        pathD = `M ${p1.x} ${p1.y} Q ${cpX} ${cpY} ${p2.x} ${p2.y}`;
      }

      const strokeColor = type === 'g1' ? '#ef4444' : type === 'g2' ? '#3b82f6' : '#525252';
      const strokeWidth = highlight ? 4 : 2;
      const opacity = highlight ? 1 : 0.3;

      return (
        <g key={i}>
          <path d={pathD} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" opacity={opacity} />
          {!isLoop && highlight && (
             <text x={(p1.x+p2.x)/2 + (e.cubeIdx-1.5)*10} y={(p1.y+p2.y)/2 + (e.cubeIdx-1.5)*10} fill="white" fontSize="12" textAnchor="middle">
               {e.cubeIdx + 1}
             </text>
          )}
        </g>
      );
    });
  };

  return (
    <div className="absolute top-4 left-4 right-4 md:right-4 md:left-auto md:w-80 z-30 bg-neutral-900/90 backdrop-blur-xl border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all max-h-[60vh] md:max-h-none">
      <div className="flex items-center justify-between p-4 border-b border-neutral-700">
        <h3 className="text-white font-bold flex items-center gap-2">
          <Lightbulb size={20} className="text-yellow-400" />
          Hint Mode
        </h3>
        <button onClick={onClose} className="text-neutral-400 hover:text-white">
          <XIcon size={20} />
        </button>
      </div>

      <div className="p-4 flex-1 flex flex-col items-center justify-center min-h-[200px] overflow-y-auto">
        {!solution ? (
          <div className="text-red-400 text-center">
            <p className="font-bold">No Solution Found!</p>
            <p className="text-sm">이 퍼즐은 해답이 없습니다.</p>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div className="w-full">
                <p className="text-neutral-300 text-sm mb-2 text-center">Step 1: 전체 그래프 생성</p>
                <p className="text-neutral-500 text-xs mb-4 text-center">각 큐브의 마주 보는 면을 연결합니다.</p>
                <svg width="100%" height="200" viewBox="0 0 300 300" className="mx-auto bg-neutral-800 rounded-lg">
                  {renderEdges(solution.allEdges, true)}
                  {nodes.map(n => (
                    <circle key={n} cx={nodePos[n as keyof typeof nodePos].x} cy={nodePos[n as keyof typeof nodePos].y} r="18" fill={GRAPH_COLORS[n]} stroke="white" strokeWidth="2" />
                  ))}
                  {nodes.map(n => (
                    <text key={n+"t"} x={nodePos[n as keyof typeof nodePos].x} y={nodePos[n as keyof typeof nodePos].y} dy="5" textAnchor="middle" fill="white" fontWeight="bold">{n}</text>
                  ))}
                </svg>
              </div>
            )}

            {step === 2 && (
              <div className="w-full">
                <p className="text-neutral-300 text-sm mb-2 text-center">Step 2: 부분 그래프 분해</p>
                <div className="grid grid-cols-2 gap-2 h-[200px]">
                  <div className="bg-neutral-800 rounded-lg p-1 flex flex-col items-center">
                    <span className="text-red-400 text-xs font-bold mb-1">G1 (앞-뒤)</span>
                    <svg width="100%" height="100%" viewBox="0 0 300 300">
                      {renderEdges(solution.g1, true, 'g1')}
                      {nodes.map(n => (
                        <circle key={n} cx={nodePos[n as keyof typeof nodePos].x} cy={nodePos[n as keyof typeof nodePos].y} r="15" fill={GRAPH_COLORS[n]} />
                      ))}
                    </svg>
                  </div>
                  <div className="bg-neutral-800 rounded-lg p-1 flex flex-col items-center">
                    <span className="text-blue-400 text-xs font-bold mb-1">G2 (좌-우)</span>
                    <svg width="100%" height="100%" viewBox="0 0 300 300">
                      {renderEdges(solution.g2, true, 'g2')}
                      {nodes.map(n => (
                        <circle key={n} cx={nodePos[n as keyof typeof nodePos].x} cy={nodePos[n as keyof typeof nodePos].y} r="15" fill={GRAPH_COLORS[n]} />
                      ))}
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="text-center space-y-6 py-4">
                <p className="text-neutral-300 text-sm">Step 3: 솔루션 적용</p>
                <div className="bg-neutral-800 p-4 rounded-xl">
                  <Check className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <p className="text-white font-bold">해답을 찾았습니다!</p>
                  <p className="text-neutral-400 text-xs mt-1">큐브를 자동으로 회전시킵니다.</p>
                </div>
                <button 
                  onClick={() => onApply(solution.g1, solution.g2)}
                  className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-full font-bold shadow-lg w-full flex items-center justify-center gap-2"
                >
                  <Play size={18} fill="currentColor" />
                  Apply Solution
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {solution && (
        <div className="p-4 border-t border-neutral-700 flex justify-between">
          <button 
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="p-2 rounded-full hover:bg-neutral-800 disabled:opacity-30 text-white transition-colors"
          >
            <ChevronLeft />
          </button>
          
          <div className="flex gap-2 items-center">
            {[1, 2, 3].map(i => (
              <div key={i} className={`w-2 h-2 rounded-full ${step === i ? 'bg-white' : 'bg-neutral-600'}`} />
            ))}
          </div>

          <button 
            onClick={() => setStep(Math.min(3, step + 1))}
            disabled={step === 3}
            className="p-2 rounded-full hover:bg-neutral-800 disabled:opacity-30 text-white transition-colors"
          >
            <ChevronRight />
          </button>
        </div>
      )}
    </div>
  );
};

const PuzzleMapOverlay = ({ puzzleData, onClose }: { puzzleData: string[][], onClose: () => void }) => {
  return (
    <div className="absolute top-4 left-4 right-4 md:right-auto md:w-64 z-30 max-h-[60vh] overflow-y-auto bg-neutral-900/90 backdrop-blur-xl border border-neutral-700 rounded-2xl shadow-2xl p-4 flex flex-col gap-6 scrollbar-hide">
       <div className="flex items-center justify-between border-b border-neutral-700 pb-2">
        <h3 className="text-white font-bold flex items-center gap-2">
          <MapIcon size={18} className="text-blue-400" />
          Puzzle Map
        </h3>
        <button onClick={onClose} className="text-neutral-400 hover:text-white">
          <XIcon size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {puzzleData.map((faces, idx) => (
          <div key={idx} className="bg-neutral-800/50 p-2 rounded-lg border border-neutral-700/50">
            <div className="text-xs text-neutral-400 mb-2 ml-1 font-mono">Cube {idx + 1}</div>
            <div className="grid grid-cols-4 gap-1 w-max mx-auto transform scale-90 origin-top">
              <div className="col-start-2">
                <div className={`w-6 h-6 border border-black/30 rounded-sm ${COLORS[faces[0]]}`} />
              </div>
              <div className="col-start-1 row-start-2">
                <div className={`w-6 h-6 border border-black/30 rounded-sm ${COLORS[faces[1]]}`} />
              </div>
              <div className="col-start-2 row-start-2">
                <div className={`w-6 h-6 border border-black/30 rounded-sm ${COLORS[faces[2]]}`} />
              </div>
              <div className="col-start-3 row-start-2">
                <div className={`w-6 h-6 border border-black/30 rounded-sm ${COLORS[faces[3]]}`} />
              </div>
              <div className="col-start-4 row-start-2">
                <div className={`w-6 h-6 border border-black/30 rounded-sm ${COLORS[faces[4]]}`} />
              </div>
              <div className="col-start-2 row-start-3">
                <div className={`w-6 h-6 border border-black/30 rounded-sm ${COLORS[faces[5]]}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ==========================================
// 5. 메인 컴포넌트 (Components)
// ==========================================

const Platform = ({ onRotateStart, onRotate, onRotateEnd }: PlatformProps) => {
  // [수정] useRef 사용으로 성능 및 반응성 개선
  const startX = useRef(0);
  const isDragging = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    
    isDragging.current = true;
    startX.current = e.clientX;
    onRotateStart();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    
    const diffX = e.clientX - startX.current;
    if (diffX === 0) return;

    onRotate(diffX * DRAG_SENSITIVITY);
    startX.current = e.clientX; // 기준점 갱신
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    
    isDragging.current = false;
    onRotateEnd();
  };

  const lastCubeIndex = 3; 
  const bottomCubeY = (lastCubeIndex - 1.5) * (CUBE_SIZE + GAP);
  const platformY = bottomCubeY + CUBE_SIZE / 2;

  return (
    <div
      className="absolute flex items-center justify-center touch-none"
      style={{
        transformStyle: 'preserve-3d',
        transform: `translateY(${platformY}px) rotateX(90deg)`,
        width: '320px',
        height: '320px',
        cursor: 'grab', // 드래그 중인 커서는 전역적으로 제어하거나 단순화
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="absolute w-full h-full rounded-full bg-neutral-700 border-4 border-neutral-600 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center pointer-events-none">
         <div className="w-2/3 h-2/3 rounded-full border-2 border-neutral-600/50 border-dashed" />
      </div>
      <div className="absolute w-full h-full rounded-full bg-neutral-800 translate-z-[-10px] pointer-events-none" />
      <div className="absolute w-full h-full rounded-full bg-neutral-800 translate-z-[-20px] shadow-xl pointer-events-none" />
      <div className="absolute text-white/20 font-bold text-4xl select-none animate-pulse pointer-events-none">⟲ ⟳</div>
    </div>
  );
};

const Cube = ({ 
  id, 
  colors, 
  matrix, 
  towerRotation,
  onRotate 
}: { 
  id: number; 
  colors: string[]; 
  matrix: number[]; 
  towerRotation: number;
  onRotate: (id: number, newMatrix: number[]) => void;
}) => {
  // [수정] 드래그 추적을 useRef로 변경
  const startPos = useRef({ x: 0, y: 0 });
  const [currentDragAngle, setCurrentDragAngle] = useState<{ axis: 'x' | 'y' | 'z', val: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false); // UI 상태용
  
  const activeAxis = useRef<'x' | 'y' | 'z' | null>(null);
  const rotationSign = useRef(1);
  const touchedFaceIndex = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    
    const target = e.target as HTMLElement;
    const faceEl = target.closest('[data-face-index]');
    const faceIndex = faceEl ? parseInt(faceEl.getAttribute('data-face-index') || '0', 10) : 0;
    
    touchedFaceIndex.current = faceIndex;
    startPos.current = { x: e.clientX, y: e.clientY };
    activeAxis.current = null;
    rotationSign.current = 1;
    
    setIsDragging(true);
    setCurrentDragAngle(null);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.preventDefault();

    const diffX = e.clientX - startPos.current.x;
    const diffY = e.clientY - startPos.current.y;

    if (!activeAxis.current) {
      if (Math.abs(diffX) < 5 && Math.abs(diffY) < 5) return;

      const initialNormal = INITIAL_NORMALS[touchedFaceIndex.current || 0];
      const towerRotMatrix = getRotationMatrix('y', towerRotation);
      const cubeWorldMatrix = multiplyMatrix(towerRotMatrix, matrix);
      const worldNormal = applyMatrixToVector(cubeWorldMatrix, initialNormal);
      
      const nx = worldNormal[0];
      const ny = worldNormal[1];
      const nz = worldNormal[2];

      const absX = Math.abs(nx);
      const absY = Math.abs(ny);
      const absZ = Math.abs(nz);
      const max = Math.max(absX, absY, absZ);

      let targetWorldAxis: 'x' | 'y' | 'z' = 'y';
      let worldSign = 1;
      let shouldUseHorizontalDrag = false;

      const isHorz = Math.abs(diffX) > Math.abs(diffY);

      if (max === absY) {
        if (isHorz) {
          targetWorldAxis = 'z';
          shouldUseHorizontalDrag = true;
          worldSign = 1;
        } else {
          targetWorldAxis = 'x';
          worldSign = ny < 0 ? -1 : 1;
        }
      } 
      else if (max === absX) {
        if (isHorz) {
          targetWorldAxis = 'y';
          shouldUseHorizontalDrag = true;
          worldSign = 1; 
        } else {
          targetWorldAxis = 'z';
          worldSign = nx > 0 ? 1 : -1;
        }
      } 
      else {
        if (isHorz) {
          targetWorldAxis = 'y';
          shouldUseHorizontalDrag = true;
          worldSign = 1;
        } else {
          targetWorldAxis = 'x';
          worldSign = nz > 0 ? -1 : 1;
        }
      }

      const invTowerMatrix = getRotationMatrix('y', -towerRotation);
      let worldAxisVec = [0,0,0,0];
      if (targetWorldAxis === 'x') worldAxisVec = [1,0,0,0];
      if (targetWorldAxis === 'y') worldAxisVec = [0,1,0,0];
      if (targetWorldAxis === 'z') worldAxisVec = [0,0,1,0];

      const localAxisVec = applyMatrixToVector(invTowerMatrix, worldAxisVec);
      
      const lx = localAxisVec[0];
      const ly = localAxisVec[1];
      const lz = localAxisVec[2];
      const maxL = Math.max(Math.abs(lx), Math.abs(ly), Math.abs(lz));

      let finalAxis: 'x'|'y'|'z' = 'x';
      let mappingSign = 1;

      if (maxL === Math.abs(lx)) {
        finalAxis = 'x';
        mappingSign = lx >= 0 ? 1 : -1;
      } else if (maxL === Math.abs(ly)) {
        finalAxis = 'y';
        mappingSign = ly >= 0 ? 1 : -1;
      } else {
        finalAxis = 'z';
        mappingSign = lz >= 0 ? 1 : -1;
      }

      activeAxis.current = finalAxis;
      rotationSign.current = worldSign * mappingSign * (shouldUseHorizontalDrag ? 1 : 1);
      return;
    }

    const isHorz = Math.abs(diffX) > Math.abs(diffY);
    let val = isHorz ? diffX : diffY;
    const delta = val * DRAG_SENSITIVITY * rotationSign.current;

    setCurrentDragAngle({ axis: activeAxis.current, val: delta });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    
    setIsDragging(false);
    
    if (currentDragAngle && activeAxis.current) {
      const snapAngle = Math.round(currentDragAngle.val / 90) * 90;
      if (snapAngle !== 0) {
        const rotMat = getRotationMatrix(activeAxis.current, snapAngle);
        const newMatrix = multiplyMatrix(rotMat, matrix);
        onRotate(id, newMatrix);
      }
    }

    activeAxis.current = null;
    setCurrentDragAngle(null);
  };

  let displayMatrix = matrix;
  if (isDragging && currentDragAngle) {
    const tempRot = getRotationMatrix(currentDragAngle.axis, currentDragAngle.val);
    displayMatrix = multiplyMatrix(tempRot, matrix);
  }

  const halfSize = CUBE_SIZE / 2 - 0.5;

  return (
    <div 
      className="absolute cursor-grab active:cursor-grabbing touch-none"
      style={{
        width: `${CUBE_SIZE}px`,
        height: `${CUBE_SIZE}px`,
        transformStyle: 'preserve-3d',
        transform: `translateY(${(id - 1.5) * (CUBE_SIZE + GAP)}px) matrix3d(${displayMatrix.join(',')})`,
        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
        zIndex: isDragging ? 100 : 10,
      }}
    >
      <CubeFace index={0} color={colors[0]} transform={`rotateX(90deg) translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />
      <CubeFace index={1} color={colors[1]} transform={`rotateY(-90deg) translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />
      <CubeFace index={2} color={colors[2]} transform={`translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />
      <CubeFace index={3} color={colors[3]} transform={`rotateY(90deg) translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />
      <CubeFace index={4} color={colors[4]} transform={`rotateY(180deg) translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />
      <CubeFace index={5} color={colors[5]} transform={`rotateX(-90deg) translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />
    </div>
  );
};

const CubeFace = ({ 
  index, color, transform, 
  onPointerDown, onPointerMove, onPointerUp 
}: { 
  index: number, color: string, transform: string,
  onPointerDown: (e: React.PointerEvent) => void,
  onPointerMove: (e: React.PointerEvent) => void,
  onPointerUp: (e: React.PointerEvent) => void
}) => {
  return (
    <div
      data-face-index={index}
      className={`absolute w-full h-full border-[3px] border-black flex items-center justify-center box-border touch-none ${COLORS[color]}`}
      style={{ 
        transform, 
        backfaceVisibility: 'hidden', 
        WebkitBackfaceVisibility: 'hidden',
        outline: '2px solid black'
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp} 
    >
      <div className="w-full h-full bg-gradient-to-br from-white/30 to-black/10 pointer-events-none absolute inset-0" />
    </div>
  );
};

// --- FaceInput for Editor ---
const FaceInput = ({ value, onChange, label, onPaste }: { value: string, onChange: (v: string) => void, label: string, onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void }) => {
  const style = INPUT_COLORS[value] || INPUT_COLORS.DEFAULT;
  
  return (
    <div className="flex flex-col items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        maxLength={1}
        className={`w-12 h-12 text-center text-xl font-bold uppercase rounded-md border-2 focus:outline-none focus:border-white transition-colors ${style}`}
      />
      <span className="text-[10px] text-neutral-500 uppercase">{label}</span>
    </div>
  );
};

// --- CustomPuzzleEditor Component ---
const CustomPuzzleEditor = ({ onStart, onBack }: { onStart: (data: string[][]) => void, onBack: () => void }) => {
  const [puzzleData, setPuzzleData] = useState<string[][]>(
    PRESET_PUZZLES.custom.map(row => [...row])
  );

  const handleInputChange = (cubeIndex: number, faceIndex: number, val: string) => {
    const char = val.slice(-1).toUpperCase(); 
    const newData = [...puzzleData];
    newData[cubeIndex] = [...newData[cubeIndex]];
    newData[cubeIndex][faceIndex] = char;
    setPuzzleData(newData);
  };

  const handlePaste = (cubeIndex: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text').replace(/[^a-zA-Z]/g, '').toUpperCase();
    
    if (pastedText.length === 6) {
      e.preventDefault(); 
      const newData = [...puzzleData];
      newData[cubeIndex] = pastedText.split(''); 
      setPuzzleData(newData);
    }
  };

  const handlePlay = () => {
    const filledData = puzzleData.map(row => 
      row.map(cell => cell || 'X')
    );
    onStart(filledData);
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-neutral-900 overflow-hidden overscroll-none touch-none flex flex-col">
      <div className="w-full flex-none flex items-center justify-between p-6">
        <button onClick={onBack} className="p-2 text-white hover:bg-white/10 rounded-full">
          <ChevronLeft size={32} />
        </button>
        <h2 className="text-2xl font-bold text-white">Custom Puzzle Editor</h2>
        <div className="w-10"></div> 
      </div>

      <div className="flex-1 w-full overflow-y-auto p-6 pb-32">
        <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto">
          {puzzleData.map((cubeFaces, cubeIdx) => (
            <div key={cubeIdx} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
              <h3 className="text-white font-bold mb-4 ml-2">Cube {cubeIdx + 1}</h3>
              
              <div className="grid grid-cols-4 gap-2 w-max mx-auto">
                <div className="col-start-2">
                  <FaceInput 
                    value={cubeFaces[0]} 
                    onChange={(v) => handleInputChange(cubeIdx, 0, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Top"
                  />
                </div>
                <div className="col-start-1 row-start-2">
                  <FaceInput 
                    value={cubeFaces[1]} 
                    onChange={(v) => handleInputChange(cubeIdx, 1, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Left"
                  />
                </div>
                <div className="col-start-2 row-start-2">
                  <FaceInput 
                    value={cubeFaces[2]} 
                    onChange={(v) => handleInputChange(cubeIdx, 2, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Front"
                  />
                </div>
                <div className="col-start-3 row-start-2">
                  <FaceInput 
                    value={cubeFaces[3]} 
                    onChange={(v) => handleInputChange(cubeIdx, 3, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Right"
                  />
                </div>
                <div className="col-start-4 row-start-2">
                  <FaceInput 
                    value={cubeFaces[4]} 
                    onChange={(v) => handleInputChange(cubeIdx, 4, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Back"
                  />
                </div>
                <div className="col-start-2 row-start-3">
                  <FaceInput 
                    value={cubeFaces[5]} 
                    onChange={(v) => handleInputChange(cubeIdx, 5, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Bottom"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button 
        onClick={handlePlay}
        className="fixed bottom-8 right-8 bg-green-600 text-white p-4 rounded-full shadow-2xl hover:bg-green-500 transition-all active:scale-95 flex items-center gap-2 font-bold pr-6 z-50"
      >
        <div className="bg-white/20 p-2 rounded-full">
          <Check size={24} />
        </div>
        START GAME
      </button>
    </div>
  );
};

// --- HomeScreen Component ---
const HomeScreen = ({ onStart, onCustom }: { onStart: (data: string[][]) => void, onCustom: () => void }) => {
  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-neutral-900 overflow-hidden touch-none overscroll-none flex flex-col items-center justify-center p-6 space-y-12">
      <div className="absolute top-2 left-2 text-xs text-neutral-600 font-mono z-10 select-none">
        {APP_VERSION}
      </div>

      <div className="text-center space-y-2 animate-fade-in-up">
        <h1 className="text-5xl md:text-7xl font-black text-white tracking-widest drop-shadow-2xl" style={{ fontFamily: 'Impact, sans-serif' }}>
          INSTANT<br/>INSANITY
        </h1>
        <p className="text-neutral-400 text-lg">4개의 큐브, 4개의 면, 하나의 정답</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {/* Puzzle 1 */}
        <button 
          onClick={() => onStart(PRESET_PUZZLES.standard)}
          className="w-full group relative overflow-hidden rounded-xl bg-blue-600 p-4 transition-all hover:bg-blue-500 active:scale-95 shadow-lg shadow-blue-900/20"
        >
          <div className="flex items-center justify-center gap-3 relative z-10">
            <Grid3X3 className="w-6 h-6 text-white" />
            <span className="text-xl font-bold text-white">Puzzle 1</span>
          </div>
        </button>
        
        {/* Puzzle 2 */}
        <button 
          onClick={() => onStart(PRESET_PUZZLES.hard)}
          className="w-full rounded-xl bg-orange-600 p-4 transition-all hover:bg-orange-500 active:scale-95 shadow-lg shadow-orange-900/20 flex items-center justify-center gap-3"
        >
          <Grid3X3 className="w-5 h-5 text-white" />
          <span className="text-lg font-bold text-white">Puzzle 2</span>
        </button>

        {/* Puzzle 3 */}
        <button 
          onClick={() => onStart(PRESET_PUZZLES.expert)}
          className="w-full rounded-xl bg-purple-600 p-4 transition-all hover:bg-purple-500 active:scale-95 shadow-lg shadow-purple-900/20 flex items-center justify-center gap-3"
        >
          <Grid3X3 className="w-5 h-5 text-white" />
          <span className="text-lg font-bold text-white">Puzzle 3</span>
        </button>

        {/* Custom */}
        <button 
          onClick={onCustom}
          className="w-full rounded-xl bg-neutral-800 p-4 border-2 border-neutral-700 flex items-center justify-center gap-3 hover:bg-neutral-700 active:scale-95 transition-all"
        >
          <Settings className="w-5 h-5 text-neutral-400" />
          <span className="text-lg font-bold text-neutral-300">Custom Puzzle</span>
        </button>
      </div>
      
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.8s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

// --- GameScreen Component ---
const GameScreen = ({ puzzleData, onHome }: { puzzleData: string[][], onHome: () => void }) => {
  const [cubeMatrices, setCubeMatrices] = useState<number[][]>(
    puzzleData.map(() => [...IDENTITY_MATRIX])
  );
  const [towerRotation, setTowerRotation] = useState(0);
  const [isTowerDragging, setIsTowerDragging] = useState(false);
  
  const [showHint, setShowHint] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const isOverlayOpen = showHint || showMap;

  // [수정] document 레벨 스크롤 방지 (Safari 대응)
  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      // 힌트/맵 오버레이 내부 스크롤은 허용하되, 그 외 영역은 막음
      const target = e.target as HTMLElement;
      if (target.closest('.overflow-y-auto')) return;
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => document.removeEventListener('touchmove', preventScroll);
  }, []);

  const handleRotate = (id: number, newMatrix: number[]) => {
    setCubeMatrices(prev => {
      const next = [...prev];
      next[id] = newMatrix;
      return next;
    });
  };

  const handleReset = () => {
    setCubeMatrices(puzzleData.map(() => [...IDENTITY_MATRIX]));
    setTowerRotation(0);
    setShowHint(false);
    setShowMap(false);
  };

  const applySolution = (g1: Subgraph, g2: Subgraph) => {
    const allRotations = getAllRotations();
    
    const getLocalAxisVector = (pairIdx: number) => {
      if (pairIdx === 0) return [0, 1, 0, 0]; // Y
      if (pairIdx === 1) return [1, 0, 0, 0]; // X
      if (pairIdx === 2) return [0, 0, 1, 0]; // Z
      return [0, 0, 0, 0];
    };

    const cubeCandidates = puzzleData.map((_, cubeIdx) => {
      const e1 = g1.find(e => e.cubeIdx === cubeIdx); 
      const e2 = g2.find(e => e.cubeIdx === cubeIdx); 
      
      if (!e1 || !e2) return [IDENTITY_MATRIX];

      const axis1 = getLocalAxisVector(e1.pairIdx); 
      const axis2 = getLocalAxisVector(e2.pairIdx); 

      const candidates: number[][] = [];

      for (const m of allRotations) {
        const v1 = applyMatrixToVector(m, axis1);
        const onZ = Math.abs(v1[0]) < 0.1 && Math.abs(v1[1]) < 0.1 && Math.abs(Math.abs(v1[2]) - 1) < 0.1;
        const v2 = applyMatrixToVector(m, axis2);
        const onX = Math.abs(Math.abs(v2[0]) - 1) < 0.1 && Math.abs(v2[1]) < 0.1 && Math.abs(v2[2]) < 0.1;

        if (onZ && onX) candidates.push(m);
      }
      return candidates;
    });

    const finalSolution: number[][] = [];
    
    const solveOrientation = (depth: number, usedFront: Record<string, number>, usedLeft: Record<string, number>): boolean => {
      if (depth === 4) return true;

      const candidates = cubeCandidates[depth];
      const currentColors = puzzleData[depth];

      for (const m of candidates) {
        let frontColor = '';
        let leftColor = '';

        for (let i = 0; i < 6; i++) {
          const worldNormal = applyMatrixToVector(m, INITIAL_NORMALS[i]);
          if (worldNormal[2] > 0.9) frontColor = currentColors[i];
          if (worldNormal[0] < -0.9) leftColor = currentColors[i];
        }

        if (usedFront[frontColor] || usedLeft[leftColor]) continue;

        usedFront[frontColor] = 1;
        usedLeft[leftColor] = 1;
        finalSolution[depth] = m;

        if (solveOrientation(depth + 1, usedFront, usedLeft)) return true;

        usedFront[frontColor] = 0;
        usedLeft[leftColor] = 0;
      }
      return false;
    };

    if (solveOrientation(0, {}, {})) {
      setCubeMatrices([...finalSolution]);
      setTowerRotation(0);
      setShowHint(false);
    } else {
      alert("해답 적용 중 오류가 발생했습니다. (유효한 방향 조합 없음)");
    }
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-neutral-900 overflow-hidden touch-none overscroll-none flex flex-col items-center justify-center">
      
      {/* [수정] 글로벌 스타일 주입 - 사파리 스크롤 방지 */}
      <style>{`
        html, body, #root {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
          touch-action: none;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }
      `}</style>

      <div className="absolute top-2 left-2 text-xs text-neutral-600 font-mono z-10 select-none">
        {APP_VERSION}
      </div>

      {showHint && (
        <HintPanel 
          puzzleData={puzzleData} 
          onClose={() => setShowHint(false)} 
          onApply={applySolution}
        />
      )}

      {showMap && (
        <PuzzleMapOverlay
          puzzleData={puzzleData}
          onClose={() => setShowMap(false)}
        />
      )}

      {/* 3D Viewport - [수정] 오버레이가 열리면 더 많이 내림 */}
      <div 
        className={`relative w-64 h-96 perspective-container transition-transform duration-300 ${isOverlayOpen ? 'scale-75 translate-y-48 md:translate-y-0 md:scale-100' : '-translate-y-24 md:translate-y-0'}`} 
        style={{ perspective: '1200px' }}
      >
        <div className="w-full h-full relative preserve-3d flex items-center justify-center" style={{ transform: 'rotateX(-20deg) rotateY(-30deg)' }}>
          <div className="w-full h-full relative preserve-3d flex items-center justify-center" 
               style={{ transform: `rotateY(${towerRotation}deg)`, transition: isTowerDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
            {puzzleData.map((colors, idx) => (
              <Cube key={idx} id={idx} colors={colors} matrix={cubeMatrices[idx]} towerRotation={towerRotation} onRotate={handleRotate} />
            ))}
            <Platform onRotateStart={() => setIsTowerDragging(true)} onRotate={(delta) => setTowerRotation(prev => prev + delta)} onRotateEnd={() => { setIsTowerDragging(false); setTowerRotation(prev => Math.round(prev / 90) * 90); }} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-12 flex items-center gap-6 z-20">
        <button onClick={onHome} className="w-14 h-14 bg-neutral-700 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform border-2 border-neutral-600 hover:bg-neutral-600">
          <Home size={24} />
        </button>
        
        <button onClick={handleReset} className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-900/50 active:scale-95 transition-transform border-2 border-blue-500 hover:bg-blue-500">
          <RotateCcw size={24} />
        </button>

        <button onClick={() => setShowMap(!showMap)} className="w-14 h-14 bg-neutral-700 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform border-2 border-neutral-600 hover:bg-neutral-600">
          <MapIcon size={24} />
        </button>

        <button onClick={() => setShowHint(true)} className="w-14 h-14 bg-yellow-500 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform border-2 border-yellow-400 hover:bg-yellow-400 text-black">
          <Lightbulb size={24} fill="currentColor" />
        </button>
      </div>

      <style>{`
        .perspective-container { perspective: 1200px; }
        .preserve-3d { transform-style: preserve-3d; }
      `}</style>
    </div>
  );
};

// --- 메인 앱 ---
export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'home' | 'game' | 'custom'>('home');
  const [activePuzzle, setActivePuzzle] = useState<string[][] | null>(null);

  const handleStartGame = (data: string[][]) => {
    setActivePuzzle(data);
    setCurrentScreen('game');
  };

  return (
    <>
      {currentScreen === 'home' && <HomeScreen onStart={handleStartGame} onCustom={() => setCurrentScreen('custom')} />}
      {currentScreen === 'custom' && <CustomPuzzleEditor onStart={handleStartGame} onBack={() => setCurrentScreen('home')} />}
      {currentScreen === 'game' && activePuzzle && <GameScreen puzzleData={activePuzzle} onHome={() => { setActivePuzzle(null); setCurrentScreen('home'); }} />}
    </>
  );
}