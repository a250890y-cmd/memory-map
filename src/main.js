/**
 * Memory Map - メインエントリーポイント
 * アプリのブートストラップ、スタイル読み込み、初期データシード、
 * 地図描画、思い出記録モーダル、サイドバー絞り込み検索、
 * アルバムツアー再生、およびフォトブック出力の統合管理を行います。
 */

// スタイルのインポート
import './style.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { initMap, renderMarkers, flyToLocation, getMap } from './map/map-manager';
import { getAllMemories, saveMemory } from './services/storage';
import { initMemoryModal, openCreateModal, openEditModal } from './components/memory-modal';
import { initSidebar, updateSidebar, getFilterState } from './components/sidebar';
import { startAlbumTour } from './components/tour-player';
import { openPhotobookModal } from './components/photobook-modal';

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
 * 最新の思い出一覧を取得し、地図とサイドバーを同時に再描画・更新する
 * @returns {Promise<Array>}
 */
async function refreshAllData() {
  const memories = await getAllMemories();
  allMemoriesCache = memories;
  currentFilteredMemories = memories;
  renderMarkers(memories);
  updateSidebar(memories);
  return memories;
}

/**
 * サイドバーヘッダーにツアー再生＆フォトブック出力ボタンを設置
 */
function setupHeaderActions(map) {
  const header = document.querySelector('.sidebar-header');
  if (!header || document.getElementById('sidebar-quick-actions')) return;

  const actionsHtml = `
    <div id="sidebar-quick-actions" style="display: flex; gap: 8px; margin-top: 10px;">
      <button id="btn-quick-tour" style="flex: 1; padding: 7px 10px; background: #2563eb; color: white; border: none; border-radius: 12px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 8px rgba(37,99,235,0.25); transition: all 0.2s;">
        ▶ ツアー再生
      </button>
      <button id="btn-quick-photobook" style="flex: 1; padding: 7px 10px; background: #f1f5f9; color: #0f172a; border: 1px solid rgba(0,0,0,0.06); border-radius: 12px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.2s;">
        📖 旅のフォトブック
      </button>
    </div>
  `;

  header.insertAdjacentHTML('beforeend', actionsHtml);

  // ツアー再生イベント
  document.getElementById('btn-quick-tour')?.addEventListener('click', () => {
    const targets = currentFilteredMemories.length > 0 ? currentFilteredMemories : allMemoriesCache;
    startAlbumTour(targets, map);
  });

  // フォトブック出力イベント
  document.getElementById('btn-quick-photobook')?.addEventListener('click', () => {
    const filterState = getFilterState();
    const currentAlbum = filterState.selectedAlbum || '旅の記録';
    const targets = currentFilteredMemories.length > 0 ? currentFilteredMemories : allMemoriesCache;
    openPhotobookModal(currentAlbum, targets);
  });
}

/**
 * アプリケーションの初期化
 */
async function bootstrap() {
  try {
    // 1. 地図の初期化
    const map = initMap('map');

    // 2. データの取得または初期シード
    const memories = await loadOrSeedMemories();

    // 3. マーカーのプロット
    renderMarkers(memories);

    // 4. データが存在する場合は最初のスポットへカメラを移動
    if (memories.length > 0 && memories[0].lat && memories[0].lng) {
      flyToLocation(memories[0].lat, memories[0].lng, 10);
    }

    // 5. サイドバーの初期化（フィルター変更・アルバム選択連携）
    initSidebar({
      containerId: 'sidebar-content',
      onFilterChange: (filteredMemories) => {
        currentFilteredMemories = filteredMemories;
        renderMarkers(filteredMemories);
      },
      onAlbumSelect: (albumName, albumMemories) => {
        currentFilteredMemories = albumMemories;
        if (albumMemories && albumMemories.length > 0) {
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
        }
      }
    });

    // 6. サイドバーに思い出データを反映
    updateSidebar(memories);

    // 7. ツアー＆フォトブックのアクションボタン設置
    setupHeaderActions(map);

    // 8. 思い出記録モーダルの初期化とコールバック接続
    initMemoryModal({
      getFallbackLocation: () => {
        const center = map.getCenter();
        return { lat: center.lat, lng: center.lng };
      },
      onSave: async (savedMemory) => {
        await refreshAllData();
        if (savedMemory && savedMemory.lat && savedMemory.lng) {
          flyToLocation(savedMemory.lat, savedMemory.lng, 14);
        }
      },
      onDelete: async () => {
        await refreshAllData();
      }
    });

    // 9. 地図上をクリックしたときに、その地点を初期位置として記録モーダルを開く
    map.on('click', (e) => {
      openCreateModal({
        lat: e.latlng.lat,
        lng: e.latlng.lng
      });
    });

    // 10. ポップアップ内のダブルクリックで編集モーダルを開く委譲サポート
    document.addEventListener('dblclick', async (e) => {
      const popup = e.target.closest('.memory-popup-content');
      if (popup) {
        const titleEl = popup.querySelector('h4');
        const titleText = titleEl ? titleEl.textContent : '';
        const all = await getAllMemories();
        const found = all.find(m => m.title === titleText);
        if (found) {
          openEditModal(found);
        }
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
