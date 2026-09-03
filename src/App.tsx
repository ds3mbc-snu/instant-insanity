import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, Home, Play, Settings, Grid3X3, ChevronLeft, ChevronRight, Check, Lightbulb, X as XIcon, Map as MapIcon, Share2, Clipboard, ArrowDownToLine } from 'lucide-react';
import {
  generateSeed,
  getIncompleteFaces,
  isCompletePuzzle,
  isPuzzleColor,
  normalizePuzzleColorInput,
  parseSeed,
  type IncompleteFace,
} from './puzzle';
import { orientGraphSolution, solveGraph, type Edge, type Subgraph } from './solver';
import {
  IDENTITY_MATRIX,
  INITIAL_NORMALS,
  applyMatrixToVector,
  getRotationMatrix,
  getSnappedDragAngle,
  multiplyMatrix,
} from './rotation';

// ==========================================
// 1. 상수 및 데이터 정의
// ==========================================
const APP_VERSION = "v1.0.15";
const CUBE_SIZE = 100;
const GAP = 10;
const DRAG_SENSITIVITY = 0.8; 

const COLORS: Record<string, string> = {
  R: 'bg-red-600',    
  G: 'bg-green-600',  
  P: 'bg-purple-600', 
  Y: 'bg-yellow-400', 
};

const GRAPH_COLORS: Record<string, string> = {
  R: '#dc2626', 
  G: '#16a34a', 
  P: '#9333ea', 
  Y: '#facc15', 
};

const INPUT_COLORS: Record<string, string> = {
  R: 'bg-red-600 text-white',
  G: 'bg-green-600 text-white',
  P: 'bg-purple-600 text-white',
  Y: 'bg-yellow-400 text-black', 
  DEFAULT: 'bg-neutral-800 text-neutral-400 border-neutral-600', 
};

const FACE_LABELS = ['Top', 'Left', 'Front', 'Right', 'Back', 'Bottom'];

const PUZZLE_1 = [
  ['P', 'G', 'Y', 'R', 'G', 'R'], 
  ['R', 'G', 'G', 'G', 'P', 'Y'], 
  ['G', 'Y', 'P', 'R', 'P', 'Y'], 
  ['P', 'G', 'R', 'P', 'Y', 'R'], 
];

const PUZZLE_2 = [
  ['P', 'R', 'Y', 'G', 'P', 'R'],
  ['R', 'R', 'Y', 'P', 'G', 'Y'],
  ['G', 'P', 'P', 'R', 'Y', 'G'],
  ['P', 'G', 'Y', 'R', 'G', 'Y'],
];

const PUZZLE_3 = [
  ['Y', 'G', 'R', 'P', 'G', 'R'],
  ['R', 'P', 'G', 'Y', 'R', 'Y'],
  ['G', 'Y', 'P', 'R', 'Y', 'P'],
  ['P', 'R', 'Y', 'G', 'P', 'G'],
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

interface PlatformProps {
  onRotateStart: () => void;
  onRotate: (delta: number) => void;
  onRotateEnd: () => void;
}

const VersionBadge = ({
  onPressStart,
  onPressEnd,
}: {
  onPressStart: () => void;
  onPressEnd: () => void;
}) => (
  <div
    role="button"
    tabIndex={0}
    aria-label={`${APP_VERSION}. 강의자 모드를 전환하려면 2초간 누르세요.`}
    className="absolute top-2 left-2 text-xs text-neutral-400 font-mono z-10 select-none cursor-default touch-none rounded-sm"
    onPointerDown={onPressStart}
    onPointerUp={onPressEnd}
    onPointerLeave={onPressEnd}
    onKeyDown={(event) => {
      if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        onPressStart();
      }
    }}
    onKeyUp={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onPressEnd();
      }
    }}
    onBlur={onPressEnd}
  >
    {APP_VERSION}
  </div>
);

// ==========================================
// 4. 서브 컴포넌트 (UI Parts)
// ==========================================

const HintPanel = ({ 
  puzzleData, 
  onClose, 
  onApply,
  isOpen, 
  step,   
  setStep 
}: { 
  puzzleData: string[][], 
  onClose: () => void, 
  onApply: (g1: Subgraph, g2: Subgraph) => void,
  isOpen: boolean,
  step: number,
  setStep: (s: number) => void
}) => {
  const solution = useMemo(() => solveGraph(puzzleData), [puzzleData]);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const nodes = ['R', 'G', 'P', 'Y'];
  const nodePos = {
    R: { x: 50, y: 50 },
    G: { x: 250, y: 50 },
    P: { x: 250, y: 250 },
    Y: { x: 50, y: 250 },
  };

  const renderEdges = (edges: Edge[], highlight: boolean = false, type: 'g1'|'g2'|'none' = 'none') => {
    return edges.map((e, i) => {
      let u = e.u;
      let v = e.v;
      if (nodes.indexOf(u) > nodes.indexOf(v)) {
        [u, v] = [v, u];
      }

      const p1 = nodePos[u as keyof typeof nodePos];
      const p2 = nodePos[v as keyof typeof nodePos];
      if(!p1 || !p2) return null;

      const isLoop = e.u === e.v;
      const offset = (e.cubeIdx - 1.5) * 40; 
      
      let pathD: string;
      let labelX: number;
      let labelY: number;

      if (isLoop) {
        const dirX = p1.x < 150 ? -1 : 1;
        const dirY = p1.y < 150 ? -1 : 1;

        const loopSize = 50 + Math.abs(offset * 0.5); 
        const twist = (e.cubeIdx % 2 ? 15 : -15); 

        const c1x = p1.x + dirX * loopSize * 0.5 + twist;
        const c1y = p1.y + dirY * loopSize;
        const c2x = p1.x + dirX * loopSize;
        const c2y = p1.y + dirY * loopSize * 0.5 - twist;

        pathD = `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p1.x} ${p1.y}`;
        
        labelX = 0.25 * p1.x + 0.375 * (c1x + c2x);
        labelY = 0.25 * p1.y + 0.375 * (c1y + c2y);

      } else {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        
        const dist = Math.sqrt(dx*dx + dy*dy);
        const nx = -dy / dist;
        const ny = dx / dist;

        const cpX = mx + nx * offset * 1.2; 
        const cpY = my + ny * offset * 1.2;

        pathD = `M ${p1.x} ${p1.y} Q ${cpX} ${cpY} ${p2.x} ${p2.y}`;

        labelX = 0.25 * (p1.x + p2.x) + 0.5 * cpX;
        labelY = 0.25 * (p1.y + p2.y) + 0.5 * cpY;
      }

      const strokeColor = type === 'g1' ? '#ef4444' : type === 'g2' ? '#3b82f6' : '#525252';
      const strokeWidth = highlight ? 4 : 2;
      const opacity = highlight ? 1 : 0.3;

      return (
        <g key={i}>
          <path d={pathD} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" opacity={opacity} />
          {highlight && ( 
             <g>
               <circle cx={labelX} cy={labelY} r="9" fill={strokeColor} />
               <text x={labelX} y={labelY} dy="4" fill="white" fontSize="12" fontWeight="bold" textAnchor="middle">
                 {e.cubeIdx + 1}
               </text>
             </g>
          )}
        </g>
      );
    });
  };

  return (
    <div 
      role="dialog"
      aria-labelledby="hint-panel-title"
      aria-hidden={!isOpen}
      inert={!isOpen}
      className={`fixed top-4 right-4 bottom-32 w-[80%] max-w-sm z-30 bg-neutral-900/95 backdrop-blur-xl border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-[120%]'}`}
    >
      <div className="flex items-center justify-between p-4 border-b border-neutral-700">
        <h3 id="hint-panel-title" className="text-white font-bold flex items-center gap-2">
          <Lightbulb size={20} className="text-yellow-400" />
          Hint Mode
        </h3>
        <button ref={closeButtonRef} aria-label="힌트 닫기" onClick={onClose} className="text-neutral-400 hover:text-white">
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
                <p className="text-neutral-400 text-xs mb-4 text-center">각 큐브의 마주 보는 면을 연결합니다.</p>
                <svg width="100%" height="200" viewBox="0 0 300 300" className="mx-auto bg-neutral-800 rounded-lg">
                  {renderEdges(solution.allEdges, true)}
                  {nodes.map(n => (
                    <circle key={n} cx={nodePos[n as keyof typeof nodePos].x} cy={nodePos[n as keyof typeof nodePos].y} r="18" fill={GRAPH_COLORS[n]} stroke="white" strokeWidth="2" />
                  ))}
                  {nodes.map(n => (
                    <text key={n+"t"} x={nodePos[n as keyof typeof nodePos].x} y={nodePos[n as keyof typeof nodePos].y} dy="5" textAnchor="middle" fill={n === 'G' || n === 'Y' ? 'black' : 'white'} fontWeight="bold">{n}</text>
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
                  className="px-6 py-3 bg-green-700 hover:bg-green-600 text-white rounded-full font-bold shadow-lg w-full flex items-center justify-center gap-2"
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
            aria-label="이전 힌트 단계"
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
            aria-label="다음 힌트 단계"
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

const PuzzleMapOverlay = ({ puzzleData, onClose, isOpen }: { puzzleData: string[][], onClose: () => void, isOpen: boolean }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  return (
    <div 
      role="dialog"
      aria-labelledby="puzzle-map-title"
      aria-hidden={!isOpen}
      inert={!isOpen}
      className={`fixed top-4 left-4 bottom-32 w-[80%] max-w-sm z-30 bg-neutral-900/95 backdrop-blur-xl border border-neutral-700 rounded-2xl shadow-2xl overflow-y-auto flex flex-col gap-6 scrollbar-hide transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-[120%]'}`}
    >
       <div className="flex items-center justify-between border-b border-neutral-700 p-4 sticky top-0 bg-neutral-900/90 z-10">
        <h3 id="puzzle-map-title" className="text-white font-bold flex items-center gap-2">
          <MapIcon size={18} className="text-blue-400" />
          Puzzle Map
        </h3>
        <button ref={closeButtonRef} aria-label="퍼즐 맵 닫기" onClick={onClose} className="text-neutral-400 hover:text-white">
          <XIcon size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
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
  const startX = useRef(0);
  const isDragging = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {
      // Pointer capture may be unavailable for an interrupted gesture.
    }
    
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
    startX.current = e.clientX; 
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {
      // The pointer may already have been released by the browser.
    }
    
    isDragging.current = false;
    onRotateEnd();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    onRotateStart();
    onRotate(event.key === 'ArrowLeft' ? -90 : 90);
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
        cursor: 'grab', 
        touchAction: 'none',
        pointerEvents: 'none', 
        zIndex: 0, 
      }}
    >
      <div 
        role="group"
        tabIndex={0}
        aria-label="전체 큐브 받침대. 왼쪽 또는 오른쪽 방향키로 회전합니다."
        className="absolute w-full h-full rounded-full bg-neutral-700 border-4 border-neutral-600 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center"
        style={{ pointerEvents: 'auto', cursor: 'grab' }} 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
         <div className="w-2/3 h-2/3 rounded-full border-2 border-neutral-600/50 border-dashed pointer-events-none" />
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
  onRotate,
  baseZIndex 
}: { 
  id: number; 
  colors: string[]; 
  matrix: number[]; 
  towerRotation: number;
  onRotate: (id: number, newMatrix: number[]) => void;
  baseZIndex: number; 
}) => {
  const startPos = useRef({ x: 0, y: 0 });
  const [currentDragAngle, setCurrentDragAngle] = useState<{ axis: 'x' | 'y' | 'z', val: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false); 
  
  const isDraggingRef = useRef(false);
  const activeAxis = useRef<'x' | 'y' | 'z' | null>(null);
  const dragComponent = useRef<'x' | 'y' | null>(null);
  const rotationSign = useRef(1);
  const touchedFaceIndex = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (animationFrameRef.current !== null) return;

    e.preventDefault(); e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {
      // Pointer capture may be unavailable for an interrupted gesture.
    }
    
    const target = e.target as HTMLElement;
    const faceEl = target.closest('[data-face-index]');
    const faceIndex = faceEl ? parseInt(faceEl.getAttribute('data-face-index') || '0', 10) : 0;
    
    touchedFaceIndex.current = faceIndex;
    startPos.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = true;
    activeAxis.current = null;
    dragComponent.current = null;
    rotationSign.current = 1;
    
    setIsDragging(true);
    setCurrentDragAngle(null);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
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

      let targetWorldAxis: 'x' | 'y' | 'z';
      let worldSign: number;

      const isHorz = Math.abs(diffX) > Math.abs(diffY);
      dragComponent.current = isHorz ? 'x' : 'y';

      if (max === absY) {
        if (isHorz) {
          targetWorldAxis = 'z';
          worldSign = 1;
        } else {
          targetWorldAxis = 'x';
          worldSign = ny < 0 ? -1 : 1;
        }
      } 
      else if (max === absX) {
        if (isHorz) {
          targetWorldAxis = 'y';
          worldSign = 1; 
        } else {
          targetWorldAxis = 'z';
          worldSign = nx > 0 ? 1 : -1;
        }
      } 
      else {
        if (isHorz) {
          targetWorldAxis = 'y';
          worldSign = 1;
        } else {
          targetWorldAxis = 'x';
          worldSign = nz > 0 ? -1 : 1;
        }
      }

      const invTowerMatrix = getRotationMatrix('y', -towerRotation);
      const worldAxisVec = targetWorldAxis === 'x'
        ? [1, 0, 0, 0]
        : targetWorldAxis === 'y'
          ? [0, 1, 0, 0]
          : [0, 0, 1, 0];

      const localAxisVec = applyMatrixToVector(invTowerMatrix, worldAxisVec);
      
      const lx = localAxisVec[0];
      const ly = localAxisVec[1];
      const lz = localAxisVec[2];
      const maxL = Math.max(Math.abs(lx), Math.abs(ly), Math.abs(lz));

      let finalAxis: 'x'|'y'|'z';
      let mappingSign: number;

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
      rotationSign.current = worldSign * mappingSign;
    }

    const val = dragComponent.current === 'x' ? diffX : diffY;
    const delta = val * DRAG_SENSITIVITY * rotationSign.current;

    if (activeAxis.current) {
      setCurrentDragAngle({ axis: activeAxis.current, val: delta });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {
      // The pointer may already have been released by the browser.
    }

    if (!currentDragAngle || !activeAxis.current) {
      setIsDragging(false);
      setCurrentDragAngle(null);
      activeAxis.current = null;
      dragComponent.current = null;
      return;
    }

    const axis = activeAxis.current;
    const fromAngle = currentDragAngle.val;
    const snapAngle = getSnappedDragAngle(fromAngle);
    const startedAt = performance.now();
    const duration = Math.max(100, Math.min(220, Math.abs(snapAngle - fromAngle) * 3));

    const finishSnap = () => {
      if (snapAngle !== 0) {
        onRotate(id, multiplyMatrix(getRotationMatrix(axis, snapAngle), matrix));
      }
      animationFrameRef.current = null;
      activeAxis.current = null;
      dragComponent.current = null;
      setCurrentDragAngle(null);
      setIsDragging(false);
    };

    const animateSnap = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const angle = fromAngle + (snapAngle - fromAngle) * easedProgress;
      setCurrentDragAngle({ axis, val: angle });

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animateSnap);
      } else {
        finishSnap();
      }
    };

    animationFrameRef.current = requestAnimationFrame(animateSnap);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const rotation = {
      ArrowLeft: { axis: 'y' as const, angle: -90 },
      ArrowRight: { axis: 'y' as const, angle: 90 },
      ArrowUp: { axis: 'x' as const, angle: -90 },
      ArrowDown: { axis: 'x' as const, angle: 90 },
      q: { axis: 'z' as const, angle: -90 },
      e: { axis: 'z' as const, angle: 90 },
      Q: { axis: 'z' as const, angle: -90 },
      E: { axis: 'z' as const, angle: 90 },
    }[event.key];

    if (!rotation) return;

    event.preventDefault();
    onRotate(id, multiplyMatrix(getRotationMatrix(rotation.axis, rotation.angle), matrix));
  };

  let displayMatrix = matrix;
  if (isDragging && currentDragAngle) {
    const tempRot = getRotationMatrix(currentDragAngle.axis, currentDragAngle.val);
    displayMatrix = multiplyMatrix(tempRot, matrix);
  }

  const halfSize = CUBE_SIZE / 2 - 0.5;

  return (
    <div 
      role="group"
      tabIndex={0}
      aria-label={`Cube ${id + 1}. 방향키로 상하좌우 회전하고 Q 또는 E 키로 비틉니다.`}
      className="absolute cursor-grab active:cursor-grabbing touch-none"
      style={{
        width: `${CUBE_SIZE}px`,
        height: `${CUBE_SIZE}px`,
        transformStyle: 'preserve-3d',
        transform: `translateY(${(id - 1.5) * (CUBE_SIZE + GAP)}px) matrix3d(${displayMatrix.join(',')})`,
        transition: 'none',
        zIndex: isDragging ? 100 : baseZIndex, 
        pointerEvents: 'none' 
      }}
      onKeyDown={handleKeyDown}
    >
      <CubeFace index={0} color={colors[0]} transform={`rotateX(90deg) translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onLostPointerCapture={handlePointerUp} />
      <CubeFace index={1} color={colors[1]} transform={`rotateY(-90deg) translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onLostPointerCapture={handlePointerUp} />
      <CubeFace index={2} color={colors[2]} transform={`translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onLostPointerCapture={handlePointerUp} />
      <CubeFace index={3} color={colors[3]} transform={`rotateY(90deg) translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onLostPointerCapture={handlePointerUp} />
      <CubeFace index={4} color={colors[4]} transform={`rotateY(180deg) translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onLostPointerCapture={handlePointerUp} />
      <CubeFace index={5} color={colors[5]} transform={`rotateX(-90deg) translateZ(${halfSize}px)`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onLostPointerCapture={handlePointerUp} />
    </div>
  );
};

const CubeFace = ({ 
  index, color, transform, 
  onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture,
}: { 
  index: number, color: string, transform: string,
  onPointerDown: (e: React.PointerEvent) => void,
  onPointerMove: (e: React.PointerEvent) => void,
  onPointerUp: (e: React.PointerEvent) => void,
  onPointerCancel: (e: React.PointerEvent) => void,
  onLostPointerCapture: (e: React.PointerEvent) => void,
}) => {
  return (
    <div
      data-face-index={index}
      className={`absolute w-full h-full border-[3px] border-black flex items-center justify-center box-border touch-none ${COLORS[color]}`}
      style={{ 
        transform, 
        backfaceVisibility: 'hidden', 
        WebkitBackfaceVisibility: 'hidden',
        outline: '2px solid black',
        pointerEvents: 'auto' 
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
    >
      <div className="w-full h-full bg-gradient-to-br from-white/30 to-black/10 pointer-events-none absolute inset-0" />
    </div>
  );
};

const FaceInput = ({
  id,
  value,
  onChange,
  label,
  invalid,
  onPaste,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid: boolean;
  onPaste?: (event: React.ClipboardEvent<HTMLInputElement>) => void;
}) => {
  const style = INPUT_COLORS[value] || INPUT_COLORS.DEFAULT;
  
  return (
    <div className="flex flex-col items-center gap-1">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        maxLength={1}
        aria-invalid={invalid}
        className={`w-12 h-12 text-center text-xl font-bold uppercase rounded-md border-2 focus:outline-none focus:border-white transition-colors ${invalid ? 'border-red-400 ring-2 ring-red-500/40' : ''} ${style}`}
      />
      <label htmlFor={id} className={`text-[10px] uppercase ${invalid ? 'text-red-300' : 'text-neutral-300'}`}>
        {label}
      </label>
    </div>
  );
};

const CustomPuzzleEditor = ({ 
  onStart, 
  onBack, 
  onSecretPressStart, 
  onSecretPressEnd 
}: { 
  onStart: (data: string[][]) => void, 
  onBack: () => void, 
  onSecretPressStart: () => void,
  onSecretPressEnd: () => void
}) => {
  const [puzzleData, setPuzzleData] = useState<string[][]>(
    PRESET_PUZZLES.custom.map(row => [...row])
  );

  const [seedInput, setSeedInput] = useState(""); 
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success', message: string } | null>(null);

  const incompleteFaces = getIncompleteFaces(puzzleData);
  const incompleteFaceKeys = new Set(
    incompleteFaces.map(({ cubeIndex, faceIndex }) => `${cubeIndex}-${faceIndex}`),
  );
  const isFaceInvalid = (cubeIndex: number, faceIndex: number) =>
    showValidationErrors && incompleteFaceKeys.has(`${cubeIndex}-${faceIndex}`);

  const describeIncompleteFaces = (faces: IncompleteFace[]) => {
    const visibleFaces = faces
      .slice(0, 6)
      .map(({ cubeIndex, faceIndex }) => `Cube ${cubeIndex + 1} ${FACE_LABELS[faceIndex]}`);
    const remainingCount = faces.length - visibleFaces.length;
    return `미완성 면: ${visibleFaces.join(', ')}${remainingCount > 0 ? ` 외 ${remainingCount}곳` : ''}`;
  };

  const updatePuzzleData = (newData: string[][]) => {
    const complete = isCompletePuzzle(newData);
    setPuzzleData(newData);
    setSeedInput(complete ? generateSeed(newData) : '');
    if (complete) setShowValidationErrors(false);
  };

  const handleInputChange = (cubeIndex: number, faceIndex: number, val: string) => {
    const color = normalizePuzzleColorInput(val);
    const newData = [...puzzleData];
    newData[cubeIndex] = [...newData[cubeIndex]];
    newData[cubeIndex][faceIndex] = color;
    updatePuzzleData(newData);

    if (val && !color) {
      setFeedback({ type: 'error', message: '각 면에는 R, G, P, Y 중 하나만 입력할 수 있습니다.' });
    } else {
      setFeedback(null);
    }
  };

  const handlePaste = (cubeIndex: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text').trim().toUpperCase();
    e.preventDefault();

    if (pastedText.length === 6 && [...pastedText].every(isPuzzleColor)) {
      const newData = [...puzzleData];
      newData[cubeIndex] = pastedText.split(''); 
      updatePuzzleData(newData);
      setFeedback({ type: 'success', message: `Cube ${cubeIndex + 1}의 여섯 면을 입력했습니다.` });
    } else {
      setFeedback({ type: 'error', message: '붙여넣기는 R, G, P, Y로만 이루어진 여섯 글자여야 합니다.' });
    }
  };

  const handleLoadSeed = () => {
    const parsed = parseSeed(seedInput);
    if (parsed) {
      setPuzzleData(parsed);
      setSeedInput(generateSeed(parsed));
      setShowValidationErrors(false);
      setFeedback({ type: 'success', message: '시드를 불러왔습니다.' });
    } else {
      setFeedback({ type: 'error', message: '올바르지 않은 시드 코드입니다.' });
    }
  };

  const handleCopySeed = async () => {
    const missingFaces = getIncompleteFaces(puzzleData);
    if (missingFaces.length > 0) {
      setShowValidationErrors(true);
      setFeedback({ type: 'error', message: describeIncompleteFaces(missingFaces) });
      return;
    }

    const seed = generateSeed(puzzleData);
    try {
      await navigator.clipboard.writeText(seed);
      setFeedback({ type: 'success', message: `시드를 복사했습니다: ${seed}` });
    } catch {
      setFeedback({ type: 'error', message: '클립보드에 접근할 수 없어 시드를 복사하지 못했습니다.' });
    }
  };

  const handlePlay = () => {
    const missingFaces = getIncompleteFaces(puzzleData);
    if (missingFaces.length > 0) {
      setShowValidationErrors(true);
      setFeedback({ type: 'error', message: describeIncompleteFaces(missingFaces) });
      return;
    }

    onStart(puzzleData.map((faces) => [...faces]));
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-neutral-900 overflow-hidden overscroll-none touch-none flex flex-col">
      <VersionBadge onPressStart={onSecretPressStart} onPressEnd={onSecretPressEnd} />

      <div className="w-full flex-none flex items-center justify-between p-6">
        <button aria-label="홈으로 돌아가기" onClick={onBack} className="p-2 text-white hover:bg-white/10 rounded-full">
          <ChevronLeft size={32} />
        </button>
        <h2 className="text-2xl font-bold text-white">Custom Puzzle Editor</h2>
        <div className="w-10"></div> 
      </div>

      <div className="w-full max-w-2xl mx-auto px-6 mb-4 flex gap-2">
        <div className="relative flex-1">
          <input 
            type="text" 
            value={seedInput}
            onChange={(e) => {
              setSeedInput(e.target.value);
              setFeedback(null);
            }}
            placeholder="Puzzle Seed Code..."
            className="w-full bg-neutral-800 text-white p-3 rounded-lg border border-neutral-700 font-mono text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <button onClick={handleLoadSeed} className="bg-blue-600 text-white px-4 rounded-lg font-bold hover:bg-blue-500 flex items-center gap-1">
          <ArrowDownToLine size={18} /> Load
        </button>
        <button onClick={handleCopySeed} className="bg-neutral-700 text-white px-4 rounded-lg font-bold hover:bg-neutral-600 flex items-center gap-1">
          <Clipboard size={18} /> Copy
        </button>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`w-full max-w-2xl mx-auto px-6 mb-2 text-sm ${feedback.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}
        >
          {feedback.message}
        </div>
      )}

      <div className="flex-1 w-full overflow-y-auto p-6 pb-32">
        <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto">
          {puzzleData.map((cubeFaces, cubeIdx) => (
            <div key={cubeIdx} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
              <h3 className="text-white font-bold mb-4 ml-2">Cube {cubeIdx + 1}</h3>
              
              <div className="grid grid-cols-4 gap-2 w-max mx-auto">
                <div className="col-start-2">
                  <FaceInput 
                    id={`cube-${cubeIdx}-face-0`}
                    value={cubeFaces[0]} 
                    onChange={(v) => handleInputChange(cubeIdx, 0, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Top"
                    invalid={isFaceInvalid(cubeIdx, 0)}
                  />
                </div>
                <div className="col-start-1 row-start-2">
                  <FaceInput 
                    id={`cube-${cubeIdx}-face-1`}
                    value={cubeFaces[1]} 
                    onChange={(v) => handleInputChange(cubeIdx, 1, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Left"
                    invalid={isFaceInvalid(cubeIdx, 1)}
                  />
                </div>
                <div className="col-start-2 row-start-2">
                  <FaceInput 
                    id={`cube-${cubeIdx}-face-2`}
                    value={cubeFaces[2]} 
                    onChange={(v) => handleInputChange(cubeIdx, 2, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Front"
                    invalid={isFaceInvalid(cubeIdx, 2)}
                  />
                </div>
                <div className="col-start-3 row-start-2">
                  <FaceInput 
                    id={`cube-${cubeIdx}-face-3`}
                    value={cubeFaces[3]} 
                    onChange={(v) => handleInputChange(cubeIdx, 3, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Right"
                    invalid={isFaceInvalid(cubeIdx, 3)}
                  />
                </div>
                <div className="col-start-4 row-start-2">
                  <FaceInput 
                    id={`cube-${cubeIdx}-face-4`}
                    value={cubeFaces[4]} 
                    onChange={(v) => handleInputChange(cubeIdx, 4, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Back"
                    invalid={isFaceInvalid(cubeIdx, 4)}
                  />
                </div>
                <div className="col-start-2 row-start-3">
                  <FaceInput 
                    id={`cube-${cubeIdx}-face-5`}
                    value={cubeFaces[5]} 
                    onChange={(v) => handleInputChange(cubeIdx, 5, v)} 
                    onPaste={(e) => handlePaste(cubeIdx, e)}
                    label="Bottom"
                    invalid={isFaceInvalid(cubeIdx, 5)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button 
        onClick={handlePlay}
        className="fixed bottom-8 right-8 bg-green-700 text-white p-4 rounded-full shadow-2xl hover:bg-green-600 transition-all active:scale-95 flex items-center gap-2 font-bold pr-6 z-50"
      >
        <div className="bg-white/20 p-2 rounded-full">
          <Check size={24} />
        </div>
        START GAME
      </button>
    </div>
  );
};

const HomeScreen = ({ 
  onStart, 
  onCustom, 
  onSecretPressStart, 
  onSecretPressEnd 
}: { 
  onStart: (data: string[][]) => void, 
  onCustom: () => void, 
  onSecretPressStart: () => void,
  onSecretPressEnd: () => void
}) => {
  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-neutral-900 overflow-hidden touch-none overscroll-none flex flex-col items-center justify-center p-6 space-y-12">
      <VersionBadge onPressStart={onSecretPressStart} onPressEnd={onSecretPressEnd} />

      <div className="text-center space-y-2 animate-fade-in-up">
        <h1 className="text-5xl md:text-7xl font-black text-white tracking-widest drop-shadow-2xl" style={{ fontFamily: 'Impact, sans-serif' }}>
          INSTANT<br/>INSANITY
        </h1>
        <p className="text-neutral-400 text-lg">4개의 큐브, 4개의 면, 하나의 정답</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <button 
          onClick={() => onStart(PRESET_PUZZLES.standard)}
          className="w-full group relative overflow-hidden rounded-xl bg-red-600 p-4 transition-all hover:bg-red-500 active:scale-95 shadow-lg shadow-red-900/20"
        >
          <div className="flex items-center justify-center gap-3 relative z-10">
            <Grid3X3 className="w-6 h-6 text-white" />
            <span className="text-xl font-bold text-white">Puzzle 1</span>
          </div>
        </button>
        
        <button 
          onClick={() => onStart(PRESET_PUZZLES.hard)}
          className="w-full rounded-xl bg-orange-700 p-4 transition-all hover:bg-orange-600 active:scale-95 shadow-lg shadow-orange-900/20 flex items-center justify-center gap-3"
        >
          <Grid3X3 className="w-5 h-5 text-white" />
          <span className="text-lg font-bold text-white">Puzzle 2</span>
        </button>

        <button 
          onClick={() => onStart(PRESET_PUZZLES.expert)}
          className="w-full rounded-xl bg-purple-600 p-4 transition-all hover:bg-purple-500 active:scale-95 shadow-lg shadow-purple-900/20 flex items-center justify-center gap-3"
        >
          <Grid3X3 className="w-5 h-5 text-white" />
          <span className="text-lg font-bold text-white">Puzzle 3</span>
        </button>

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

const GameScreen = ({ 
  puzzleData, 
  onHome, 
  onSecretPressStart, 
  onSecretPressEnd,
  isInstructorMode,
  showToast
}: { 
  puzzleData: string[][]; 
  onHome: () => void;
  onSecretPressStart: () => void;
  onSecretPressEnd: () => void;
  isInstructorMode: boolean;
  showToast: (m: string) => void;
}) => {
  const [cubeMatrices, setCubeMatrices] = useState<number[][]>(
    puzzleData.map(() => [...IDENTITY_MATRIX])
  );
  const [towerRotation, setTowerRotation] = useState(0);
  const [isTowerDragging, setIsTowerDragging] = useState(false);
  
  const [showHint, setShowHint] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [hintStep, setHintStep] = useState(1);
  const hintButtonRef = useRef<HTMLButtonElement>(null);
  const mapButtonRef = useRef<HTMLButtonElement>(null);

  const closeHintPanel = useCallback(() => {
    setShowHint(false);
    requestAnimationFrame(() => hintButtonRef.current?.focus());
  }, []);

  const closeMapPanel = useCallback(() => {
    setShowMap(false);
    requestAnimationFrame(() => mapButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.overflow-y-auto')) return;
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => document.removeEventListener('touchmove', preventScroll);
  }, []);

  useEffect(() => {
    if (!isInstructorMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Parent mode changes intentionally close the local hint panel.
      setShowHint(false);
    }
  }, [isInstructorMode]);

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
    setHintStep(1); 
  };

  const handleShare = async () => {
    try {
      const seed = generateSeed(puzzleData);
      await navigator.clipboard.writeText(seed);
      showToast(`Seed Copied: ${seed}`);
    } catch {
      showToast('클립보드에 접근할 수 없어 시드를 복사하지 못했습니다.');
    }
  };

  const applySolution = (g1: Subgraph, g2: Subgraph) => {
    const solutionMatrices = orientGraphSolution(puzzleData, g1, g2);

    if (solutionMatrices) {
      setCubeMatrices(solutionMatrices);
      setTowerRotation(0);
      setShowHint(false);
    } else {
      alert("해답 적용 중 오류가 발생했습니다. (유효한 방향 조합 없음)");
    }
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-neutral-900 overflow-hidden touch-none overscroll-none flex flex-col items-center justify-center">
      
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

      <VersionBadge onPressStart={onSecretPressStart} onPressEnd={onSecretPressEnd} />

      <HintPanel 
        puzzleData={puzzleData} 
        onClose={closeHintPanel}
        onApply={applySolution}
        isOpen={showHint}
        step={hintStep}
        setStep={setHintStep}
      />

      <PuzzleMapOverlay
        puzzleData={puzzleData}
        onClose={closeMapPanel}
        isOpen={showMap}
      />

      <div className="relative w-64 h-96 perspective-container transition-transform duration-300" style={{ perspective: '1200px' }}>
        <div className="w-full h-full relative preserve-3d flex items-center justify-center" style={{ transform: 'rotateX(-20deg) rotateY(-30deg)' }}>
          <div className="w-full h-full relative preserve-3d flex items-center justify-center" 
               style={{ transform: `rotateY(${towerRotation}deg)`, transition: isTowerDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
            
            <Platform onRotateStart={() => setIsTowerDragging(true)} onRotate={(delta) => setTowerRotation(prev => prev + delta)} onRotateEnd={() => { setIsTowerDragging(false); setTowerRotation(prev => Math.round(prev / 90) * 90); }} />

            {puzzleData.map((colors, idx) => (
              <Cube 
                key={idx} 
                id={idx} 
                colors={colors} 
                matrix={cubeMatrices[idx]} 
                towerRotation={towerRotation} 
                onRotate={handleRotate} 
                baseZIndex={(puzzleData.length - idx) * 10}
              />
            ))}
          </div>
        </div>
      </div>

      <div
        className="absolute inset-x-0 flex items-center justify-center gap-2 px-3 sm:gap-4 sm:px-4 z-20"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <button aria-label="홈으로 이동" onClick={onHome} className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-neutral-700 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform border-2 border-neutral-600 hover:bg-neutral-600">
          <Home size={22} />
        </button>
        
        <button aria-label="퍼즐 초기화" onClick={handleReset} className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-900/50 active:scale-95 transition-transform border-2 border-blue-500 hover:bg-blue-500">
          <RotateCcw size={22} />
        </button>

        <button ref={mapButtonRef} aria-label="퍼즐 맵 보기" aria-pressed={showMap} onClick={() => { setShowMap(!showMap); if (!showMap) setShowHint(false); }} className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-neutral-700 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform border-2 border-neutral-600 hover:bg-neutral-600">
          <MapIcon size={22} />
        </button>

        {isInstructorMode && (
          <button ref={hintButtonRef} aria-label="풀이 힌트 보기" aria-pressed={showHint} onClick={() => { setShowHint(!showHint); if (!showHint) setShowMap(false); }} className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-yellow-500 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform border-2 border-yellow-400 hover:bg-yellow-400 text-black">
            <Lightbulb size={22} fill="currentColor" />
          </button>
        )}

        <button aria-label="퍼즐 시드 복사" onClick={handleShare} className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-emerald-600 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform border-2 border-emerald-500 hover:bg-emerald-500">
          <Share2 size={22} />
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
  
  const [isInstructorMode, setIsInstructorMode] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // [수정] 길게 누르기(Long Press) 타이머 참조
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2000);
  };

  // [추가] 2초간 누르고 있으면 토글
  const handleSecretPressStart = () => {
    pressTimerRef.current = setTimeout(() => {
      setIsInstructorMode(prev => {
        const next = !prev;
        showToast(next ? "강의자 모드: 힌트 버튼이 활성화되었습니다." : "강의자 모드: 힌트 버튼을 숨겼습니다.");
        return next;
      });
    }, 2000); // 2초 설정
  };

  // [추가] 2초 전에 손을 떼면 취소
  const handleSecretPressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handleStartGame = (data: string[][]) => {
    setActivePuzzle(data);
    setCurrentScreen('game');
  };

  return (
    <>
      {toastMsg && (
        <div role="status" aria-live="polite" className="fixed top-12 left-1/2 -translate-x-1/2 bg-neutral-800/90 text-white px-4 py-2 rounded-full shadow-lg z-[9999] text-sm animate-fade-in-up">
          {toastMsg}
        </div>
      )}

      {currentScreen === 'home' && (
        <HomeScreen 
          onStart={handleStartGame} 
          onCustom={() => setCurrentScreen('custom')} 
          onSecretPressStart={handleSecretPressStart}
          onSecretPressEnd={handleSecretPressEnd}
        />
      )}
      {currentScreen === 'custom' && (
        <CustomPuzzleEditor 
          onStart={handleStartGame} 
          onBack={() => setCurrentScreen('home')} 
          onSecretPressStart={handleSecretPressStart}
          onSecretPressEnd={handleSecretPressEnd}
        />
      )}
      {currentScreen === 'game' && activePuzzle && (
        <GameScreen 
          puzzleData={activePuzzle} 
          onHome={() => { setActivePuzzle(null); setCurrentScreen('home'); }} 
          onSecretPressStart={handleSecretPressStart}
          onSecretPressEnd={handleSecretPressEnd}
          isInstructorMode={isInstructorMode}
          showToast={showToast}
        />
      )}
    </>
  );
}
