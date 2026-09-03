/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('main user flow', () => {
  it('starts a custom game from a valid puzzle seed', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Custom Puzzle' }));
    expect(screen.getByRole('heading', { name: 'Custom Puzzle Editor' })).toBeTruthy();

    await user.type(screen.getByPlaceholderText('Puzzle Seed Code...'), 'FD81F29052D3');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.getByRole('status').textContent).toContain('시드를 불러왔습니다.');

    await user.click(screen.getByRole('button', { name: 'START GAME' }));

    expect(screen.queryByRole('heading', { name: 'Custom Puzzle Editor' })).toBeNull();
    expect(screen.getAllByRole('group', { name: /^Cube \d/ })).toHaveLength(4);
    expect(screen.getByRole('button', { name: '홈으로 이동' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '퍼즐 초기화' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '퍼즐 맵 보기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '퍼즐 시드 복사' })).toBeTruthy();
  });

  it('keeps the initial drag direction and settles with a rigid rotation', async () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Puzzle 1' }));

    const cube = screen.getByRole('group', { name: /^Cube 1/ });
    const frontFace = cube.querySelector<HTMLElement>('[data-face-index="2"]');
    expect(frontFace).not.toBeNull();
    if (!frontFace) return;

    expect(frontFace.style.transform).toBe('translateZ(50px)');
    expect(frontFace.style.outline).toBe('');
    expect(frontFace.firstElementChild?.classList.contains('bg-white/10')).toBe(true);

    fireEvent.pointerDown(frontFace, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(frontFace, { pointerId: 1, clientX: 160, clientY: 105 });
    const initialDragTransform = cube.style.transform;

    fireEvent.pointerMove(frontFace, { pointerId: 1, clientX: 110, clientY: 200 });
    const crossedBoundaryTransform = cube.style.transform;

    expect(initialDragTransform).not.toContain('matrix3d(1,0,0,0,0,1,0,0,0,0,1');
    expect(crossedBoundaryTransform).toContain('matrix3d(0.990268');
    expect(cube.style.transition).toBe('none');

    fireEvent.pointerUp(frontFace, { pointerId: 1, clientX: 110, clientY: 200 });
    expect(animationFrames).toHaveLength(1);

    await act(async () => {
      animationFrames.shift()?.(performance.now() + 1_000);
    });

    expect(cube.style.transform).toContain('matrix3d(1,0,0,0,0,1,0,0,0,0,1');
    expect(cube.style.zIndex).toBe('40');
  });

  it('animates the final hint solution instead of jumping to it', () => {
    vi.useFakeTimers();
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    render(<App />);

    const versionBadge = screen.getByRole('button', { name: /강의자 모드를 전환/ });
    fireEvent.pointerDown(versionBadge);
    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.pointerUp(versionBadge);
    fireEvent.click(screen.getByRole('button', { name: 'Puzzle 1' }));
    fireEvent.click(screen.getByRole('button', { name: '풀이 힌트 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '다음 힌트 단계' }));
    fireEvent.click(screen.getByRole('button', { name: '다음 힌트 단계' }));

    const cubes = screen.getAllByRole('group', { name: /^Cube \d/ });
    const initialTransforms = cubes.map((cube) => cube.style.transform);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Solution' }));

    expect(animationFrames).toHaveLength(1);
    act(() => animationFrames.shift()?.(performance.now() + 325));

    const middleTransforms = cubes.map((cube) => cube.style.transform);
    expect(middleTransforms.some((transform, index) => transform !== initialTransforms[index])).toBe(true);
    expect(animationFrames).toHaveLength(1);

    act(() => animationFrames.shift()?.(performance.now() + 1_000));
    const finalTransforms = cubes.map((cube) => cube.style.transform);
    expect(finalTransforms.some((transform, index) => transform !== middleTransforms[index])).toBe(true);
    expect(animationFrames).toHaveLength(0);
  });
});
