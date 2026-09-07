/**
 * Memory Map - メインエントリーポイント
 * アプリのブートストラップ、スタイル読み込み、および初期データのロードと地図描画を行います。
 */

// Leaflet & MarkerCluster の CSS インポート
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { initMap, renderMarkers, flyToLocation } from './map/map-manager';
import { getAllMemories, saveMemory } from './services/storage';

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
 * アプリケーションの初期化
 */
async function bootstrap() {
  try {
    // 1. 地図の初期化
    initMap('map');

    // 2. データの取得または初期シード
    const memories = await loadOrSeedMemories();

    // 3. マーカーのプロット
    renderMarkers(memories);

    // 4. データが存在する場合は最初のスポットへカメラを移動
    if (memories.length > 0 && memories[0].lat && memories[0].lng) {
      flyToLocation(memories[0].lat, memories[0].lng, 10);
    }

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
