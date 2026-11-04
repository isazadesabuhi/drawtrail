// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawingPreset } from '@drawtrail/geo-utils';
import { DrawingEditor } from './drawing-editor';
import { DRAWING_DRAFT_KEY } from '../lib/drawing-draft';

const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
beforeEach(() => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    key: (index) => [...values.keys()][index] ?? null,
  };
  // Isolate browser storage from Node 25's optional global localStorage shim.
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalStorage)
    Object.defineProperty(window, 'localStorage', originalStorage);
});
function keyboardLine() {
  const canvas = screen.getByRole('application', { name: 'Drawing canvas' });
  fireEvent.keyDown(canvas, { key: ' ' });
  fireEvent.keyDown(canvas, { key: 'ArrowRight', shiftKey: true });
  fireEvent.keyDown(canvas, { key: ' ' });
  fireEvent.keyDown(canvas, { key: 'ArrowDown', shiftKey: true });
  fireEvent.keyDown(canvas, { key: ' ' });
  fireEvent.keyDown(canvas, { key: 'Enter' });
  return canvas;
}
describe('drawing editor interactions', () => {
  it('adds multiple keyboard strokes, undoes/redoes and clears without losing history', () => {
    render(<DrawingEditor />);
    const canvas = keyboardLine();
    keyboardLine();
    expect(screen.getByLabelText('Stroke count')).toHaveTextContent(
      '2 strokes',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Stroke count')).toHaveTextContent('1 stroke');
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByLabelText('Stroke count')).toHaveTextContent(
      '2 strokes',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear drawing' }));
    expect(screen.getByLabelText('Stroke count')).toHaveTextContent(
      '0 strokes',
    );
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });
    expect(screen.getByLabelText('Stroke count')).toHaveTextContent(
      '2 strokes',
    );
  });
  it('applies presets and transformations, restores geometry on undo, then reopens a saved draft', async () => {
    const page = render(<DrawingEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    const original = page.container
      .querySelector('.drawing-canvas polyline')
      ?.getAttribute('points');
    fireEvent.click(screen.getByRole('button', { name: 'Move left' }));
    expect(
      page.container
        .querySelector('.drawing-canvas polyline')
        ?.getAttribute('points'),
    ).not.toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      page.container
        .querySelector('.drawing-canvas polyline')
        ?.getAttribute('points'),
    ).toBe(original);
    await waitFor(() =>
      expect(screen.getByLabelText('Draft storage')).toHaveTextContent(
        'Saved on this device',
      ),
    );
    page.unmount();
    render(<DrawingEditor />);
    expect(screen.getByLabelText('Stroke count')).toHaveTextContent('1 stroke');
    expect(screen.getByLabelText('Drawing feedback')).toHaveTextContent(
      'restored',
    );
  });
  it('reorders and selects separate strokes without inventing connectors', () => {
    const first = drawingPreset('letter');
    window.localStorage.setItem(
      DRAWING_DRAFT_KEY,
      JSON.stringify({
        version: 1,
        drawing: {
          ...first,
          strokes: [
            ...first.strokes,
            { ...first.strokes[0], id: 'second', label: 'Second' },
          ],
        },
        selectedStrokeId: null,
      }),
    );
    render(<DrawingEditor />);
    expect(screen.getByText(/These are separate strokes/)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Move stroke 2 earlier' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /1\. Second/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Use only selected stroke' }),
    );
    expect(screen.getByLabelText('Stroke count')).toHaveTextContent('1 stroke');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Stroke count')).toHaveTextContent(
      '2 strokes',
    );
  });
  it('resets a corrupt local draft and keeps editing when saving is unavailable', async () => {
    window.localStorage.setItem(DRAWING_DRAFT_KEY, '{broken');
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    render(<DrawingEditor />);
    expect(screen.getByLabelText('Drawing feedback')).toHaveTextContent(
      'corrupt',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Square' }));
    expect(screen.getByLabelText('Stroke count')).toHaveTextContent('1 stroke');
    await waitFor(() =>
      expect(screen.getByLabelText('Draft storage')).toHaveTextContent(
        'Local saving unavailable',
      ),
    );
  });
});
