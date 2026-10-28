// Player avatars use the stable file name {player UUID}.webp.
// The Storage bucket is public-read and password-protected for writes.
export const PROFILE_BUCKET = 'whist-profiles';
export const MAX_AVATAR_ZOOM = 4;

export function profileUrl(supabase, playerId, cacheKey = '') {
  const { data } = supabase.storage.from(PROFILE_BUCKET).getPublicUrl(`${playerId}.webp`);
  return `${data.publicUrl}?v=${encodeURIComponent(cacheKey || '1')}`;
}

function validateAvatarFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Vælg et JPG-, PNG- eller WebP-billede.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Billedet må højst fylde 10 MB før beskæring.');
  }
}

// Decode once for both the live preview and the final saved image.
export async function loadAvatarImage(file) {
  validateAvatarFile(file);
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Billedet kunne ikke åbnes.'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('Billedet kunne ikke læses.');
    }
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// x/y are offsets from the centre in source-image pixels. Keeping the crop in
// source pixels makes dragging accurate at every viewport size, including phones.
export function avatarCrop(image, {zoom = 1, x = 0, y = 0} = {}) {
  const width = image.naturalWidth ?? image.width;
  const height = image.naturalHeight ?? image.height;
  if (!(width > 0) || !(height > 0)) throw new Error('Billedet kunne ikke læses.');
  const scale = Math.max(1, Math.min(MAX_AVATAR_ZOOM, Number(zoom) || 1));
  const size = Math.min(width, height) / scale;
  const maxX = (width - size) / 2;
  const maxY = (height - size) / 2;
  const safeX = Math.max(-maxX, Math.min(maxX, Number(x) || 0));
  const safeY = Math.max(-maxY, Math.min(maxY, Number(y) || 0));
  return {
    zoom: scale, x: safeX, y: safeY, size,
    sourceX: maxX + safeX,
    sourceY: maxY + safeY
  };
}

export function moveAvatarCrop(image, crop, deltaX, deltaY, viewportSize) {
  const current = avatarCrop(image, crop);
  if (!(viewportSize > 0)) return current;
  const pixelsPerViewPixel = current.size / viewportSize;
  // Dragging the picture right exposes the left side of the source image.
  return avatarCrop(image, {
    zoom: current.zoom,
    x: current.x - deltaX * pixelsPerViewPixel,
    y: current.y - deltaY * pixelsPerViewPixel
  });
}

// Transform the crop about the touch midpoint. The source pixel under the old
// midpoint remains under the new midpoint as fingers move and change distance.
// Using successive gestures also handles a pinch that pans at the same time.
export function pinchAvatarCrop(image, crop, previous, next, viewportSize) {
  const current = avatarCrop(image, crop);
  if (!(viewportSize > 0) || !(previous?.distance > 0) ||
      !(next?.distance > 0)) return current;
  const zoom = current.zoom * next.distance / previous.distance;
  const resized = avatarCrop(image, {...current, zoom});
  const oldPixels = current.size / viewportSize;
  const newPixels = resized.size / viewportSize;
  const cx = viewportSize / 2;
  return avatarCrop(image, {
    zoom: resized.zoom,
    x: current.x + (previous.x - cx) * oldPixels - (next.x - cx) * newPixels,
    y: current.y + (previous.y - cx) * oldPixels - (next.y - cx) * newPixels
  });
}

export function drawAvatarCrop(canvas, image, crop = {}) {
  const area = avatarCrop(image, crop);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Din browser kan ikke behandle billedet.');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, area.sourceX, area.sourceY, area.size, area.size,
    0, 0, canvas.width, canvas.height);
  return area;
}

export async function prepareAvatar(file, {image, ...crop} = {}) {
  validateAvatarFile(file);
  const source = image ?? await loadAvatarImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  drawAvatarCrop(canvas, source, crop);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .82));
  if (!blob || blob.type !== 'image/webp') {
    throw new Error('Din browser understøtter ikke WebP. Prøv en anden browser.');
  }
  if (blob.size > 2 * 1024 * 1024) {
    throw new Error('Det behandlede billede er for stort.');
  }
  return blob;
}
