/**
 * Memory Map - アルバムツアー再生モジュール
 * フルスクリーン没入レイアウト（position: fixed; inset: 0; z-index: 3000）で
 * 指定アルバムの思い出を時系列順に自動巡回します。
 * 絵文字を完全排除し、洗練された SVG アイコンおよびテキストコントローラーを提供します。
 */

let tourContainer = null;
let currentMemories = [];
let currentIndex = 0;
let isPlaying = false;
let playbackTimer = null;
let photoSlideTimer = null;
let playbackSpeed = 1;
let mapInstance = null;

const BASE_DURATION = 4500; // 1スポットの滞在時間 (ms)

// SVG アイコン定義（絵文字排除）
const ICONS = {
  prev: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`,
  next: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
  play: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`,
  pause: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
  close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
};

/**
 * フルスクリーンツアー専用のスタイルを動的に注入
 */
function ensureTourStyles() {
  if (document.getElementById('tour-player-styles')) return;
  const style = document.createElement('style');
  style.id = 'tour-player-styles';
  style.textContent = `
    .tour-fullscreen-overlay {
      position: fixed;
      inset: 0;
      z-index: 3000;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 1.5rem 2rem;
      box-sizing: border-box;
      color: #ffffff;
      transition: opacity 0.3s ease;
    }
    .tour-fullscreen-overlay.hidden {
      display: none !important;
    }

    /* トップヘッダー */
    .tour-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
    }
    .tour-top-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .tour-step-badge {
      display: inline-block;
      padding: 4px 12px;
      background: #2563eb;
      color: #ffffff;
      font-size: 0.8rem;
      font-weight: 700;
      border-radius: 20px;
      letter-spacing: 0.5px;
    }
    .tour-album-name {
      font-size: 0.9rem;
      color: #94a3b8;
      font-weight: 600;
    }
    .tour-btn-close {
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 30px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      transition: all 0.2s ease;
      backdrop-filter: blur(8px);
    }
    .tour-btn-close:hover {
      background: rgba(239, 68, 68, 0.8);
    }

    /* メインシネマティックステージ */
    .tour-main-stage {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      max-width: 900px;
      width: 100%;
      margin: 0 auto;
      text-align: center;
      padding: 1rem 0;
    }
    .tour-hero-photo-wrapper {
      position: relative;
      width: 100%;
      max-height: 52vh;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.6);
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.5rem;
    }
    .tour-hero-photo-wrapper img {
      max-width: 100%;
      max-height: 52vh;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
      border-radius: 20px;
      transition: opacity 0.3s ease;
    }
    .tour-info-card {
      max-width: 720px;
    }
    .tour-spot-title {
      font-size: 1.75rem;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 6px;
      line-height: 1.3;
    }
    .tour-spot-date {
      font-size: 0.88rem;
      color: #94a3b8;
      margin-bottom: 10px;
    }
    .tour-spot-diary {
      font-size: 1rem;
      color: #e2e8f0;
      line-height: 1.6;
      max-height: 80px;
      overflow-y: auto;
      background: rgba(255, 255, 255, 0.06);
      padding: 10px 18px;
      border-radius: 12px;
      border-left: 3px solid #2563eb;
      text-align: left;
    }

    /* ボトムコントロールバー */
    .tour-bottom-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      max-width: 540px;
      margin: 0 auto;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 40px;
      padding: 8px 24px;
      gap: 20px;
      backdrop-filter: blur(12px);
    }
    .tour-ctrl-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: #ffffff;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .tour-ctrl-btn:hover {
      background: #2563eb;
      transform: scale(1.08);
    }
    .tour-play-pause-btn {
      width: 52px;
      height: 52px;
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 50%;
      box-shadow: 0 4px 16px rgba(37, 99, 235, 0.5);
    }
    .tour-play-pause-btn:hover {
      background: #1d4ed8;
      transform: scale(1.08);
    }
    .tour-speed-select {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #ffffff;
      border-radius: 12px;
      padding: 6px 12px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      outline: none;
    }
    .tour-speed-select option {
      background: #0f172a;
      color: #ffffff;
    }
  `;
  document.head.appendChild(style);
}

/**
 * フルスクリーンツアーDOMの作成
 */
function createTourDOM() {
  ensureTourStyles();
  if (document.getElementById('tour-player-container')) return;

  const html = `
    <div id="tour-player-container" class="tour-fullscreen-overlay hidden">
      <!-- 上部ヘッダー -->
      <div class="tour-top-bar">
        <div class="tour-top-meta">
          <span id="tour-step-badge" class="tour-step-badge">SPOT 1 / 1</span>
          <span id="tour-album-name" class="tour-album-name">ツアー再生中</span>
        </div>
        <button id="btn-tour-close" class="tour-btn-close">
          ${ICONS.close}
          <span>ツアー終了</span>
        </button>
      </div>

      <!-- 中央メインステージ -->
      <div class="tour-main-stage">
        <div id="tour-hero-box" class="tour-hero-photo-wrapper">
          <img id="tour-hero-img" src="" alt="思い出写真" />
        </div>
        <div class="tour-info-card">
          <h2 id="tour-spot-title" class="tour-spot-title">タイトル</h2>
          <div id="tour-spot-date" class="tour-spot-date">2024年5月3日</div>
          <p id="tour-spot-diary" class="tour-spot-diary">日記本文</p>
        </div>
      </div>

      <!-- 下部コントロールバー -->
      <div class="tour-bottom-bar">
        <button id="btn-tour-prev" class="tour-ctrl-btn" title="前のスポット">
          ${ICONS.prev}
        </button>
        <button id="btn-tour-play-pause" class="tour-ctrl-btn tour-play-pause-btn" title="再生 / 一時停止">
          ${ICONS.pause}
        </button>
        <button id="btn-tour-next" class="tour-ctrl-btn" title="次のスポット">
          ${ICONS.next}
        </button>
        <select id="tour-speed-select" class="tour-speed-select" title="再生速度">
          <option value="1">1.0x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2.0x</option>
        </select>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  tourContainer = document.getElementById('tour-player-container');
  bindEvents();
}

/**
 * イベント設定
 */
function bindEvents() {
  document.getElementById('btn-tour-prev')?.addEventListener('click', prevSpot);
  document.getElementById('btn-tour-next')?.addEventListener('click', nextSpot);
  document.getElementById('btn-tour-play-pause')?.addEventListener('click', togglePlayPause);
  document.getElementById('btn-tour-close')?.addEventListener('click', stopTour);

  const speedSelect = document.getElementById('tour-speed-select');
  if (speedSelect) {
    speedSelect.addEventListener('change', (e) => {
      playbackSpeed = parseFloat(e.target.value) || 1;
      if (isPlaying) restartTimer();
    });
  }

  // キーボード操作対応 (左右キーで移動, スペースで再生/停止, Escで終了)
  document.addEventListener('keydown', (e) => {
    if (tourContainer && !tourContainer.classList.contains('hidden')) {
      if (e.key === 'ArrowRight') nextSpot();
      if (e.key === 'ArrowLeft') prevSpot();
      if (e.key === ' ') { e.preventDefault(); togglePlayPause(); }
      if (e.key === 'Escape') stopTour();
    }
  });
}

/**
 * 現在のスポットを画面および地図に反映
 */
function displayCurrentSpot() {
  if (!currentMemories || currentMemories.length === 0) return;
  const mem = currentMemories[currentIndex];
  if (!mem) return;

  const stepBadge = document.getElementById('tour-step-badge');
  const albumNameEl = document.getElementById('tour-album-name');
  const titleEl = document.getElementById('tour-spot-title');
  const dateEl = document.getElementById('tour-spot-date');
  const diaryEl = document.getElementById('tour-spot-diary');
  const heroBox = document.getElementById('tour-hero-box');
  const heroImg = document.getElementById('tour-hero-img');

  if (stepBadge) stepBadge.textContent = `SPOT ${currentIndex + 1} / ${currentMemories.length}`;
  if (albumNameEl) albumNameEl.textContent = mem.album ? `アルバム: ${mem.album}` : '旅の記録';
  if (titleEl) titleEl.textContent = mem.title || '無題の思い出';
  
  // 日付の整形
  let displayDate = '';
  const rawDate = mem.datetime || mem.timestamp;
  if (rawDate) {
    const dt = new Date(rawDate);
    if (!isNaN(dt.getTime())) {
      displayDate = `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
    }
  }
  if (dateEl) dateEl.textContent = displayDate;
  if (diaryEl) {
    diaryEl.textContent = mem.diary || '日記メモはありません。';
  }

  // 写真の表示
  const photos = Array.isArray(mem.imageUrls) ? mem.imageUrls : [];
  if (photoSlideTimer) {
    clearInterval(photoSlideTimer);
    photoSlideTimer = null;
  }

  if (photos.length > 0) {
    heroBox.style.display = 'flex';
    heroImg.src = photos[0];

    // 複数写真がある場合は自動スライド
    if (photos.length > 1) {
      let pIdx = 0;
      photoSlideTimer = setInterval(() => {
        pIdx = (pIdx + 1) % photos.length;
        heroImg.style.opacity = '0.3';
        setTimeout(() => {
          heroImg.src = photos[pIdx];
          heroImg.style.opacity = '1';
        }, 200);
      }, 2500 / playbackSpeed);
    }
  } else {
    heroBox.style.display = 'none';
  }

  // 地図カメラの追従移動
  if (mapInstance && typeof mem.lat === 'number' && typeof mem.lng === 'number') {
    mapInstance.flyTo([mem.lat, mem.lng], 15, {
      animate: true,
      duration: 1.5 / playbackSpeed
    });
  }
}

/**
 * タイマーを再起動
 */
function restartTimer() {
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  if (isPlaying) {
    const duration = BASE_DURATION / playbackSpeed;
    playbackTimer = setTimeout(() => {
      nextSpot();
    }, duration);
  }
}

function nextSpot() {
  if (currentIndex < currentMemories.length - 1) {
    currentIndex++;
    displayCurrentSpot();
    restartTimer();
  } else {
    pauseTour();
  }
}

function prevSpot() {
  if (currentIndex > 0) {
    currentIndex--;
    displayCurrentSpot();
    restartTimer();
  }
}

function togglePlayPause() {
  if (isPlaying) {
    pauseTour();
  } else {
    playTour();
  }
}

function playTour() {
  isPlaying = true;
  const btn = document.getElementById('btn-tour-play-pause');
  if (btn) btn.innerHTML = ICONS.pause;
  restartTimer();
}

function pauseTour() {
  isPlaying = false;
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  const btn = document.getElementById('btn-tour-play-pause');
  if (btn) btn.innerHTML = ICONS.play;
}

/**
 * ツアーを開始する
 * @param {Array<Object>} memories 
 * @param {Object} [map] 
 */
export function startAlbumTour(memories = [], map = null) {
  if (!memories || memories.length === 0) {
    alert('ツアー再生する思い出がありません。');
    return;
  }

  createTourDOM();
  mapInstance = map;

  // 時系列順（古い順）にソート
  currentMemories = [...memories].sort((a, b) => {
    const timeA = new Date(a.datetime || a.timestamp || 0).getTime();
    const timeB = new Date(b.datetime || b.timestamp || 0).getTime();
    return timeA - timeB;
  });

  currentIndex = 0;
  isPlaying = true;

  tourContainer.classList.remove('hidden');
  const playPauseBtn = document.getElementById('btn-tour-play-pause');
  if (playPauseBtn) playPauseBtn.innerHTML = ICONS.pause;

  displayCurrentSpot();
  restartTimer();
}

/**
 * ツアーを停止して閉じる
 */
export function stopTour() {
  isPlaying = false;
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  if (photoSlideTimer) {
    clearInterval(photoSlideTimer);
    photoSlideTimer = null;
  }
  if (tourContainer) {
    tourContainer.classList.add('hidden');
  }
}
