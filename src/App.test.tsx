/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';

afterEach(cleanup);

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
});
