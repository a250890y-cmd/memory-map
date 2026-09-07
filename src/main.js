/**
 * Memory Map - メインエントリーポイント
 * アプリのブートストラップ、スタイル読み込み、初期データシード、
 * 地図描画、および思い出記録モーダルの連携を行います。
 */

// スタイルのインポート
import './style.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { initMap, renderMarkers, flyToLocation, getMap } from './map/map-manager';
import { getAllMemories, saveMemory } from './services/storage';
import { initMemoryModal, openCreateModal, openEditModal } from './components/memory-modal';

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
 * 最新の思い出一覧を取得し、地図上のピンを再描画する
 */
async function refreshMarkers() {
  const memories = await getAllMemories();
  renderMarkers(memories);
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

    // 5. 思い出記録モーダルの初期化とコールバック接続
    initMemoryModal({
      getFallbackLocation: () => {
        const center = map.getCenter();
        return { lat: center.lat, lng: center.lng };
      },
      onSave: async (savedMemory) => {
        await refreshMarkers();
        if (savedMemory && savedMemory.lat && savedMemory.lng) {
          flyToLocation(savedMemory.lat, savedMemory.lng, 14);
        }
      },
      onDelete: async () => {
        await refreshMarkers();
      }
    });

    // 6. 地図上をクリックしたときに、その地点を初期位置として記録モーダルを開く
    map.on('click', (e) => {
      openCreateModal({
        lat: e.latlng.lat,
        lng: e.latlng.lng
      });
    });

    // 7. ポップアップ内のダブルクリックや要素操作で編集モーダルを開けるよう委譲サポート
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
