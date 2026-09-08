/**
 * Memory Map - メインエントリーポイント
 * アプリのブートストラップ、スタイル読み込み、初期データシード、
 * 地図描画、思い出記録モーダル、サイドバー絞り込み検索、
 * アルバムツアー再生、フォトブック出力、および Google 認証・クラウド自動同期を統合管理します。
 */

// スタイルのインポート
import './style.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { initMap, renderMarkers, flyToLocation, getMap, drawRouteLine, clearRouteLine } from './map/map-manager';
import { getAllMemories, saveMemory, deleteMemory, saveMemoriesBatch } from './services/storage';
import { initMemoryModal, openCreateModal, openEditModal, openMemoryModal } from './components/memory-modal';
import { initSidebar, updateSidebar, getFilterState, toggleSidebar, closeSidebar, closeSidebarIfMobile, setAlbumFilter } from './components/sidebar';
import { startAlbumTour } from './components/tour-player';
import { openPhotobookModal } from './components/photobook-modal';
import { initAuthUI } from './components/auth-button';
import { getCurrentUser } from './services/auth-service';
import { syncSingleMemoryToCloud, deleteCloudMemory } from './services/cloud-sync';
import { openAlbumListModal, updateAlbumModalMemories } from './components/album-modal';

let allMemoriesCache = [];
let currentFilteredMemories = [];

/**
 * 初回起動時、データが空であれば動作確認用のサンプルデータを投入する
 * @returns {Promise<Array>}
 */
async function loadOrSeedMemories() {
  let memories = await getAllMemories();

  if (memories.length === 0) {
    console.log('初回起動: 動作確認用のサンプル思い出データを登録します。');
    const sampleMemory = {
      title: '富士山と河口湖の旅',
      diary: '快晴の湖畔から望む富士山。澄んだ空気と水面に映る景色がとても綺麗でした。',
      lat: 35.5171,
      lng: 138.7518,
      album: '2024 山梨旅行',
      tags: ['景色', '富士山', '湖'],
      datetime: '2024-05-03T10:30:00.000Z',
      imageUrls: [
        'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?auto=format&fit=crop&w=800&q=80'
      ]
    };

    const savedId = await saveMemory(sampleMemory);
    sampleMemory.id = savedId;
    memories = [sampleMemory];
  }

  allMemoriesCache = memories;
  currentFilteredMemories = memories;
  return memories;
}

/**
 * 思い出の削除処理（ローカル削除、画面最新化、クラウド非同期同期）
 * @param {string} deletedId 
 */
async function handleDeleteMemory(deletedId) {
  if (!deletedId) return;
  try {
    await deleteMemory(deletedId);
    await refreshAllData();

    // ログイン中であればクラウドからも非同期削除
    const user = getCurrentUser();
    if (user) {
      deleteCloudMemory(user, deletedId).catch(e => console.warn('[Main] クラウド削除保留:', e));
    }
  } catch (err) {
    console.error('[Main] 思い出削除エラー:', err);
    alert('削除に失敗しました: ' + err.message);
  }
}

/**
 * ピンを描画し、編集・削除コールバックをバインド
 * @param {Array<Object>} mems 
 */
function renderAppMarkers(mems) {
  renderMarkers(mems, {
    onMarkerClick: null,
    onEdit: (memory) => {
      openEditModal(memory);
    },
    onDelete: async (memoryId) => {
      await handleDeleteMemory(memoryId);
    }
  });
}

/**
 * 最新の思い出一覧を取得し、地図とサイドバーを同時に再描画・更新する
 * @returns {Promise<Array>}
 */
async function refreshAllData() {
  const memories = await getAllMemories();
  allMemoriesCache = memories;
  currentFilteredMemories = memories;
  renderAppMarkers(memories);
  updateSidebar(memories);
  const filterState = getFilterState();
  if (filterState && filterState.selectedAlbum) {
    const albumMems = memories.filter(m => m.album === filterState.selectedAlbum);
    drawRouteLine(albumMems);
  } else {
    clearRouteLine();
  }
  return memories;
}

/**
 * アルバム情報（アルバム名・代表写真）を一括更新
 * @param {string} oldAlbumName 
 * @param {string} newAlbumName 
 * @param {string|null} coverPhotoUrl 
 */
async function handleUpdateAlbum(oldAlbumName, newAlbumName, coverPhotoUrl) {
  if (!oldAlbumName || !newAlbumName) return allMemoriesCache;

  const trimmedOld = oldAlbumName.trim();
  const trimmedNew = newAlbumName.trim();

  // 1. 対象の思い出を抽出して更新
  const targetMemories = allMemoriesCache.filter(m => (m.album || '').trim() === trimmedOld);
  if (targetMemories.length === 0) return allMemoriesCache;

  const updatedMemories = [];

  targetMemories.forEach(mem => {
    const updated = {
      ...mem,
      album: trimmedNew
    };

    // 渡された coverPhotoUrl が存在する場合、該当アルバムに属する全思い出オブジェクトに対して albumCoverPhoto = coverPhotoUrl をセット
    if (coverPhotoUrl) {
      updated.albumCoverPhoto = coverPhotoUrl;
      updated.coverPhoto = coverPhotoUrl;
    }

    // 選ばれた写真を持つ思い出の imageUrls 配列の先頭にその写真を移動させてフラグ設定
    if (coverPhotoUrl && Array.isArray(updated.imageUrls) && updated.imageUrls.includes(coverPhotoUrl)) {
      updated.imageUrls = [coverPhotoUrl, ...updated.imageUrls.filter(u => u !== coverPhotoUrl)];
      updated.isCoverPhoto = true;
    } else {
      updated.isCoverPhoto = false;
    }

    updatedMemories.push(updated);
  });

  // 2. IndexedDB に一括バッチ保存（完了を確実に待機）
  await saveMemoriesBatch(updatedMemories);

  // 3. ログイン中であればバックグラウンドでクラウドにも同期
  const user = getCurrentUser();
  if (user) {
    Promise.allSettled(
      updatedMemories.map(m => syncSingleMemoryToCloud(user, m))
    ).then(() => {
      console.log(`[Main] アルバム「${trimmedNew}」のクラウド同期が完了しました。`);
    }).catch(err => {
      console.warn('[Main] アルバムクラウド同期保留:', err);
    });
  }

  // 4. 全画面データの再描画
  const freshMemories = await refreshAllData();

  // 5. もし現在該当アルバムでフィルタ中なら新しいアルバム名でフィルタ再設定
  const filterState = getFilterState();
  if (filterState && filterState.selectedAlbum === trimmedOld) {
    setAlbumFilter(trimmedNew);
    const newAlbumMems = (freshMemories || allMemoriesCache).filter(m => (m.album || '').trim() === trimmedNew);
    renderAppMarkers(newAlbumMems);
    drawRouteLine(newAlbumMems);
  }

  // 6. refreshAllData 完了後、現在開いているアルバム一覧モーダルが新しいデータで再描画されるように再レンダリング処理を実行
  const albumModalEl = document.getElementById('album-list-modal');
  if (albumModalEl && !albumModalEl.classList.contains('hidden')) {
    updateAlbumModalMemories(freshMemories || allMemoriesCache);
  }

  return freshMemories || allMemoriesCache;
}

/**
 * サイドバーヘッダーにツアー再生＆フォトブック出力ボタンを設置
 */
function setupHeaderActions(map) {
  const header = document.querySelector('.sidebar-header');
  if (!header || document.getElementById('sidebar-quick-actions')) return;

  const actionsHtml = `
    <div id="sidebar-quick-actions" class="sidebar-quick-actions">
      <button id="btn-quick-albums" class="btn-action-card-primary" type="button">
        <div class="action-card-left">
          <svg class="action-card-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>アルバム一覧</span>
        </div>
        <svg class="action-card-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>

      <div class="quick-actions-row">
        <button id="btn-quick-tour" class="btn-action-card-sub tour" type="button">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <span>ツアー再生</span>
        </button>
        <button id="btn-quick-photobook" class="btn-action-card-sub" type="button">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          <span>旅のフォトブック</span>
        </button>
      </div>
    </div>
  `;

  header.insertAdjacentHTML('beforeend', actionsHtml);

  // アルバム一覧モーダル表示イベント
  document.getElementById('btn-quick-albums')?.addEventListener('click', () => {
    closeSidebarIfMobile();
    openAlbumListModal(allMemoriesCache, {
      onSelectAlbum: (albumName, albumMemories) => {
        currentFilteredMemories = albumMemories;
        renderAppMarkers(albumMemories);

        if (albumName && albumMemories && albumMemories.length > 0) {
          drawRouteLine(albumMemories);
          const latlngs = albumMemories
            .filter(m => typeof m.lat === 'number' && typeof m.lng === 'number')
            .map(m => [m.lat, m.lng]);

          if (latlngs.length === 1) {
            flyToLocation(latlngs[0][0], latlngs[0][1], 13);
          } else if (latlngs.length > 1) {
            map.fitBounds(latlngs, {
              padding: [60, 60],
              maxZoom: 15,
              animate: true
            });
          }
        } else {
          clearRouteLine();
        }

        // サイドバーのフィルター状態を同期
        setAlbumFilter(albumName);
      },
      onPlayTour: (albumMemories) => {
        if (albumMemories && albumMemories.length > 0) {
          startAlbumTour(albumMemories, map);
        }
      },
      onOpenPhotobook: (albumName, albumMemories) => {
        if (albumMemories && albumMemories.length > 0) {
          openPhotobookModal(albumName, albumMemories);
        }
      },
      onUpdateAlbum: async (oldAlbumName, newAlbumName, coverPhotoUrl) => {
        return await handleUpdateAlbum(oldAlbumName, newAlbumName, coverPhotoUrl);
      }
    });
  });

  // ツアー再生イベント
  document.getElementById('btn-quick-tour')?.addEventListener('click', () => {
    closeSidebarIfMobile();
    const targets = currentFilteredMemories.length > 0 ? currentFilteredMemories : allMemoriesCache;
    startAlbumTour(targets, map);
  });

  // フォトブック出力イベント
  document.getElementById('btn-quick-photobook')?.addEventListener('click', () => {
    closeSidebarIfMobile();
    const filterState = getFilterState();
    const currentAlbum = filterState.selectedAlbum || '旅の記録';
    const targets = currentFilteredMemories.length > 0 ? currentFilteredMemories : allMemoriesCache;
    openPhotobookModal(currentAlbum, targets);
  });
}

/**
 * スマホ用UI（左上ハンバーガーメニュー、サイドバー暗転オーバーレイ）の設置とイベント登録
 */
function setupMobileControls() {
  // 1. 暗転オーバーレイ
  if (!document.getElementById('sidebar-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.id = 'sidebar-backdrop';
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSidebar();
    });
    backdrop.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: true });
  }

  // 2. 左上ハンバーガーボタン
  if (!document.getElementById('btn-hamburger')) {
    const btnHamburger = document.createElement('button');
    btnHamburger.id = 'btn-hamburger';
    btnHamburger.className = 'btn-hamburger';
    btnHamburger.type = 'button';
    btnHamburger.setAttribute('aria-label', 'メニューを開く');
    btnHamburger.setAttribute('title', 'メニュー');
    btnHamburger.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="4" y1="6" x2="20" y2="6"></line>
        <line x1="4" y1="12" x2="20" y2="12"></line>
        <line x1="4" y1="18" x2="20" y2="18"></line>
      </svg>
    `;

    btnHamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSidebar();
    });

    btnHamburger.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: true });

    document.body.appendChild(btnHamburger);
  }
}

/**
 * サイドバー下部に認証コンテナを設置して初期化
 */
function setupAuthContainer() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar || document.getElementById('auth-container')) return;

  const footerHtml = `<div id="auth-container" class="sidebar-auth-footer"></div>`;
  sidebar.insertAdjacentHTML('beforeend', footerHtml);

  initAuthUI({
    containerId: 'auth-container',
    onSyncComplete: async (syncResult) => {
      // クラウド同期完了時に全データを再取得して画面を更新
      await refreshAllData();
      if (syncResult && syncResult.importedCount > 0) {
        console.log(`[Main] クラウドから ${syncResult.importedCount} 件の思い出を復元しました。`);
      }
    }
  });
}

/**
 * アプリケーションの初期化
 */
async function bootstrap() {
  try {
    // 0. スマホ用UI（ハンバーガーボタン、暗転オーバーレイ）の初期化
    setupMobileControls();

    // 1. 地図の初期化
    const map = initMap('map');

    // 2. データの取得または初期シード（ローカルファースト：即座に描画）
    const memories = await loadOrSeedMemories();

    // 3. マーカーのプロット
    renderAppMarkers(memories);

    // 4. データが存在する場合は最初のスポットへカメラを移動
    if (memories.length > 0 && memories[0].lat && memories[0].lng) {
      flyToLocation(memories[0].lat, memories[0].lng, 10);
    }

    // 5. サイドバーの初期化（フィルター変更・アルバム選択連携）
    initSidebar({
      containerId: 'sidebar-content',
      onFilterChange: (filteredMemories) => {
        currentFilteredMemories = filteredMemories;
        renderAppMarkers(filteredMemories);
        const filterState = getFilterState();
        if (filterState && filterState.selectedAlbum) {
          drawRouteLine(filteredMemories);
        } else {
          clearRouteLine();
        }
      },
      onAlbumSelect: (albumName, albumMemories) => {
        currentFilteredMemories = albumMemories;
        if (albumName && albumMemories && albumMemories.length > 0) {
          drawRouteLine(albumMemories);
          const latlngs = albumMemories
            .filter(m => typeof m.lat === 'number' && typeof m.lng === 'number')
            .map(m => [m.lat, m.lng]);

          if (latlngs.length === 1) {
            flyToLocation(latlngs[0][0], latlngs[0][1], 13);
          } else if (latlngs.length > 1) {
            map.fitBounds(latlngs, {
              padding: [60, 60],
              maxZoom: 15,
              animate: true
            });
          }
        } else {
          clearRouteLine();
        }
      }
    });

    // 6. サイドバーに思い出データを反映
    updateSidebar(memories);

    // 7. ツアー＆フォトブックのアクションボタン設置
    setupHeaderActions(map);

    // 8. 認証コンテナの設置とクラウド同期連携
    setupAuthContainer();

    // 9. 思い出記録モーダルの初期化とコールバック接続
    initMemoryModal({
      getFallbackLocation: () => {
        const center = map.getCenter();
        return { lat: center.lat, lng: center.lng };
      },
      onSave: async (savedMemory) => {
        // 1. ローカル画面を即座に更新
        await refreshAllData();
        if (savedMemory && savedMemory.lat && savedMemory.lng) {
          flyToLocation(savedMemory.lat, savedMemory.lng, 14);
        }

        // 2. ログイン中であればバックグラウンドでクラウドへ非同期反映
        const user = getCurrentUser();
        if (user) {
          syncSingleMemoryToCloud(user, savedMemory).then(() => {
            console.log('[Main] クラウドへバックアップ完了:', savedMemory.id);
          }).catch(e => console.warn('[Main] クラウドバックアップ保留:', e));
        }
      },
      onDelete: async (deletedId) => {
        await handleDeleteMemory(deletedId);
      }
    });

    // 10. PCの右クリック（contextmenu）でピン作成モーダルを開く（通常の左クリックは地図移動・ピン選択用）
    map.on('contextmenu', (e) => {
      openCreateModal({
        lat: e.latlng.lat,
        lng: e.latlng.lng
      });
    });

    // 11. カスタムイベント経由での編集・削除連携
    window.addEventListener('memorymap:edit-memory', (e) => {
      const memory = e.detail?.memory || e.detail;
      if (memory && typeof memory === 'object' && (memory.id || memory.title)) {
        openEditModal(memory);
      }
    });

    window.addEventListener('memorymap:delete-memory', async (e) => {
      const memoryId = e.detail?.memoryId || e.detail?.id || (typeof e.detail === 'string' ? e.detail : null);
      if (memoryId) {
        await handleDeleteMemory(memoryId);
      }
    });

    console.log(`Memory Map 初期化完了: ${memories.length} 件の思い出を読み込みました。`);
  } catch (error) {
    console.error('Memory Map 初期化中にエラーが発生しました:', error);
  }
}

// DOM読み込み完了時にブートストラップを実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
