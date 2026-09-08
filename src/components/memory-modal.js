/**
 * Memory Map - 思い出記録 & 編集モーダルコンポーネント
 * UI・UXデザイナー設計書に基づき、写真のドラッグ＆ドロップ、EXIF位置・日時の自動反映、
 * タグチップ管理、IndexedDB への保存・更新・削除を制御します。
 */

import exifr from 'exifr';
import { processPhotoFile } from '../services/photo-processor';
import { saveMemory, updateMemory, deleteMemory } from '../services/storage';

let modalCallbacks = {
  onSave: null,
  onDelete: null,
  getFallbackLocation: null,
  onPhotoLocationDetected: null
};

// フォーム状態
let currentMemoryId = null;
let currentLat = null;
let currentLng = null;
let currentPhotoUrls = [];
let currentTags = [];

// DOM 要素キャッシュ
let modalOverlay = null;
let modalTitle = null;
let latInput = null;
let lngInput = null;
let titleInput = null;
let datetimeInput = null;
let albumInput = null;
let diaryInput = null;
let tagBareInput = null;
let tagsChipsWrapper = null;
let photoDropzone = null;
let photoFileInput = null;
let dropzonePlaceholder = null;
let photoPreviewGrid = null;
let photoAddMoreWrapper = null;
let btnAddMorePhotos = null;
let exifBadge = null;
let exifBadgeText = null;
let deleteActionRow = null;
let btnDeleteMemory = null;
let btnModalCancel = null;
let btnModalSave = null;
let btnModalClose = null;

/**
 * ISO日時文字列を <input type="datetime-local"> 向けに変換
 */
function toDatetimeLocalString(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * モーダルおよび記録ボタンの DOM を生成してマウント
 */
function createModalDOM() {
  if (document.getElementById('memory-modal')) return;

  const container = document.getElementById('modal-container') || document.body;

  // モーダル本体の HTML
  const modalHtml = `
    <div id="memory-modal" class="modal-overlay hidden">
      <div class="modal-card">
        <header class="modal-header">
          <h2 id="modal-title" class="modal-title">思い出を記録</h2>
          <button id="btn-modal-close" class="btn-icon-close" type="button" aria-label="閉じる">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <div class="modal-body">
          <input type="hidden" id="memory-id" value="" />
          <input type="hidden" id="memory-lat" value="" />
          <input type="hidden" id="memory-lng" value="" />

          <div id="photo-dropzone" class="photo-dropzone">
            <input type="file" id="photo-file-input" accept="image/*,.heic,.heif" multiple class="hidden-input" />
            
            <div id="dropzone-placeholder" class="dropzone-placeholder">
              <div class="dropzone-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </div>
              <p class="dropzone-main-text">タップして写真を選択 <span>またはドラッグ＆ドロップ</span></p>
              <p class="dropzone-sub-text">位置情報（GPS）と撮影日時を自動で反映します</p>
            </div>

            <div id="photo-preview-grid" class="photo-preview-grid hidden"></div>
          </div>

          <div id="photo-add-more-wrapper" class="photo-add-more-row hidden">
            <button type="button" id="btn-add-more-photos" class="btn-text-action" style="display: inline-flex; align-items: center; gap: 4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>写真を追加する</span>
            </button>
          </div>

          <div id="exif-success-badge" class="exif-badge hidden">
            <svg id="exif-badge-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span id="exif-badge-text">写真の撮影位置を自動取得しました</span>
          </div>

          <div class="form-group">
            <label for="input-memory-title" class="form-label">タイトル</label>
            <input type="text" id="input-memory-title" class="form-input" placeholder="例: 富士山と河口湖の旅" />
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label for="input-memory-datetime" class="form-label">日時</label>
              <input type="datetime-local" id="input-memory-datetime" class="form-input" />
            </div>
            <div class="form-group flex-1">
              <label for="input-memory-album" class="form-label">アルバム</label>
              <input type="text" id="input-memory-album" class="form-input" placeholder="例: 2024 夏旅行" list="album-datalist" />
              <datalist id="album-datalist"></datalist>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">タグ</label>
            <div id="tags-input-container" class="tags-input-box">
              <div id="tags-chips-wrapper" class="tags-chips-wrapper"></div>
              <input type="text" id="input-memory-tag" class="tag-bare-input" placeholder="タグを入力 (Enterで確定)" />
            </div>
          </div>

          <div class="form-group">
            <label for="input-memory-diary" class="form-label">日記・メモ</label>
            <textarea id="input-memory-diary" rows="3" class="form-textarea" placeholder="どんな思い出でしたか？自由に残しましょう"></textarea>
          </div>

          <div id="delete-action-row" class="delete-action-row hidden" style="margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end;">
            <button type="button" id="btn-delete-memory" class="btn-danger-link" style="display: inline-flex; align-items: center; gap: 4px; font-weight: 600;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>この思い出を削除する</span>
            </button>
          </div>
        </div>

        <footer class="modal-footer">
          <button type="button" id="btn-modal-cancel" class="btn-secondary">キャンセル</button>
          <button type="button" id="btn-modal-save" class="btn-primary">思い出を保存</button>
        </footer>
      </div>
    </div>
  `;

  // FAB（記録ボタン）の HTML
  const fabHtml = `
    <div class="center-bottom-container">
      <button id="btn-record-memory" class="fab-record-btn" title="新しい思い出を記録">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <span>ここで記録</span>
      </button>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', modalHtml);
  document.body.insertAdjacentHTML('beforeend', fabHtml);

  cacheDOMElements();
  bindEvents();
}

/**
 * DOM 要素の取得とキャッシュ
 */
function cacheDOMElements() {
  modalOverlay = document.getElementById('memory-modal');
  modalTitle = document.getElementById('modal-title');
  latInput = document.getElementById('memory-lat');
  lngInput = document.getElementById('memory-lng');
  titleInput = document.getElementById('input-memory-title');
  datetimeInput = document.getElementById('input-memory-datetime');
  albumInput = document.getElementById('input-memory-album');
  diaryInput = document.getElementById('input-memory-diary');
  tagBareInput = document.getElementById('input-memory-tag');
  tagsChipsWrapper = document.getElementById('tags-chips-wrapper');
  photoDropzone = document.getElementById('photo-dropzone');
  photoFileInput = document.getElementById('photo-file-input');
  dropzonePlaceholder = document.getElementById('dropzone-placeholder');
  photoPreviewGrid = document.getElementById('photo-preview-grid');
  photoAddMoreWrapper = document.getElementById('photo-add-more-wrapper');
  btnAddMorePhotos = document.getElementById('btn-add-more-photos');
  exifBadge = document.getElementById('exif-success-badge');
  exifBadgeText = document.getElementById('exif-badge-text');
  deleteActionRow = document.getElementById('delete-action-row');
  btnDeleteMemory = document.getElementById('btn-delete-memory');
  btnModalCancel = document.getElementById('btn-modal-cancel');
  btnModalSave = document.getElementById('btn-modal-save');
  btnModalClose = document.getElementById('btn-modal-close');
}

/**
 * 写真プレビューの再描画
 */
function renderPhotoPreviews() {
  photoPreviewGrid.innerHTML = '';
  if (currentPhotoUrls.length === 0) {
    photoPreviewGrid.classList.add('hidden');
    dropzonePlaceholder.classList.remove('hidden');
    photoAddMoreWrapper.classList.add('hidden');
  } else {
    photoPreviewGrid.classList.remove('hidden');
    dropzonePlaceholder.classList.add('hidden');
    photoAddMoreWrapper.classList.remove('hidden');

    currentPhotoUrls.forEach((url, idx) => {
      const card = document.createElement('div');
      card.className = 'preview-thumb-card';
      card.innerHTML = `
        <img src="${url}" alt="選択写真 ${idx + 1}" />
        <button type="button" class="btn-thumb-remove" title="写真を削除" style="display: flex; align-items: center; justify-content: center;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;
      card.querySelector('.btn-thumb-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        currentPhotoUrls.splice(idx, 1);
        renderPhotoPreviews();
      });
      photoPreviewGrid.appendChild(card);
    });
  }
}

/**
 * タグチップの再描画
 */
function renderTagChips() {
  tagsChipsWrapper.innerHTML = '';
  currentTags.forEach((tag, idx) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `
      <span>#${tag}</span>
      <span class="tag-chip-remove" title="削除" style="display: inline-flex; align-items: center; justify-content: center;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </span>
    `;
    chip.querySelector('.tag-chip-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      currentTags.splice(idx, 1);
      renderTagChips();
    });
    tagsChipsWrapper.appendChild(chip);
  });
}

/**
 * アップロードされた写真ファイル群を処理
 */
async function handlePhotoFiles(files) {
  if (!files || files.length === 0) return;
  let autoFoundGps = false;
  let detectedLat = null;
  let detectedLng = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      // 1. exifr による Exif メタデータ（GPS座標 & 撮影日時）の直接解析
      let fileLat = null;
      let fileLng = null;
      let fileDatetime = null;

      try {
        const gps = await exifr.gps(file);
        if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
          fileLat = gps.latitude;
          fileLng = gps.longitude;
        }
      } catch (gpsErr) {
        console.warn('[Exif] GPS取得スキップ:', gpsErr);
      }

      try {
        const meta = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
        const rawDate = meta?.DateTimeOriginal || meta?.CreateDate;
        if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
          fileDatetime = rawDate;
        } else if (rawDate) {
          const parsed = new Date(rawDate);
          if (!isNaN(parsed.getTime())) fileDatetime = parsed;
        }
      } catch (metaErr) {
        console.warn('[Exif] 撮影日時取得スキップ:', metaErr);
      }

      // 2. 画像の圧縮/変換・プレビューURL取得
      const result = await processPhotoFile(file);
      currentPhotoUrls.push(result.imageUrl);

      // GPS 座標の決定（最初の位置情報付き写真を優先）
      const finalLat = (typeof fileLat === 'number') ? fileLat : result.lat;
      const finalLng = (typeof fileLng === 'number') ? fileLng : result.lng;

      if (finalLat != null && finalLng != null && !autoFoundGps) {
        currentLat = finalLat;
        currentLng = finalLng;
        if (latInput) latInput.value = finalLat;
        if (lngInput) lngInput.value = finalLng;
        detectedLat = finalLat;
        detectedLng = finalLng;
        autoFoundGps = true;
      }

      // 撮影日時の自動反映（日付入力欄へ YYYY-MM-DD または YYYY-MM-DDTHH:mm 形式で自動セット）
      const finalDate = fileDatetime || (result.datetime ? new Date(result.datetime) : null);
      if (finalDate && datetimeInput && (!datetimeInput.value || autoFoundGps)) {
        const pad = n => String(n).padStart(2, '0');
        const yyyy = finalDate.getFullYear();
        const mm = pad(finalDate.getMonth() + 1);
        const dd = pad(finalDate.getDate());
        const hh = pad(finalDate.getHours());
        const min = pad(finalDate.getMinutes());
        if (datetimeInput.type === 'date') {
          datetimeInput.value = `${yyyy}-${mm}-${dd}`;
        } else {
          datetimeInput.value = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
        }
      }
    } catch (err) {
      console.error('写真処理エラー:', err);
    }
  }

  // 3. フォームおよびインジケーターへの自動反映
  const iconEl = document.getElementById('exif-badge-icon');

  if (autoFoundGps && detectedLat != null && detectedLng != null) {
    // 座標が取得できた場合: 上品な薄緑系バッジとインラインSVG位置アイコンを表示
    if (exifBadge) {
      exifBadge.classList.remove('hidden');
      exifBadge.style.background = 'rgba(5, 150, 105, 0.08)';
      exifBadge.style.borderColor = 'rgba(5, 150, 105, 0.2)';
      exifBadge.style.color = '#059669';
    }
    if (iconEl) {
      iconEl.setAttribute('stroke', '#059669');
      iconEl.innerHTML = `
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      `;
    }
    if (exifBadgeText) {
      exifBadgeText.textContent = '写真の撮影位置を自動取得しました';
    }

    // 外部コールバックを呼び出し、メイン処理へ座標を通知
    if (typeof modalCallbacks.onPhotoLocationDetected === 'function') {
      modalCallbacks.onPhotoLocationDetected(detectedLat, detectedLng);
    }
  } else if (!autoFoundGps && (currentLat == null || currentLng == null || currentLat === '')) {
    // GPS情報が含まれていない写真の場合: エラーにせず手動指定案内へスムーズにフォールバック
    if (exifBadge) {
      exifBadge.classList.remove('hidden');
      exifBadge.style.background = 'rgba(100, 116, 139, 0.08)';
      exifBadge.style.borderColor = 'rgba(100, 116, 139, 0.2)';
      exifBadge.style.color = '#475569';
    }
    if (iconEl) {
      iconEl.setAttribute('stroke', '#64748b');
      iconEl.innerHTML = `
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      `;
    }
    if (exifBadgeText) {
      exifBadgeText.textContent = '位置情報は含まれていません。地図上をタップして場所を指定してください';
    }
  }

  renderPhotoPreviews();
}

/**
 * イベントリスナーの登録
 */
function bindEvents() {
  // 写真ドロップゾーン
  photoDropzone.addEventListener('click', (e) => {
    if (e.target.closest('.btn-thumb-remove')) return;
    photoFileInput.click();
  });

  if (btnAddMorePhotos) {
    btnAddMorePhotos.addEventListener('click', () => photoFileInput.click());
  }

  photoFileInput.addEventListener('change', async (e) => {
    await handlePhotoFiles(e.target.files);
    photoFileInput.value = '';
  });

  // ドラッグ＆ドロップ対応
  ['dragenter', 'dragover'].forEach(name => {
    photoDropzone.addEventListener(name, (e) => {
      e.preventDefault();
      photoDropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    photoDropzone.addEventListener(name, (e) => {
      e.preventDefault();
      photoDropzone.classList.remove('dragover');
    });
  });

  photoDropzone.addEventListener('drop', async (e) => {
    if (e.dataTransfer && e.dataTransfer.files) {
      await handlePhotoFiles(e.dataTransfer.files);
    }
  });

  // タグ入力
  tagBareInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return; // 日本語入力変換中のEnterを無視
    if (e.key === 'Enter' || e.key === ' ' || e.key === '　' || e.key === ',') {
      e.preventDefault();
      const val = tagBareInput.value.trim().replace(/^#|,/g, '');
      if (val && !currentTags.includes(val)) {
        currentTags.push(val);
        renderTagChips();
      }
      tagBareInput.value = '';
    }
  });

  // ボタンイベント
  btnModalClose.addEventListener('click', closeModal);
  btnModalCancel.addEventListener('click', closeModal);
  btnModalSave.addEventListener('click', handleSave);
  btnDeleteMemory.addEventListener('click', handleDelete);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // FAB 記録ボタン
  const fabBtn = document.getElementById('btn-record-memory');
  if (fabBtn) {
    fabBtn.addEventListener('click', () => {
      openCreateModal();
    });
  }
}

/**
 * 保存処理
 */
async function handleSave() {
  const title = titleInput.value.trim();
  if (!title && currentPhotoUrls.length === 0) {
    alert('写真を選択するか、タイトルを入力してください。');
    return;
  }

  // 入力途中のタグがあれば追加
  const leftoverTag = tagBareInput.value.trim().replace(/^#|,/g, '');
  if (leftoverTag && !currentTags.includes(leftoverTag)) {
    currentTags.push(leftoverTag);
    tagBareInput.value = '';
  }

  // 位置情報の確定（写真EXIF -> フォーム値 -> 地図フォールバック）
  let lat = currentLat != null ? currentLat : (parseFloat(latInput.value) || null);
  let lng = currentLng != null ? currentLng : (parseFloat(lngInput.value) || null);

  if (lat == null || lng == null) {
    if (typeof modalCallbacks.getFallbackLocation === 'function') {
      const fallback = modalCallbacks.getFallbackLocation();
      if (fallback && typeof fallback.lat === 'number' && typeof fallback.lng === 'number') {
        lat = fallback.lat;
        lng = fallback.lng;
      }
    }
  }

  // 最終フォールバック（日本中央付近）
  if (lat == null || lng == null) {
    lat = 36.2048;
    lng = 138.2529;
  }

  const memoryData = {
    title,
    diary: diaryInput.value.trim(),
    album: albumInput.value.trim(),
    datetime: datetimeInput.value ? new Date(datetimeInput.value).toISOString() : null,
    tags: currentTags,
    imageUrls: currentPhotoUrls,
    lat,
    lng
  };

  try {
    if (currentMemoryId) {
      memoryData.id = currentMemoryId;
      await updateMemory(memoryData);
    } else {
      const newId = await saveMemory(memoryData);
      memoryData.id = newId;
    }

    closeModal();
    if (typeof modalCallbacks.onSave === 'function') {
      modalCallbacks.onSave(memoryData);
    }
  } catch (err) {
    console.error('思い出の保存に失敗しました:', err);
    alert('保存に失敗しました: ' + err.message);
  }
}

/**
 * 削除処理
 */
async function handleDelete() {
  if (!currentMemoryId) return;
  if (!confirm('この思い出を削除してもよろしいですか？')) return;

  try {
    await deleteMemory(currentMemoryId);
    closeModal();
    if (typeof modalCallbacks.onDelete === 'function') {
      modalCallbacks.onDelete(currentMemoryId);
    }
  } catch (err) {
    console.error('削除失敗:', err);
    alert('削除に失敗しました: ' + err.message);
  }
}

/**
 * モーダルを閉じる
 */
export function closeModal() {
  if (modalOverlay) {
    modalOverlay.classList.add('hidden');
  }
  if (typeof modalCallbacks.onClose === 'function') {
    modalCallbacks.onClose();
  }
}

/**
 * 新規作成モーダルを開く
 * @param {Object} [initialLocation] { lat, lng }
 */
export function openCreateModal(initialLocation = null) {
  createModalDOM();

  currentMemoryId = null;
  currentPhotoUrls = [];
  currentTags = [];

  modalTitle.textContent = '思い出を記録';
  deleteActionRow.classList.add('hidden');
  exifBadge.classList.add('hidden');

  titleInput.value = '';
  diaryInput.value = '';
  albumInput.value = '';
  datetimeInput.value = toDatetimeLocalString(new Date());
  tagBareInput.value = '';

  if (initialLocation && typeof initialLocation.lat === 'number' && typeof initialLocation.lng === 'number') {
    currentLat = initialLocation.lat;
    currentLng = initialLocation.lng;
    latInput.value = initialLocation.lat;
    lngInput.value = initialLocation.lng;
  } else {
    currentLat = null;
    currentLng = null;
    latInput.value = '';
    lngInput.value = '';
  }

  renderPhotoPreviews();
  renderTagChips();

  modalOverlay.classList.remove('hidden');
  titleInput.focus();
}

/**
 * 編集モーダルを開く
 * @param {Object} memory 
 */
export function openEditModal(memory) {
  if (!memory) return;
  createModalDOM();

  currentMemoryId = memory.id;
  currentLat = memory.lat;
  currentLng = memory.lng;
  currentPhotoUrls = Array.isArray(memory.imageUrls) ? [...memory.imageUrls] : [];
  currentTags = Array.isArray(memory.tags) ? [...memory.tags] : [];

  modalTitle.textContent = '思い出を編集';
  deleteActionRow.classList.remove('hidden');
  exifBadge.classList.add('hidden');

  latInput.value = memory.lat || '';
  lngInput.value = memory.lng || '';
  titleInput.value = memory.title || '';
  diaryInput.value = memory.diary || '';
  albumInput.value = memory.album || '';
  datetimeInput.value = toDatetimeLocalString(memory.datetime || memory.timestamp);
  tagBareInput.value = '';

  renderPhotoPreviews();
  renderTagChips();

  modalOverlay.classList.remove('hidden');
}

/**
 * モーダル初期化
 * @param {Object} callbacks
 * @param {Function} callbacks.onSave
 * @param {Function} callbacks.onDelete
 * @param {Function} callbacks.getFallbackLocation
 */
export function initMemoryModal(callbacks = {}) {
  modalCallbacks = {
    ...modalCallbacks,
    ...callbacks
  };
  createModalDOM();
}

/**
 * 思い出モーダルを開く（新規作成または編集の統合関数）
 * @param {Object|null} target 思い出オブジェクトまたは初期位置 { lat, lng }
 */
export function openMemoryModal(target = null) {
  if (target && target.id) {
    openEditModal(target);
  } else {
    openCreateModal(target);
  }
}
