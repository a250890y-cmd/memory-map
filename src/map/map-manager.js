/**
 * Memory Map - 地図管理モジュール
 * Google Maps タイルによる地図描画、アルバム時系列経路（Polyline）の描画・消去、
 * および絵文字を排除したクリーンなマーカークラスタとポップアップ制御を行います。
 */

import L from 'leaflet';
import 'leaflet.markercluster';
import { openLightbox } from '../components/lightbox';

let mapInstance = null;
let clusterGroup = null;
let routeLayers = null;
let currentRouteRequestId = 0;
let currentAbortController = null;
let homeMarkerInstance = null;
let currentHomeCoords = null;
let currentLocationMarker = null;

// Google Maps タイルレイヤー設定
const GOOGLE_MAPS_CONFIG = {
  url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  subdomains: ['0', '1', '2', '3'],
  attribution: '&copy; Google Maps',
  maxZoom: 20
};

/**
 * 現在地マーカー（青いパルス円）を表示
 * @param {number} lat 
 * @param {number} lng 
 */
export function showCurrentLocationMarker(lat, lng) {
  if (!mapInstance || typeof lat !== 'number' || typeof lng !== 'number') return;

  if (currentLocationMarker) {
    mapInstance.removeLayer(currentLocationMarker);
    currentLocationMarker = null;
  }

  const pulseIcon = L.divIcon({
    className: 'current-location-pulse-div-icon',
    html: `
      <div class="current-location-pulse-container">
        <div class="current-location-pulse-ring"></div>
        <div class="current-location-pulse-dot"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  currentLocationMarker = L.marker([lat, lng], {
    icon: pulseIcon,
    zIndexOffset: 900
  }).addTo(mapInstance);
}

/**
 * 地図右下にGPS現在地取得コントロールを設置
 * @param {L.Map} map 
 */
function setupGeolocationControl(map) {
  const GpsControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function() {
      const container = L.DomUtil.create('div', 'leaflet-bar map-control-wrapper');
      container.innerHTML = `
        <button id="btn-map-gps" class="map-gps-btn" type="button" title="現在地に移動" aria-label="現在地に移動">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="3"></circle>
            <line x1="12" y1="2" x2="12" y2="5"></line>
            <line x1="12" y1="19" x2="12" y2="22"></line>
            <line x1="2" y1="12" x2="5" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
          </svg>
        </button>
      `;

      L.DomEvent.disableClickPropagation(container);

      const btn = container.querySelector('#btn-map-gps');
      btn.addEventListener('click', () => {
        if (!navigator.geolocation) {
          alert('お使いのブラウザは現在地取得に対応していません。');
          return;
        }

        btn.classList.add('loading');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            btn.classList.remove('loading');
            const { latitude: lat, longitude: lng } = pos.coords;
            flyToLocation(lat, lng, 16);
            showCurrentLocationMarker(lat, lng);
          },
          (err) => {
            btn.classList.remove('loading');
            console.warn('現在地取得エラー:', err);
            alert('現在地を取得できませんでした。ブラウザの位置情報パーミッションをご確認ください。');
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });

      return container;
    }
  });

  new GpsControl().addTo(map);
}

/**
 * 地図右上に地名・住所検索バーコントロールを設置
 * @param {L.Map} map 
 */
function setupGeocoderControl(map) {
  const SearchControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function() {
      const container = L.DomUtil.create('div', 'map-search-container');
      container.innerHTML = `
        <div class="map-search-bar">
          <svg class="map-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="map-address-search-input" class="map-address-search-input" placeholder="地名や住所を検索..." aria-label="地名や住所を検索" />
          <button id="btn-map-search-clear" class="map-search-clear-btn hidden" type="button" aria-label="検索クリア">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      const input = container.querySelector('#map-address-search-input');
      const clearBtn = container.querySelector('#btn-map-search-clear');

      input.addEventListener('input', () => {
        if (input.value.trim()) {
          clearBtn.classList.remove('hidden');
        } else {
          clearBtn.classList.add('hidden');
        }
      });

      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.add('hidden');
        input.focus();
      });

      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const query = input.value.trim();
          if (!query) return;

          input.blur();
          input.disabled = true;

          try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Search request failed');
            const data = await res.json();

            if (Array.isArray(data) && data.length > 0) {
              const lat = parseFloat(data[0].lat);
              const lon = parseFloat(data[0].lon);
              flyToLocation(lat, lon, 14);
            } else {
              alert(`「${query}」に一致する場所が見つかりませんでした。`);
            }
          } catch (err) {
            console.error('地名検索エラー:', err);
            alert('検索処理中にエラーが発生しました。ネットワーク接続をご確認ください。');
          } finally {
            input.disabled = false;
          }
        }
      });

      return container;
    }
  });

  new SearchControl().addTo(map);
}

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

  // GPS現在地コントロールを追加
  setupGeolocationControl(mapInstance);

  // 地名・住所検索コントロールを追加
  setupGeocoderControl(mapInstance);

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
 * 現在の自宅座標を取得
 * @returns {Object|null}
 */
export function getHomeMarkerCoords() {
  return currentHomeCoords ? { ...currentHomeCoords } : null;
}

/**
 * 地図上に特別な自宅ピンを描画・更新・消去
 * @param {Object|null} coords { lat: number, lng: number, name?: string }
 * @param {Object} [options]
 * @param {Function} [options.onClear] 自宅解除コールバック
 */
export function setHomeMarker(coords, options = {}) {
  if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
    if (homeMarkerInstance && mapInstance) {
      mapInstance.removeLayer(homeMarkerInstance);
    }
    homeMarkerInstance = null;
    currentHomeCoords = null;
    return;
  }

  currentHomeCoords = {
    lat: coords.lat,
    lng: coords.lng,
    name: coords.name || '自宅'
  };

  if (!mapInstance) return;

  if (homeMarkerInstance) {
    mapInstance.removeLayer(homeMarkerInstance);
    homeMarkerInstance = null;
  }

  // スタイリッシュな自宅ピン（家アイコンSVG入り）
  const homeIcon = L.divIcon({
    className: 'home-marker-div-icon',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        <svg width="34" height="44" viewBox="0 0 44 58" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 6px rgba(0,0,0,0.4));">
          <path d="M 22 2 C 10.95 2 2 10.95 2 22 C 2 37 22 56 22 56 C 22 56 42 37 42 22 C 42 10.95 33.05 2 22 2 Z" fill="#0f172a" stroke="#ffffff" stroke-width="2.5"/>
          <path d="M 13 25 L 22 16 L 31 25 V 34 A 2 2 0 0 1 29 36 H 15 A 2 2 0 0 1 13 34 Z" fill="#ffffff"/>
          <path d="M 19 36 V 28 H 25 V 36 Z" fill="#0f172a"/>
        </svg>
      </div>
    `,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -46]
  });

  homeMarkerInstance = L.marker([coords.lat, coords.lng], {
    icon: homeIcon,
    zIndexOffset: 1000 // 他の思い出ピンより前面に表示
  }).addTo(mapInstance);

  const popupHtml = `
    <div style="text-align: center; padding: 4px 6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="display: flex; align-items: center; justify-content: center; gap: 5px; font-weight: 700; color: #0f172a; margin-bottom: 2px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        </svg>
        <span>${currentHomeCoords.name}</span>
      </div>
      <div style="font-size: 0.72rem; color: #64748b; margin-bottom: 8px;">旅の出発地・帰着拠点</div>
      <button id="btn-popup-clear-home" style="padding: 4px 10px; font-size: 0.72rem; background: #fee2e2; color: #dc2626; border: none; border-radius: 6px; font-weight: 700; cursor: pointer; transition: background 0.2s;">
        自宅設定を解除
      </button>
    </div>
  `;

  homeMarkerInstance.bindPopup(popupHtml);

  homeMarkerInstance.on('popupopen', () => {
    const btn = document.getElementById('btn-popup-clear-home');
    if (btn) {
      btn.addEventListener('click', () => {
        setHomeMarker(null);
        if (typeof options.onClear === 'function') {
          options.onClear();
        }
        // カスタムイベントの発行で UI 側へも通知
        window.dispatchEvent(new CustomEvent('memorymap:home-cleared'));
      });
    }
  });
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

  // 自宅が設定されている場合、旅の出発点および帰着点として自宅座標を付加
  if (currentHomeCoords && typeof currentHomeCoords.lat === 'number' && typeof currentHomeCoords.lng === 'number') {
    latlngs.unshift([currentHomeCoords.lat, currentHomeCoords.lng]);
    latlngs.push([currentHomeCoords.lat, currentHomeCoords.lng]);
  }

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
/**
 * マーカーを描画（写真インライン送り、編集・削除アクション対応）
 * @param {Array<Object>} memories 
 * @param {Function|Object} [onMarkerClickOrOptions] 
 * @param {Function} [onEditMemory] 
 * @param {Function} [onDeleteMemory] 
 */
export function renderMarkers(memories = [], onMarkerClickOrOptions = null, onEditMemory = null, onDeleteMemory = null) {
  if (!clusterGroup) return;

  let onMarkerClick = null;
  let onEdit = null;
  let onDelete = null;

  if (typeof onMarkerClickOrOptions === 'function') {
    onMarkerClick = onMarkerClickOrOptions;
    onEdit = onEditMemory;
    onDelete = onDeleteMemory;
  } else if (onMarkerClickOrOptions && typeof onMarkerClickOrOptions === 'object') {
    onMarkerClick = onMarkerClickOrOptions.onMarkerClick || null;
    onEdit = onMarkerClickOrOptions.onEdit || onMarkerClickOrOptions.onEditMemory || null;
    onDelete = onMarkerClickOrOptions.onDelete || onMarkerClickOrOptions.onDeleteMemory || null;
  }

  clusterGroup.clearLayers();

  memories.forEach((memory) => {
    if (typeof memory.lat !== 'number' || typeof memory.lng !== 'number') return;
    if (isNaN(memory.lat) || isNaN(memory.lng)) return;

    const photos = Array.isArray(memory.imageUrls) ? memory.imageUrls : [];
    const hasPhoto = photos.length > 0;
    const coverPhoto = hasPhoto ? photos[0] : null;

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

    // 写真エリア（複数写真の場合は前後のインライン切り替え矢印を配置）
    const imageHtml = coverPhoto
      ? `<div class="memory-popup-image-box" style="width: 100%; height: 135px; border-radius: 10px; overflow: hidden; margin-bottom: 8px; background: #f1f5f9; position: relative;">
          <img class="popup-current-img" src="${coverPhoto}" alt="${title}" style="width: 100%; height: 100%; object-fit: cover; display: block; cursor: pointer; transition: opacity 0.2s ease;" title="クリックして拡大表示" />
          
          ${photos.length > 1 ? `
            <button type="button" class="popup-carousel-btn prev" style="position: absolute; left: 6px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; border-radius: 50%; background: rgba(15, 23, 42, 0.7); border: none; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(4px); z-index: 5;" title="前の写真">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button type="button" class="popup-carousel-btn next" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; border-radius: 50%; background: rgba(15, 23, 42, 0.7); border: none; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(4px); z-index: 5;" title="次の写真">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <div class="popup-photo-indicator" style="position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(4px); border-radius: 10px; padding: 2px 8px; color: white; font-size: 0.65rem; font-weight: 700; pointer-events: none; z-index: 4;">
              1 / ${photos.length}
            </div>
          ` : `
            <div style="position: absolute; right: 6px; bottom: 6px; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(4px); border-radius: 6px; padding: 2px 6px; color: white; font-size: 0.65rem; font-weight: 700; display: flex; align-items: center; gap: 4px; pointer-events: none; z-index: 4;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              <span>拡大</span>
            </div>
          `}
         </div>`
      : '';

    // ポップアップ下部アクションバー（編集・削除）
    const actionBarHtml = `
      <div class="popup-action-bar" style="display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(0, 0, 0, 0.06);">
        <button type="button" class="btn-popup-edit" style="flex: 1; padding: 5px 8px; background: #f8fafc; border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 8px; font-size: 0.75rem; font-weight: 700; color: #334155; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.2s;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
          </svg>
          <span>編集</span>
        </button>
        <button type="button" class="btn-popup-delete" style="padding: 5px 8px; background: #fee2e2; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; font-size: 0.75rem; font-weight: 700; color: #dc2626; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.2s;" title="この思い出を削除">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <span>削除</span>
        </button>
      </div>
    `;

    const popupHtml = `
      <div class="memory-popup-content" style="min-width: 210px; max-width: 250px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        ${imageHtml}
        ${albumBadge}
        <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; font-weight: 700; color: #0f172a; line-height: 1.3;">${title}</h4>
        ${displayDate ? `<div style="font-size: 0.75rem; color: #94a3b8;">${displayDate}</div>` : ''}
        ${diaryText}
        ${actionBarHtml}
      </div>
    `;

    marker.bindPopup(popupHtml, {
      maxWidth: 270,
      className: 'custom-memory-popup'
    });

    marker.on('popupopen', (e) => {
      const popupEl = e.popup.getElement();
      if (!popupEl) return;

      let currentPhotoIdx = 0;
      const imgEl = popupEl.querySelector('.popup-current-img');
      const indicatorEl = popupEl.querySelector('.popup-photo-indicator');
      const btnPrev = popupEl.querySelector('.popup-carousel-btn.prev');
      const btnNext = popupEl.querySelector('.popup-carousel-btn.next');

      // 前後の写真切り替えハンドラ
      if (photos.length > 1 && imgEl && indicatorEl) {
        const updatePopupPhoto = (idx) => {
          if (idx < 0) currentPhotoIdx = photos.length - 1;
          else if (idx >= photos.length) currentPhotoIdx = 0;
          else currentPhotoIdx = idx;

          imgEl.style.opacity = '0';
          setTimeout(() => {
            imgEl.src = photos[currentPhotoIdx];
            imgEl.style.opacity = '1';
            indicatorEl.textContent = `${currentPhotoIdx + 1} / ${photos.length}`;
          }, 150);
        };

        btnPrev?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          updatePopupPhoto(currentPhotoIdx - 1);
        });

        btnNext?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          updatePopupPhoto(currentPhotoIdx + 1);
        });
      }

      // 画像クリックで拡大ライトボックス起動
      if (imgEl && hasPhoto) {
        imgEl.addEventListener('click', () => {
          openLightbox(photos, currentPhotoIdx);
        });
      }

      // 編集ボタンハンドラ
      const btnEdit = popupEl.querySelector('.btn-popup-edit');
      btnEdit?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        marker.closePopup();
        if (typeof onEdit === 'function') {
          onEdit(memory);
        }
        window.dispatchEvent(new CustomEvent('memorymap:edit-memory', { detail: memory }));
      });

      // 削除ボタンハンドラ
      const btnDelete = popupEl.querySelector('.btn-popup-delete');
      btnDelete?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (confirm(`思い出「${title}」を削除してもよろしいですか？`)) {
          marker.closePopup();
          if (typeof onDelete === 'function') {
            onDelete(memory.id);
          }
          window.dispatchEvent(new CustomEvent('memorymap:delete-memory', { detail: { id: memory.id } }));
        }
      });
    });

    if (typeof onMarkerClick === 'function') {
      marker.on('click', () => onMarkerClick(memory));
    }

    clusterGroup.addLayer(marker);
  });
}
