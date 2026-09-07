/**
 * Memory Map - 旅のフォトブック生成 & 印刷プレビューモジュール
 * 指定アルバムの思い出を「表紙」「行程一覧」「スポット詳細」のA4印刷レイアウトに
 * 自動整形し、ブラウザの印刷機能（window.print）経由でPDF保存を可能にします。
 */

let photobookModal = null;

/**
 * フォトブック用スタイルを動的に注入（画面プレビュー & @media print 印刷用）
 */
function ensurePhotobookStyles() {
  if (document.getElementById('photobook-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'photobook-modal-styles';
  style.textContent = `
    .photobook-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 3000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 1.5rem 1rem;
      overflow-y: auto;
    }
    .photobook-modal-overlay.hidden {
      display: none !important;
    }
    .photobook-container {
      width: 100%;
      max-width: 820px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      margin-bottom: 2rem;
    }
    .photobook-toolbar {
      width: 100%;
      max-width: 820px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: white;
      padding: 12px 20px;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      margin-bottom: 16px;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .photobook-toolbar-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .photobook-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn-print-action {
      background: #2563eb;
      color: white;
      border: none;
      padding: 9px 18px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.88rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
      transition: all 0.2s;
    }
    .btn-print-action:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }
    .btn-close-photobook {
      background: #f1f5f9;
      border: none;
      border-radius: 50%;
      width: 34px;
      height: 34px;
      cursor: pointer;
      color: #64748b;
      font-size: 1rem;
      font-weight: 700;
    }
    .btn-close-photobook:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    /* 各ページ（A4用紙比率スタイル） */
    .photobook-page {
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
      padding: 48px;
      min-height: 980px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      color: #0f172a;
      position: relative;
    }
    .photobook-cover-page {
      text-align: center;
      justify-content: center;
      align-items: center;
      padding: 64px 48px;
    }
    .photobook-cover-title {
      font-size: 2.4rem;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 12px;
      line-height: 1.2;
    }
    .photobook-cover-subtitle {
      font-size: 1.1rem;
      color: #64748b;
      margin-bottom: 36px;
    }
    .photobook-cover-grid {
      display: grid;
      grid-template-columns: repeat(2, 180px);
      grid-template-rows: repeat(2, 180px);
      gap: 12px;
      margin-bottom: 40px;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    }
    .photobook-cover-grid img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .photobook-spot-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 12px;
    }
    .photobook-badge {
      padding: 4px 12px;
      background: #2563eb;
      color: white;
      border-radius: 14px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .photobook-spot-title {
      font-size: 1.6rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 16px 0;
    }
    .photobook-photos-container {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: center;
      margin-bottom: 24px;
    }
    .photobook-photos-container img {
      border-radius: 10px;
      object-fit: cover;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .photobook-diary-box {
      background: #f8fafc;
      border-left: 4px solid #2563eb;
      padding: 18px 20px;
      border-radius: 0 12px 12px 0;
      font-size: 0.95rem;
      line-height: 1.7;
      color: #334155;
      white-space: pre-wrap;
      margin-bottom: 20px;
    }
    .photobook-tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    .photobook-tag-pill {
      background: #f1f5f9;
      color: #475569;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 600;
    }
    .photobook-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: #94a3b8;
    }

    /* 印刷時のスタイル */
    @media print {
      body * {
        visibility: hidden;
      }
      .photobook-modal-overlay,
      .photobook-modal-overlay * {
        visibility: visible;
      }
      .photobook-modal-overlay {
        position: static !important;
        background: transparent !important;
        padding: 0 !important;
        overflow: visible !important;
      }
      .photobook-toolbar {
        display: none !important;
      }
      .photobook-container {
        max-width: 100% !important;
        margin: 0 !important;
        gap: 0 !important;
      }
      .photobook-page {
        box-shadow: none !important;
        border-radius: 0 !important;
        padding: 24mm 20mm !important;
        min-height: 100vh !important;
        page-break-after: always !important;
        break-after: page !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * モーダルDOMの作成
 */
function createPhotobookDOM() {
  ensurePhotobookStyles();
  if (document.getElementById('photobook-modal-overlay')) return;

  const html = `
    <div id="photobook-modal-overlay" class="photobook-modal-overlay hidden">
      <div class="photobook-toolbar">
        <div class="photobook-toolbar-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span id="photobook-toolbar-album-name">旅のフォトブック プレビュー</span>
        </div>
        <div class="photobook-toolbar-actions">
          <button id="btn-print-photobook" class="btn-print-action">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            <span>PDF保存 / 印刷</span>
          </button>
          <button id="btn-close-photobook" class="btn-close-photobook" title="閉じる" style="display: flex; align-items: center; justify-content: center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div id="photobook-content-container" class="photobook-container"></div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  photobookModal = document.getElementById('photobook-modal-overlay');

  document.getElementById('btn-close-photobook')?.addEventListener('click', closePhotobookModal);
  document.getElementById('btn-print-photobook')?.addEventListener('click', () => {
    window.print();
  });

  photobookModal.addEventListener('click', (e) => {
    if (e.target === photobookModal) closePhotobookModal();
  });
}

/**
 * フォトブックHTMLの生成
 */
function generatePhotobookHTML(albumName, memories) {
  // 日付順にソート
  const sorted = [...memories].sort((a, b) => {
    const tA = new Date(a.datetime || a.timestamp || 0).getTime();
    const tB = new Date(b.datetime || b.timestamp || 0).getTime();
    return tA - tB;
  });

  // 旅の期間を計算
  let periodText = '記録された旅の思い出';
  const dates = sorted.map(m => m.datetime || m.timestamp).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
  if (dates.length > 0) {
    const first = dates[0];
    const last = dates[dates.length - 1];
    const fmt = d => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    periodText = fmt(first) === fmt(last) ? fmt(first) : `${fmt(first)} 〜 ${fmt(last)}`;
  }

  // 全写真の収集（表紙用）
  const allPhotos = [];
  sorted.forEach(m => {
    if (Array.isArray(m.imageUrls)) allPhotos.push(...m.imageUrls);
  });

  let html = '';

  // 1. 表紙ページ
  html += `
    <div class="photobook-page photobook-cover-page">
      <div>
        <div style="font-size: 0.9rem; font-weight: 700; color: #2563eb; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px;">Memory Map Album</div>
        <h1 class="photobook-cover-title">${albumName || '旅の記録'}</h1>
        <div class="photobook-cover-subtitle">${periodText}</div>
      </div>

      ${allPhotos.length > 0 ? `
        <div class="photobook-cover-grid">
          ${allPhotos.slice(0, 4).map(url => `<img src="${url}" alt="表紙写真" />`).join('')}
        </div>
      ` : ''}

      <div style="color: #94a3b8; font-size: 0.85rem;">全 ${sorted.length} か所のスポットを収録</div>
    </div>
  `;

  // 2. 各スポットのページ
  sorted.forEach((m, idx) => {
    const spotNum = idx + 1;
    let spotDate = '';
    const rawDate = m.datetime || m.timestamp;
    if (rawDate) {
      const dt = new Date(rawDate);
      if (!isNaN(dt.getTime())) {
        spotDate = `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      }
    }

    const photos = Array.isArray(m.imageUrls) ? m.imageUrls : [];
    let photosHtml = '';

    if (photos.length === 1) {
      photosHtml = `
        <div class="photobook-photos-container">
          <img src="${photos[0]}" alt="${m.title}" style="max-width: 100%; max-height: 440px; width: auto;" />
        </div>
      `;
    } else if (photos.length > 1) {
      const imgWidth = photos.length === 2 ? '48%' : (photos.length === 3 ? '31%' : '48%');
      photosHtml = `
        <div class="photobook-photos-container">
          ${photos.map(url => `<img src="${url}" alt="${m.title}" style="width: ${imgWidth}; max-height: 260px;" />`).join('')}
        </div>
      `;
    }

    const tagsHtml = Array.isArray(m.tags) && m.tags.length > 0
      ? `<div class="photobook-tag-list">${m.tags.map(t => `<span class="photobook-tag-pill">#${t}</span>`).join('')}</div>`
      : '';

    html += `
      <div class="photobook-page">
        <div>
          <div class="photobook-spot-header">
            <span class="photobook-badge">SPOT ${spotNum} / ${sorted.length}</span>
            <span style="font-size: 0.85rem; color: #64748b; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>${spotDate}</span>
            </span>
          </div>

          <h2 class="photobook-spot-title">${m.title || '無題の思い出'}</h2>

          ${photosHtml}

          ${m.diary ? `<div class="photobook-diary-box">${m.diary}</div>` : ''}

          ${tagsHtml}
        </div>

        <div class="photobook-footer">
          <span>${albumName || 'Memory Map'}</span>
          <span>Page ${idx + 2}</span>
        </div>
      </div>
    `;
  });

  return html;
}

/**
 * フォトブックモーダルを開く
 * @param {string} albumName 
 * @param {Array<Object>} memories 
 */
export function openPhotobookModal(albumName, memories = []) {
  createPhotobookDOM();

  const titleEl = document.getElementById('photobook-toolbar-album-name');
  if (titleEl) {
    titleEl.textContent = `旅のフォトブック: ${albumName || 'すべての思い出'}`;
  }

  const container = document.getElementById('photobook-content-container');
  if (container) {
    container.innerHTML = generatePhotobookHTML(albumName, memories);
  }

  photobookModal.classList.remove('hidden');
}

/**
 * フォトブックモーダルを閉じる
 */
export function closePhotobookModal() {
  if (photobookModal) {
    photobookModal.classList.add('hidden');
  }
}
