// Two real browsers, fake cameras: join → see each other → request → accept →
// chat both ways → video (blurred until revealed) → block. Screenshots → docs/proof/.
//   BASE=http://localhost:3210 node tests/e2e-two-users.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire("/Users/mcknx/develop/personal/playground-macos/package.json")("playwright");
const BASE = process.env.BASE || "http://localhost:3210";
const OUT = new URL("../docs/proof/", import.meta.url).pathname;
const b = await chromium.launch({
  executablePath: process.env.CHROME || "/Users/mcknx/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
let fail = 0;
const ok = (c, m) => { console.log(`${c ? "  ok  " : "  FAIL"} ${m}`); if (!c) fail++; };
const user = async (name, lat, lng) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, geolocation: { latitude: lat, longitude: lng }, permissions: ["geolocation", "camera", "microphone"] });
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(BASE + "/"); await p.getByRole("button", { name: /Drop onto the map/ }).click();
  return p;
};
const A = await user("A", 14.6, 121.0), B = await user("B", 1.35, 103.8);
await A.waitForSelector(".pulse-dot", { timeout: 30000 }); await B.waitForSelector(".pulse-dot", { timeout: 30000 });
await A.waitForTimeout(3500); // let the fly-in settle
await A.screenshot({ path: OUT + "1-map.png" });
ok(await A.locator(".pulse-dot").count() === 1, "A sees exactly one stranger");

await A.locator(".pulse-dot").first().click({ force: true });
await B.getByText("A stranger is saying hi").waitFor({ timeout: 15000 });
await B.screenshot({ path: OUT + "2-request.png" });
await B.getByRole("button", { name: "Say hi back" }).click();
await A.getByText("Connected · peer-to-peer").waitFor({ timeout: 30000 });
await B.getByText("Connected · peer-to-peer").waitFor({ timeout: 30000 });
ok(true, "both connected peer-to-peer");

await A.getByLabel("Message").fill("hey from Manila 👋"); await A.getByLabel("Message").press("Enter");
await B.getByText("hey from Manila 👋").waitFor({ timeout: 10000 });
await B.getByLabel("Message").fill("hello from Singapore!"); await B.getByLabel("Message").press("Enter");
await A.getByText("hello from Singapore!").waitFor({ timeout: 10000 });
ok(true, "chat works both ways");
await A.waitForTimeout(800);
await A.screenshot({ path: OUT + "3-chat.png" });

await A.getByLabel("Ask to start video").click();
await B.getByRole("button", { name: "Turn on video" }).click();
await A.getByText("Their video is blurred").waitFor({ timeout: 30000 });
await A.waitForTimeout(700);
await A.screenshot({ path: OUT + "4-video-blurred.png" });
ok(true, "video arrives blurred");
await A.getByRole("button", { name: "Show their video" }).click();
await A.waitForTimeout(2000);
const w = await A.locator('[data-testid="remote-video"]').evaluate((v) => v.videoWidth);
ok(w > 0, `remote video is playing (${w}px wide)`);
await A.screenshot({ path: OUT + "5-video-revealed.png" });
await A.getByRole("button", { name: "End video" }).click();

await A.getByLabel("Block this stranger").click();
await A.getByRole("button", { name: "Block", exact: true }).click();
await B.getByText("The stranger left the conversation.").waitFor({ timeout: 15000 });
await A.waitForTimeout(3000);
ok(await A.locator(".pulse-dot").count() === 0 && (await B.locator(".pulse-dot").count()) === 0, "after block, neither sees the other");
ok(A.errs.length + B.errs.length === 0, `no page errors ${[...A.errs, ...B.errs].join(" | ")}`);
await b.close();
console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
