// title-anim.js — the Verdant Signal wordmark shared by desktop and the mobile gate.
//
// It lives in its own module for ONE reason: the mobile gate must be able to draw the real logo without
// importing main.js. Pulling main.js in would execute its whole module scope — ~96 image requests and the
// entire sim graph — on a device that never renders a world. So this file, crt.js and pixel.js are the only
// things the gate loads, and none of them fetch art beyond the single sheet below.
//
// Keeping ONE copy of the frame maths also means the two screens cannot drift: the same loop, the same
// pause, the same fallback wordmark.

import { drawText, textWidth } from './pixel.js';

export const TITLE_SHEET = { cols: 1, rows: 1, frames: 1, fw: 256, fh: 47, ms: 0 };

// #firstframe START THE TITLE EARLY. This used to be fetched on the first DRAW of the start screen, which is
// the worst possible moment: the boot screen hands over, the start screen appears, and only THEN does a 393KB
// sheet begin downloading — so the very first thing a new visitor saw was the 3x5 font wordmark, which then
// swapped to the animated title. Kicked off on import so it downloads alongside everything else, and the boot
// gate waits for it on a plain visit (see firstFrameArtChecks), where the start screen IS the first frame.
let titleImg = null, titleSettled = false;
(function preloadTitle() {
    const im = new Image();
    im.fetchPriority = 'high';
    im.addEventListener('load', () => { titleImg = im; titleSettled = true; }, { once: true });
    im.addEventListener('error', () => { titleSettled = true; }, { once: true });   // never hold the boot
    im.src = './assets/verdant-signal/title.png';
})();

// settled = loaded OR failed. The boot gate waits on this, so it must go true either way or a dead asset
// would hold a visitor on the static screen until the ceiling fires.
export function isTitleSettled() { return titleSettled; }

// The animated title, centred at (cx, topY); returns the y just below it. Falls back to the font wordmark.
// `gw` is the canvas width, used only to pick the fallback's scale.
export function drawTitleArt(ctx, cx, topY, maxW, gw) {
    if (titleImg && titleImg.width) {
        const T = TITLE_SHEET;
        const sc = Math.min(maxW / T.fw, 2.4), w = Math.round(T.fw * sc), h = Math.round(T.fh * sc);
        const dx = Math.round(cx - w / 2), dy = Math.round(topY);
        const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(titleImg, 0, 0, T.fw, T.fh, dx, dy, w, h); ctx.imageSmoothingEnabled = sm;
        return dy + h;
    }
    const s = gw < 400 ? 2 : 3, tw = textWidth('VERDANT SIGNAL', s), tx = Math.round(cx - tw / 2), ty = Math.round(topY + 20);
    drawText(ctx, 'VERDANT SIGNAL', tx + 1, ty + 1, 'rgba(0,0,0,0.6)', s);
    drawText(ctx, 'VERDANT SIGNAL', tx, ty, '#8fffc1', s);
    return ty + 5 * s;
}
