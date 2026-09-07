/**
 * Memory Map - アルバムツアー再生モジュール
 * 指定されたアルバムの思い出を時系列順に巡り、地図カメラの自動追従と
 * スライドショー演出、再生コントローラー（前へ/次へ/一時停止/速度切替）を提供します。
 */

let tourContainer = null;
let currentMemories = [];
let currentIndex = 0;
let isPlaying = false;
let playbackTimer = null;
let photoSlideTimer = null;
let playbackSpeed = 1; // 1x, 1.5x, 2x
let mapInstance = null;

const BASE_DURATION = 4500; // 1スポットあたりの標準滞在時間 (ms)

/**
 * ツアー専用のスタイルを動的に注入
 */
function ensureTourStyles() {
  if (document.getElementById('tour-player-styles')) return;
  const style = document.createElement('style');
  style.id = 'tour-player-styles';
  style.textContent = `
    .tour-overlay-panel {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      width: 90%;
      max-width: 640px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.8);
      border-radius: 20px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      z-index: 2500;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .tour-overlay-panel.hidden {
      display: none !important;
    }
    .tour-card-body {
      display: flex;
      padding: 16px;
      gap: 16px;
      align-items: center;
    }
    .tour-photo-box {
      width: 140px;
      height: 105px;
      border-radius: 12px;
      overflow: hidden;
      background: #f1f5f9;
      flex-shrink: 0;
      position: relative;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
    }
    .tour-photo-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: opacity 0.4s ease;
    }
    .tour-content-box {
      flex: 1;
      min-width: 0;
    }
    .tour-step-badge {
      display: inline-block;
      padding: 3px 10px;
      background: #2563eb;
      color: white;
      font-size: 0.72rem;
      font-weight: 700;
      border-radius: 20px;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .tour-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 4px 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tour-date {
      font-size: 0.78rem;
      color: #64748b;
      margin-bottom: 6px;
    }
    .tour-diary {
      font-size: 0.84rem;
      color: #334155;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .tour-controls-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: rgba(241, 245, 249, 0.7);
      border-top: 1px solid rgba(0, 0, 0, 0.05);
    }
    .tour-btn-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tour-ctrl-btn {
      background: white;
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 50%;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #0f172a;
      transition: all 0.2s;
      font-size: 0.9rem;
    }
    .tour-ctrl-btn:hover {
      background: #2563eb;
      color: white;
      border-color: #2563eb;
    }
    .tour-play-pause-btn {
      width: 40px;
      height: 40px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 50%;
      font-weight: 700;
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3);
    }
    .tour-play-pause-btn:hover {
      background: #1d4ed8;
      transform: scale(1.05);
    }
    .tour-speed-select {
      background: white;
      border: 1px solid rgba(0,0,0,0.1);
      border-radius: 12px;
      padding: 4px 8px;
      font-size: 0.78rem;
      font-weight: 600;
      color: #334155;
      cursor: pointer;
    }
    .tour-close-btn {
      background: none;
      border: none;
      font-size: 0.8rem;
      color: #64748b;
      cursor: pointer;
      font-weight: 600;
      padding: 4px 8px;
    }
    .tour-close-btn:hover {
      color: #ef4444;
    }
  `;
  document.head.appendChild(style);
}

/**
 * DOM の作成
 */
function createTourDOM() {
  ensureTourStyles();
  if (document.getElementById('tour-player-container')) return;

  const html = `
    <div id="tour-player-container" class="tour-overlay-panel hidden">
      <div class="tour-card-body">
        <div id="tour-photo-box" class="tour-photo-box">
          <img id="tour-photo-img" src="" alt="思い出写真" />
        </div>
        <div class="tour-content-box">
          <span id="tour-step-badge" class="tour-step-badge">SPOT 1 / 1</span>
          <h3 id="tour-title" class="tour-title">思い出のタイトル</h3>
          <div id="tour-date" class="tour-date">2024/05/03</div>
          <div id="tour-diary" class="tour-diary">思い出の日記</div>
        </div>
      </div>
      <div class="tour-controls-bar">
        <div class="tour-btn-group">
          <button id="btn-tour-prev" class="tour-ctrl-btn" title="前のスポット">❮</button>
          <button id="btn-tour-play-pause" class="tour-ctrl-btn tour-play-pause-btn" title="再生 / 一時停止">⏸</button>
          <button id="btn-tour-next" class="tour-ctrl-btn" title="次のスポット">❯</button>
          <select id="tour-speed-select" class="tour-speed-select" title="再生速度">
            <option value="1">1.0x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>
        </div>
        <button id="btn-tour-close" class="tour-close-btn">ツアー終了 ✕</button>
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
      if (isPlaying) {
        restartTimer();
      }
    });
  }
}

/**
 * 現在のスポットを画面および地図に反映
 */
function displayCurrentSpot() {
  if (!currentMemories || currentMemories.length === 0) return;
  const mem = currentMemories[currentIndex];
  if (!mem) return;

  const stepBadge = document.getElementById('tour-step-badge');
  const titleEl = document.getElementById('tour-title');
  const dateEl = document.getElementById('tour-date');
  const diaryEl = document.getElementById('tour-diary');
  const photoBox = document.getElementById('tour-photo-box');
  const photoImg = document.getElementById('tour-photo-img');

  if (stepBadge) stepBadge.textContent = `SPOT ${currentIndex + 1} / ${currentMemories.length}`;
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
  if (diaryEl) diaryEl.textContent = mem.diary || '（日記メモはありません）';

  // 写真の表示
  const photos = Array.isArray(mem.imageUrls) ? mem.imageUrls : [];
  if (photoSlideTimer) {
    clearInterval(photoSlideTimer);
    photoSlideTimer = null;
  }

  if (photos.length > 0) {
    photoBox.style.display = 'block';
    photoImg.src = photos[0];

    // 複数写真がある場合は自動スライド
    if (photos.length > 1) {
      let pIdx = 0;
      photoSlideTimer = setInterval(() => {
        pIdx = (pIdx + 1) % photos.length;
        photoImg.style.opacity = '0.4';
        setTimeout(() => {
          photoImg.src = photos[pIdx];
          photoImg.style.opacity = '1';
        }, 150);
      }, 2500 / playbackSpeed);
    }
  } else {
    photoBox.style.display = 'none';
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

/**
 * 次のスポットへ
 */
function nextSpot() {
  if (currentIndex < currentMemories.length - 1) {
    currentIndex++;
    displayCurrentSpot();
    restartTimer();
  } else {
    // 終点に達したら一時停止
    pauseTour();
  }
}

/**
 * 前のスポットへ
 */
function prevSpot() {
  if (currentIndex > 0) {
    currentIndex--;
    displayCurrentSpot();
    restartTimer();
  }
}

/**
 * 再生 / 一時停止の切り替え
 */
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
  if (btn) btn.textContent = '⏸';
  restartTimer();
}

function pauseTour() {
  isPlaying = false;
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  const btn = document.getElementById('btn-tour-play-pause');
  if (btn) btn.textContent = '▶';
}

/**
 * ツアーを開始する
 * @param {Array<Object>} memories 対象思い出配列
 * @param {Object} [map] Leaflet map インスタンス
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
  if (playPauseBtn) playPauseBtn.textContent = '⏸';

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
