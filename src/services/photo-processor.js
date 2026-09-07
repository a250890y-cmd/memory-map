/**
 * Memory Map - 写真処理 & EXIF抽出モジュール
 * 写真ファイルからのGPS位置情報・撮影日時の自動抽出、HEIC形式のJPEG変換、
 * および IndexedDB 保存に適した画像リサイズ処理を提供します。
 */

import exifr from 'exifr';
import heic2any from 'heic2any';

/**
 * 写真ファイルから EXIF メタデータ（GPS座標、撮影日時）を抽出
 * @param {File|Blob} file 
 * @returns {Promise<{lat: number|null, lng: number|null, datetime: string|null}>}
 */
async function extractMetadata(file) {
  let lat = null;
  let lng = null;
  let datetime = null;

  // GPS 座標の抽出
  try {
    const gpsData = await exifr.gps(file);
    if (gpsData && typeof gpsData.latitude === 'number' && typeof gpsData.longitude === 'number') {
      lat = gpsData.latitude;
      lng = gpsData.longitude;
    }
  } catch (err) {
    console.warn('GPS データの抽出スキップ（未設定または非対応形式）:', err);
  }

  // 撮影日時の抽出
  try {
    const parsed = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
    const rawDate = parsed?.DateTimeOriginal || parsed?.CreateDate;
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      datetime = rawDate.toISOString();
    } else if (rawDate) {
      const parsedDate = new Date(rawDate);
      if (!isNaN(parsedDate.getTime())) {
        datetime = parsedDate.toISOString();
      }
    }
  } catch (err) {
    console.warn('撮影日時の抽出スキップ（未設定または非対応形式）:', err);
  }

  return { lat, lng, datetime };
}

/**
 * HEIC/HEIF 形式のファイルを JPEG Blob に変換（非HEICファイルはそのまま返却）
 * @param {File|Blob} file 
 * @returns {Promise<Blob|File>}
 */
async function convertHeicIfNeeded(file) {
  const isHeic = (file.name && (/\.(heic|heif)$/i).test(file.name))
    || file.type === 'image/heic'
    || file.type === 'image/heif';

  if (!isHeic) return file;

  try {
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9
    });
    return Array.isArray(converted) ? converted[0] : converted;
  } catch (error) {
    console.warn('HEICからJPEGへの変換に失敗しました。元のファイルでフォールバックします:', error);
    return file;
  }
}

/**
 * 画像を指定された最大長辺サイズにリサイズし、Base64 (DataURL) として出力
 * @param {File|Blob} fileOrBlob 
 * @param {number} maxDimension 最大長辺ピクセル数（デフォルト: 1920px）
 * @param {number} quality JPEG圧縮品質 (0.0 〜 1.0, デフォルト: 0.85)
 * @returns {Promise<string>} Base64 DataURL
 */
export function resizeImageToBase64(fileOrBlob, maxDimension = 1920, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // 長辺に合わせてアスペクト比を維持し縮小
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(e.target.result);
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(fileOrBlob);
  });
}

/**
 * 写真ファイルを処理し、位置情報・撮影日時とリサイズ済みDataURLを返す
 * @param {File} file アップロードされた画像ファイル
 * @param {Object} [options] リサイズ設定オプション
 * @param {number} [options.maxDimension=1920]
 * @param {number} [options.quality=0.85]
 * @returns {Promise<{imageUrl: string, lat: number|null, lng: number|null, datetime: string|null, fileName: string}>}
 */
export async function processPhotoFile(file, options = {}) {
  const { maxDimension = 1920, quality = 0.85 } = options;

  // 1. HEIC変換前に EXIF メタデータを直接抽出（exifr は HEIC の EXIF にネイティブ対応）
  const { lat, lng, datetime } = await extractMetadata(file);

  // 2. ブラウザ描画用に HEIC を JPEG に変換
  const renderableFile = await convertHeicIfNeeded(file);

  // 3. 最大1920pxにリサイズして Base64 DataURL 化
  let imageUrl = '';
  try {
    imageUrl = await resizeImageToBase64(renderableFile, maxDimension, quality);
  } catch (err) {
    console.error('リサイズ処理失敗、BlobURLフォールバック:', err);
    imageUrl = URL.createObjectURL(renderableFile);
  }

  return {
    imageUrl,
    lat,
    lng,
    datetime,
    fileName: file.name || 'photo.jpg'
  };
}

// 既存コードとの互換用エイリアス
export const processLocalPhoto = processPhotoFile;
