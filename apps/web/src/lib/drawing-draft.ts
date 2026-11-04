import type { Drawing } from '@drawtrail/types';
import { emptyDrawing } from '@drawtrail/geo-utils';
import { drawingDraftSchema } from '@drawtrail/validation';

export const DRAWING_DRAFT_KEY = 'drawtrail.drawing.v1';
export const MAX_DRAFT_CHARS = 1_000_000;
export function readDrawingDraft(storage: Pick<Storage, 'getItem'>) {
  const empty = {
    drawing: emptyDrawing(),
    selectedStrokeId: null as string | null,
    notice: '',
  };
  try {
    const text = storage.getItem(DRAWING_DRAFT_KEY);
    if (!text) return empty;
    if (text.length > MAX_DRAFT_CHARS)
      return {
        ...empty,
        notice: 'The saved draft was too large. Started a new drawing.',
      };
    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch {
      return {
        ...empty,
        notice: 'The saved draft was corrupt. Started a new drawing.',
      };
    }
    const parsed = drawingDraftSchema.safeParse(decoded);
    if (!parsed.success)
      return {
        ...empty,
        notice:
          'The saved draft was corrupt or used an unsupported version. Started a new drawing.',
      };
    return {
      drawing: parsed.data.drawing as Drawing,
      selectedStrokeId: parsed.data.selectedStrokeId,
      notice: 'Your drawing draft was restored from this device.',
    };
  } catch {
    return {
      ...empty,
      notice: 'The saved draft could not be read. You can still draw here.',
    };
  }
}

export function writeDrawingDraft(
  storage: Pick<Storage, 'setItem'>,
  drawing: Drawing,
  selectedStrokeId: string | null,
) {
  const value = drawingDraftSchema.parse({
    version: 1,
    drawing,
    selectedStrokeId,
  });
  const text = JSON.stringify(value);
  if (text.length > MAX_DRAFT_CHARS)
    throw new Error('Draft is too large to save locally.');
  storage.setItem(DRAWING_DRAFT_KEY, text);
}
