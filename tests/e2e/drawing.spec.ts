import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { mockMapStyle } from './map-fixture';

async function openDrawing(page: Page) {
  await mockMapStyle(page);
  await page.goto('/workspace');
  await expect(
    page.getByRole('button', { name: 'Start drawing', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Start drawing', exact: true })
    .click();
  await expect(
    page.getByRole('application', { name: 'Drawing canvas' }),
  ).toBeVisible();
}
async function drawStroke(page: Page, touch: boolean, offset = 0) {
  const canvas = page.getByRole('application', { name: 'Drawing canvas' });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const points = [
    [0.18, 0.25 + offset],
    [0.35, 0.65 + offset],
    [0.55, 0.25 + offset],
    [0.8, 0.5 + offset],
  ].map(([x, y]) => ({
    x: box.x + box.width * x!,
    y: box.y + box.height * y!,
  }));
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...points[0]!, id: 1 }],
    });
    for (const point of points.slice(1))
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...point, id: 1 }],
      });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await session.detach();
  } else {
    await page.mouse.move(points[0]!.x, points[0]!.y);
    await page.mouse.down();
    for (const point of points.slice(1))
      await page.mouse.move(point.x, point.y, { steps: 4 });
    await page.mouse.up();
  }
}

test('freehand mouse/touch and keyboard drawing support multiple-stroke history', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    Object.defineProperty(window.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openDrawing(page);
  await drawStroke(page, testInfo.project.name === 'mobile');
  await drawStroke(page, testInfo.project.name === 'mobile', -0.12);
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '2 strokes',
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '1 stroke',
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Clear drawing' }).click();
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '0 strokes',
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const canvas = page.getByRole('application', { name: 'Drawing canvas' });
  await canvas.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '3 strokes',
  );
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '2 strokes',
  );
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '3 strokes',
  );
  await expect(page.getByLabel('Draft storage')).toHaveText(
    'Saved on this device',
  );
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('drawtrail.drawing.v1')!),
  );
  expect(draft.drawing.strokes).toHaveLength(3);
  expect(
    draft.drawing.strokes.every((stroke: { points: number[][] }) =>
      stroke.points.every((point) =>
        point.every((value) => value >= 0 && value <= 1),
      ),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('presets and transforms persist across reloads while map location stays transient', async ({
  page,
}, testInfo) => {
  await mockMapStyle(page);
  await page.goto('/workspace');
  await page.getByLabel('Latitude', { exact: true }).fill('45.77');
  await page.getByLabel('Longitude', { exact: true }).fill('4.84');
  await page.getByRole('button', { name: 'Set start point' }).click();
  await page
    .getByRole('button', { name: 'Start drawing', exact: true })
    .click();
  await page.getByRole('button', { name: 'Heart', exact: true }).click();
  const polyline = page.locator('.drawing-canvas polyline');
  const original = await polyline.getAttribute('points');
  await page.getByRole('button', { name: 'Rotate right' }).click();
  await page.getByRole('button', { name: 'Make smaller' }).click();
  await page.getByRole('button', { name: 'Flip horizontally' }).click();
  await expect(polyline).not.toHaveAttribute('points', original!);
  await page.getByRole('button', { name: 'Simplify & resample' }).click();
  await expect(page.getByLabel('Draft storage')).toHaveText(
    'Saved on this device',
  );
  const transformed = await polyline.getAttribute('points');
  await page.getByRole('button', { name: 'Choose your place' }).click();
  await expect(
    page.getByRole('status', { name: 'Selected start point', exact: true }),
  ).toContainText('45.770000');
  await page.reload();
  await expect(
    page.getByRole('status', { name: 'Selected start point', exact: true }),
  ).toContainText('No start point');
  await page
    .getByRole('button', { name: 'Start drawing', exact: true })
    .click();
  await expect(polyline).toHaveAttribute('points', transformed!);
  await expect(page.getByLabel('Drawing feedback')).toContainText('restored');
  await page
    .getByRole('application', { name: 'Drawing canvas' })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('drawing-editor.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('SVG import rejects active content and preserves explicit stroke ordering', async ({
  page,
}) => {
  let dialogs = 0;
  page.on('dialog', (dialog) => {
    dialogs++;
    void dialog.dismiss();
  });
  await openDrawing(page);
  const upload = page.getByLabel('Choose SVG, PNG or JPEG');
  await upload.setInputFiles(resolve('tests/fixtures/drawing/two-strokes.svg'));
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '2 strokes',
  );
  await expect(page.getByText(/These are separate strokes/)).toBeVisible();
  await page.getByRole('button', { name: 'Move stroke 2 earlier' }).click();
  await page.getByRole('button', { name: /1\. Stroke 2/ }).click();
  await page.getByRole('button', { name: 'Use only selected stroke' }).click();
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '1 stroke',
  );
  await upload.setInputFiles(resolve('tests/fixtures/drawing/unsafe.svg'));
  await expect(
    page.getByRole('alert', { name: 'Drawing feedback' }),
  ).toContainText('Unsupported SVG');
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '1 stroke',
  );
  await upload.setInputFiles({
    name: 'large.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.alloc(300_000),
  });
  await expect(
    page.getByRole('alert', { name: 'Drawing feedback' }),
  ).toContainText('256 KB');
  expect(dialogs).toBe(0);
});

test('a fixed PNG remains a preview until its ordered silhouette is reviewed and accepted', async ({
  page,
}) => {
  await openDrawing(page);
  await page.getByRole('button', { name: 'Circle', exact: true }).click();
  const before = await page
    .locator('.drawing-canvas polyline')
    .getAttribute('points');
  await page
    .getByLabel('Choose SVG, PNG or JPEG')
    .setInputFiles(resolve('tests/fixtures/drawing/silhouette-square.png'));
  await expect(
    page.getByRole('img', { name: 'Uploaded image preview' }),
  ).toBeVisible();
  await expect(page.locator('.drawing-canvas polyline')).toHaveAttribute(
    'points',
    before!,
  );
  await page.getByRole('button', { name: 'Trace silhouette' }).click();
  await expect(
    page.getByRole('img', { name: 'Extracted silhouette outline' }),
  ).toBeVisible();
  await expect(page.locator('.drawing-canvas polyline')).toHaveAttribute(
    'points',
    before!,
  );
  await page
    .getByRole('button', { name: 'Replace drawing with outline' })
    .click();
  await expect(page.getByLabel('Draft storage')).toHaveText(
    'Saved on this device',
  );
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('drawtrail.drawing.v1')!),
  );
  const stroke = draft.drawing.strokes[0];
  expect(stroke.closed).toBe(true);
  expect(stroke.points).toHaveLength(5);
  for (const point of stroke.points)
    for (const value of point)
      expect(
        Math.min(Math.abs(value - 0.12), Math.abs(value - 0.88)),
      ).toBeLessThan(1e-6);
  expect(JSON.stringify(draft)).not.toContain('blob:');
  // Exercise JPEG decoding with a deterministic re-encoding of the same fixture.
  const png = readFileSync(
    resolve('tests/fixtures/drawing/silhouette-square.png'),
  ).toString('base64');
  const jpeg = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas.toDataURL('image/jpeg').split(',')[1]!;
  }, png);
  await page.getByLabel('Choose SVG, PNG or JPEG').setInputFiles({
    name: 'preview.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpeg, 'base64'),
  });
  await expect(
    page.getByRole('img', { name: 'Uploaded image preview' }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('button', { name: 'Start drawing', exact: true })
    .click();
  await expect(
    page.getByRole('img', { name: 'Uploaded image preview' }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '1 stroke',
  );
});

test('a corrupt saved draft resets without breaking keyboard editing', async ({
  page,
}) => {
  await mockMapStyle(page);
  await page.goto('/workspace');
  await page.evaluate(() =>
    localStorage.setItem('drawtrail.drawing.v1', '{broken'),
  );
  await page.reload();
  await page
    .getByRole('button', { name: 'Start drawing', exact: true })
    .click();
  await expect(page.getByLabel('Drawing feedback')).toContainText('corrupt');
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '0 strokes',
  );
  await page.getByRole('button', { name: 'Star', exact: true }).click();
  await expect(page.getByLabel('Stroke count', { exact: true })).toHaveText(
    '1 stroke',
  );
});
