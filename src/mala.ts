/**
 * 念珠。
 *
 * 佛珠正好 108 顆，所以「撥一顆」和「一輪」是同一個東西——
 * 珠環每敲一下轉 360/108 度，第 108 下剛好轉滿一圈回到原點，母珠回到拇指下。
 * 「108 回到原點」不是額外寫的規則，是這串珠子的幾何。
 */

export const BEADS = 108;

/** 一顆珠的角度。 */
export const STEP = 360 / BEADS;

// 一個大圓，圓心落在畫面下方很遠處，所以看得見的只有頂端那段平緩的弧——
// 就像手裡拿著一串垂下去的念珠。半徑放大也讓每顆珠子有 10 個單位的間距，
// 大到看得出是一顆一顆，而不是一條虛線。
const CX = 100;
const CY = 250;
const R = 175;

const NS = 'http://www.w3.org/2000/svg';

export function buildBeads(ring: SVGGElement): void {
  for (let i = 0; i < BEADS; i++) {
    // 0 號是母珠，起手就在拇指底下
    const rad = ((-90 + i * STEP) * Math.PI) / 180;
    const bead = document.createElementNS(NS, 'circle');
    bead.setAttribute('cx', (CX + R * Math.cos(rad)).toFixed(2));
    bead.setAttribute('cy', (CY + R * Math.sin(rad)).toFixed(2));
    bead.setAttribute('r', i === 0 ? '6.8' : '4.2');
    bead.setAttribute('fill', i === 0 ? 'url(#guru)' : 'url(#bead)');
    ring.append(bead);
  }
}

/** 撥到第 n 顆時，整串要轉到的角度。 */
export function angleFor(n: number): number {
  return -n * STEP;
}
