/**
 * Shrink a camera photo before upload (phones produce 3–8 MB images).
 * Returns a JPEG Blob, longest side ≤ maxSide. Falls back to the original file if the browser cannot decode it.
 */
export async function compressImage(file, { maxSide = 1600, quality = 0.75 } = {}) {
  try {
    const bitmap = await (window.createImageBitmap
      ? createImageBitmap(file, { imageOrientation: 'from-image' })
      : new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        }));
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
