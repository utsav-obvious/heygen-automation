import { test, chromium, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Configuration from environment variables
const AUDIO_FILE_PATH = process.env.AUDIO_PATH;
// const AUDIO_FILE_PATH = "/Users/utsavchindalia/Documents/Obvious/Pratham/Heygen_automation/audio_test/audited-script-1767756364837.mp3";
const TEMPLATE_URL = process.env.TEMPLATE_URL || 'https://app.heygen.com/create-v4/draft?template_id=c142c9f82bff4643b9d2d7841d68e237&private=1&panel=scene';
const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const VIDEO_NAME = process.env.VIDEO_NAME;

test(`Automate HeyGen V4 Video Generation - ${VIDEO_NAME || (AUDIO_FILE_PATH ? path.basename(AUDIO_FILE_PATH) : 'Unknown')}`, async () => {
    // Validate audio file exists
    if (!AUDIO_FILE_PATH || !fs.existsSync(AUDIO_FILE_PATH)) {
        throw new Error(`Audio file not found at: ${AUDIO_FILE_PATH}`);
    }

    console.log('════════════════════════════════════════════════════════════');
    console.log('🎬 HeyGen V4 Video Generation - CDP Automation');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`📁 Audio file: ${AUDIO_FILE_PATH}`);
    console.log(`📋 Template URL: ${TEMPLATE_URL}`);
    console.log('');

    // ═══════════════════════════════════════════════════════════════════
    // CONNECT: Connect to existing Chrome instance via CDP
    // ═══════════════════════════════════════════════════════════════════
    console.log('🔌 Connecting to Chrome via CDP...');
    const browser = await chromium.connectOverCDP(CDP_ENDPOINT);

    const defaultContext = browser.contexts()[0];
    if (!defaultContext) {
        throw new Error('No active browser context found. Make sure Chrome is running with --remote-debugging-port=9222');
    }

    // Close ONLY the previous HeyGen tab to save memory while preserving other tabs
    const existingPages = defaultContext.pages();
    for (let i = existingPages.length - 1; i >= 0; i--) {
        const p = existingPages[i];
        if (p.url().includes('heygen.com')) {
            try {
                await p.close();
                console.log('✓ Closed previous HeyGen tab');
            } catch (e) {
                // Ignore errors for already closed pages
            }
            break; // Only close the most recent one
        }
    }

    // Always open a new page to avoid hijacking the localhost tab (which kills the server action)
    let page = await defaultContext.newPage();

    // Safety net for the name-card (GSAP) stretch bug: force playback "freeze" on GSAP
    // elements in the submit request. The primary fix is the editor reload in STEP 4.5.
    await page.route('**/v1/text_draft.generate', async (route) => {
        try {
            const body = route.request().postDataJSON();
            const patched = forceGsapFreeze(body);
            if (patched > 0) {
                console.log(`🛡️ Submit guard: set playback "freeze" on ${patched} GSAP element(s)`);
                await route.continue({ postData: JSON.stringify(body) });
                return;
            }
        } catch (e) {
            console.log(`⚠️ Submit guard could not inspect request: ${e}`);
        }
        await route.continue();
    });

    console.log('✓ Connected to Chrome\n');

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1 & 2: Navigate directly to Template Editor
    // ═══════════════════════════════════════════════════════════════════
    console.log('📍 STEP 1 & 2: Navigating directly to HeyGen Template Editor...');
    await page.goto(TEMPLATE_URL, { waitUntil: 'domcontentloaded' });

    console.log('⏳ Waiting for editor to load...');
    await page.waitForURL(/create-v4|editor|video/, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(5000); // Let editor fully render
    console.log('✓ Editor loaded\n');

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Open Audio Panel & Upload Audio
    // ═══════════════════════════════════════════════════════════════════
    console.log('🎵 STEP 3: Opening Audio panel...');

    // EXTRA STEP: Wait for the script editor area to fully load and hydrate
    console.log('  Waiting for script text or "Add scene" button to be visible...');
    await page.waitForTimeout(2000);

    // NEW LOGIC: Clear existing "utsav" text OR click "Add scene" as per latest UI change
    // Using getByText with regex is more resilient than looking only for 'span' with exact match.
    const utsavElement = page.getByText(/utsav/i).first();
    const addSceneBtn = page.locator('button').filter({ hasText: 'Add scene' }).first();

    // Extra step: Try waiting up to 5 seconds specifically for the text to appear
    try {
        await utsavElement.waitFor({ state: 'visible', timeout: 5000 });
    } catch (e) {
        console.log('  "utsav" text not found within timeout, will check for "Add scene"...');
    }

    if (await utsavElement.isVisible()) {
        // Triple click to ensure focus and sub-selection
        await utsavElement.click({ clickCount: 3 });
        await page.waitForTimeout(500);

        const isMac = process.platform === 'darwin';
        const modifier = isMac ? 'Meta' : 'Control';

        // Perform aggressive clearing sequence
        await page.keyboard.press(`${modifier}+a`);
        await page.waitForTimeout(200);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);
        await page.keyboard.press('Delete'); // Fallback for some editors

        console.log('  Script clear sequence performed.');
        await page.waitForTimeout(1000);

        // After clearing, "Upload audio" button should be visible
        // Using a regex to be more flexible with casing/spacing
        const uploadAudioBtn = page.getByRole('button', { name: /upload audio/i }).first();
        if (await uploadAudioBtn.isVisible()) {
            console.log('  Clicking "Upload audio" button...');
            await uploadAudioBtn.click();
            await page.waitForTimeout(1000);
        } else {
            // Check if it's just text that needs clicking
            const uploadAudioTextFallback = page.locator('button, div, span').filter({ hasText: /^Upload audio$/i }).first();
            if (await uploadAudioTextFallback.isVisible()) {
                console.log('  Clicking "Upload audio" (text-based fallback)...');
                await uploadAudioTextFallback.click();
                await page.waitForTimeout(1000);
            }
        }
    } else if (await addSceneBtn.isVisible()) {
        console.log('  "utsav" not found, but "Add scene" visible. Clicking it...');
        await addSceneBtn.click();
        await page.waitForTimeout(1000);

        const uploadAudioBtn = page.locator('button').filter({ hasText: 'Upload audio' }).first();
        if (await uploadAudioBtn.isVisible()) {
            console.log('  Clicking "Upload audio" button...');
            await uploadAudioBtn.click();
            await page.waitForTimeout(1000);
        }
    } else {
        console.log('  Neither "utsav" script nor "Add scene" found. Trying global search for Upload Audio options...');
        const uploadOptionFallback = page.getByRole('button', { name: /upload audio/i }).first();
        if (await uploadOptionFallback.isVisible()) {
            console.log('  Clicking "Upload audio" (fallback trigger)...');
            await uploadOptionFallback.click();
            await page.waitForTimeout(1000);
        } else {
            throw new Error('STEP 3 FAILED: Could not find any way to open audio upload (no "utsav" text, no "Add scene" button, no "Upload audio" button).');
        }
    }

    // Check if the "Upload Audio" modal is ALREADY open (by title)
    // The modal usually has "Upload Audio" as a header and a "Record Audio" tab
    const uploadModalHeader = page.locator('div[role="dialog"]').filter({ hasText: 'Upload Audio' }).first();
    const isModalOpen = await uploadModalHeader.isVisible();

    if (isModalOpen) {
        console.log('✓ Audio upload modal is already open');
    } else {
        // We need to open the modal via the "Audio" menu
        console.log('  Interacting with Audio menu...');

        // 1. Find the main Audio button/text in the timeline toolbar
        // Based on user screenshot: it's "Audio" icon/text
        const audioBtn = page.getByText('Audio', { exact: true }).first();

        // 2. Hover first (as user reported it appears on hover)
        console.log('  Hovering over Audio button...');
        await audioBtn.hover();
        await page.waitForTimeout(1000);

        // 3. Check for "Upload Audio" menu item
        const uploadOption = page.getByText('Upload Audio').filter({ hasText: /^Upload Audio$/ }).first();

        if (await uploadOption.isVisible()) {
            console.log('  "Upload Audio" menu item appeared on hover');
            await uploadOption.click();
        } else {
            console.log('  Hover didn\'t work, trying click on Audio button...');
            await audioBtn.click();
            await page.waitForTimeout(1000);

            if (await uploadOption.isVisible()) {
                console.log('  "Upload Audio" menu item appeared on click');
                await uploadOption.click();
            } else {
                // Fallback: It might be "Audio to script" -> "Upload Audio"
                console.log('  Trying fallback selector for Upload Audio...');
                await page.getByRole('button', { name: /upload audio/i }).first().click();
            }
        }
        console.log('✓ Clicked "Upload Audio"');
    }

    await page.waitForTimeout(2000);

    // Look for file input in the opened modal
    console.log(`📤 Uploading audio: ${path.basename(AUDIO_FILE_PATH)}`);

    // Upload the audio file
    // We target the input specifically inside the dialog to be safe
    const fileInput = page.locator('div[role="dialog"] input[type="file"]').first();

    try {
        await fileInput.setInputFiles(AUDIO_FILE_PATH);

        // CRITICAL FIX: Sometimes setInputFiles doesn't trigger the React 'change' listener
        // We force a change event to ensure the upload starts
        // await fileInput.evaluate(e => e.dispatchEvent(new Event('change', { bubbles: true })));

        console.log('✓ Audio file uploaded (and change event forced)');
    } catch (e) {
        // Fallback to generic input if dialog specific one fails
        console.log('  Dialog specific input not found, trying generic...');
        try {
            await page.locator('input[type="file"]').first().setInputFiles(AUDIO_FILE_PATH);
        } catch (e2) {
            throw new Error(`STEP 3 FAILED: Could not upload audio file. Dialog input error: ${e}. Generic input error: ${e2}`);
        }
    }

    // Wait for upload to complete - INCREASED TIMEOUT
    // User reported it takes 20-25 seconds
    console.log('⏳ Waiting for upload processing (this can take ~30s)...');

    // Wait a fixed buffer time for the upload to at least START and ideally finish
    // We can't always rely on the filename appearing if the UI truncates it
    await page.waitForTimeout(35000);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Click "Add Audio" Button
    // ═══════════════════════════════════════════════════════════════════
    console.log('➕ STEP 4: Adding audio to video...');

    const uploadedFileName = path.basename(AUDIO_FILE_PATH);
    console.log(`  Target file: ${uploadedFileName}`);

    // Definition of the "Add audio" button (only visible ones)
    const confirmAddBtn = page.getByRole('button', { name: /add audio|apply/i }).locator('visible=true');

    // CHECK 1: Is the dialog ALREADY open? (Sometimes auto-opens after upload)
    if (await confirmAddBtn.count() > 0) {
        console.log('  "Add audio" button found immediately (Dialog auto-opened?)');
        await confirmAddBtn.first().click();
        console.log('✓ Clicked "Add audio" (Immediate)');
    } else {
        // Dialog not open, need to click the row
        console.log('  Dialog not open, attempting to click audio row...');

        // 1. Find the row
        const audioRow = page.locator('div, li').filter({ hasText: uploadedFileName }).first();

        if (await audioRow.count() === 0) {
            // Debug: Print some visible text to see what's wrong
            const bodyText = await page.locator('body').innerText();
            console.log(`  Page sample text: ${bodyText.slice(0, 200)}...`);
            throw new Error(`STEP 4 FAILED: Could not find audio row for "${uploadedFileName}".`);
        } else {
            // 2. Click the row (try container if possible)
            const clickableRow = audioRow.locator('xpath=ancestor::div[contains(@class, "group") or @draggable="true"]').first();

            if (await clickableRow.count() > 0) {
                await clickableRow.click();
            } else {
                await audioRow.click();
            }
            console.log('✓ Clicked audio row');
        }

        // 3. Wait for button to appear
        console.log('⏳ Waiting for "Add audio" button...');
        try {
            await confirmAddBtn.first().waitFor({ state: 'visible', timeout: 5000 });
            await confirmAddBtn.first().click();
            console.log('✓ Clicked "Add audio" confirmation button');
        } catch (e) {
            console.log('❌ "Add audio" button did not appear after row click.');
            // Fallback: Try Force Click if it exists but is "hidden" to Playwright
            const hiddenBtn = page.getByRole('button', { name: /add audio|apply/i }).last();
            if (await hiddenBtn.isVisible() === false && await hiddenBtn.count() > 0) {
                console.log('  Button exists but is not visible. Attempting force click...');
                await hiddenBtn.click({ force: true });
                console.log('✓ Force clicked hidden button');
            } else {
                throw new Error('STEP 4 FAILED: "Add audio" button not found at all after clicking audio row.');
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4.5: Reload editor so the name card isn't stretched
    // ═══════════════════════════════════════════════════════════════════
    // When the template loads, its scene is only 0.4s ("utsav"), so HeyGen's editor marks the
    // 4.4s name-card animation as "fit_to_scene" in its in-memory state. Autosaves send a
    // corrected copy ("freeze"), but Generate submits the stale in-memory state, so the card
    // gets stretched across the whole video. Reloading after the audio is saved makes HeyGen
    // recompute it against the real scene length, which yields "freeze".
    console.log('🔄 STEP 4.5: Waiting for draft save, then reloading editor...');
    await page.waitForResponse(
        (r) => r.url().includes('/v1/text_draft.save') && r.request().method() === 'POST',
        { timeout: 20000 }
    ).catch(() => console.log('  ⚠️ No draft save observed within 20s, continuing'));
    await page.waitForTimeout(6000); // Second autosave (with transcript words) lands a few seconds later

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /generate/i }).first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(5000); // Let editor fully render

    const playbackModes = await getGsapPlaybackModes(page);
    console.log(`  Name card playback after reload: ${playbackModes ? playbackModes.join(', ') : 'unknown'}`);
    if (playbackModes?.includes('fit_to_scene')) {
        throw new Error('STEP 4.5 FAILED: Name card is still "fit_to_scene" after reload. Not submitting, to avoid a stretched video.');
    }
    console.log('✓ Editor reloaded\n');

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: Click "Generate" Button
    // ═══════════════════════════════════════════════════════════════════
    console.log('🚀 STEP 5: Clicking Generate...');

    const generateBtn = page.getByRole('button', { name: /generate/i })
        .or(page.locator('button:has-text("Generate")'))
        .first();

    try {
        await generateBtn.waitFor({ state: 'visible', timeout: 10000 });
        await generateBtn.click();
        console.log('✓ Generate clicked\n');
    } catch (e) {
        throw new Error('Could not find Generate button. The UI may have changed.');
    }

    await page.waitForTimeout(2000);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 6: Update Video Title & Submit
    // ═══════════════════════════════════════════════════════════════════
    console.log('✅ STEP 6: Updating video title and submitting...');

    try {

        // 1. Wait for "Generate video" dialog header to confirm logic
        // 2. Find the Title input
        // CRITICAL FIX: Ensure we only look inside the DIALOG.
        // Otherwise we might pick up the editor title in the background which is covered by the backdrop.
        const dialog = page.locator('div[role="dialog"]').filter({ hasText: /generate|download/i }).last();

        // We'll use the most generic, stable input selector inside this specific dialog
        // This avoids the "locator broke because value changed" issue
        let titleInputCheck = dialog.locator('input[type="text"]').first();

        // If standard text input missing, look for ANY input that is visible
        if (!await titleInputCheck.isVisible()) {
            titleInputCheck = dialog.locator('input').filter({ hasNot: page.locator('[type="checkbox"],[type="radio"]') }).first();
        }

        // Now act on the found input
        if (await titleInputCheck.isVisible()) {
            console.log('  Found Title input inside dialog.');

            if (VIDEO_NAME) {
                console.log(`📝 Setting video title to: ${VIDEO_NAME}`);

                // Just use fill() - it automatically focuses and clears the field
                // No need for complex press sequences that might fail or need stable locators
                try {
                    await titleInputCheck.fill(VIDEO_NAME);
                    console.log('✓ Video title updated');
                } catch (e) {
                    console.log(`⚠️ Standard fill failed (${e}). Trying click + type...`);
                    await titleInputCheck.click();
                    await page.keyboard.type(VIDEO_NAME);
                }
            } else {
                console.log('  No VIDEO_NAME provided, keeping default.');
            }
        } else {
            throw new Error('STEP 6 FAILED: Could not find Title input inside the dialog to rename video.');
        }

        // 3. Click Submit
        const submitBtn = page.getByRole('button', { name: /submit/i })
            .or(page.locator('button:has-text("Submit")'))
            .first();

        await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
        await submitBtn.click(); // COMMENTED OUT TO SAVE CREDITS
        console.log('✓ Video submitted for generation (SIMULATED)\n');

    } catch (e) {
        console.log(`  Error during submission: ${e}`);
        console.log('  Attempting fallback submission...');

        // Fallback: just try to click anything that looks like a confirm button
        // "Submit", "Generate", "Yes"
        const fallbackBtn = page.locator('button').filter({ hasText: /submit|generate|confirm/i }).last();
        if (await fallbackBtn.isVisible()) {
            await fallbackBtn.click(); // COMMENTED OUT TO SAVE CREDITS
            console.log('✓ Video submitted via fallback button (SIMULATED)\n');
        } else {
            console.log('❌ Could not submit video generation.');
            throw e;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // DONE
    // ═══════════════════════════════════════════════════════════════════
    console.log('════════════════════════════════════════════════════════════');
    console.log('🎉 SUCCESS! Video generation submitted to HeyGen.');
    console.log('   Check your HeyGen dashboard for the rendered video.');
    console.log('════════════════════════════════════════════════════════════\n');

    // Keep browser open for user to see result
});

// Sets content.playback = "freeze" on every GSAP element found anywhere in the payload.
// Returns how many elements were changed.
function forceGsapFreeze(node: unknown): number {
    if (!node || typeof node !== 'object') return 0;
    let changed = 0;
    const obj = node as Record<string, any>;
    if (obj.type === 'gsap' && obj.content && typeof obj.content === 'object' && obj.content.playback !== 'freeze') {
        obj.content.playback = 'freeze';
        changed++;
    }
    for (const value of Object.values(obj)) changed += forceGsapFreeze(value);
    return changed;
}

// Reads the playback mode of GSAP elements from the HeyGen editor's in-memory (Redux) draft.
// Returns null if the store can't be found (e.g. HeyGen changed its internals).
async function getGsapPlaybackModes(page: Page): Promise<string[] | null> {
    return page.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll('body *'))) {
            const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
            if (!fiberKey) continue;
            for (let f = (el as any)[fiberKey], i = 0; f && i < 200; i++, f = f.return) {
                const store = f.memoizedProps?.store;
                if (store?.getState) {
                    const elements = store.getState().draftCanvasV4?.present?.draft?.text_draft?.visual?.elements;
                    if (!elements) return null;
                    return Object.values(elements as Record<string, any>)
                        .filter((e) => e?.type === 'gsap')
                        .map((e) => String(e.content?.playback));
                }
            }
        }
        return null;
    });
}
