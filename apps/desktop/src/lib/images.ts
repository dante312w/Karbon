const MAX_SIDE_PX = 800;
const QUALITY = 0.85;

/**
 * Reduce una imagen elegida por el usuario a un data URL liviano (máx. 800 px, WebP/JPEG) antes
 * de subirla: el servidor acepta hasta 512 KB y las fotos de celular pesan varios MB.
 */
export async function imageFileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo procesar la imagen');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', QUALITY);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', QUALITY);
}
