/**
 * Memory Map - 全画面写真拡大ライトボックスコンポーネント
 * 複数枚の写真カルーセル表示、キーボード操作（Esc, ArrowLeft, ArrowRight）、
 * 洗練されたインライン SVG アイコンナビゲーションを提供します。
 */

let lightboxElement = null;
let currentImages = [];
let currentIndex = 0;

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
        <button id="lightbox-btn-close" class="lightbox-icon-btn" type="button" aria-label="閉じる" title="閉じる (Esc)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
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
        <img id="lightbox-main-image" class="lightbox-main-image" src="" alt="拡大写真" />
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  lightboxElement = document.getElementById('memory-lightbox-overlay');

  // イベントリスナーの登録
  const btnClose = document.getElementById('lightbox-btn-close');
  const btnPrev = document.getElementById('lightbox-btn-prev');
  const btnNext = document.getElementById('lightbox-btn-next');
  const imgEl = document.getElementById('lightbox-main-image');

  btnClose?.addEventListener('click', closeLightbox);
  btnPrev?.addEventListener('click', (e) => {
    e.stopPropagation();
    showPrev();
  });
  btnNext?.addEventListener('click', (e) => {
    e.stopPropagation();
    showNext();
  });

  // 背景クリックで閉じる（画像自体のクリックは伝播防止）
  lightboxElement.addEventListener('click', (e) => {
    if (e.target === lightboxElement || e.target.closest('.lightbox-image-wrapper')) {
      if (e.target !== imgEl) {
        closeLightbox();
      }
    }
  });

  imgEl?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // キーボードナビゲーション
  window.addEventListener('keydown', (e) => {
    if (!lightboxElement || lightboxElement.classList.contains('hidden')) return;

    if (e.key === 'Escape') {
      closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      showPrev();
    } else if (e.key === 'ArrowRight') {
      showNext();
    }
  });
}

/**
 * 指定インデックスの画像を表示
 * @param {number} index 
 */
function updateDisplay(index) {
  if (!currentImages || currentImages.length === 0) return;

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
  if (lightboxElement) {
    lightboxElement.classList.add('hidden');
    document.body.style.overflow = '';
  }
}
