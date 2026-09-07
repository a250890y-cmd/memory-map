import { defineConfig } from 'vite';

export default defineConfig({
  // 相対パスベースに設定し、ローカル開発環境やサブディレクトリ配信でのパス不整合を解消
  base: './',
  server: {
    port: 5173,
    open: false
  }
});
