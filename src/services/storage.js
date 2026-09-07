/**
 * Memory Map - ローカルファースト ストレージサービス
 * idb (IndexedDB) を使用し、未ログイン環境でもブラウザ内で安全に思い出データの永続化を行います。
 * ハイブリッド同期に対応したバッチ保存（saveMemoriesBatch）や upsert 処理を提供します。
 */

import { openDB } from 'idb';
import { createMemory, createAppSettings, isValidMemory } from '../models/memory';

const DB_NAME = 'memory_map_db';
const DB_VERSION = 1;
const MEMORIES_STORE = 'memories';
const SETTINGS_STORE = 'settings';

/**
 * IndexedDB インスタンスを初期化・取得
 */
async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(MEMORIES_STORE)) {
        const memoryStore = db.createObjectStore(MEMORIES_STORE, { keyPath: 'id' });
        memoryStore.createIndex('timestamp', 'timestamp');
        memoryStore.createIndex('album', 'album');
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
    },
  });
}

/**
 * すべての思い出を取得（時系列昇順でソート）
 * @returns {Promise<Array>} 思い出の配列
 */
export async function getAllMemories() {
  try {
    const db = await getDB();
    const all = await db.getAll(MEMORIES_STORE);

    return all.sort((a, b) => {
      const timeA = new Date(a.datetime || a.timestamp || 0).getTime();
      const timeB = new Date(b.datetime || b.timestamp || 0).getTime();
      return timeA - timeB;
    });
  } catch (error) {
    console.error('getAllMemories 取得エラー:', error);
    return [];
  }
}

/**
 * IDから単一の思い出を取得
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function getMemoryById(id) {
  if (!id) return null;
  try {
    const db = await getDB();
    const memory = await db.get(MEMORIES_STORE, String(id));
    return memory || null;
  } catch (error) {
    console.error(`getMemoryById エラー (id: ${id}):`, error);
    return null;
  }
}

/**
 * 新しい思い出を保存
 * @param {Object} memoryData 
 * @returns {Promise<string>} 保存された思い出の ID
 */
export async function saveMemory(memoryData) {
  const memory = createMemory(memoryData);
  if (!isValidMemory(memory)) {
    throw new Error('無効な思い出データです。位置情報（lat, lng）が正しく設定されているか確認してください。');
  }

  const db = await getDB();
  await db.put(MEMORIES_STORE, memory);
  return memory.id;
}

/**
 * 既存の思い出を挿入または更新 (Upsert)
 * クラウド同期時にIDを維持して安全に上書き保存します。
 * @param {Object} memoryData 
 * @returns {Promise<string>}
 */
export async function upsertMemory(memoryData) {
  const memory = createMemory(memoryData);
  if (!isValidMemory(memory)) {
    throw new Error('無効な思い出データです。');
  }

  const db = await getDB();
  await db.put(MEMORIES_STORE, memory);
  return memory.id;
}

/**
 * 複数の思い出を一括で保存・マージ（バッチ登録）
 * @param {Array<Object>} memoriesList 
 * @returns {Promise<number>} 保存された件数
 */
export async function saveMemoriesBatch(memoriesList = []) {
  if (!Array.isArray(memoriesList) || memoriesList.length === 0) return 0;

  const db = await getDB();
  const tx = db.transaction(MEMORIES_STORE, 'readwrite');
  let count = 0;

  for (const item of memoriesList) {
    const memory = createMemory(item);
    if (isValidMemory(memory)) {
      await tx.store.put(memory);
      count++;
    }
  }

  await tx.done;
  return count;
}

/**
 * 既存の思い出を更新
 * @param {Object} memoryData 
 * @returns {Promise<void>}
 */
export async function updateMemory(memoryData) {
  if (!memoryData || !memoryData.id) {
    throw new Error('更新対象の思い出 ID が指定されていません。');
  }

  const existing = await getMemoryById(memoryData.id);
  const updated = createMemory({
    ...(existing || {}),
    ...memoryData,
    timestamp: new Date().toISOString()
  });

  if (!isValidMemory(updated)) {
    throw new Error('無効な思い出データです。');
  }

  const db = await getDB();
  await db.put(MEMORIES_STORE, updated);
}

/**
 * 思い出を削除
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteMemory(id) {
  if (!id) return;
  const db = await getDB();
  await db.delete(MEMORIES_STORE, String(id));
}

/**
 * アプリ設定を取得（自宅位置、カスタムアルバム表紙など）
 * @returns {Promise<Object>}
 */
export async function getAppSettings() {
  try {
    const db = await getDB();
    const settings = await db.get(SETTINGS_STORE, 'app_settings');
    return createAppSettings(settings || {});
  } catch (error) {
    console.error('getAppSettings 取得エラー:', error);
    return createAppSettings();
  }
}

/**
 * アプリ設定を保存
 * @param {Object} settingsData 
 * @returns {Promise<void>}
 */
export async function saveAppSettings(settingsData) {
  const db = await getDB();
  const current = await getAppSettings();
  const merged = createAppSettings({
    ...current,
    ...settingsData
  });
  await db.put(SETTINGS_STORE, merged, 'app_settings');
}
