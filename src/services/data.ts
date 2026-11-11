import { secureTokenStore } from '@/api/tokenStore';
import { mealsRepo } from '@/db/mealsRepo';
import { settingsRepo } from '@/db/settingsRepo';
import { deleteAllPhotos } from '@/image/photos';


/** All user data as pretty JSON (never includes the install token). */
export async function exportAll(): Promise<string> {
  const [meals, settings] = await Promise.all([mealsRepo.listAll(), settingsRepo.load()]);
  return JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, settings, meals }, null, 2);
}

/** Wipes DB rows, stored photos and the install token. */
export async function deleteAllData(): Promise<void> {
  await mealsRepo.deleteAll();
  deleteAllPhotos();
  await secureTokenStore.clear();
}
