/**
 * Memory Map - サイドバーコンポーネント
 * アルバム一覧、年別フィルターチップ、タグ一覧、検索バーを管理し、
 * 条件変更時に地図上のピンを動的に絞り込みます。
 */

let sidebarContainer = null;
let memoriesData = [];
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
}

/**
 * サイドバーの初期化
 * @param {Object} options
 * @param {string} [options.containerId='sidebar-content']
 * @param {Function} [options.onFilterChange] (filteredMemories, filterState) => void
 * @param {Function} [options.onAlbumSelect] (albumName, albumMemories) => void
 */
export function initSidebar(options = {}) {
  const containerId = options.containerId || 'sidebar-content';
  sidebarContainer = document.getElementById(containerId);
  callbacks.onFilterChange = options.onFilterChange || null;
  callbacks.onAlbumSelect = options.onAlbumSelect || null;
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
