import { File, Paths } from 'expo-file-system';
import { secureTokenStore } from '@/api/tokenStore';
import { mealsRepo } from '@/db/mealsRepo';
import { settingsRepo } from '@/db/settingsRepo';
import { deleteAllPhotos } from '@/image/photos';

export const EXPORT_FILE_NAME = 'calorietracker-export.json';

/** Location of the temporary export file handed to the share sheet. */
export const exportFile = (): File => new File(Paths.cache, EXPORT_FILE_NAME);

/** All user data as pretty JSON (never includes the install token). */
export async function exportAll(): Promise<string> {
  const [meals, settings] = await Promise.all([mealsRepo.listAll(), settingsRepo.load()]);
  return JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, settings, meals }, null, 2);
}

function deleteExportFile(): void {
  try {
    const f = exportFile();
    if (f.exists) f.delete();
  } catch {
    /* ignore */
  }
}

/**
 * Wipes DB rows, stored photos, any leftover export file (it contains the full meal history)
 * and the install token. Every step is attempted even if an earlier one fails; the first
 * failure is rethrown so the UI can tell the user the wipe was incomplete.
 */
export async function deleteAllData(): Promise<void> {
  let firstError: unknown = null;
  try {
    await mealsRepo.deleteAll();
  } catch (e) {
    firstError = e;
  }
  deleteAllPhotos();
  deleteExportFile();
  try {
    await secureTokenStore.clear();
  } catch (e) {
    firstError ??= e;
  }
  if (firstError) throw firstError;
}
