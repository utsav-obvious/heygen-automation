import { test, expect, chromium, Page, Locator } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * HeyGen UI Health Check (read-only)
 *
 * Verifies that every element heygen-generate.spec.ts depends on can still be found,
 * WITHOUT uploading audio, editing the script, or submitting a video.
 * The selectors below mirror heygen-generate.spec.ts — keep them in sync if you change one.
 *
 * Usage:  npm run check:ui
 * Deep:   CHECK_GENERATE_DIALOG=1 npm run check:ui
 *         (also opens the "Generate" dialog to check the title input + Submit button,
 *          then closes it with Escape. Submit is NEVER clicked.)
 */

const TEMPLATE_URL = process.env.TEMPLATE_URL || 'https://app.heygen.com/create-v4/draft?template_id=c142c9f82bff4643b9d2d7841d68e237&private=1&panel=scene';
const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const CHECK_GENERATE_DIALOG = process.env.CHECK_GENERATE_DIALOG === '1';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'test-results', 'ui-health-check');

type CheckResult = { step: string; ok: boolean; detail: string };

test('HeyGen UI health check - selectors used by the automation still resolve', async () => {
    const results: CheckResult[] = [];
    const record = (step: string, ok: boolean, detail = '') => {
        results.push({ step, ok, detail });
        console.log(`  ${ok ? '✅' : '❌'} ${step}${detail ? ` — ${detail}` : ''}`);
    };
    const isVisible = (locator: Locator, timeout = 5000) =>
        locator.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const snap = (page: Page, name: string) =>
        page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) }).catch(() => null);

    console.log('════════════════════════════════════════════════════════════');
    console.log('🩺 HeyGen UI Health Check (read-only, no credits used)');
    console.log('════════════════════════════════════════════════════════════');

    // ── Connect ──────────────────────────────────────────────────────────
    const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    const context = browser.contexts()[0];
    if (!context) {
        throw new Error('No active browser context found. Make sure Chrome is running with --remote-debugging-port=9222');
    }
    const page = await context.newPage();

    try {
        // ── STEP 1 & 2: Editor loads (and we're still logged in) ─────────
        await page.goto(TEMPLATE_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(/create-v4|editor|video/, { timeout: 15000 }).catch(() => null);
        await page.waitForTimeout(7000);
        const url = page.url();
        record('Template editor loaded', /create-v4/.test(url) && !/login|signin|sign-in/i.test(url), url);
        await snap(page, '01-editor');

        // ── STEP 3a: Script area — "utsav" text OR "Add scene" button ────
        const utsavElement = page.getByText(/utsav/i).first();
        const addSceneBtn = page.locator('button').filter({ hasText: 'Add scene' }).first();
        const hasUtsav = await isVisible(utsavElement);
        const hasAddScene = !hasUtsav && await isVisible(addSceneBtn, 2000);
        record('Script entry point ("utsav" text or "Add scene" button)', hasUtsav || hasAddScene,
            hasUtsav ? 'found "utsav" text' : hasAddScene ? 'found "Add scene" button' : 'neither found');

        // ── STEP 3b: Audio toolbar → "Upload Audio" menu item ────────────
        const audioBtn = page.getByText('Audio', { exact: true }).first();
        const hasAudioBtn = await isVisible(audioBtn);
        record('"Audio" toolbar button', hasAudioBtn);

        const uploadOption = page.getByText('Upload Audio').filter({ hasText: /^Upload Audio$/ }).first();
        let hasUploadOption = false;
        let openedVia = '';
        if (hasAudioBtn) {
            await audioBtn.hover();
            hasUploadOption = await isVisible(uploadOption, 2000);
            openedVia = 'hover';
            if (!hasUploadOption) {
                await audioBtn.click();
                hasUploadOption = await isVisible(uploadOption, 2000);
                openedVia = 'click';
            }
        }
        if (!hasUploadOption) {
            const fallback = page.getByRole('button', { name: /upload audio/i }).first();
            if (await isVisible(fallback, 2000)) {
                hasUploadOption = true;
                openedVia = 'fallback "upload audio" button';
            }
        }
        record('"Upload Audio" menu item', hasUploadOption, hasUploadOption ? `appeared on ${openedVia}` : '');
        await snap(page, '02-audio-menu');

        // ── STEP 3c: Upload modal + file input (no file is uploaded) ─────
        if (hasUploadOption) {
            const target = openedVia.startsWith('fallback')
                ? page.getByRole('button', { name: /upload audio/i }).first()
                : uploadOption;
            await target.click();
            await page.waitForTimeout(2000);

            const dialog = page.locator('div[role="dialog"]').first();
            const hasDialog = await isVisible(dialog);
            record('Upload Audio dialog opens', hasDialog);

            const fileInputs = await page.locator('div[role="dialog"] input[type="file"]').count();
            record('File input inside dialog', fileInputs > 0, `${fileInputs} found`);
            await snap(page, '03-upload-dialog');

            await page.keyboard.press('Escape');
            await page.waitForTimeout(1000);
        } else {
            record('Upload Audio dialog opens', false, 'skipped — menu item not found');
            record('File input inside dialog', false, 'skipped — menu item not found');
        }

        // ── STEP 5: Generate button ──────────────────────────────────────
        const generateBtn = page.getByRole('button', { name: /generate/i })
            .or(page.locator('button:has-text("Generate")'))
            .first();
        const hasGenerate = await isVisible(generateBtn, 10000);
        record('"Generate" button', hasGenerate);

        // ── STEP 6 (opt-in): Generate dialog — title input + Submit ──────
        if (CHECK_GENERATE_DIALOG && hasGenerate) {
            await generateBtn.click();
            await page.waitForTimeout(2000);

            const dialog = page.locator('div[role="dialog"]').filter({ hasText: /generate|download/i }).last();
            record('Generate dialog opens', await isVisible(dialog));

            let titleInput = dialog.locator('input[type="text"]').first();
            if (!await titleInput.isVisible()) {
                titleInput = dialog.locator('input').filter({ hasNot: page.locator('[type="checkbox"],[type="radio"]') }).first();
            }
            record('Title input inside Generate dialog', await isVisible(titleInput, 3000));

            const submitBtn = page.getByRole('button', { name: /submit/i })
                .or(page.locator('button:has-text("Submit")'))
                .first();
            record('"Submit" button (NOT clicked)', await isVisible(submitBtn, 3000));
            await snap(page, '04-generate-dialog');

            await page.keyboard.press('Escape');
            await page.waitForTimeout(1000);
        } else if (!CHECK_GENERATE_DIALOG) {
            console.log('  ⏭️  Generate dialog check skipped (set CHECK_GENERATE_DIALOG=1 to include it)');
        }
    } finally {
        await page.close().catch(() => null);
    }

    // ── Summary ──────────────────────────────────────────────────────────
    const failed = results.filter(r => !r.ok);
    console.log('════════════════════════════════════════════════════════════');
    console.log(`🩺 ${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length > 0) {
        console.log('❌ Changed / missing UI elements:');
        failed.forEach(r => console.log(`   - ${r.step}${r.detail ? ` (${r.detail})` : ''}`));
    }
    console.log(`📸 Screenshots: ${SCREENSHOT_DIR}`);
    console.log('════════════════════════════════════════════════════════════');

    expect(failed.map(r => r.step), 'These UI elements could not be found — HeyGen UI may have changed').toEqual([]);
});
