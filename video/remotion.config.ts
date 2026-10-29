import { Config } from "@remotion/cli/config";

// The pre-installed headless Chromium: no browser download needed.
Config.setBrowserExecutable("/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setConcurrency(4);
Config.setCodec("h264");
Config.setCrf(18);
