/**
 * Memory Map - アルバム一覧モーダルコンポーネント
 * カバー写真、期間、スポット数を表示するリッチなカードグリッド一覧を提供し、
 * ツアー再生、フォトブック出力、アルバム名・代表サムネイル写真の編集に対応します。
 */

let modalElement = null;
let editDialogElement = null;
let cachedMemories = [];

// コールバック保持
let onSelectAlbumCallback = null;
let onPlayTourCallback = null;
let onOpenPhotobookCallback = null;
let onUpdateAlbumCallback = null;

let currentSearchQuery = '';
let currentSortBy = 'newest';

// 編集中の状態
let editingAlbum = null;
let selectedCoverUrl = null;

/**
 * アルバムカバー写真の localStorage キーを取得
 * @param {string} albumName 
 * @returns {string}
 */
export function getAlbumCoverStorageKey(albumName) {
  return `memory_album_cover_${encodeURIComponent((albumName || '').trim())}`;
}

/**
 * localStorage から該当アルバムのカバー写真URLを取得
 * @param {string} albumName 
 * @returns {string|null}
 */
export function getStoredAlbumCover(albumName) {
  if (!albumName) return null;
  try {
    return localStorage.getItem(getAlbumCoverStorageKey(albumName));
  } catch (e) {
    return null;
  }
}

/**
 * localStorage に該当アルバムのカバー写真URLを保存または削除
 * @param {string} albumName 
 * @param {string|null} photoUrl 
 */
export function setStoredAlbumCover(albumName, photoUrl) {
  if (!albumName) return;
  try {
    const key = getAlbumCoverStorageKey(albumName);
    if (photoUrl) {
      localStorage.setItem(key, photoUrl);
    } else {
      localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn('[AlbumModal] localStorage 保存失敗:', e);
  }
}

/**
 * モーダルDOMを初期化・生成
 */
function ensureModalDOM() {
  if (!document.getElementById('album-list-modal')) {
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

    modalElement?.addEventListener('click', (e) => {
      if (e.target === modalElement) {
        closeAlbumListModal();
      }
    });

    searchInput?.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.trim();
      if (btnClearSearch) {
        btnClearSearch.classList.toggle('hidden', !currentSearchQuery);
      }
      renderGrid();
    });

    btnClearSearch?.addEventListener('click', () => {
      currentSearchQuery = '';
      if (searchInput) searchInput.value = '';
      btnClearSearch.classList.add('hidden');
      renderGrid();
    });

    sortSelect?.addEventListener('change', (e) => {
      currentSortBy = e.target.value;
      renderGrid();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (editDialogElement && !editDialogElement.classList.contains('hidden')) {
          closeAlbumEditDialog();
        } else if (modalElement && !modalElement.classList.contains('hidden')) {
          closeAlbumListModal();
        }
      }
    });
  }

  ensureEditDialogDOM();
}

/**
 * アルバム編集用サブモーダルDOMを生成
 */
function ensureEditDialogDOM() {
  if (document.getElementById('album-edit-dialog-overlay')) return;

  const html = `
    <div id="album-edit-dialog-overlay" class="modal-overlay hidden" style="z-index: 2600;" role="dialog" aria-modal="true" aria-label="アルバムを編集">
      <div class="modal-card" style="max-width: 480px; width: 92%; max-height: 88vh; background: rgba(255, 255, 255, 0.98); border-radius: 20px; box-shadow: 0 20px 48px rgba(0,0,0,0.25);">
        <header class="modal-header" style="padding: 1.1rem 1.3rem; border-bottom: 1px solid rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="album-modal-icon-badge" style="width: 32px; height: 32px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
            </div>
            <h3 class="modal-title" style="font-size: 1.05rem; margin: 0; font-weight: 700; color: #0f172a;">アルバムを編集</h3>
          </div>
          <button id="btn-close-album-edit" class="btn-icon-close" type="button" aria-label="閉じる">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <div class="modal-body" style="padding: 1.25rem; overflow-y: auto;">
          <div class="form-group" style="margin-bottom: 1.25rem;">
            <label for="album-edit-name-input" class="form-label" style="font-size: 0.85rem; font-weight: 700; color: #334155; margin-bottom: 6px; display: block;">アルバム名</label>
            <input type="text" id="album-edit-name-input" class="form-input" style="width: 100%; box-sizing: border-box; font-size: 0.92rem;" placeholder="アルバム名を入力" />
          </div>

          <div class="form-group" style="margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label class="form-label" style="font-size: 0.85rem; font-weight: 700; color: #334155; margin: 0;">代表サムネイル写真</label>
              <span id="album-edit-photo-count" style="font-size: 0.75rem; color: #64748b;">(0枚)</span>
            </div>
            <p style="font-size: 0.76rem; color: #94a3b8; margin: 0 0 10px 0;">一覧で表示するカバー写真をクリックして選択してください</p>
            <div id="album-edit-photos-grid" class="album-edit-photos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; max-height: 220px; overflow-y: auto; padding: 6px; background: #f8fafc; border-radius: 12px; border: 1px solid rgba(0,0,0,0.08);">
              <!-- 写真一覧 -->
            </div>
          </div>
        </div>

        <footer class="modal-footer" style="display: flex; gap: 10px; padding: 1rem 1.25rem; border-top: 1px solid rgba(0,0,0,0.06); background: #ffffff;">
          <button type="button" id="btn-cancel-album-edit" class="btn-secondary" style="flex: 1; padding: 10px; border-radius: 10px; font-weight: 600; cursor: pointer;">キャンセル</button>
          <button type="button" id="btn-save-album-edit" class="btn-primary" style="flex: 1; padding: 10px; border-radius: 10px; font-weight: 700; cursor: pointer; background: #2563eb; color: #ffffff;">変更を保存</button>
        </footer>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  editDialogElement = document.getElementById('album-edit-dialog-overlay');

  document.getElementById('btn-close-album-edit')?.addEventListener('click', closeAlbumEditDialog);
  document.getElementById('btn-cancel-album-edit')?.addEventListener('click', closeAlbumEditDialog);

  editDialogElement?.addEventListener('click', (e) => {
    if (e.target === editDialogElement) {
      closeAlbumEditDialog();
    }
  });

  document.getElementById('btn-save-album-edit')?.addEventListener('click', handleSaveAlbumEdit);
}

/**
 * アルバム編集ダイアログを開く
 * @param {Object} album 
 */
function openAlbumEditDialog(album) {
  ensureEditDialogDOM();
  editingAlbum = album;

  // localStorage または album.coverPhoto から初期選択URLを取得
  const storedCover = getStoredAlbumCover(album.name);
  selectedCoverUrl = storedCover || album.coverPhoto || null;

  const nameInput = document.getElementById('album-edit-name-input');
  const countEl = document.getElementById('album-edit-photo-count');
  const gridEl = document.getElementById('album-edit-photos-grid');

  if (nameInput) {
    nameInput.value = album.name;
  }

  // アルバム内の全写真 URL を抽出
  const allPhotos = [];
  album.memories.forEach(m => {
    if (Array.isArray(m.imageUrls)) {
      m.imageUrls.forEach(url => {
        if (url && !allPhotos.includes(url)) {
          allPhotos.push(url);
        }
      });
    }
  });

  // 初期選択写真が未決定またはリストにない場合、先頭写真があればフォールバック
  if (!selectedCoverUrl && allPhotos.length > 0) {
    selectedCoverUrl = allPhotos[0];
  }

  if (countEl) {
    countEl.textContent = `(${allPhotos.length}枚)`;
  }

  if (gridEl) {
    if (allPhotos.length === 0) {
      gridEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 1.5rem; color: #94a3b8; font-size: 0.8rem;">
          このアルバムの写真はありません
        </div>
      `;
      gridEl.onclick = null;
    } else {
      gridEl.innerHTML = allPhotos.map(url => {
        const isSelected = selectedCoverUrl === url;
        return `
          <div class="album-edit-thumb-item ${isSelected ? 'selected' : ''}" data-url="${url}" style="position: relative; width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2.5px solid ${isSelected ? '#2563eb' : 'transparent'}; box-sizing: border-box; transition: all 0.15s ease;">
            <img src="${url}" alt="サムネイル候補" style="width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none;" />
            <div class="album-edit-thumb-check" style="position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%; background: #2563eb; color: white; display: ${isSelected ? 'flex' : 'none'}; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3); pointer-events: none;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          </div>
        `;
      }).join('');

      // 写真選択イベントの安定化: closest('.album-edit-thumb-item') 経由で dataset.url を取得
      gridEl.onclick = (e) => {
        const item = e.target.closest('.album-edit-thumb-item');
        if (!item) return;

        const url = item.dataset.url || item.getAttribute('data-url');
        if (!url) return;

        selectedCoverUrl = url;
        console.log('[AlbumModal] サムネイル写真が選択されました:', url);

        // クリック時に選択中を示す青枠（.selected）とチェックマークを即座に切り替え
        gridEl.querySelectorAll('.album-edit-thumb-item').forEach(other => {
          const otherUrl = other.dataset.url || other.getAttribute('data-url');
          const isTarget = otherUrl === url;
          if (isTarget) {
            other.classList.add('selected');
            other.style.borderColor = '#2563eb';
          } else {
            other.classList.remove('selected');
            other.style.borderColor = 'transparent';
          }
          const check = other.querySelector('.album-edit-thumb-check');
          if (check) check.style.display = isTarget ? 'flex' : 'none';
        });
      };
    }
  }

  if (editDialogElement) {
    editDialogElement.classList.remove('hidden');
  }
}

/**
 * アルバム編集ダイアログを閉じる
 */
function closeAlbumEditDialog() {
  if (editDialogElement) {
    editDialogElement.classList.add('hidden');
  }
  editingAlbum = null;
  selectedCoverUrl = null;
}

/**
 * 編集の保存実行
 */
async function handleSaveAlbumEdit() {
  if (!editingAlbum) return;

  const nameInput = document.getElementById('album-edit-name-input');
  const btnSave = document.getElementById('btn-save-album-edit');
  const newName = (nameInput?.value || '').trim();

  if (!newName) {
    alert('アルバム名を入力してください。');
    return;
  }

  const oldName = (editingAlbum.name || '').trim();
  const coverUrl = selectedCoverUrl;

  try {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = '保存中...';
    }

    // 1. 旧アルバム名から新アルバム名へ変更された場合は、古いキーのストレージをクリーンアップ
    if (oldName && newName && oldName !== newName) {
      try {
        localStorage.removeItem(getAlbumCoverStorageKey(oldName));
      } catch (e) {}
    }

    // 2. 選択された selectedCoverPhotoUrl を localStorage へ即座に保存
    if (coverUrl) {
      setStoredAlbumCover(newName, coverUrl);
      console.log(`[AlbumModal] localStorageにアルバム「${newName}」のカバー写真を保存しました:`, coverUrl);
    }

    // 3. onUpdateAlbum(oldAlbumName, newAlbumName, selectedCoverPhotoUrl) を呼び出し、メイン処理へ引き渡す
    let updatedAllMemories = null;
    if (typeof onUpdateAlbumCallback === 'function') {
      updatedAllMemories = await onUpdateAlbumCallback(oldName, newName, coverUrl);
    }

    if (Array.isArray(updatedAllMemories) && updatedAllMemories.length > 0) {
      cachedMemories = updatedAllMemories;
    } else {
      // キャッシュ内の思い出も同期
      cachedMemories.forEach(m => {
        if ((m.album || '').trim() === oldName) {
          m.album = newName;
          if (coverUrl) {
            m.albumCoverPhoto = coverUrl;
            m.coverPhoto = coverUrl;
          }
          if (coverUrl && Array.isArray(m.imageUrls) && m.imageUrls.includes(coverUrl)) {
            // カバー写真を先頭に移動
            m.imageUrls = [coverUrl, ...m.imageUrls.filter(u => u !== coverUrl)];
            m.isCoverPhoto = true;
          } else {
            m.isCoverPhoto = false;
          }
        }
      });
    }

    closeAlbumEditDialog();
    renderGrid();
  } catch (err) {
    console.error('[AlbumModal] アルバム更新エラー:', err);
    alert('アルバムの更新に失敗しました: ' + err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = '変更を保存';
    }
  }
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
        explicitCoverPhoto: null,
        minTimestamp: Infinity,
        maxTimestamp: -Infinity
      };
    }

    const item = map[name];
    item.count += 1;
    item.memories.push(mem);

    // 2. 思い出データの albumCoverPhoto または coverPhoto / isCoverPhoto の検出
    if (!item.explicitCoverPhoto) {
      if (mem.albumCoverPhoto) {
        item.explicitCoverPhoto = mem.albumCoverPhoto;
      } else if (mem.coverPhoto) {
        item.explicitCoverPhoto = mem.coverPhoto;
      } else if (mem.isCoverPhoto && Array.isArray(mem.imageUrls) && mem.imageUrls.length > 0) {
        item.explicitCoverPhoto = mem.imageUrls[0];
      }
    }

    // 3. 該当アルバム内の先頭の思い出の写真（フォールバック用）
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
    // 代表カバー写真の優先順位:
    // 1. localStorage に保存されている該当アルバムのカバー写真URL
    // 2. 思い出データの albumCoverPhoto または coverPhoto プロパティ
    // 3. 該当アルバム内の先頭の思い出の写真
    const storedCover = getStoredAlbumCover(album.name);
    const finalCoverPhoto = storedCover || album.explicitCoverPhoto || album.coverPhoto;

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
      coverPhoto: finalCoverPhoto,
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

          <!-- アクションボタングループ -->
          <div class="album-card-actions-group" style="display: flex; gap: 5px; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.06);">
            <button type="button" class="btn-card-action btn-card-tour" title="ツアー再生" style="flex: 1; padding: 6px 4px; background: #2563eb; color: #ffffff; border: none; border-radius: 8px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: opacity 0.2s;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <span>ツアー</span>
            </button>
            <button type="button" class="btn-card-action btn-card-photobook" title="フォトブック" style="flex: 1; padding: 6px 4px; background: #f1f5f9; color: #1e293b; border: 1px solid rgba(0,0,0,0.06); border-radius: 8px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: background 0.2s;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              <span>旅本</span>
            </button>
            <button type="button" class="btn-card-action btn-card-edit" title="編集" style="padding: 6px 8px; background: #f8fafc; color: #475569; border: 1px solid rgba(0,0,0,0.06); border-radius: 8px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; transition: background 0.2s;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
              <span>編集</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // カードおよびアクションボタンのイベントバインド
  grid.querySelectorAll('.album-grid-card').forEach(card => {
    const albumName = card.getAttribute('data-album-name');
    if (!albumName) return;

    const targetAlbum = albums.find(a => a.name === albumName);
    if (!targetAlbum) return;

    // カード全体クリック（地図へ遷移してルート表示）
    const handleCardSelect = () => {
      closeAlbumListModal();
      if (typeof onSelectAlbumCallback === 'function') {
        onSelectAlbumCallback(albumName, targetAlbum.memories);
      }
    };

    card.addEventListener('click', handleCardSelect);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.classList.contains('btn-card-action')) return;
        e.preventDefault();
        handleCardSelect();
      }
    });

    // 1. ツアー再生ボタン
    const btnTour = card.querySelector('.btn-card-tour');
    btnTour?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAlbumListModal();
      if (typeof onPlayTourCallback === 'function') {
        onPlayTourCallback(targetAlbum.memories);
      }
    });

    // 2. フォトブックボタン
    const btnPhotobook = card.querySelector('.btn-card-photobook');
    btnPhotobook?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAlbumListModal();
      if (typeof onOpenPhotobookCallback === 'function') {
        onOpenPhotobookCallback(albumName, targetAlbum.memories);
      }
    });

    // 3. 編集ボタン
    const btnEdit = card.querySelector('.btn-card-edit');
    btnEdit?.addEventListener('click', (e) => {
      e.stopPropagation();
      openAlbumEditDialog(targetAlbum);
    });
  });
}

/**
 * アルバム一覧モーダルを開く
 * @param {Array<Object>} memories 全思い出データ配列
 * @param {Function|Object} optionsOrSelect onSelectAlbum コールバック または オプションオブジェクト
 */
export function openAlbumListModal(memories = [], optionsOrSelect = null) {
  ensureModalDOM();
  cachedMemories = Array.isArray(memories) ? memories : [];

  if (typeof optionsOrSelect === 'function') {
    onSelectAlbumCallback = optionsOrSelect;
    onPlayTourCallback = null;
    onOpenPhotobookCallback = null;
    onUpdateAlbumCallback = null;
  } else if (optionsOrSelect && typeof optionsOrSelect === 'object') {
    onSelectAlbumCallback = optionsOrSelect.onSelectAlbum || null;
    onPlayTourCallback = optionsOrSelect.onPlayTour || null;
    onOpenPhotobookCallback = optionsOrSelect.onOpenPhotobook || null;
    onUpdateAlbumCallback = optionsOrSelect.onUpdateAlbum || null;
  }

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

/**
 * 最新の思い出データでアルバム一覧モーダルを再描画
 * @param {Array<Object>} freshMemories 
 */
export function updateAlbumModalMemories(freshMemories) {
  if (Array.isArray(freshMemories)) {
    cachedMemories = freshMemories;
  }
  if (modalElement && !modalElement.classList.contains('hidden')) {
    renderGrid();
  }
}

