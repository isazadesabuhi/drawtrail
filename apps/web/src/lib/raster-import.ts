import { traceSilhouette } from './silhouette';

export const RASTER_LIMITS = {
  bytes: 5 * 1024 * 1024,
  pixels: 4_000_000,
  side: 4096,
} as const;
export interface RasterHeader {
  type: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

export function rasterHeader(bytes: Uint8Array): RasterHeader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let header: RasterHeader | undefined;
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
  ) {
    if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR')
      throw new Error('Invalid PNG header.');
    header = {
      type: 'image/png',
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset);
      if (size > bytes.length - offset - 12)
        throw new Error('Invalid PNG chunk.');
      if (
        String.fromCharCode(...bytes.slice(offset + 4, offset + 8)) === 'acTL'
      )
        throw new Error('Animated PNG files are not supported.');
      offset += size + 12;
    }
  } else if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) throw new Error('Invalid JPEG marker.');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++]!;
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length)
        throw new Error('Invalid JPEG segment.');
      if ([192, 193, 194].includes(marker) && length >= 7) {
        header = {
          type: 'image/jpeg',
          height: view.getUint16(offset + 3),
          width: view.getUint16(offset + 5),
        };
        break;
      }
      offset += length;
    }
  }
  if (!header) throw new Error('Choose a valid PNG or JPEG image.');
  if (
    !header.width ||
    !header.height ||
    header.width > RASTER_LIMITS.side ||
    header.height > RASTER_LIMITS.side ||
    header.width * header.height > RASTER_LIMITS.pixels
  )
    throw new Error(
      'Image dimensions exceed the limit: 4096 pixels per side and 4 megapixels total.',
    );
  return header;
}

export interface RasterPreview extends RasterHeader {
  url: string;
  image: HTMLImageElement;
}
export async function loadRaster(file: File): Promise<RasterPreview> {
  if (!file.size || file.size > RASTER_LIMITS.bytes)
    throw new Error('PNG/JPEG images must be 5 MB or smaller.');
  const header = rasterHeader(new Uint8Array(await file.arrayBuffer()));
  if (file.type && file.type !== header.type)
    throw new Error('The image contents do not match its file type.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      !image.naturalWidth ||
      image.naturalWidth * image.naturalHeight > RASTER_LIMITS.pixels
    )
      throw new Error('The decoded image is too large or invalid.');
    return {
      ...header,
      width: image.naturalWidth,
      height: image.naturalHeight,
      url,
      image,
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(
      'This image could not be decoded safely. Choose another PNG or JPEG.',
    );
  }
}

export function traceRaster(preview: RasterPreview) {
  const ratio = Math.min(1, 128 / Math.max(preview.width, preview.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(preview.width * ratio));
  canvas.height = Math.max(2, Math.round(preview.height * ratio));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context)
    throw new Error('Image tracing is unavailable in this browser.');
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(preview.image, 0, 0, canvas.width, canvas.height);
  return traceSilhouette(
    context.getImageData(0, 0, canvas.width, canvas.height),
  );
}
