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

  // 統計バッジの更新
  updateStatsBadge(albumList.length, memoriesData.length);

  // HTML 構築
  sidebarContainer.innerHTML = `
    <!-- 検索バー -->
    <div class="sidebar-search-box">
      <svg class="sidebar-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input type="text" id="sidebar-search-input" class="sidebar-search-input" placeholder="思い出、場所、タグを検索..." value="${filterState.searchQuery}" />
      ${filterState.searchQuery ? `
        <button id="btn-clear-search" class="btn-clear-search" title="検索クリア">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      ` : ''}
    </div>

    <!-- ミニマル拠点・自宅バー (1行) -->
    <div class="sidebar-group">
      <div class="sidebar-group-header">
        <span class="sidebar-group-title">拠点</span>
      </div>
      <div class="sidebar-home-bar ${isSettingHomeFromMap ? 'picking' : homeLocationState ? 'is-set' : 'empty'}">
        ${isSettingHomeFromMap ? `
          <div class="home-bar-lead">
            <div class="home-bar-icon pulse">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 8 12 12 14 14"></polyline></svg>
            </div>
            <div class="home-bar-text">
              <span class="home-bar-label">地図をクリックして指定</span>
            </div>
          </div>
          <button id="btn-sidebar-cancel-pick" class="home-bar-btn" type="button">キャンセル</button>
        ` : homeLocationState ? `
          <div class="home-bar-lead" id="btn-sidebar-fly-home" title="自宅へジャンプ">
            <div class="home-bar-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              </svg>
            </div>
            <div class="home-bar-text">
              <span class="home-bar-label">${homeLocationState.name || '自宅'}</span>
              <span class="home-bar-sub">${homeLocationState.lat.toFixed(2)}, ${homeLocationState.lng.toFixed(2)}</span>
            </div>
          </div>
          <div class="home-bar-actions">
            <button id="btn-sidebar-change-home" class="home-bar-btn" type="button" title="自宅の位置を変更">変更</button>
            <button id="btn-sidebar-clear-home" class="home-bar-btn-clear" type="button" title="自宅設定を解除">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        ` : `
          <div class="home-bar-lead">
            <div class="home-bar-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              </svg>
            </div>
            <div class="home-bar-text">
              <span class="home-bar-label">拠点未設定</span>
            </div>
          </div>
          <div class="home-bar-actions">
            <button id="btn-sidebar-set-home-map" class="home-bar-btn primary" type="button" title="地図をクリックして指定">地図指定</button>
            <button id="btn-sidebar-set-home-current" class="home-bar-btn" type="button" title="現在地を自宅に設定">現在地</button>
          </div>
        `}
      </div>
    </div>

    <!-- 時期フィルター（セグメントコントロール） -->
    <div class="sidebar-group">
      <div class="sidebar-group-header">
        <span class="sidebar-group-title">時期</span>
        ${filterState.selectedYear ? '<button id="btn-reset-year" class="btn-filter-reset">クリア</button>' : ''}
      </div>
      <div class="segmented-control year-segmented-control">
        <button class="segmented-item ${filterState.selectedYear === '' ? 'active' : ''}" data-year="">すべて</button>
        ${sortedYears.map(yr => `
          <button class="segmented-item ${filterState.selectedYear === yr ? 'active' : ''}" data-year="${yr}">
            ${yr}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- タグクラウド（ミニマルチップ・カッコなし） -->
    <div class="sidebar-group">
      <div class="sidebar-group-header">
        <span class="sidebar-group-title">タグ</span>
        ${filterState.selectedTag ? '<button id="btn-reset-tag" class="btn-filter-reset">すべて表示</button>' : ''}
      </div>
      <div class="sidebar-tag-cloud">
        <button class="sidebar-tag-chip ${filterState.selectedTag === '' ? 'active' : ''}" data-tag="">すべて</button>
        ${sortedTags.map(item => `
          <button class="sidebar-tag-chip ${filterState.selectedTag === item.tag ? 'active' : ''}" data-tag="${item.tag}">
            #${item.tag} <span class="tag-count">${item.count}</span>
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

  // セグメントコントロール（年別）クリック
  sidebarContainer.querySelectorAll('.segmented-item').forEach(btn => {
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

  // タグチップクリック
  sidebarContainer.querySelectorAll('.sidebar-tag-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      filterState.selectedTag = btn.getAttribute('data-tag') || '';
      renderSidebarUI();
      applyFilters();

      // スマホ表示時は地図を見やすくするためサイドバーを自動クローズ
      closeSidebarIfMobile();
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
    btnClearHome.addEventListener('click', (e) => {
      e.stopPropagation();
      handleClearHome();
    });
  }

  const btnFlyHome = document.getElementById('btn-sidebar-fly-home');
  if (btnFlyHome) {
    btnFlyHome.addEventListener('click', handleFlyToHome);
  }

  const btnChangeHome = document.getElementById('btn-sidebar-change-home');
  if (btnChangeHome) {
    btnChangeHome.addEventListener('click', (e) => {
      e.stopPropagation();
      startMapPickHome();
    });
  }

  const btnSetHomeMap = document.getElementById('btn-sidebar-set-home-map');
  if (btnSetHomeMap) {
    btnSetHomeMap.addEventListener('click', startMapPickHome);
  }

  const btnSetHomeCurrent = document.getElementById('btn-sidebar-set-home-current');
  if (btnSetHomeCurrent) {
    btnSetHomeCurrent.addEventListener('click', setCurrentLocationAsHome);
  }

  const btnCancelPick = document.getElementById('btn-sidebar-cancel-pick');
  if (btnCancelPick) {
    btnCancelPick.addEventListener('click', () => {
      isSettingHomeFromMap = false;
      const mapEl = document.getElementById('map');
      if (mapEl) mapEl.style.cursor = '';
      renderSidebarUI();
    });
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

  // スマホ用閉じるボタンをヘッダーに配置
  setupSidebarHeader();

  // ポップアップからの解除通知をリッスン
  window.addEventListener('memorymap:home-cleared', handleClearHome);
}

/**
 * 旅の全体統計サマリーバッジをヘッダーに更新
 * @param {number} albumCount 
 * @param {number} totalSpots 
 */
function updateStatsBadge(albumCount, totalSpots) {
  const badge = document.getElementById('sidebar-header-stats');
  if (!badge) return;

  badge.innerHTML = `
    <span class="stats-badge-item">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
      <strong>${albumCount}</strong> アルバム
    </span>
    <span class="stats-badge-divider">·</span>
    <span class="stats-badge-item">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"></circle><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path></svg>
      <strong>${totalSpots}</strong> スポット
    </span>
  `;
}

/**
 * スマホ用サイドバー閉じるボタン（SVGクロス）と旅統計サマリーバッジをヘッダーに配置
 */
function setupSidebarHeader() {
  const header = document.querySelector('.sidebar-header');
  if (!header) return;

  if (!document.getElementById('btn-sidebar-close')) {
    const closeBtnHtml = `
      <button id="btn-sidebar-close" class="sidebar-btn-close" type="button" aria-label="サイドバーを閉じる" title="閉じる">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    const h2 = header.querySelector('h2');
    if (h2) {
      const topRow = document.createElement('div');
      topRow.className = 'sidebar-header-top-row';
      h2.parentNode.insertBefore(topRow, h2);
      topRow.appendChild(h2);
      topRow.insertAdjacentHTML('beforeend', closeBtnHtml);
    } else {
      header.insertAdjacentHTML('afterbegin', closeBtnHtml);
    }

    document.getElementById('btn-sidebar-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSidebar();
    });
  }

  // 統計バッジコンテナの配置（ロゴの直下）
  if (!document.getElementById('sidebar-header-stats')) {
    const statsContainer = document.createElement('div');
    statsContainer.id = 'sidebar-header-stats';
    statsContainer.className = 'sidebar-stats-badge';
    header.appendChild(statsContainer);
  }
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

/**
 * サイドバーを開く
 */
export function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
}

/**
 * サイドバーを閉じる
 */
export function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

/**
 * サイドバーの開閉をトグル
 */
export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

/**
 * スマホ表示（画面幅 768px 以下）の場合にサイドバーを閉じる
 */
export function closeSidebarIfMobile() {
  if (typeof window !== 'undefined' && window.innerWidth <= 768) {
    closeSidebar();
  }
}

/**
 * 外部からアルバムフィルターを更新
 * @param {string} albumName
 */
export function setAlbumFilter(albumName = '') {
  filterState.selectedAlbum = albumName;
  renderSidebarUI();
  applyFilters();
}
