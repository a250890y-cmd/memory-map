/**
 * Memory Map - 地図管理モジュール
 * Leaflet の初期化、安定したオープンソース地図タイルの設定、
 * およびマーカークラスタリングによる思い出ピンの描画とポップアップ制御を行います。
 */

import L from 'leaflet';
import 'leaflet.markercluster';

let mapInstance = null;
let clusterGroup = null;

// タイルプロバイダの定義（外部アクセス制限や403に強いオープンソースタイルを採用）
const TILE_PROVIDERS = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19
  },
  cartoVoyager: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }
};

/**
 * 地図を初期化する
 * @param {string} containerId 地図をマウントするHTML要素のID
 * @param {Object} [options]
 * @returns {L.Map}
 */
export function initMap(containerId = 'map', options = {}) {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  // 日本列島全体を見渡す初期座標
  const defaultCenter = options.center || [36.2048, 138.2529];
  const defaultZoom = options.zoom || 5;

  mapInstance = L.map(containerId, {
    center: defaultCenter,
    zoom: defaultZoom,
    zoomControl: false,
    worldCopyJump: true
  });

  // ズームコントロールを右下に配置
  L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

  // 標準タイル（CartoDB Voyager: 視認性が高く写真が映えるニュートラルなデザイン）
  const tileConfig = TILE_PROVIDERS.cartoVoyager;
  L.tileLayer(tileConfig.url, {
    attribution: tileConfig.attribution,
    maxZoom: tileConfig.maxZoom
  }).addTo(mapInstance);

  // マーカークラスタグループの初期化
  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 40,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  mapInstance.addLayer(clusterGroup);

  return mapInstance;
}

/**
 * 現在の地図インスタンスを取得
 * @returns {L.Map|null}
 */
export function getMap() {
  return mapInstance;
}

/**
 * 指定した座標へスムーズに移動
 * @param {number} lat 
 * @param {number} lng 
 * @param {number} [zoom=13] 
 */
export function flyToLocation(lat, lng, zoom = 13) {
  if (mapInstance && typeof lat === 'number' && typeof lng === 'number') {
    mapInstance.flyTo([lat, lng], zoom, {
      animate: true,
      duration: 1.2
    });
  }
}

/**
 * 日時文字列を日本語表記にフォーマット
 * @param {string} dateStr 
 * @returns {string}
 */
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const dt = new Date(dateStr);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

/**
 * 思い出データの配列を受け取り、マーカークラスタとして地図上にプロットする
 * @param {Array<Object>} memories 
 * @param {Function} [onMarkerClick] 
 */
export function renderMarkers(memories = [], onMarkerClick = null) {
  if (!clusterGroup) return;

  clusterGroup.clearLayers();

  memories.forEach((memory) => {
    if (typeof memory.lat !== 'number' || typeof memory.lng !== 'number') return;
    if (isNaN(memory.lat) || isNaN(memory.lng)) return;

    // 写真付きの場合は円形サムネイル、ない場合はシンプルなピン
    const hasPhoto = Array.isArray(memory.imageUrls) && memory.imageUrls.length > 0;
    const coverPhoto = hasPhoto ? memory.imageUrls[0] : null;

    const iconHtml = coverPhoto
      ? `<div style="
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 3px solid #ffffff;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
          background-image: url('${coverPhoto}');
          background-size: cover;
          background-position: center;
          transition: transform 0.2s ease;
          cursor: pointer;
        "></div>`
      : `<div style="
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background-color: #2563eb;
          border: 3px solid #ffffff;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
          cursor: pointer;
        "></div>`;

    const iconSize = coverPhoto ? [48, 48] : [24, 24];
    const iconAnchor = coverPhoto ? [24, 24] : [12, 12];

    const customIcon = L.divIcon({
      className: 'memory-marker-div-icon',
      html: iconHtml,
      iconSize: iconSize,
      iconAnchor: iconAnchor,
      popupAnchor: [0, -iconAnchor[1] - 4]
    });

    const marker = L.marker([memory.lat, memory.lng], { icon: customIcon });

    // ポップアップ HTML の組み立て
    const title = memory.title || '無題の思い出';
    const displayDate = formatDisplayDate(memory.datetime || memory.timestamp);
    const albumBadge = memory.album ? `<div style="font-size: 0.72rem; color: #2563eb; font-weight: 600; margin-bottom: 2px;">📁 ${memory.album}</div>` : '';
    const diaryText = memory.diary ? `<p style="font-size: 0.82rem; color: #475569; margin-top: 6px; line-height: 1.4; max-height: 60px; overflow: hidden; text-overflow: ellipsis;">${memory.diary}</p>` : '';
    
    const imageHtml = coverPhoto
      ? `<div style="width: 100%; height: 130px; border-radius: 10px; overflow: hidden; margin-bottom: 8px; background: #f1f5f9;">
          <img src="${coverPhoto}" alt="${title}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
         </div>`
      : '';

    const popupHtml = `
      <div class="memory-popup-content" style="min-width: 200px; max-width: 240px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        ${imageHtml}
        ${albumBadge}
        <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; font-weight: 700; color: #0f172a; line-height: 1.3;">${title}</h4>
        ${displayDate ? `<div style="font-size: 0.75rem; color: #94a3b8;">${displayDate}</div>` : ''}
        ${diaryText}
      </div>
    `;

    marker.bindPopup(popupHtml, {
      maxWidth: 260,
      className: 'custom-memory-popup'
    });

    if (typeof onMarkerClick === 'function') {
      marker.on('click', () => onMarkerClick(memory));
    }

    clusterGroup.addLayer(marker);
  });
}
