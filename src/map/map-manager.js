/**
 * Memory Map - 地図管理モジュール
 * Google Maps タイルによる地図描画、アルバム時系列経路（Polyline）の描画・消去、
 * および絵文字を排除したクリーンなマーカークラスタとポップアップ制御を行います。
 */

import L from 'leaflet';
import 'leaflet.markercluster';

let mapInstance = null;
let clusterGroup = null;
let routePolyline = null;

// Google Maps タイルレイヤー設定
const GOOGLE_MAPS_CONFIG = {
  url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  subdomains: ['0', '1', '2', '3'],
  attribution: '&copy; Google Maps',
  maxZoom: 20
};

/**
 * 地図を初期化する
 * @param {string} containerId 
 * @param {Object} [options] 
 * @returns {L.Map}
 */
export function initMap(containerId = 'map', options = {}) {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  const defaultCenter = options.center || [36.2048, 138.2529];
  const defaultZoom = options.zoom || 5;

  mapInstance = L.map(containerId, {
    center: defaultCenter,
    zoom: defaultZoom,
    zoomControl: false,
    worldCopyJump: true
  });

  L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

  // Google Maps タイルレイヤーを適用
  L.tileLayer(GOOGLE_MAPS_CONFIG.url, {
    attribution: GOOGLE_MAPS_CONFIG.attribution,
    maxZoom: GOOGLE_MAPS_CONFIG.maxZoom,
    subdomains: GOOGLE_MAPS_CONFIG.subdomains
  }).addTo(mapInstance);

  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 40,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  mapInstance.addLayer(clusterGroup);

  return mapInstance;
}

export function getMap() {
  return mapInstance;
}

export function flyToLocation(lat, lng, zoom = 13) {
  if (mapInstance && typeof lat === 'number' && typeof lng === 'number') {
    mapInstance.flyTo([lat, lng], zoom, {
      animate: true,
      duration: 1.2
    });
  }
}

/**
 * アルバム選択時にピンを時系列順に結ぶポリラインを描画
 * @param {Array<Object>} memories 
 */
export function drawRouteLine(memories = []) {
  clearRouteLine();
  if (!mapInstance || !Array.isArray(memories) || memories.length < 2) return;

  // 時系列順（古い順）にソート
  const sorted = [...memories].sort((a, b) => {
    const timeA = new Date(a.datetime || a.timestamp || 0).getTime();
    const timeB = new Date(b.datetime || b.timestamp || 0).getTime();
    return timeA - timeB;
  });

  const latlngs = sorted
    .filter(m => typeof m.lat === 'number' && typeof m.lng === 'number' && !isNaN(m.lat) && !isNaN(m.lng))
    .map(m => [m.lat, m.lng]);

  if (latlngs.length < 2) return;

  // スタイリッシュな青色の破線ルートを描画
  routePolyline = L.polyline(latlngs, {
    color: '#2563eb',
    weight: 3.5,
    opacity: 0.85,
    dashArray: '8, 8',
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(mapInstance);
}

/**
 * ポリラインを地図から消去
 */
export function clearRouteLine() {
  if (routePolyline && mapInstance) {
    mapInstance.removeLayer(routePolyline);
    routePolyline = null;
  }
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const dt = new Date(dateStr);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

/**
 * マーカーを描画（絵文字を完全に排除したクリーンなスタイル）
 * @param {Array<Object>} memories 
 * @param {Function} [onMarkerClick] 
 */
export function renderMarkers(memories = [], onMarkerClick = null) {
  if (!clusterGroup) return;

  clusterGroup.clearLayers();

  memories.forEach((memory) => {
    if (typeof memory.lat !== 'number' || typeof memory.lng !== 'number') return;
    if (isNaN(memory.lat) || isNaN(memory.lng)) return;

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

    const title = memory.title || '無題の思い出';
    const displayDate = formatDisplayDate(memory.datetime || memory.timestamp);
    
    // 絵文字を排除したクリーンなアルバムタグ
    const albumBadge = memory.album
      ? `<div style="display: inline-block; font-size: 0.72rem; color: #2563eb; font-weight: 700; background: rgba(37,99,235,0.08); padding: 2px 8px; border-radius: 6px; margin-bottom: 4px;">ALBUM: ${memory.album}</div>`
      : '';
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
