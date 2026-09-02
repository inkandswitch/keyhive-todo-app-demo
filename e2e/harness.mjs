// Shared setup for the signing probes.
//
// These run against a live browser with a real keyhive identity, which is the
// point: every claim they check was at some stage asserted from source and
// turned out to need executing. Provenance is the argument, so the harness
// keeps the path from "what ran" to "what is reported" as short as possible.

import { chromium } from "playwright";

const DEFAULT_URL = process.env.PROBE_URL ?? "http://127.0.0.1:5557/";
const CHROMIUM =
  process.env.PROBE_CHROMIUM ?? "/etc/profiles/per-user/expede/bin/chromium";

/**
 * Boot the demo, run `fn` in the page, print the result as JSON.
 *
 * A throwaway profile by default: these probes only need *an* identity, not a
 * particular one, and reusing the persistent profile would tie their results
 * to whatever state that account has accumulated.
 */
export async function probe(name, fn) {
  const ctx = await chromium.launchPersistentContext(
    process.env.PROBE_PROFILE ?? `/tmp/probe-${name}-${Date.now()}`,
    { executablePath: CHROMIUM, headless: true }
  );
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on("pageerror", (e) =>
    console.error(`  [pageerror] ${String(e.message).slice(0, 160)}`)
  );

  try {
    await page.goto(DEFAULT_URL, { waitUntil: "domcontentloaded" });
    // The name box is the last thing to render, so it stands in for "the app
    // is up". Keyhive needs longer still before an identity exists.
    await page.waitForSelector('input[aria-label="Name to resolve"]', {
      timeout: 90_000,
    });
    await page.waitForTimeout(Number(process.env.PROBE_SETTLE ?? 11_000));

    const result = await page.evaluate(fn);
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await ctx.close();
  }
}

/** Hex, spaced, for eyeballing byte layouts. */
export const HEX_HELPER = `
  const hex = (b, n) => [...b.slice(0, n ?? b.length)]
    .map((x) => x.toString(16).padStart(2, "0")).join(" ");
`;
