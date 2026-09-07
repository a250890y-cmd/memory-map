/**
 * Memory Map - サイドバーコンポーネント
 * アルバム一覧、年別フィルターチップ、タグ一覧、検索バーを管理し、
 * 条件変更時に地図上のピンを動的に絞り込みます。
 */

import { getHomeLocation, saveHomeLocation, clearHomeLocation } from '../services/storage';
import { setHomeMarker, flyToLocation, getMap, drawRouteLine } from '../map/map-manager';

let sidebarContainer = null;
let memoriesData = [];
let homeLocationState = null;
let isSettingHomeFromMap = false;

let filterState = {
  searchQuery: '',
  selectedYear: '',
  selectedAlbum: '',
  selectedTag: ''
};

let callbacks = {
  onFilterChange: null,
  onAlbumSelect: null
};

/**
 * フィルターを適用して該当する思い出を抽出し、リスナーに通知
 */
function applyFilters() {
  let filtered = [...memoriesData];

  // 1. 検索語フィルター（タイトル、日記、アルバム、タグを横断）
  if (filterState.searchQuery) {
    const q = filterState.searchQuery.toLowerCase();
    filtered = filtered.filter(m => {
      const inTitle = (m.title || '').toLowerCase().includes(q);
      const inDiary = (m.diary || '').toLowerCase().includes(q);
      const inAlbum = (m.album || '').toLowerCase().includes(q);
      const inTags = Array.isArray(m.tags) && m.tags.some(t => t.toLowerCase().includes(q));
      return inTitle || inDiary || inAlbum || inTags;
    });
  }

  // 2. 年別フィルター
  if (filterState.selectedYear) {
    filtered = filtered.filter(m => {
      const rawDate = m.datetime || m.timestamp;
      if (!rawDate) return false;
      const dt = new Date(rawDate);
      return !isNaN(dt.getTime()) && String(dt.getFullYear()) === filterState.selectedYear;
    });
  }

  // 3. アルバムフィルター
  if (filterState.selectedAlbum) {
    filtered = filtered.filter(m => (m.album || '') === filterState.selectedAlbum);
  }

  // 4. タグフィルター
  if (filterState.selectedTag) {
    filtered = filtered.filter(m => Array.isArray(m.tags) && m.tags.includes(filterState.selectedTag));
  }

  if (typeof callbacks.onFilterChange === 'function') {
    callbacks.onFilterChange(filtered, filterState);
  }
}

/**
 * サイドバーの UI を構築してイベントをバインド
 */
function renderSidebarUI() {
  if (!sidebarContainer) return;

  // 1. 年の集計（降順）
  const yearsSet = new Set();
  memoriesData.forEach(m => {
    const raw = m.datetime || m.timestamp;
    if (raw) {
      const dt = new Date(raw);
      if (!isNaN(dt.getTime())) {
        yearsSet.add(String(dt.getFullYear()));
      }
    }
  });
  const sortedYears = [...yearsSet].sort((a, b) => Number(b) - Number(a));

  // 2. アルバムの集計
  const albumsMap = {};
  memoriesData.forEach(m => {
    const albumName = (m.album || '').trim();
    if (albumName) {
      if (!albumsMap[albumName]) {
        albumsMap[albumName] = {
          name: albumName,
          count: 0,
          coverUrl: null,
          memories: []
        };
      }
      albumsMap[albumName].count += 1;
      albumsMap[albumName].memories.push(m);
      if (!albumsMap[albumName].coverUrl && Array.isArray(m.imageUrls) && m.imageUrls.length > 0) {
        albumsMap[albumName].coverUrl = m.imageUrls[0];
      }
    }
  });
  const albumList = Object.values(albumsMap);

  // 3. タグの集計（件数付き・降順）
  const tagCountMap = {};
  memoriesData.forEach(m => {
    if (Array.isArray(m.tags)) {
      m.tags.forEach(t => {
        const clean = t.trim();
        if (clean) {
          tagCountMap[clean] = (tagCountMap[clean] || 0) + 1;
        }
      });
    }
  });
  const sortedTags = Object.entries(tagCountMap)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  // HTML 構築
  sidebarContainer.innerHTML = `
    <!-- 検索バー -->
    <div class="sidebar-search-box">
      <svg class="sidebar-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input type="text" id="sidebar-search-input" class="sidebar-search-input" placeholder="思い出、場所、タグを検索..." value="${filterState.searchQuery}" />
      ${filterState.searchQuery ? `
        <button id="btn-clear-search" class="btn-clear-search" title="検索クリア" style="display: flex; align-items: center; justify-content: center;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      ` : ''}
    </div>

    <!-- 拠点・自宅設定 -->
    <div class="sidebar-group">
      <div class="sidebar-group-header">
        <span class="sidebar-group-title" style="display: flex; align-items: center; gap: 5px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          </svg>
          <span>拠点・自宅</span>
        </span>
        ${homeLocationState ? '<button id="btn-sidebar-clear-home" class="btn-filter-reset">解除</button>' : ''}
      </div>

      <div style="background: rgba(255, 255, 255, 0.7); border: 1px solid rgba(0, 0, 0, 0.06); border-radius: 14px; padding: 10px 12px;">
        ${isSettingHomeFromMap ? `
          <div style="color: #2563eb; font-size: 0.78rem; font-weight: 600; line-height: 1.4; display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #2563eb; animation: pulse 1.5s infinite;"></span>
            <span>地図上の自宅にしたい場所をクリックしてください</span>
          </div>
        ` : homeLocationState ? `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #0f172a; font-size: 0.82rem;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
              <span>${homeLocationState.name || '自宅'}</span>
            </div>
            <span style="font-size: 0.72rem; color: #94a3b8;">${homeLocationState.lat.toFixed(3)}, ${homeLocationState.lng.toFixed(3)}</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button id="btn-sidebar-fly-home" style="flex: 1; padding: 6px 10px; background: #2563eb; color: white; border: none; border-radius: 8px; font-size: 0.76rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 6px rgba(37,99,235,0.25); transition: all 0.2s;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
              <span>自宅へ移動</span>
            </button>
            <button id="btn-sidebar-change-home" style="padding: 6px 10px; background: #f1f5f9; color: #475569; border: 1px solid rgba(0,0,0,0.06); border-radius: 8px; font-size: 0.76rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">
              変更
            </button>
          </div>
        ` : `
          <div style="color: #64748b; font-size: 0.76rem; margin-bottom: 8px; line-height: 1.4;">
            自宅を設定すると、旅のルート探索時に出発地・帰着点として自動反映されます。
          </div>
          <div style="display: flex; gap: 6px;">
            <button id="btn-sidebar-set-home-map" style="flex: 1; padding: 6px 10px; background: #f8fafc; color: #2563eb; border: 1px solid rgba(37,99,235,0.2); border-radius: 8px; font-size: 0.76rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.2s;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 8 12 12 14 14"></polyline></svg>
              <span>地図から指定</span>
            </button>
            <button id="btn-sidebar-set-home-current" style="flex: 1; padding: 6px 10px; background: #f1f5f9; color: #0f172a; border: 1px solid rgba(0,0,0,0.06); border-radius: 8px; font-size: 0.76rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.2s;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
              <span>現在地を設定</span>
            </button>
          </div>
        `}
      </div>
    </div>

    <!-- 年別フィルター -->
    <div class="sidebar-group">
      <div class="sidebar-group-header">
        <span class="sidebar-group-title">時期で絞り込み</span>
        ${filterState.selectedYear ? '<button id="btn-reset-year" class="btn-filter-reset">クリア</button>' : ''}
      </div>
      <div class="filter-chip-group">
        <button class="filter-chip ${filterState.selectedYear === '' ? 'active' : ''}" data-year="">すべて</button>
        ${sortedYears.map(yr => `
          <button class="filter-chip ${filterState.selectedYear === yr ? 'active' : ''}" data-year="${yr}">
            ${yr}年
          </button>
        `).join('')}
      </div>
    </div>

    <!-- アルバム一覧 -->
    <div class="sidebar-group">
      <div class="sidebar-group-header">
        <span class="sidebar-group-title">アルバム (${albumList.length})</span>
        ${filterState.selectedAlbum ? '<button id="btn-reset-album" class="btn-filter-reset">すべて表示</button>' : ''}
      </div>
      <div class="sidebar-album-list">
        <div class="sidebar-album-item ${filterState.selectedAlbum === '' ? 'active' : ''}" data-album="">
          <div class="album-thumb-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div class="album-item-info">
            <div class="album-item-title">すべてのアルバム</div>
            <div class="album-item-count">${memoriesData.length} 件の思い出</div>
          </div>
        </div>
        ${albumList.map(a => `
          <div class="sidebar-album-item ${filterState.selectedAlbum === a.name ? 'active' : ''}" data-album="${a.name}">
            ${a.coverUrl
              ? `<img src="${a.coverUrl}" alt="${a.name}" class="album-thumb-img" />`
              : `<div class="album-thumb-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>`
            }
            <div class="album-item-info">
              <div class="album-item-title">${a.name}</div>
              <div class="album-item-count">${a.count} 件</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- タグクラウド -->
    <div class="sidebar-group">
      <div class="sidebar-group-header">
        <span class="sidebar-group-title">タグ (${sortedTags.length})</span>
        ${filterState.selectedTag ? '<button id="btn-reset-tag" class="btn-filter-reset">すべて表示</button>' : ''}
      </div>
      <div class="sidebar-tag-cloud">
        <button class="sidebar-tag-chip ${filterState.selectedTag === '' ? 'active' : ''}" data-tag="">すべて</button>
        ${sortedTags.map(item => `
          <button class="sidebar-tag-chip ${filterState.selectedTag === item.tag ? 'active' : ''}" data-tag="${item.tag}">
            #${item.tag} <span class="tag-count">(${item.count})</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  bindSidebarEvents(albumsMap);
}

/**
 * イベントリスナーの登録
 */
function bindSidebarEvents(albumsMap) {
  // 検索入力
  const searchInput = document.getElementById('sidebar-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterState.searchQuery = e.target.value.trim();
      applyFilters();
      // クリアボタンの動的トグル
      const clearBtn = document.getElementById('btn-clear-search');
      if (clearBtn) {
        clearBtn.style.display = filterState.searchQuery ? 'block' : 'none';
      }
    });
  }

  const btnClearSearch = document.getElementById('btn-clear-search');
  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      filterState.searchQuery = '';
      if (searchInput) searchInput.value = '';
      applyFilters();
      renderSidebarUI();
    });
  }

  // 年別チップクリック
  sidebarContainer.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      filterState.selectedYear = btn.getAttribute('data-year') || '';
      renderSidebarUI();
      applyFilters();
    });
  });

  const btnResetYear = document.getElementById('btn-reset-year');
  if (btnResetYear) {
    btnResetYear.addEventListener('click', () => {
      filterState.selectedYear = '';
      renderSidebarUI();
      applyFilters();
    });
  }

  // アルバム選択クリック
  sidebarContainer.querySelectorAll('.sidebar-album-item').forEach(el => {
    el.addEventListener('click', () => {
      const album = el.getAttribute('data-album') || '';
      filterState.selectedAlbum = album;
      renderSidebarUI();
      applyFilters();

      // アルバムが選択された場合、カメラ移動をコールバック
      if (album && albumsMap[album] && typeof callbacks.onAlbumSelect === 'function') {
        callbacks.onAlbumSelect(album, albumsMap[album].memories);
      }
    });
  });

  const btnResetAlbum = document.getElementById('btn-reset-album');
  if (btnResetAlbum) {
    btnResetAlbum.addEventListener('click', () => {
      filterState.selectedAlbum = '';
      renderSidebarUI();
      applyFilters();
    });
  }

  // タグチップクリック
  sidebarContainer.querySelectorAll('.sidebar-tag-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      filterState.selectedTag = btn.getAttribute('data-tag') || '';
      renderSidebarUI();
      applyFilters();
    });
  });

  const btnResetTag = document.getElementById('btn-reset-tag');
  if (btnResetTag) {
    btnResetTag.addEventListener('click', () => {
      filterState.selectedTag = '';
      renderSidebarUI();
      applyFilters();
    });
  }

  // 自宅操作イベントのバインド
  const btnClearHome = document.getElementById('btn-sidebar-clear-home');
  if (btnClearHome) {
    btnClearHome.addEventListener('click', handleClearHome);
  }

  const btnFlyHome = document.getElementById('btn-sidebar-fly-home');
  if (btnFlyHome) {
    btnFlyHome.addEventListener('click', handleFlyToHome);
  }

  const btnChangeHome = document.getElementById('btn-sidebar-change-home');
  if (btnChangeHome) {
    btnChangeHome.addEventListener('click', startMapPickHome);
  }

  const btnSetHomeMap = document.getElementById('btn-sidebar-set-home-map');
  if (btnSetHomeMap) {
    btnSetHomeMap.addEventListener('click', startMapPickHome);
  }

  const btnSetHomeCurrent = document.getElementById('btn-sidebar-set-home-current');
  if (btnSetHomeCurrent) {
    btnSetHomeCurrent.addEventListener('click', setCurrentLocationAsHome);
  }
}

/**
 * 地図をクリックして自宅を設定するフロー
 */
function startMapPickHome() {
  const map = getMap();
  const mapEl = document.getElementById('map');
  if (!map) return;

  isSettingHomeFromMap = true;
  if (mapEl) mapEl.style.cursor = 'crosshair';
  renderSidebarUI();

  map.once('click', async (e) => {
    if (mapEl) mapEl.style.cursor = '';
    isSettingHomeFromMap = false;

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const newHome = { lat, lng, name: '自宅' };

    try {
      await saveHomeLocation(newHome);
      homeLocationState = newHome;
      setHomeMarker(homeLocationState, { onClear: handleClearHome });
      renderSidebarUI();

      // アルバム選択中の場合はルート探索を再実行
      if (filterState.selectedAlbum) {
        const albumMemories = memoriesData.filter(m => (m.album || '') === filterState.selectedAlbum);
        drawRouteLine(albumMemories);
      }
    } catch (err) {
      console.error('自宅設定の保存エラー:', err);
      alert('自宅設定の保存に失敗しました: ' + err.message);
    }
  });
}

/**
 * 現在地を自宅として設定するフロー
 */
function setCurrentLocationAsHome() {
  if (!navigator.geolocation) {
    alert('お使いのブラウザは現在地取得に対応していません。');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const newHome = { lat, lng, name: '自宅' };

      try {
        await saveHomeLocation(newHome);
        homeLocationState = newHome;
        setHomeMarker(homeLocationState, { onClear: handleClearHome });
        flyToLocation(lat, lng, 15);
        renderSidebarUI();

        if (filterState.selectedAlbum) {
          const albumMemories = memoriesData.filter(m => (m.album || '') === filterState.selectedAlbum);
          drawRouteLine(albumMemories);
        }
      } catch (err) {
        console.error('現在地からの自宅設定エラー:', err);
        alert('自宅設定の保存に失敗しました: ' + err.message);
      }
    },
    (err) => {
      console.warn('現在地取得失敗:', err);
      alert('現在地を取得できませんでした。ブラウザの位置情報パーミッションをご確認ください。');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

/**
 * 自宅設定を解除
 */
async function handleClearHome() {
  try {
    await clearHomeLocation();
    homeLocationState = null;
    setHomeMarker(null);
    renderSidebarUI();

    if (filterState.selectedAlbum) {
      const albumMemories = memoriesData.filter(m => (m.album || '') === filterState.selectedAlbum);
      drawRouteLine(albumMemories);
    }
  } catch (err) {
    console.error('自宅設定解除エラー:', err);
  }
}

/**
 * 自宅へカメラ移動
 */
function handleFlyToHome() {
  if (homeLocationState && typeof homeLocationState.lat === 'number' && typeof homeLocationState.lng === 'number') {
    flyToLocation(homeLocationState.lat, homeLocationState.lng, 15);
  }
}

/**
 * サイドバーの初期化
 * @param {Object} options
 * @param {string} [options.containerId='sidebar-content']
 * @param {Function} [options.onFilterChange] (filteredMemories, filterState) => void
 * @param {Function} [options.onAlbumSelect] (albumName, albumMemories) => void
 */
export async function initSidebar(options = {}) {
  const containerId = options.containerId || 'sidebar-content';
  sidebarContainer = document.getElementById(containerId);
  callbacks.onFilterChange = options.onFilterChange || null;
  callbacks.onAlbumSelect = options.onAlbumSelect || null;

  // 自宅設定のロードと初期ピン描画
  try {
    homeLocationState = await getHomeLocation();
    if (homeLocationState) {
      setHomeMarker(homeLocationState, { onClear: handleClearHome });
    }
  } catch (err) {
    console.warn('自宅初期ロードに失敗しました:', err);
  }

  // ポップアップからの解除通知をリッスン
  window.addEventListener('memorymap:home-cleared', handleClearHome);
}

/**
 * 最新の思い出データでサイドバーを更新・再集計
 * @param {Array} memories 
 */
export function updateSidebar(memories = []) {
  memoriesData = Array.isArray(memories) ? memories : [];
  renderSidebarUI();
}

/**
 * 現在のフィルター状態を取得
 */
export function getFilterState() {
  return { ...filterState };
}
