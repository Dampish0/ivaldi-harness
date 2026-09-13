/** Message file URLs belong to the server. Only picker-owned files are phone-local. */
export function previewableImageUri(uri: string, mime: string, origin: 'picker' | 'message'): string | null {
  if (!/^image\/(png|jpeg|webp)$/i.test(mime)) return null;
  const embedded = uri.slice(0, 64).match(/^data:(image\/(?:png|jpeg|webp));base64,/i);
  if (embedded) return embedded[1].toLowerCase() === mime.toLowerCase() && uri.length > embedded[0].length ? uri : null;
  return origin === 'picker' && /^(file|content):\/\//i.test(uri) ? uri : null;
}
