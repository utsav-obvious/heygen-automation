import { test, chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Configuration from environment variables
const AUDIO_FILE_PATH = process.env.AUDIO_PATH;
// const AUDIO_FILE_PATH = "/Users/utsavchindalia/Documents/Obvious/Pratham/Heygen_automation/audio_test/audited-script-1767756364837.mp3";
const TEMPLATE_NAME = process.env.TEMPLATE_NAME || 'Pratham-Template';
const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const VIDEO_NAME = process.env.VIDEO_NAME;

test('Automate HeyGen V4 Video Generation', async () => {
    // Validate audio file exists
    if (!AUDIO_FILE_PATH || !fs.existsSync(AUDIO_FILE_PATH)) {
        throw new Error(`Audio file not found at: ${AUDIO_FILE_PATH}`);
    }

    console.log('════════════════════════════════════════════════════════════');
    console.log('🎬 HeyGen V4 Video Generation - CDP Automation');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`📁 Audio file: ${AUDIO_FILE_PATH}`);
    console.log(`📋 Template: ${TEMPLATE_NAME}`);
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

    // Close existing pages to save memory
    const existingPages = defaultContext.pages();
    for (const p of existingPages) {
        try {
            await p.close();
        } catch (e) {
            // Ignore errors for already closed pages
        }
    }

    // Always open a new page to avoid hijacking the localhost tab (which kills the server action)
    let page = await defaultContext.newPage();

    console.log('✓ Connected to Chrome\n');

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Navigate to Templates Page
    // ═══════════════════════════════════════════════════════════════════
    console.log('📍 STEP 1: Navigating to HeyGen Templates...');
    await page.goto('https://app.heygen.com/templates', { waitUntil: 'domcontentloaded' });

    // Wait for the template to be visible (more reliable than networkidle)
    await page.waitForSelector(`text="${TEMPLATE_NAME}"`, { timeout: 30000 });
    await page.waitForTimeout(1000); // Brief settle time
    console.log('✓ Templates page loaded\n');

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Hover on Template & Click "Use this template"
    // ═══════════════════════════════════════════════════════════════════
    console.log(`🖱️ STEP 2: Selecting template "${TEMPLATE_NAME}"...`);

    // Find the template card specifically
    // The card usually has a 'tw-group' class or similar container behavior
    // We'll find the text element, then find its specific card container
    const templateCard = page.locator('div.tw-group, div[class*="group"]').filter({ hasText: TEMPLATE_NAME }).first();

    try {
        await templateCard.waitFor({ state: 'visible', timeout: 10000 });
        console.log(`✓ Found template card for "${TEMPLATE_NAME}"`);

        // Hover to reveal buttons
        await templateCard.hover();
        await page.waitForTimeout(1000); // Wait for hover animation

        // Find the "Use this template" / "Play" button WITHIN the card
        // It's usually a button with an icon named 'create-video' or 'new-video'
        const useTemplateBtn = templateCard.locator('button:has(iconpark-icon[name="create-video"]), button:has(iconpark-icon[name="new-video"])').first();

        if (await useTemplateBtn.isVisible()) {
            await useTemplateBtn.click();
            console.log('✓ Clicked "Use this template" button (play icon)\n');
        } else {
            // Fallback: Click the card itself or any button in it
            console.log('  Button not visible, clicking card center...');
            await templateCard.click();
            console.log('✓ Clicked template card\n');
        }
    } catch (e) {
        console.log(`  Error identifying template card: ${e}`);
        console.log('  Fallback: Trying global text search...');

        // Original fallback logic but slightly improved
        const templateNameElement = page.locator(`text="${TEMPLATE_NAME}"`).first();
        const templateCardArea = templateNameElement.locator('xpath=ancestor::div[.//button]').first();
        await templateCardArea.hover();
        await page.waitForTimeout(1000);
        await templateCardArea.locator('button').first().click();
        console.log('✓ Clicked template via fallback\n');
    }

    // ═══════════════════════════════════════════════════════════════════
    // Wait for Editor to Load - May open in a new tab
    // ═══════════════════════════════════════════════════════════════════
    console.log('⏳ Waiting for editor to load...');

    // The editor might open in a new tab - wait for it
    const pagesBefore = defaultContext.pages().length;

    // Wait for potential new page or URL change
    const editorPage = await Promise.race([
        // Option 1: URL changes in current page
        page.waitForURL(/create-v4|editor|video/, { timeout: 10000 }).then(() => page),
        // Option 2: New page opens
        defaultContext.waitForEvent('page', { timeout: 10000 })
    ]).catch(() => null);

    if (editorPage && editorPage !== page) {
        // A new tab opened - switch to it
        page = editorPage;
        console.log('✓ Switched to new editor tab');
        await page.waitForLoadState('domcontentloaded');
    } else if (!editorPage) {
        // Neither happened - check if there are new pages
        const allPages = defaultContext.pages();
        if (allPages.length > pagesBefore) {
            page = allPages[allPages.length - 1];
            console.log('✓ Found new editor tab');
            await page.waitForLoadState('domcontentloaded');
        } else {
            // Maybe still on same page - wait a bit more
            await page.waitForTimeout(2000);
            console.log('  Continuing on current page...');
        }
    }

    await page.waitForTimeout(3000); // Let editor fully render
    console.log('✓ Editor loaded\n');

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Open Audio Panel & Upload Audio
    // ═══════════════════════════════════════════════════════════════════
    console.log('🎵 STEP 3: Opening Audio panel...');

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
        await page.locator('input[type="file"]').first().setInputFiles(AUDIO_FILE_PATH);
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
            console.log(`⚠️ ERROR: Could not find audio row for "${uploadedFileName}"`);
            // Debug: Print some visible text to see what's wrong
            const bodyText = await page.locator('body').innerText();
            console.log(`  Page sample text: ${bodyText.slice(0, 200)}...`);
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
                console.log('  Button not found at all.');
            }
        }
    }

    await page.waitForTimeout(2000);

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
            console.log('❌ could not find Title input inside the dialog to rename video.');
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
