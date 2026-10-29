// Records the simulated board for the video: node tools/record-board.cjs <outdir> [board url]
// Then: ffmpeg -ss 2 -t 12 -i <outdir>/*.webm -c:v libx264 -crf 18 -pix_fmt yuv420p -r 30 public/board-sim.mp4
const { chromium } = require("playwright");
(async () => {
  const url = process.argv[3] || "http://localhost:8080/board?view=sim";
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: process.argv[2], size: { width: 1920, height: 1080 } } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  // a local server without a bot token says "starting soon" here; production shows the real bot
  await page.evaluate(() => { const a = document.querySelector(".join a"); if (a) a.textContent = "t.me/favor_loop_village_bot"; });
  await page.waitForTimeout(14500);
  await context.close();
  await browser.close();
})();
