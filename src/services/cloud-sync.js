/**
 * Memory Map - クラウド同期エンジン (Cloud Sync Engine)
 * reference/storage.js の仕様に準拠し、Firestore (users/{uid}/memories) および
 * Firebase Storage (images/{uid}/...) とローカル IndexedDB の双方向同期・データ復旧を行います。
 * オフライン時や通信障害時でも例外でアプリが落ちない安全設計を徹底しています。
 */

import { db, storage, isFirebaseInitialized } from './firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy
} from 'firebase/firestore';
import {
  ref,
  uploadString,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { getAllMemories, saveMemoriesBatch, upsertMemory } from './storage';
import { createMemory } from '../models/memory';

/**
 * Base64 画像配列を Firebase Storage へアップロードし、ダウンロード URL 配列を返却
 * @param {string} uid ユーザーID
 * @param {Array<string>} imageUrls 
 * @returns {Promise<Array<string>>}
 */
export async function uploadImagesToStorage(uid, imageUrls = []) {
  if (!storage || !uid || !Array.isArray(imageUrls)) return imageUrls;

  const uploadedUrls = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const dataUrl = imageUrls[i];
    
    // 既に http(s) URL の場合はアップロード不要
    if (typeof dataUrl === 'string' && dataUrl.startsWith('http')) {
      uploadedUrls.push(dataUrl);
      continue;
    }

    // Base64 DataURL のアップロード
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
      try {
        const fileName = `images/${uid}/${Date.now()}_${i}.jpg`;
        const imageRef = ref(storage, fileName);
        await uploadString(imageRef, dataUrl, 'data_url');
        const downloadUrl = await getDownloadURL(imageRef);
        uploadedUrls.push(downloadUrl);
      } catch (err) {
        console.warn(`画像のStorageアップロードに失敗 (${i}枚目):`, err);
        uploadedUrls.push(dataUrl); // 失敗時は元のBase64を維持
      }
    } else {
      uploadedUrls.push(dataUrl);
    }
  }

  return uploadedUrls;
}

/**
 * Firestore から指定ユーザーの過去の思い出データを全件取得
 * @param {Object} user Firebase ユーザー
 * @returns {Promise<Array<Object>>}
 */
export async function fetchCloudMemories(user) {
  if (!isFirebaseInitialized || !db || !user || !user.uid) {
    return [];
  }

  try {
    const memoriesCol = collection(db, 'users', user.uid, 'memories');
    let snapshot;

    // timestamp ソートのクエリを試行（インデックスエラー時はフォールバック）
    try {
      const q = query(memoriesCol, orderBy('timestamp', 'asc'));
      snapshot = await getDocs(q);
    } catch (queryErr) {
      console.warn('orderBy クエリエラー。全件直接取得にフォールバックします:', queryErr);
      snapshot = await getDocs(memoriesCol);
    }

    const cloudMemories = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      cloudMemories.push(createMemory({
        ...data,
        id: docSnap.id,
        syncStatus: 'synced'
      }));
    });

    return cloudMemories;
  } catch (error) {
    console.error('fetchCloudMemories 取得エラー:', error);
    return [];
  }
}

/**
 * クラウドデータとローカル IndexedDB の双方向同期・復旧処理
 * @param {Object} user 
 * @returns {Promise<{success: boolean, importedCount: number, uploadedCount: number, totalCount: number}>}
 */
export async function syncWithCloud(user) {
  if (!isFirebaseInitialized || !db || !user || !user.uid) {
    return { success: false, importedCount: 0, uploadedCount: 0, totalCount: 0 };
  }

  try {
    console.log(`[CloudSync] ユーザー ${user.email || user.uid} のクラウド同期を開始します...`);

    // 1. ローカルとクラウドの双方からデータを取得
    const [localMemories, cloudMemories] = await Promise.all([
      getAllMemories(),
      fetchCloudMemories(user)
    ]);

    const localMap = new Map(localMemories.map(m => [m.id, m]));
    const cloudMap = new Map(cloudMemories.map(m => [m.id, m]));

    const toImportToLocal = [];
    const toUploadToCloud = [];

    // 2. クラウドデータのローカル取り込み・新旧判定
    cloudMemories.forEach(cloudMem => {
      const localMem = localMap.get(cloudMem.id);
      if (!localMem) {
        // ローカルに存在しない過去データ ➔ IndexedDB へ復元
        toImportToLocal.push(cloudMem);
      } else {
        // 双方に存在する場合、timestamp を比較
        const cloudTime = new Date(cloudMem.timestamp || 0).getTime();
        const localTime = new Date(localMem.timestamp || 0).getTime();
        if (cloudTime > localTime) {
          toImportToLocal.push(cloudMem);
        }
      }
    });

    // 3. ローカルにしかない（未同期）データをクラウドへアップロード
    for (const localMem of localMemories) {
      const cloudMem = cloudMap.get(localMem.id);
      if (!cloudMem || localMem.syncStatus === 'pending') {
        toUploadToCloud.push(localMem);
      }
    }

    // 4. ローカルへの一括保存
    let importedCount = 0;
    if (toImportToLocal.length > 0) {
      importedCount = await saveMemoriesBatch(toImportToLocal);
      console.log(`[CloudSync] クラウドから ${importedCount} 件の思い出をローカルに復元しました。`);
    }

    // 5. クラウドへのアップロード
    let uploadedCount = 0;
    const memoriesCol = collection(db, 'users', user.uid, 'memories');
    for (const mem of toUploadToCloud) {
      try {
        // Base64 画像があれば Storage へアップロード
        const cloudImageUrls = await uploadImagesToStorage(user.uid, mem.imageUrls);

        const docData = {
          title: mem.title || '',
          diary: mem.diary || '',
          album: mem.album || '',
          tags: mem.tags || [],
          datetime: mem.datetime || null,
          timestamp: mem.timestamp || new Date().toISOString(),
          lat: mem.lat,
          lng: mem.lng,
          imageUrls: cloudImageUrls
        };

        // Firestore へドキュメントIDを指定して保存
        const docRef = doc(memoriesCol, mem.id);
        await setDoc(docRef, docData);

        // ローカルレコードも画像URLをクラウド版に差し替えて同期完了状態に更新
        await upsertMemory({
          ...mem,
          imageUrls: cloudImageUrls,
          syncStatus: 'synced'
        });

        uploadedCount++;
      } catch (uploadErr) {
        console.warn(`[CloudSync] ID ${mem.id} のクラウドアップロードに失敗しました:`, uploadErr);
      }
    }

    const allFinal = await getAllMemories();
    console.log(`[CloudSync] 同期完了: 復元 ${importedCount} 件 / アップロード ${uploadedCount} 件 / 合計 ${allFinal.length} 件`);

    return {
      success: true,
      importedCount,
      uploadedCount,
      totalCount: allFinal.length
    };
  } catch (err) {
    console.error('[CloudSync] 同期処理中に例外が発生しました（ローカル動作は継続します）:', err);
    return { success: false, importedCount: 0, uploadedCount: 0, totalCount: 0 };
  }
}

/**
 * 単一思い出のクラウド非同期同期ヘルパー
 * @param {Object} user 
 * @param {Object} memory 
 */
export async function syncSingleMemoryToCloud(user, memory) {
  if (!isFirebaseInitialized || !db || !user || !user.uid || !memory || !memory.id) return;

  try {
    const cloudImageUrls = await uploadImagesToStorage(user.uid, memory.imageUrls);
    const docData = {
      title: memory.title || '',
      diary: memory.diary || '',
      album: memory.album || '',
      tags: memory.tags || [],
      datetime: memory.datetime || null,
      timestamp: memory.timestamp || new Date().toISOString(),
      lat: memory.lat,
      lng: memory.lng,
      imageUrls: cloudImageUrls
    };

    const docRef = doc(db, 'users', user.uid, 'memories', memory.id);
    await setDoc(docRef, docData);

    // ローカルも更新
    await upsertMemory({
      ...memory,
      imageUrls: cloudImageUrls,
      syncStatus: 'synced'
    });
  } catch (err) {
    console.warn(`単一思い出のクラウド同期失敗 (id: ${memory.id}):`, err);
  }
}

/**
 * クラウドからの思い出削除ヘルパー
 * @param {Object} user 
 * @param {string} id 
 * @param {Array<string>} imageUrls 
 */
export async function deleteCloudMemory(user, id, imageUrls = []) {
  if (!isFirebaseInitialized || !db || !user || !user.uid || !id) return;

  try {
    // Storage からの画像削除
    if (storage && Array.isArray(imageUrls)) {
      for (const url of imageUrls) {
        if (typeof url === 'string' && url.includes('firebasestorage')) {
          try {
            const imgRef = ref(storage, url);
            await deleteObject(imgRef);
          } catch (e) {
            console.warn('Storage画像削除スキップ:', e);
          }
        }
      }
    }

    // Firestore ドキュメント削除
    const docRef = doc(db, 'users', user.uid, 'memories', id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn(`クラウド上の思い出削除失敗 (id: ${id}):`, err);
  }
}
