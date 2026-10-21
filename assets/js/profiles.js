// Player avatars use the stable file name {player UUID}.webp.
// The Storage bucket is public-read and password-protected for writes.
export const PROFILE_BUCKET = 'whist-profiles';

export function profileUrl(supabase, playerId, cacheKey = '') {
  const { data } = supabase.storage.from(PROFILE_BUCKET).getPublicUrl(`${playerId}.webp`);
  return `${data.publicUrl}?v=${encodeURIComponent(cacheKey || '1')}`;
}

export async function prepareAvatar(file) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) {
    throw new Error('Vælg et JPG-, PNG- eller WebP-billede.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Billedet må højst fylde 10 MB før beskæring.');
  }

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

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Din browser kan ikke behandle billedet.');
    const edge = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(image,
      (image.naturalWidth - edge) / 2, (image.naturalHeight - edge) / 2,
      edge, edge, 0, 0, 512, 512);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .82));
    if (!blob || blob.type !== 'image/webp') {
      throw new Error('Din browser understøtter ikke WebP. Prøv en anden browser.');
    }
    if (blob.size > 2 * 1024 * 1024) {
      throw new Error('Det behandlede billede er for stort.');
    }
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
