/**
 * Memory Map - メインエントリーポイント
 * アプリのブートストラップ、スタイル読み込み、初期データシード、
 * 地図描画、思い出記録モーダル、およびサイドバー絞り込み検索の連携を行います。
 */

// スタイルのインポート
import './style.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { initMap, renderMarkers, flyToLocation, getMap } from './map/map-manager';
import { getAllMemories, saveMemory } from './services/storage';
import { initMemoryModal, openCreateModal, openEditModal } from './components/memory-modal';
import { initSidebar, updateSidebar } from './components/sidebar';

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

  return memories;
}

/**
 * 最新の思い出一覧を取得し、地図とサイドバーを同時に再描画・更新する
 * @returns {Promise<Array>}
 */
async function refreshAllData() {
  const memories = await getAllMemories();
  renderMarkers(memories);
  updateSidebar(memories);
  return memories;
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
        // 絞り込まれた思い出のみを地図上に再描画
        renderMarkers(filteredMemories);
      },
      onAlbumSelect: (albumName, albumMemories) => {
        // アルバムが選択されたら、そのアルバム内のピン全体が見えるようカメラを調整
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

    // 6. サイドバーに思い出データを反映して集計表示
    updateSidebar(memories);

    // 7. 思い出記録モーダルの初期化とコールバック接続
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

    // 8. 地図上をクリックしたときに、その地点を初期位置として記録モーダルを開く
    map.on('click', (e) => {
      openCreateModal({
        lat: e.latlng.lat,
        lng: e.latlng.lng
      });
    });

    // 9. ポップアップ内のダブルクリックで編集モーダルを開く委譲サポート
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
