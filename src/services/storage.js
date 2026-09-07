/**
 * Memory Map - ローカルファースト ストレージサービス
 * idb (IndexedDB) を使用し、未ログイン環境でもブラウザ内で安全に思い出データの永続化を行います。
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
      // 思い出ストアの作成
      if (!db.objectStoreNames.contains(MEMORIES_STORE)) {
        const memoryStore = db.createObjectStore(MEMORIES_STORE, { keyPath: 'id' });
        memoryStore.createIndex('timestamp', 'timestamp');
        memoryStore.createIndex('album', 'album');
      }

      // アプリ設定ストアの作成
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

    // 日時またはタイムスタンプ順にソート（古い順）
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
    timestamp: new Date().toISOString() // 更新時刻を反映
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
