/**
 * Memory Map - 地図管理モジュール
 * Google Maps タイルによる地図描画、アルバム時系列経路（Polyline）の描画・消去、
 * および絵文字を排除したクリーンなマーカークラスタとポップアップ制御を行います。
 */

import L from 'leaflet';
import 'leaflet.markercluster';

let mapInstance = null;
let clusterGroup = null;
let routeLayers = null;
let currentRouteRequestId = 0;
let currentAbortController = null;

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
 * 道路沿いルート（またはフォールバック直線）のレイヤーグループを描画
 * @param {Array<Array<number>>} coords
 * @param {boolean} isRoadSnapped
 */
function renderRoutePolylines(coords, isRoadSnapped = true) {
  if (!mapInstance || !coords || coords.length < 2) return;

  if (routeLayers) {
    mapInstance.removeLayer(routeLayers);
    routeLayers = null;
  }

  const group = L.featureGroup();

  if (isRoadSnapped) {
    // 道路網ルート: 下敷きのアウターライン（視認性とコントラスト向上）
    const casingLine = L.polyline(coords, {
      color: '#ffffff',
      weight: 7,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'osrm-route-casing'
    });
    // メインの滑らかな青線
    const mainLine = L.polyline(coords, {
      color: '#2563eb',
      weight: 4.5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'osrm-route-line'
    });
    group.addLayer(casingLine);
    group.addLayer(mainLine);
  } else {
    // フォールバック直線: スタイリッシュな青色の破線
    const fallbackLine = L.polyline(coords, {
      color: '#2563eb',
      weight: 3.5,
      opacity: 0.85,
      dashArray: '8, 8',
      lineCap: 'round',
      lineJoin: 'round',
      className: 'osrm-route-fallback'
    });
    group.addLayer(fallbackLine);
  }

  group.addTo(mapInstance);
  routeLayers = group;
}

/**
 * OSRM API から区間の道なりルート座標を取得
 * @param {Array<Array<number>>} points [ [lat, lng], ... ]
 * @param {AbortSignal} signal
 * @returns {Promise<Array<Array<number>>>}
 */
async function fetchOsrmSegment(points, signal) {
  // OSRM は {lng},{lat} 形式
  const coordsString = points.map(p => `${p[1]},${p[0]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM HTTP error: ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error('OSRM did not return valid routes');
  }
  // GeoJSON の coordinates は [lng, lat] なので [lat, lng] へ変換
  return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
}

/**
 * アルバム選択時にピンを時系列順に結ぶポリライン（OSRM道なりルート）を描画
 * @param {Array<Object>} memories 
 */
export async function drawRouteLine(memories = []) {
  clearRouteLine();
  if (!mapInstance || !Array.isArray(memories) || memories.length < 2) return;

  const requestId = ++currentRouteRequestId;

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

  // 1. 初動フィードバック: まず即座に直線破線を描画してユーザーの待ち時間をゼロに
  renderRoutePolylines(latlngs, false);

  // 2. OSRM API で道なりルートを探索（最大15地点ずつチャンク探索）
  const controller = new AbortController();
  currentAbortController = controller;

  // 6秒タイムアウト（応答遅延時の早期直線フォールバック）
  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch (_) {}
  }, 6000);

  try {
    const CHUNK_SIZE = 15;
    let roadCoords = [];

    for (let i = 0; i < latlngs.length - 1; i += (CHUNK_SIZE - 1)) {
      if (requestId !== currentRouteRequestId) return; // 別のリクエストが走った場合は破棄

      const chunk = latlngs.slice(i, i + CHUNK_SIZE);
      if (chunk.length < 2) break;

      try {
        const segment = await fetchOsrmSegment(chunk, controller.signal);
        if (roadCoords.length > 0) {
          roadCoords.push(...segment.slice(1));
        } else {
          roadCoords.push(...segment);
        }
      } catch (segmentErr) {
        console.warn(`[OSRM] 区間 ${i + 1}〜${i + chunk.length} の探索失敗。直線で補間します:`, segmentErr.message);
        if (roadCoords.length > 0) {
          roadCoords.push(...chunk.slice(1));
        } else {
          roadCoords.push(...chunk);
        }
      }
    }

    clearTimeout(timeoutId);

    // リクエストが最新でない場合は描画スキップ
    if (requestId !== currentRouteRequestId) return;

    if (roadCoords.length >= 2) {
      renderRoutePolylines(roadCoords, true);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (requestId !== currentRouteRequestId) return;
    console.warn('[OSRM] ルート探索全体が中断または失敗しました。直線描画を維持します:', err.message);
  } finally {
    if (currentAbortController === controller) {
      currentAbortController = null;
    }
  }
}

/**
 * ポリラインを地図から消去
 */
export function clearRouteLine() {
  currentRouteRequestId++;
  if (currentAbortController) {
    try {
      currentAbortController.abort();
    } catch (_) {}
    currentAbortController = null;
  }
  if (routeLayers && mapInstance) {
    mapInstance.removeLayer(routeLayers);
    routeLayers = null;
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
