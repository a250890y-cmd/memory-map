import L from 'leaflet';

/**
 * Memory Map - 旅のフォトブック生成 & 印刷プレビューモジュール
 * 指定アルバムの思い出を「表紙（サムネイル＋全ルート地図）」「スポット詳細（周辺ミニマップ付き）」の
 * A4印刷レイアウトに自動整形し、ブラウザの印刷機能（window.print）経由でPDF保存を可能にします。
 */

let photobookModal = null;
let activeMapInstances = [];

/**
 * フォトブック用スタイルを動的に注入（画面プレビュー & @media print 印刷用）
 */
function ensurePhotobookStyles() {
  if (document.getElementById('photobook-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'photobook-modal-styles';
  style.textContent = `
    .photobook-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 3000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 1.5rem 1rem;
      overflow-y: auto;
    }
    .photobook-modal-overlay.hidden {
      display: none !important;
    }
    .photobook-container {
      width: 100%;
      max-width: 860px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      margin-bottom: 2.5rem;
    }
    .photobook-toolbar {
      width: 100%;
      max-width: 860px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: white;
      padding: 12px 20px;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      margin-bottom: 16px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .photobook-toolbar-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .photobook-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn-print-action {
      background: #2563eb;
      color: white;
      border: none;
      padding: 9px 18px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.88rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
      transition: all 0.2s;
    }
    .btn-print-action:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }
    .btn-close-photobook {
      background: #f1f5f9;
      border: none;
      border-radius: 50%;
      width: 34px;
      height: 34px;
      cursor: pointer;
      color: #64748b;
      font-size: 1rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .btn-close-photobook:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    /* 各ページ（A4用紙比率スタイル） */
    .photobook-page {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 10px 36px rgba(0, 0, 0, 0.14);
      padding: 44px 48px;
      min-height: 980px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      color: #0f172a;
      position: relative;
    }
    .photobook-cover-page {
      text-align: center;
      justify-content: space-between;
      align-items: center;
      padding: 56px 48px 44px 48px;
    }
    .photobook-cover-title {
      font-size: 2.2rem;
      font-weight: 800;
      color: #0f172a;
      margin: 8px 0 10px 0;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }
    .photobook-cover-subtitle {
      font-size: 1.05rem;
      color: #64748b;
      margin-bottom: 28px;
    }

    /* 表紙ビジュアル横並び（サムネイル写真 ＋ ルート俯瞰サマリーマップ） */
    .photobook-cover-visual-row {
      display: flex;
      gap: 20px;
      width: 100%;
      max-width: 720px;
      margin: 0 auto 28px auto;
      align-items: stretch;
      box-sizing: border-box;
    }
    .photobook-cover-thumb-box {
      flex: 1;
      height: 280px;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0,0,0,0.1);
      background: #f1f5f9;
      border: 1px solid rgba(0,0,0,0.06);
    }
    .photobook-cover-thumb-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .photobook-cover-thumb-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      font-size: 0.85rem;
    }
    .photobook-cover-map-box {
      flex: 1;
      height: 280px;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0,0,0,0.1);
      border: 1px solid rgba(0,0,0,0.06);
      background: #e2e8f0;
      position: relative;
    }
    .photobook-summary-map {
      width: 100%;
      height: 100%;
      z-index: 1;
    }
    @media (max-width: 640px) {
      .photobook-cover-visual-row {
        flex-direction: column;
      }
      .photobook-cover-thumb-box,
      .photobook-cover-map-box {
        height: 220px;
      }
    }

    /* スポットヘッダー */
    .photobook-spot-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 12px;
    }
    .photobook-badge {
      padding: 4px 12px;
      background: #2563eb;
      color: white;
      border-radius: 14px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .photobook-spot-title {
      font-size: 1.55rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 16px 0;
      line-height: 1.3;
    }

    /* スポット本文 & ミニマップの2カラムレイアウト */
    .photobook-spot-content-layout {
      display: grid;
      grid-template-columns: 1fr 260px;
      gap: 20px;
      margin-bottom: 20px;
      align-items: start;
    }
    .photobook-spot-main-col {
      min-width: 0;
    }
    .photobook-spot-map-col {
      width: 100%;
    }
    @media (max-width: 680px) {
      .photobook-spot-content-layout {
        grid-template-columns: 1fr;
      }
    }

    .photobook-photos-container {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
    }
    .photobook-photos-container img {
      border-radius: 10px;
      object-fit: cover;
      box-shadow: 0 3px 10px rgba(0,0,0,0.08);
      border: 1px solid rgba(0,0,0,0.05);
    }
    .photobook-diary-box {
      background: #f8fafc;
      border-left: 4px solid #2563eb;
      padding: 14px 18px;
      border-radius: 0 10px 10px 0;
      font-size: 0.92rem;
      line-height: 1.65;
      color: #334155;
      white-space: pre-wrap;
      margin-bottom: 16px;
    }
    .photobook-tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .photobook-tag-pill {
      background: #f1f5f9;
      color: #475569;
      padding: 3px 9px;
      border-radius: 7px;
      font-size: 0.76rem;
      font-weight: 600;
    }

    /* 各スポットの周辺ミニマップカード */
    .photobook-spot-minimap-card {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
    }
    .photobook-minimap {
      width: 100%;
      height: 200px;
      background: #e2e8f0;
      z-index: 1;
    }
    .photobook-minimap-meta {
      padding: 7px 10px;
      font-size: 0.72rem;
      color: #64748b;
      background: #f8fafc;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      display: flex;
      align-items: center;
      gap: 5px;
      font-weight: 500;
    }

    .photobook-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 14px;
      display: flex;
      justify-content: space-between;
      font-size: 0.78rem;
      color: #94a3b8;
    }

    /* 印刷時のスタイル */
    @media print {
      body * {
        visibility: hidden;
      }
      .photobook-modal-overlay,
      .photobook-modal-overlay * {
        visibility: visible;
      }
      .photobook-modal-overlay {
        position: static !important;
        background: transparent !important;
        padding: 0 !important;
        overflow: visible !important;
      }
      .photobook-toolbar {
        display: none !important;
      }
      .photobook-container {
        max-width: 100% !important;
        margin: 0 !important;
        gap: 0 !important;
      }
      .photobook-page {
        box-shadow: none !important;
        border-radius: 0 !important;
        padding: 20mm 18mm !important;
        min-height: 100vh !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      .photobook-summary-map,
      .photobook-minimap {
        filter: saturate(1.1);
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * モーダルDOMの作成
 */
function createPhotobookDOM() {
  ensurePhotobookStyles();
  if (document.getElementById('photobook-modal-overlay')) return;

  const html = `
    <div id="photobook-modal-overlay" class="photobook-modal-overlay hidden">
      <div class="photobook-toolbar">
        <div class="photobook-toolbar-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span id="photobook-toolbar-album-name">旅のフォトブック プレビュー</span>
        </div>
        <div class="photobook-toolbar-actions">
          <button id="btn-print-photobook" class="btn-print-action">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            <span>PDF保存 / 印刷</span>
          </button>
          <button id="btn-close-photobook" class="btn-close-photobook" title="閉じる" style="display: flex; align-items: center; justify-content: center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div id="photobook-content-container" class="photobook-container"></div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  photobookModal = document.getElementById('photobook-modal-overlay');

  document.getElementById('btn-close-photobook')?.addEventListener('click', closePhotobookModal);
  document.getElementById('btn-print-photobook')?.addEventListener('click', () => {
    window.print();
  });

  photobookModal.addEventListener('click', (e) => {
    if (e.target === photobookModal) closePhotobookModal();
  });

  window.addEventListener('beforeprint', () => {
    activeMapInstances.forEach(map => {
      try { map.invalidateSize(); } catch (e) {}
    });
  });
}

/**
 * フォトブックHTMLの生成
 */
function generatePhotobookHTML(albumName, memories) {
  // 日付順にソート
  const sorted = [...memories].sort((a, b) => {
    const tA = new Date(a.datetime || a.timestamp || 0).getTime();
    const tB = new Date(b.datetime || b.timestamp || 0).getTime();
    return tA - tB;
  });

  // 旅の期間を計算
  let periodText = '記録された旅の思い出';
  const dates = sorted.map(m => m.datetime || m.timestamp).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
  if (dates.length > 0) {
    const first = dates[0];
    const last = dates[dates.length - 1];
    const fmt = d => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    periodText = fmt(first) === fmt(last) ? fmt(first) : `${fmt(first)} 〜 ${fmt(last)}`;
  }

  // 全写真の収集
  const allPhotos = [];
  sorted.forEach(m => {
    if (Array.isArray(m.imageUrls)) allPhotos.push(...m.imageUrls);
  });

  // 表紙用カバー写真の決定（albumCoverPhoto > isCoverPhoto > coverPhoto > allPhotos[0]）
  const coverPhotoUrl = 
    sorted.find(m => m.albumCoverPhoto)?.albumCoverPhoto ||
    sorted.find(m => m.isCoverPhoto && m.imageUrls?.[0])?.imageUrls?.[0] ||
    sorted.find(m => m.coverPhoto)?.coverPhoto ||
    allPhotos[0] ||
    null;

  let html = '';

  // 1. 表紙ページ（サムネイル写真 ＋ ルート俯瞰サマリーマップ）
  html += `
    <div class="photobook-page photobook-cover-page">
      <div>
        <div style="font-size: 0.9rem; font-weight: 700; color: #2563eb; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px;">Memory Map Album</div>
        <h1 class="photobook-cover-title">${albumName || '旅の記録'}</h1>
        <div class="photobook-cover-subtitle">${periodText}</div>
      </div>

      <div class="photobook-cover-visual-row">
        <div class="photobook-cover-thumb-box">
          ${coverPhotoUrl ? `
            <img src="${coverPhotoUrl}" alt="${albumName || 'アルバムカバー'}" />
          ` : `
            <div class="photobook-cover-thumb-placeholder">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span style="margin-top: 8px;">写真なし</span>
            </div>
          `}
        </div>
        <div class="photobook-cover-map-box">
          <div id="photobook-summary-map" class="photobook-summary-map"></div>
        </div>
      </div>

      <div style="color: #94a3b8; font-size: 0.85rem; font-weight: 500;">全 ${sorted.length} か所のスポットを収録</div>
    </div>
  `;

  // 2. 各スポットのページ（周辺ミニマップ埋め込み）
  sorted.forEach((m, idx) => {
    const spotNum = idx + 1;
    let spotDate = '';
    const rawDate = m.datetime || m.timestamp;
    if (rawDate) {
      const dt = new Date(rawDate);
      if (!isNaN(dt.getTime())) {
        spotDate = `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      }
    }

    const photos = Array.isArray(m.imageUrls) ? m.imageUrls : [];
    let photosHtml = '';

    if (photos.length === 1) {
      photosHtml = `
        <div class="photobook-photos-container">
          <img src="${photos[0]}" alt="${m.title || ''}" style="max-width: 100%; max-height: 400px; width: auto;" />
        </div>
      `;
    } else if (photos.length > 1) {
      const imgWidth = photos.length === 2 ? '48%' : (photos.length === 3 ? '31%' : '48%');
      photosHtml = `
        <div class="photobook-photos-container">
          ${photos.map(url => `<img src="${url}" alt="${m.title || ''}" style="width: ${imgWidth}; max-height: 240px;" />`).join('')}
        </div>
      `;
    }

    const tagsHtml = Array.isArray(m.tags) && m.tags.length > 0
      ? `<div class="photobook-tag-list">${m.tags.map(t => `<span class="photobook-tag-pill">#${t}</span>`).join('')}</div>`
      : '';

    const hasCoords = m.lat != null && m.lng != null && !isNaN(Number(m.lat)) && !isNaN(Number(m.lng));

    html += `
      <div class="photobook-page">
        <div>
          <div class="photobook-spot-header">
            <span class="photobook-badge">SPOT ${spotNum} / ${sorted.length}</span>
            <span style="font-size: 0.85rem; color: #64748b; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>${spotDate}</span>
            </span>
          </div>

          <h2 class="photobook-spot-title">${m.title || '無題の思い出'}</h2>

          <div class="photobook-spot-content-layout">
            <div class="photobook-spot-main-col">
              ${photosHtml}
              ${m.diary ? `<div class="photobook-diary-box">${m.diary}</div>` : ''}
              ${tagsHtml}
            </div>
            ${hasCoords ? `
              <div class="photobook-spot-map-col">
                <div class="photobook-spot-minimap-card">
                  <div id="photobook-minimap-${idx}" class="photobook-minimap"></div>
                  <div class="photobook-minimap-meta">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>${Number(m.lat).toFixed(4)}, ${Number(m.lng).toFixed(4)}</span>
                  </div>
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="photobook-footer">
          <span>${albumName || 'Memory Map'}</span>
          <span>Page ${idx + 2}</span>
        </div>
      </div>
    `;
  });

  return html;
}

/**
 * フォトブック内の全地図（サマリーマップ＆各スポットミニマップ）を初期化
 * @param {Array<Object>} sortedMemories 
 */
function initPhotobookMaps(sortedMemories) {
  // 既存の地図インスタンスを完全に破棄して初期化
  activeMapInstances.forEach(map => {
    try {
      map.remove();
    } catch (e) {
      console.warn('[Photobook] Map remove error:', e);
    }
  });
  activeMapInstances = [];

  const tileUrl = 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
  const tileOptions = {
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    attribution: '&copy; Google Maps'
  };

  // 1. 表紙サマリーマップの初期化
  const summaryEl = document.getElementById('photobook-summary-map');
  const validSpots = sortedMemories.filter(m => m.lat != null && m.lng != null && !isNaN(Number(m.lat)) && !isNaN(Number(m.lng)));

  if (summaryEl) {
    const summaryMap = L.map(summaryEl, {
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      attributionControl: false
    });
    L.tileLayer(tileUrl, tileOptions).addTo(summaryMap);

    const points = validSpots.map(s => [Number(s.lat), Number(s.lng)]);

    if (points.length > 0) {
      // ナンバリングされたピンをプロット
      validSpots.forEach((spot) => {
        const spotIdx = sortedMemories.indexOf(spot) + 1;
        const pin = L.divIcon({
          className: 'photobook-summary-pin',
          html: `<div style="background:#2563eb;color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid white;">${spotIdx}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        L.marker([Number(spot.lat), Number(spot.lng)], { icon: pin }).addTo(summaryMap);
      });

      // ルート線の描画
      if (points.length >= 2) {
        const drawSummaryRoute = async () => {
          let routeCoords = points;
          try {
            const coordsString = points.map(p => `${p[1]},${p[0]}`).join(';');
            const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`);
            if (res.ok) {
              const data = await res.json();
              if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                routeCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
              }
            }
          } catch (err) {
            console.warn('[Photobook] OSRM route fetch fallback to lines:', err);
          }

          if (summaryMap && !summaryMap._container) return; // 破棄済みチェック

          // 下敷き（白縁取り）
          L.polyline(routeCoords, {
            color: '#ffffff',
            weight: 6,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(summaryMap);

          // メインルート線
          L.polyline(routeCoords, {
            color: '#2563eb',
            weight: 3.5,
            opacity: 0.85,
            dashArray: '5, 7',
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(summaryMap);
        };
        drawSummaryRoute();
      }

      // 地図表示領域のフィッティング
      if (points.length === 1) {
        summaryMap.setView(points[0], 14);
      } else {
        summaryMap.fitBounds(L.latLngBounds(points), { padding: [28, 28] });
      }
    } else {
      summaryMap.setView([36.2048, 138.2529], 5);
    }

    activeMapInstances.push(summaryMap);
  }

  // 2. 各スポットの周辺ミニマップ初期化
  sortedMemories.forEach((m, idx) => {
    if (m.lat == null || m.lng == null || isNaN(Number(m.lat)) || isNaN(Number(m.lng))) return;
    const el = document.getElementById(`photobook-minimap-${idx}`);
    if (!el) return;

    const lat = Number(m.lat);
    const lng = Number(m.lng);

    const minimap = L.map(el, {
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      attributionControl: false
    });
    L.tileLayer(tileUrl, tileOptions).addTo(minimap);
    minimap.setView([lat, lng], 15);

    // スポット番号ピン
    const spotPin = L.divIcon({
      className: 'photobook-minimap-pin',
      html: `<div style="background:#2563eb;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;box-shadow:0 3px 8px rgba(0,0,0,0.35);border:2px solid white;">${idx + 1}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    L.marker([lat, lng], { icon: spotPin }).addTo(minimap);

    activeMapInstances.push(minimap);
  });

  // タイル崩れ防止のための invalidateSize
  const invalidateAll = () => {
    activeMapInstances.forEach(map => {
      try {
        map.invalidateSize();
      } catch (e) {}
    });
  };

  requestAnimationFrame(invalidateAll);
  setTimeout(invalidateAll, 150);
  setTimeout(invalidateAll, 450);
}

/**
 * フォトブックモーダルを開く
 * @param {string} albumName 
 * @param {Array<Object>} memories 
 */
export function openPhotobookModal(albumName, memories = []) {
  createPhotobookDOM();

  const titleEl = document.getElementById('photobook-toolbar-album-name');
  if (titleEl) {
    titleEl.textContent = `旅のフォトブック: ${albumName || 'すべての思い出'}`;
  }

  // 日付順にソートした思い出配列を保持
  const sorted = [...memories].sort((a, b) => {
    const tA = new Date(a.datetime || a.timestamp || 0).getTime();
    const tB = new Date(b.datetime || b.timestamp || 0).getTime();
    return tA - tB;
  });

  const container = document.getElementById('photobook-content-container');
  if (container) {
    container.innerHTML = generatePhotobookHTML(albumName, sorted);
  }

  photobookModal.classList.remove('hidden');

  // 地図のレンダリング
  initPhotobookMaps(sorted);
}

/**
 * フォトブックモーダルを閉じる
 */
export function closePhotobookModal() {
  if (photobookModal) {
    photobookModal.classList.add('hidden');
  }
  // 地図インスタンスの破棄
  activeMapInstances.forEach(map => {
    try {
      map.remove();
    } catch (e) {}
  });
  activeMapInstances = [];
}
