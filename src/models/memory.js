/**
 * Memory Map - データモデル定義
 * アーキテクトの設計に基づき、思い出データおよびアプリ設定の構造・ファクトリを提供します。
 * ハイブリッド同期に対応するため、syncStatus ('synced' | 'pending') をサポートします。
 */

/**
 * 思い出（Memory）オブジェクトを生成するファクトリ関数
 * @param {Object} data 
 * @returns {Object} 正規化された Memory オブジェクト
 */
export function createMemory(data = {}) {
  const nowIso = new Date().toISOString();
  
  // UUID の生成（非対応環境向けにフォールバックあり）
  const id = data.id || (
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  return {
    id: String(id),
    title: (data.title || '').trim(),
    diary: (data.diary || '').trim(),
    lat: typeof data.lat === 'number' ? data.lat : Number(data.lat) || 0,
    lng: typeof data.lng === 'number' ? data.lng : Number(data.lng) || 0,
    datetime: data.datetime ? new Date(data.datetime).toISOString() : null,
    timestamp: data.timestamp ? new Date(data.timestamp).toISOString() : nowIso,
    album: (data.album || '').trim(),
    tags: Array.isArray(data.tags)
      ? [...new Set(data.tags.map(t => String(t).trim()).filter(Boolean))]
      : [],
    imageUrls: Array.isArray(data.imageUrls)
      ? data.imageUrls
      : (data.imageUrl ? [data.imageUrl] : []),
    // ハイブリッド同期用ステータス ('synced': クラウド同期済, 'pending': 未同期・ローカル優先)
    syncStatus: data.syncStatus === 'synced' ? 'synced' : 'pending'
  };
}

/**
 * アプリ設定（AppSettings）オブジェクトを生成するファクトリ関数
 * @param {Object} data 
 * @returns {Object} 正規化された AppSettings オブジェクト
 */
export function createAppSettings(data = {}) {
  return {
    homeLocation: data.homeLocation && typeof data.homeLocation.lat === 'number' && typeof data.homeLocation.lng === 'number'
      ? { lat: data.homeLocation.lat, lng: data.homeLocation.lng }
      : null,
    customAlbumCovers: data.customAlbumCovers && typeof data.customAlbumCovers === 'object'
      ? { ...data.customAlbumCovers }
      : {}
  };
}

/**
 * Memory オブジェクトの最低限のバリデーション
 * @param {Object} memory 
 * @returns {boolean}
 */
export function isValidMemory(memory) {
  if (!memory || typeof memory !== 'object') return false;
  if (!memory.id) return false;
  if (typeof memory.lat !== 'number' || typeof memory.lng !== 'number') return false;
  if (isNaN(memory.lat) || isNaN(memory.lng)) return false;
  return true;
}
