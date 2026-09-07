/**
 * Memory Map - 認証サービスモジュール
 * Google ログイン、メール認証、ログアウト、および認証状態の監視を提供します。
 * Firebase 未設定・未初期化時でもエラーで画面を止めない安全ガードを実装しています。
 */

import { auth, isFirebaseInitialized } from './firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

/**
 * Googleアカウントでポップアップログイン
 * @returns {Promise<Object>} ログインしたユーザーオブジェクト
 */
export async function loginWithGoogle() {
  if (!isFirebaseInitialized || !auth) {
    throw new Error('Firebase が初期化されていないため、Google ログインを実行できません。');
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google ログインエラー:', error);
    throw error;
  }
}

/**
 * ログアウト
 * @returns {Promise<void>}
 */
export async function logout() {
  if (!isFirebaseInitialized || !auth) return;

  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('ログアウトエラー:', error);
    throw error;
  }
}

/**
 * 現在ログイン中のユーザーを取得
 * @returns {Object|null}
 */
export function getCurrentUser() {
  if (!isFirebaseInitialized || !auth) return null;
  return auth.currentUser;
}

/**
 * 認証状態の変更を監視するリスナー
 * @param {Function} callback (user: Object|null) => void
 * @returns {Function} リスナー解除関数
 */
export function onAuthStateChangedWrapper(callback) {
  if (!isFirebaseInitialized || !auth) {
    // Firebase 未初期化時は未ログイン(null)として通知
    if (typeof callback === 'function') callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

/**
 * メール・パスワードによるログイン（互換用）
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<Object>}
 */
export async function loginWithEmail(email, password) {
  if (!isFirebaseInitialized || !auth) {
    throw new Error('Firebase が初期化されていません。');
  }
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

/**
 * メール・パスワードによる新規登録（互換用）
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<Object>}
 */
export async function signupWithEmail(email, password) {
  if (!isFirebaseInitialized || !auth) {
    throw new Error('Firebase が初期化されていません。');
  }
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}
