import { Directory, File, Paths } from 'expo-file-system';

const dir = () => new Directory(Paths.document, 'photos');

/** Copy a prepared photo into the app sandbox. Returns the stored URI. */
export function persistPhoto(srcUri: string, mealId: string): string {
  const d = dir();
  if (!d.exists) d.create({ intermediates: true });
  const dest = new File(d, `${mealId}.jpg`);
  if (dest.exists) dest.delete();
  new File(srcUri).copy(dest);
  return dest.uri;
}

export function deletePhoto(uri?: string): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* ignore */
  }
}

export function deleteAllPhotos(): void {
  try {
    const d = dir();
    if (d.exists) d.delete();
  } catch {
    /* ignore */
  }
}
