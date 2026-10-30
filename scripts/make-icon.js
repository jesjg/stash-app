// Renders the Stash icon set from the design (stash-app-icon.svg): a white ticket with a big
// violet S and pink, blue and green dots, tilted on violet. The S is drawn in the heavy face given
// (Inter Display ExtraBold stands in for SF Heavy) and baked into the PNGs.
// node scripts/make-icon.js <out dir> <Inter Display ExtraBold .otf>; needs Playwright's Chromium.
// Copy the PNGs into assets/ (icon.png and favicon.png without transparency).
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2];
const font = 'data:font/otf;base64,' + require('fs').readFileSync(process.argv[3]).toString('base64');
const VIOLET = '#9747FF';
const DOTS = ['#FF2D95', '#1E7BFF', '#00D16C'];
const TICKET = 'M14 0H86A14 14 0 0 1 100 14V74A10 10 0 0 0 100 94V122A14 14 0 0 1 86 136H14A14 14 0 0 1 0 122V94A10 10 0 0 0 0 74V14A14 14 0 0 1 14 0Z';
const S = (fill) => `<text x="50" y="80" text-anchor="middle" font-family="IconS" font-size="80" font-weight="800" fill="${fill}">S</text>`;
const place = (scale) => `transform="translate(110 110) rotate(-8) scale(${scale}) translate(-50 -68)"`;
const dots = (fill) => DOTS.map((c, i) => `<circle cx="${26 + i * 24}" cy="110" r="8" fill="${fill ?? c}"/>`).join('');
const ticket = (scale) => `<g ${place(scale)}><path d="${TICKET}" fill="#FFFFFF"/>${S(VIOLET)}${dots()}</g>`;
// Monochrome (Android themed icons use only the shape): the ticket with the S and dots cut out.
const mono = (scale) => `<mask id="m"><g ${place(scale)}><path d="${TICKET}" fill="#fff"/>${S('#000')}${dots('#000')}</g></mask>
  <rect width="220" height="220" fill="#000" mask="url(#m)"/>`;
const svg = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 220 220">${bg ? `<rect width="220" height="220" fill="${bg}"/>` : ''}${body}</svg>`;
const files = {
  'icon.png': svg(ticket(1.2), VIOLET), // iOS: square, iOS rounds the corners
  'android-icon-foreground.png': svg(ticket(0.95)), // inside the adaptive icon's safe zone
  'android-icon-background.png': svg('', VIOLET),
  'android-icon-monochrome.png': svg(mono(0.95)),
  'splash-icon.png': svg(ticket(1.2)),
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  for (const [name, s] of Object.entries(files)) {
    await p.setContent(`<style>@font-face{font-family:IconS;src:url(${font});font-weight:800}html,body{margin:0;background:transparent}</style>${s}`);
    await p.evaluate(async () => {
      await document.fonts.load('800 80px IconS');
      await document.fonts.ready;
    });
    await p.screenshot({ path: path.join(out, name), omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  }
  await b.close();
})();
