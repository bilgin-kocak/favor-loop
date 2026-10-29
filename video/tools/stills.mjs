// Renders stills at the given seconds from a bundle, reusing one browser: node tools/stills.mjs <bundle> <outdir> 1.0 4.5 ...
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";

const [bundle, outDir, ...times] = process.argv.slice(2);
const browserExecutable = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const browser = await openBrowser("chrome", { browserExecutable });
const composition = await selectComposition({ serveUrl: bundle, id: "FavorLoop", puppeteerInstance: browser, browserExecutable });
for (const s of times) {
  const frame = Math.round(Number(s) * composition.fps);
  await renderStill({ composition, serveUrl: bundle, frame, output: `${outDir}/t${String(s).padStart(5, "0")}.png`, puppeteerInstance: browser,
    browserExecutable, imageFormat: "png", scale: 0.5 });
  console.log("rendered", s);
}
await browser.close({ silent: true });
