// Renders the Stash icon set from the design (violet ground, white ticket, S in a heavy SF-like face).
// node scripts/make-icon.js <out dir> <Inter Display ExtraBold .otf>; needs Playwright's Chromium.
// Copy the PNGs into assets/ (icon.png and favicon.png without transparency).
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2];
const VIOLET = '#8B3DFF';
const font = 'data:font/otf;base64,' + require('fs').readFileSync(process.argv[3]).toString('base64');
const dots = ['#2563FF', '#00825A', '#E0007A', '#D14000', '#007A9E', '#8B3DFF']
  .map((c, i) => `<circle cx="${20 + i * 12}" cy="108" r="5" fill="${c}"/>`).join('');
const TICKET = 'M14 0H86A14 14 0 0 1 100 14V74A10 10 0 0 0 100 94V122A14 14 0 0 1 86 136H14A14 14 0 0 1 0 122V94A10 10 0 0 0 0 74V14A14 14 0 0 1 14 0Z';
const S = (fill) => `<text x="50" y="64" text-anchor="middle" font-family="IconS" font-size="56" font-weight="800" fill="${fill}">S</text>`;
const ticket = (scale) => `<g transform="translate(110 112) rotate(-8) scale(${scale}) translate(-50 -68)">
  <path d="${TICKET}" fill="#FFFFFF"/>${S(VIOLET)}
  <line x1="16" y1="84" x2="84" y2="84" stroke="#D9D9D9" stroke-width="2.5" stroke-dasharray="4 4" stroke-linecap="round"/>${dots}</g>`;
// Monochrome (Android themed icons use only the shape): the ticket with the S and dots cut out.
const mono = (scale) => `<mask id="m"><g transform="translate(110 112) rotate(-8) scale(${scale}) translate(-50 -68)">
  <path d="${TICKET}" fill="#fff"/>${S('#000')}<line x1="16" y1="84" x2="84" y2="84" stroke="#000" stroke-width="2.5" stroke-dasharray="4 4" stroke-linecap="round"/>
  ${[0,1,2,3,4,5].map(i=>`<circle cx="${20+i*12}" cy="108" r="5" fill="#000"/>`).join('')}</g></mask>
  <rect width="220" height="220" fill="#000" mask="url(#m)"/>`;
const svg = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 220 220">${bg ? `<rect width="220" height="220" fill="${bg}"/>` : ''}${body}</svg>`;
const files = {
  'icon.png': svg(ticket(1.2), VIOLET),            // iOS: square, iOS rounds the corners
  'android-icon-foreground.png': svg(ticket(0.95)), // inside the adaptive icon's safe zone
  'android-icon-background.png': svg('', VIOLET),
  'android-icon-monochrome.png': svg(mono(0.95)),
  'splash-icon.png': svg(ticket(1.2)),
  'preview.png': svg(ticket(1.2), VIOLET),
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  for (const [name, s] of Object.entries(files)) {
    await p.setContent(`<style>@font-face{font-family:IconS;src:url(${font});font-weight:800}html,body{margin:0;background:transparent}</style>${s}`);
    await p.evaluate(async () => { await document.fonts.load('800 56px IconS'); await document.fonts.ready; });
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(out, name), omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  }
  await b.close();
})();
