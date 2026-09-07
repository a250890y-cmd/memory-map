/**
 * Memory Map - 全画面写真拡大ライトボックスコンポーネント
 * 画面全体への写真サイズ最大化（95%以上）、ズーム拡大（2倍）、ドラッグによる自由パン移動、
 * 複数枚写真カルーセル、キーボード操作、洗練されたインラインSVGナビゲーションを提供します。
 */

const ZOOM_SCALE = 2.0;

let lightboxElement = null;
let currentImages = [];
let currentIndex = 0;

// ズーム & ドラッグ状態管理
let isZoomed = false;
let isDragging = false;
let hasDragged = false;
let panX = 0;
let panY = 0;
let startPointerX = 0;
let startPointerY = 0;
let initialPanX = 0;
let initialPanY = 0;

/**
 * ズーム・パンのスタイルを適用
 * @param {boolean} animate アニメーションを付与するかどうか
 */
function applyTransform(animate = true) {
  const imgEl = document.getElementById('lightbox-main-image');
  if (!imgEl) return;

  if (animate) {
    imgEl.style.transition = 'opacity 0.25s ease, transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)';
  } else {
    imgEl.style.transition = 'none';
  }

  const scale = isZoomed ? ZOOM_SCALE : 1;
  imgEl.style.transform = `translate3d(${panX}px, ${panY}px, 0px) scale(${scale})`;
}

/**
 * ズーム状態に応じたUI（カーソル、アイコン、ヒント等）を更新
 */
function updateZoomUI() {
  const imgEl = document.getElementById('lightbox-main-image');
  const btnZoom = document.getElementById('lightbox-btn-zoom');
  const hintText = document.getElementById('lightbox-hint-text');
  const iconZoomIn = btnZoom?.querySelector('.zoom-in-icon');
  const iconZoomOut = btnZoom?.querySelector('.zoom-out-icon');

  if (imgEl) {
    if (isZoomed) {
      imgEl.classList.add('zoomed');
    } else {
      imgEl.classList.remove('zoomed', 'dragging');
    }
  }

  if (iconZoomIn && iconZoomOut) {
    iconZoomIn.style.display = isZoomed ? 'none' : 'block';
    iconZoomOut.style.display = isZoomed ? 'block' : 'none';
  }

  if (btnZoom) {
    btnZoom.setAttribute('title', isZoomed ? '縮小表示 (Z)' : 'ズーム拡大 (Z)');
  }

  if (hintText) {
    hintText.textContent = isZoomed ? 'ドラッグで移動 / クリックで縮小' : 'クリックでズーム拡大';
  }
}

/**
 * ドラッグ可能な範囲内に座標を制限
 */
function clampPan() {
  const imgEl = document.getElementById('lightbox-main-image');
  if (!imgEl || !isZoomed) return;

  const renderedW = imgEl.offsetWidth * ZOOM_SCALE;
  const renderedH = imgEl.offsetHeight * ZOOM_SCALE;

  const maxPanX = Math.max(0, (renderedW - window.innerWidth) / 2 + 80);
  const maxPanY = Math.max(0, (renderedH - window.innerHeight) / 2 + 80);

  panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
  panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
}

/**
 * ズーム状態を初期化（通常倍率に戻す）
 */
function resetZoom() {
  isZoomed = false;
  isDragging = false;
  hasDragged = false;
  panX = 0;
  panY = 0;
  updateZoomUI();
  applyTransform(false);
}

/**
 * ズームトグル
 * @param {Object} [originCoords] クリック位置を基準にズームする場合の座標
 */
function toggleZoom(originCoords = null) {
  isZoomed = !isZoomed;
  if (!isZoomed) {
    panX = 0;
    panY = 0;
  } else {
    if (originCoords && typeof originCoords.clientX === 'number') {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      panX = (centerX - originCoords.clientX) * (ZOOM_SCALE - 1);
      panY = (centerY - originCoords.clientY) * (ZOOM_SCALE - 1);
      clampPan();
    } else {
      panX = 0;
      panY = 0;
    }
  }
  updateZoomUI();
  applyTransform(true);
}

/**
 * ライトボックス用の DOM を生成してマウント
 */
function ensureLightboxDOM() {
  if (document.getElementById('memory-lightbox-overlay')) return;

  const html = `
    <div id="memory-lightbox-overlay" class="memory-lightbox-overlay hidden" role="dialog" aria-modal="true" aria-label="写真プレビュー">
      <!-- 上部ツールバー -->
      <div class="lightbox-top-bar">
        <div id="lightbox-counter" class="lightbox-counter">1 / 1</div>
        <div class="lightbox-top-actions">
          <button id="lightbox-btn-zoom" class="lightbox-icon-btn" type="button" aria-label="ズーム切替" title="ズーム拡大 (Z)">
            <svg class="zoom-in-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
            <svg class="zoom-out-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          <button id="lightbox-btn-close" class="lightbox-icon-btn" type="button" aria-label="閉じる" title="閉じる (Esc)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- 前へボタン -->
      <button id="lightbox-btn-prev" class="lightbox-nav-btn prev" type="button" aria-label="前の写真" title="前へ (←)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      <!-- 次へボタン -->
      <button id="lightbox-btn-next" class="lightbox-nav-btn next" type="button" aria-label="次の写真" title="次へ (→)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>

      <!-- 画像表示エリア -->
      <div class="lightbox-image-wrapper">
        <img id="lightbox-main-image" class="lightbox-main-image" src="" alt="拡大写真" draggable="false" />
      </div>

      <!-- 下部操作ヒントバッジ -->
      <div id="lightbox-zoom-hint" class="lightbox-zoom-hint">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="11" y1="8" x2="11" y2="14"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
        <span id="lightbox-hint-text">クリックでズーム拡大</span>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  lightboxElement = document.getElementById('memory-lightbox-overlay');

  // イベントリスナーの登録
  const btnClose = document.getElementById('lightbox-btn-close');
  const btnZoom = document.getElementById('lightbox-btn-zoom');
  const btnPrev = document.getElementById('lightbox-btn-prev');
  const btnNext = document.getElementById('lightbox-btn-next');
  const imgEl = document.getElementById('lightbox-main-image');

  btnClose?.addEventListener('click', closeLightbox);
  btnZoom?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleZoom();
  });

  btnPrev?.addEventListener('click', (e) => {
    e.stopPropagation();
    showPrev();
  });
  btnNext?.addEventListener('click', (e) => {
    e.stopPropagation();
    showNext();
  });

  // 背景クリック処理（ズーム時はズーム解除、通常時はライトボックスを閉じる）
  lightboxElement.addEventListener('click', (e) => {
    if (e.target === lightboxElement || e.target.classList.contains('lightbox-image-wrapper')) {
      if (isZoomed) {
        resetZoom();
      } else {
        closeLightbox();
      }
    }
  });

  // 画像ドラッグ（パン）およびクリックズームのイベント制御
  if (imgEl) {
    imgEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      if (isZoomed) {
        isDragging = true;
        hasDragged = false;
        startPointerX = e.clientX;
        startPointerY = e.clientY;
        initialPanX = panX;
        initialPanY = panY;

        try {
          imgEl.setPointerCapture(e.pointerId);
        } catch (_) {}

        imgEl.classList.add('dragging');
        applyTransform(false);
        e.preventDefault();
      }
    });

    imgEl.addEventListener('pointermove', (e) => {
      if (!isDragging || !isZoomed) return;

      const dx = e.clientX - startPointerX;
      const dy = e.clientY - startPointerY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        hasDragged = true;
      }

      panX = initialPanX + dx;
      panY = initialPanY + dy;
      clampPan();
      applyTransform(false);
    });

    const handlePointerEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      imgEl.classList.remove('dragging');
      applyTransform(true);
    };

    imgEl.addEventListener('pointerup', handlePointerEnd);
    imgEl.addEventListener('pointercancel', handlePointerEnd);

    // 画像クリックでズームトグル（ドラッグ後の指離しでは誤作動防止）
    imgEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasDragged) {
        hasDragged = false;
        return;
      }
      toggleZoom({ clientX: e.clientX, clientY: e.clientY });
    });
  }

  // キーボードナビゲーション
  window.addEventListener('keydown', (e) => {
    if (!lightboxElement || lightboxElement.classList.contains('hidden')) return;

    if (e.key === 'Escape') {
      if (isZoomed) {
        resetZoom();
      } else {
        closeLightbox();
      }
    } else if (e.key === 'ArrowLeft') {
      showPrev();
    } else if (e.key === 'ArrowRight') {
      showNext();
    } else if (e.key === 'z' || e.key === 'Z') {
      toggleZoom();
    }
  });
}

/**
 * 指定インデックスの画像を表示
 * @param {number} index 
 */
function updateDisplay(index) {
  if (!currentImages || currentImages.length === 0) return;

  // 写真切り替え時はズーム状態を自動リセット
  resetZoom();

  if (index < 0) {
    currentIndex = currentImages.length - 1;
  } else if (index >= currentImages.length) {
    currentIndex = 0;
  } else {
    currentIndex = index;
  }

  const imgEl = document.getElementById('lightbox-main-image');
  const counterEl = document.getElementById('lightbox-counter');
  const btnPrev = document.getElementById('lightbox-btn-prev');
  const btnNext = document.getElementById('lightbox-btn-next');

  if (imgEl) {
    imgEl.style.opacity = '0';
    imgEl.src = currentImages[currentIndex];
    imgEl.onload = () => {
      imgEl.style.opacity = '1';
    };
  }

  if (counterEl) {
    counterEl.textContent = `${currentIndex + 1} / ${currentImages.length}`;
  }

  // 単一写真の場合は矢印ナビゲーションを非表示
  if (btnPrev && btnNext) {
    if (currentImages.length <= 1) {
      btnPrev.style.display = 'none';
      btnNext.style.display = 'none';
    } else {
      btnPrev.style.display = 'flex';
      btnNext.style.display = 'flex';
    }
  }
}

/**
 * 前の写真を表示
 */
export function showPrev() {
  updateDisplay(currentIndex - 1);
}

/**
 * 次の写真を表示
 */
export function showNext() {
  updateDisplay(currentIndex + 1);
}

/**
 * ライトボックスを開く
 * @param {Array<string>} imageUrls 表示する画像URLの配列
 * @param {number} [startIndex=0] 初期表示するインデックス
 */
export function openLightbox(imageUrls = [], startIndex = 0) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return;

  ensureLightboxDOM();
  currentImages = imageUrls;
  currentIndex = startIndex >= 0 && startIndex < imageUrls.length ? startIndex : 0;

  resetZoom();
  updateDisplay(currentIndex);

  if (lightboxElement) {
    lightboxElement.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // 背景スクロール固定
  }
}

/**
 * ライトボックスを閉じる
 */
export function closeLightbox() {
  resetZoom();
  if (lightboxElement) {
    lightboxElement.classList.add('hidden');
    document.body.style.overflow = '';
  }
}
