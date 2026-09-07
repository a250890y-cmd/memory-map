/**
 * Memory Map - 認証UIコンポーネント (Auth Button & Sync Status)
 * Google ログイン、ログアウト、ユーザープロフィール、および
 * ログイン時の自動クラウド復旧・同期（syncWithCloud）を管理します。
 */

import {
  loginWithGoogle,
  logout,
  getCurrentUser,
  onAuthStateChangedWrapper
} from '../services/auth-service';
import { syncWithCloud } from '../services/cloud-sync';

let authContainer = null;
let onSyncCompleteCallback = null;
let isSyncing = false;

/**
 * Google “G” アイコン SVG
 */
const GOOGLE_ICON_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
  </svg>
`;

/**
 * 認証 UI の描画
 * @param {Object|null} user 
 */
function renderAuthUI(user) {
  if (!authContainer) return;

  if (user) {
    // ログイン中の表示
    const photoUrl = user.photoURL || '';
    const displayName = user.displayName || user.email || 'ユーザー';
    const initial = (displayName.charAt(0) || 'U').toUpperCase();

    const avatarHtml = photoUrl
      ? `<img src="${photoUrl}" alt="${displayName}" class="auth-user-avatar" />`
      : `<div class="auth-user-avatar-fallback">${initial}</div>`;

    authContainer.innerHTML = `
      <div class="auth-user-card">
        <div class="auth-user-header">
          ${avatarHtml}
          <div class="auth-user-info">
            <div class="auth-user-name">${displayName}</div>
            <div class="auth-sync-status">
              <span class="auth-sync-indicator ${isSyncing ? 'syncing' : ''}"></span>
              <span id="auth-sync-label">${isSyncing ? 'クラウド同期中...' : 'クラウド同期完了'}</span>
            </div>
          </div>
        </div>
        <div class="auth-user-actions">
          <button id="btn-manual-sync" class="btn-auth-action" title="クラウドと手動同期" ${isSyncing ? 'disabled' : ''}>
            ☁️ 今すぐ同期
          </button>
          <button id="btn-auth-logout" class="btn-auth-action logout" title="ログアウト">
            ログアウト
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-manual-sync')?.addEventListener('click', () => triggerCloudSync(user));
    document.getElementById('btn-auth-logout')?.addEventListener('click', handleLogout);
  } else {
    // 未ログイン時の表示
    authContainer.innerHTML = `
      <div class="auth-login-card">
        <button id="btn-google-login" class="btn-google-login">
          ${GOOGLE_ICON_SVG}
          <span>Google でログイン</span>
        </button>
        <p class="auth-login-note">ログインすると過去の思い出を自動復旧し、クラウドに同期します</p>
      </div>
    `;

    document.getElementById('btn-google-login')?.addEventListener('click', handleGoogleLogin);
  }
}

/**
 * クラウド同期の実行
 * @param {Object} user 
 */
async function triggerCloudSync(user) {
  if (isSyncing || !user) return;
  isSyncing = true;
  renderAuthUI(user);

  try {
    const result = await syncWithCloud(user);
    isSyncing = false;
    renderAuthUI(user);

    if (result && result.success) {
      if (typeof onSyncCompleteCallback === 'function') {
        onSyncCompleteCallback(result);
      }
    }
  } catch (err) {
    console.error('クラウド同期エラー:', err);
    isSyncing = false;
    renderAuthUI(user);
  }
}

/**
 * Google ログインハンドラー
 */
async function handleGoogleLogin() {
  try {
    const user = await loginWithGoogle();
    if (user) {
      // ログイン成功時に直ちに過去データを自動復旧・マージ
      await triggerCloudSync(user);
    }
  } catch (err) {
    // ユーザーによるポップアップキャンセル等は通常警告
    if (err.code !== 'auth/popup-closed-by-user') {
      alert('ログインに失敗しました: ' + (err.message || '不明なエラー'));
    }
  }
}

/**
 * ログアウトハンドラー
 */
async function handleLogout() {
  if (!confirm('ログアウトしますか？（ローカルの思い出はそのまま閲覧・利用できます）')) return;
  try {
    await logout();
  } catch (err) {
    console.error('ログアウト失敗:', err);
  }
}

/**
 * 認証 UI の初期化
 * @param {Object} options
 * @param {string} [options.containerId='auth-container']
 * @param {Function} [options.onSyncComplete] (syncResult) => void
 */
export function initAuthUI(options = {}) {
  const containerId = options.containerId || 'auth-container';
  authContainer = document.getElementById(containerId);
  onSyncCompleteCallback = options.onSyncComplete || null;

  if (!authContainer) {
    console.warn(`認証コンテナ #${containerId} が見つかりません。`);
    return;
  }

  // 初回レンダリング（即座に現在状態で描画）
  const currentUser = getCurrentUser();
  renderAuthUI(currentUser);

  // 認証状態の変化を監視
  onAuthStateChangedWrapper(async (user) => {
    renderAuthUI(user);
    if (user) {
      // ログイン検知時にクラウド同期を自動実行
      await triggerCloudSync(user);
    }
  });
}
