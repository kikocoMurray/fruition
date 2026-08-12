import { defineConfig } from 'vite';

// GitHub Pages 的專案站台掛在 https://kikocomurray.github.io/fruition/，
// 不是網域根目錄。base 沒設對的話，打包出來的 /assets/*.js 會去敲網域根目錄，
// 整頁白畫面——這是專案站台最常見的一種部署失敗。
export default defineConfig({
  base: '/fruition/',
});
