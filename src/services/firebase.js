/**
 * Memory Map - Firebase 初期化モジュール
 * 環境変数 (import.meta.env) から設定を読み込み、Firebase App、Auth、Firestore、Storage を初期化します。
 * 環境変数が未設定の場合でもアプリがクラッシュしないよう安全ガードを実装しています。
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app = null;
let auth = null;
let db = null;
let storage = null;
let isFirebaseInitialized = false;

// APIキーおよびプロジェクトIDが設定されているか検証
const isConfigValid = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId
);

if (isConfigValid) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    // ブラウザ内セッションの永続化
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn("Auth persistence error:", err);
    });

    isFirebaseInitialized = true;
    console.log("Firebase サービスが正常に初期化されました。");
  } catch (err) {
    console.error("Firebase 初期化エラー:", err);
  }
} else {
  console.warn("Firebase の環境変数が設定されていないか不完全です。クラウド同期機能はスキップされます。");
}

export { app, auth, db, storage, isFirebaseInitialized };
