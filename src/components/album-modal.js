/**
 * Memory Map - アルバム一覧モーダルコンポーネント
 * カバー写真、期間、スポット数を表示するリッチなカードグリッド一覧を提供し、
 * アルバム選択時に地図フォーカスおよび道路ルート描画と連携します。
 */

let modalElement = null;
let cachedMemories = [];
let onSelectAlbumCallback = null;
let currentSearchQuery = '';
let currentSortBy = 'newest';

/**
 * モーダルDOMを初期化・生成
 */
function ensureModalDOM() {
  if (document.getElementById('album-list-modal')) return;

  const html = `
    <div id="album-list-modal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-label="アルバム一覧">
      <div class="modal-card album-modal-card">
        <!-- ヘッダー -->
        <header class="modal-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="album-modal-icon-badge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h2 class="modal-title" style="margin: 0; font-size: 1.2rem; font-weight: 700; color: #0f172a;">アルバム一覧</h2>
                <span id="album-modal-total-badge" class="album-modal-total-badge">0</span>
              </div>
              <p style="margin: 2px 0 0 0; font-size: 0.78rem; color: #64748b;">これまでの旅のアルバムから場所やルートを振り返る</p>
            </div>
          </div>
          <button id="btn-close-album-modal" class="btn-icon-close" type="button" aria-label="閉じる" title="閉じる (Esc)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <!-- 検索 & 並び替えツールバー -->
        <div class="album-modal-toolbar">
          <div class="album-modal-search-box">
            <svg class="album-modal-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="album-modal-search-input" class="album-modal-search-input" placeholder="アルバム名を検索..." />
            <button id="btn-clear-album-search" class="album-modal-clear-search hidden" type="button" aria-label="検索クリア">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="album-modal-sort-box">
            <select id="album-modal-sort-select" class="album-modal-sort-select" aria-label="並び替え順">
              <option value="newest">時期が新しい順</option>
              <option value="oldest">時期が古い順</option>
              <option value="count">スポットが多い順</option>
              <option value="name">名前順</option>
            </select>
          </div>
        </div>

        <!-- アルバムグリッド本体 -->
        <div class="modal-body album-modal-body">
          <div id="album-modal-grid" class="album-modal-grid"></div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  modalElement = document.getElementById('album-list-modal');

  // イベントバインド
  const btnClose = document.getElementById('btn-close-album-modal');
  const searchInput = document.getElementById('album-modal-search-input');
  const btnClearSearch = document.getElementById('btn-clear-album-search');
  const sortSelect = document.getElementById('album-modal-sort-select');

  btnClose?.addEventListener('click', closeAlbumListModal);

  // 背景クリックで閉じる
  modalElement?.addEventListener('click', (e) => {
    if (e.target === modalElement) {
      closeAlbumListModal();
    }
  });

  // 検索入力
  searchInput?.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim();
    if (btnClearSearch) {
      btnClearSearch.classList.toggle('hidden', !currentSearchQuery);
    }
    renderGrid();
  });

  // 検索クリア
  btnClearSearch?.addEventListener('click', () => {
    currentSearchQuery = '';
    if (searchInput) searchInput.value = '';
    btnClearSearch.classList.add('hidden');
    renderGrid();
  });

  // 並び替え変更
  sortSelect?.addEventListener('change', (e) => {
    currentSortBy = e.target.value;
    renderGrid();
  });

  // Escキー
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalElement && !modalElement.classList.contains('hidden')) {
      closeAlbumListModal();
    }
  });
}

/**
 * 全思い出データからユニークなアルバム情報を集計
 * @param {Array} memories 
 * @returns {Array<Object>}
 */
function extractAlbumList(memories = []) {
  const map = {};

  memories.forEach(mem => {
    const name = (mem.album || '').trim();
    if (!name) return;

    if (!map[name]) {
      map[name] = {
        name,
        count: 0,
        memories: [],
        coverPhoto: null,
        minTimestamp: Infinity,
        maxTimestamp: -Infinity
      };
    }

    const item = map[name];
    item.count += 1;
    item.memories.push(mem);

    // カバー写真の抽出（写真配列の先頭）
    if (!item.coverPhoto && Array.isArray(mem.imageUrls) && mem.imageUrls.length > 0) {
      item.coverPhoto = mem.imageUrls[0];
    }

    // 期間計算用のタイムスタンプ
    const rawTime = mem.datetime || mem.timestamp;
    if (rawTime) {
      const t = new Date(rawTime).getTime();
      if (!isNaN(t)) {
        if (t < item.minTimestamp) item.minTimestamp = t;
        if (t > item.maxTimestamp) item.maxTimestamp = t;
      }
    }
  });

  return Object.values(map).map(album => {
    let dateRangeStr = '';
    if (album.minTimestamp !== Infinity && album.maxTimestamp !== -Infinity) {
      const dMin = new Date(album.minTimestamp);
      const dMax = new Date(album.maxTimestamp);
      const fmt = d => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
      const strMin = fmt(dMin);
      const strMax = fmt(dMax);
      dateRangeStr = strMin === strMax ? strMin : `${strMin} 〜 ${strMax}`;
    }

    return {
      ...album,
      dateRangeStr
    };
  });
}

/**
 * グリッド一覧を再描画
 */
function renderGrid() {
  const grid = document.getElementById('album-modal-grid');
  const badgeTotal = document.getElementById('album-modal-total-badge');
  if (!grid) return;

  const rawAlbums = extractAlbumList(cachedMemories);

  if (badgeTotal) {
    badgeTotal.textContent = String(rawAlbums.length);
  }

  // 1. 検索フィルター
  let albums = rawAlbums;
  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    albums = albums.filter(a => a.name.toLowerCase().includes(q));
  }

  // 2. ソート
  albums.sort((a, b) => {
    if (currentSortBy === 'newest') {
      return (b.maxTimestamp || 0) - (a.maxTimestamp || 0);
    } else if (currentSortBy === 'oldest') {
      return (a.minTimestamp || 0) - (b.minTimestamp || 0);
    } else if (currentSortBy === 'count') {
      return b.count - a.count;
    } else if (currentSortBy === 'name') {
      return a.name.localeCompare(b.name, 'ja');
    }
    return 0;
  });

  // 3. レンダリング
  if (albums.length === 0) {
    grid.innerHTML = `
      <div class="album-modal-empty">
        <div class="album-modal-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <p class="album-modal-empty-title">${currentSearchQuery ? '検索に一致するアルバムがありません' : 'まだアルバムが作成されていません'}</p>
        <p class="album-modal-empty-desc">${currentSearchQuery ? '検索キーワードを変更してみてください。' : '思い出を記録する際にアルバム名を設定するとここに表示されます。'}</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = albums.map(album => {
    const safeName = album.name
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const thumbHtml = album.coverPhoto
      ? `<img src="${album.coverPhoto}" alt="${safeName}" class="album-card-cover-img" loading="lazy" />`
      : `
        <div class="album-card-thumb-placeholder">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </div>
      `;

    return `
      <div class="album-grid-card" data-album-name="${safeName}" tabindex="0" role="button" aria-label="アルバム「${safeName}」を選択">
        <div class="album-card-thumb-wrapper">
          ${thumbHtml}
          <div class="album-card-badge-count">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span>${album.count} 件</span>
          </div>
        </div>
        <div class="album-card-info">
          <div>
            <h3 class="album-card-name" title="${safeName}">${safeName}</h3>
            ${album.dateRangeStr ? `
              <div class="album-card-date-row">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span>${album.dateRangeStr}</span>
              </div>
            ` : `
              <div class="album-card-date-row placeholder">
                <span>日程未登録</span>
              </div>
            `}
          </div>
          <div class="album-card-footer">
            <span class="album-card-select-label">地図でルートを見る</span>
            <svg class="album-card-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // カードクリックイベントバインド
  grid.querySelectorAll('.album-grid-card').forEach(card => {
    const clickHandler = () => {
      const albumName = card.getAttribute('data-album-name');
      if (!albumName) return;

      const targetAlbum = albums.find(a => a.name === albumName);
      closeAlbumListModal();

      if (typeof onSelectAlbumCallback === 'function') {
        onSelectAlbumCallback(albumName, targetAlbum ? targetAlbum.memories : []);
      }
    };

    card.addEventListener('click', clickHandler);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        clickHandler();
      }
    });
  });
}

/**
 * アルバム一覧モーダルを開く
 * @param {Array<Object>} memories 全思い出データ配列
 * @param {Function} onSelectAlbum (albumName, albumMemories) => void
 */
export function openAlbumListModal(memories = [], onSelectAlbum = null) {
  ensureModalDOM();
  cachedMemories = Array.isArray(memories) ? memories : [];
  onSelectAlbumCallback = onSelectAlbum;

  currentSearchQuery = '';
  const searchInput = document.getElementById('album-modal-search-input');
  if (searchInput) searchInput.value = '';
  const btnClearSearch = document.getElementById('btn-clear-album-search');
  if (btnClearSearch) btnClearSearch.classList.add('hidden');

  renderGrid();

  if (modalElement) {
    modalElement.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * アルバム一覧モーダルを閉じる
 */
export function closeAlbumListModal() {
  if (modalElement) {
    modalElement.classList.add('hidden');
    document.body.style.overflow = '';
  }
}
