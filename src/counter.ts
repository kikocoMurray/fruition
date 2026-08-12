/**
 * 單次型計數：一次坐下敲完就結束，關掉分頁就歸零。
 *
 * 用 sessionStorage 而不是純記憶體，是因為 iOS Safari 會主動丟棄背景分頁——
 * 使用者切出去回個訊息再切回來，頁面會重新載入。純記憶體在那個瞬間歸零，
 * 那是 bug 不是設計。sessionStorage 的語意正好吻合：重新載入時保留，分頁關閉時清空。
 */

const KEY = 'muyu.session';

let count = 0;
const listeners = new Set<() => void>();

count = read();

export function getMerit(): number {
  return count;
}

export function tap(n = 1): void {
  count += n;
  scheduleFlush();
  emit();
}

export function reset(): void {
  count = 0;
  scheduleFlush();
  emit();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emit(): void {
  for (const cb of listeners) cb();
}

function read(): number {
  try {
    const n = Number.parseInt(sessionStorage.getItem(KEY) ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    // 無痕模式或 storage 被封鎖：純記憶體運作即可，不影響敲擊
    return 0;
  }
}

// 一秒可以敲八下，每下都同步寫 storage 會阻塞主執行緒並掉幀。
// 記憶體累加，離開視野或關閉前才落盤。
let timer: number | undefined;

function scheduleFlush(): void {
  if (timer !== undefined) return;
  timer = window.setTimeout(flush, 1000);
}

function flush(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  try {
    sessionStorage.setItem(KEY, String(count));
  } catch {
    // 同上：寫不進去就算了
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('pagehide', flush);
