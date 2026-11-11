import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

export const MAX_EDGE = 1024;
export const JPEG_QUALITY = 0.7;

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
  /** hex SHA-256 of the resized JPEG bytes */
  hash: string;
}

/** Pure: size after fitting the longest edge to `max` (never upscales). */
export function targetSize(w: number, h: number, max = MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const k = max / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const getSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) =>
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject),
  );

/** Downscale to 1024px, re-encode JPEG q=0.7 (drops EXIF/GPS), hash the result. */
export async function prepareImage(sourceUri: string): Promise<PreparedImage> {
  const { width, height } = await getSize(sourceUri);
  const target = targetSize(width, height);
  const ctx = ImageManipulator.manipulate(sourceUri);
  if (target.width !== width || target.height !== height) ctx.resize(target);
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  const bytes = await new File(out.uri).bytes();
  const hash = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
  return { uri: out.uri, width: out.width, height: out.height, hash };
}

export async function hashText(text: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}
