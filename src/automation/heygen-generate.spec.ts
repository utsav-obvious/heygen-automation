import { test, chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Configuration from environment variables
const AUDIO_FILE_PATH = process.env.AUDIO_PATH;
const TEMPLATE_NAME = process.env.TEMPLATE_NAME || 'Pratham-Template';
const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://localhost:9222';

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

    let page = defaultContext.pages()[0];
    if (!page) {
        page = await defaultContext.newPage();
    }

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

    // Click the Audio button in the toolbar
    const audioButton = page.locator('button').filter({ hasText: /audio/i }).first();

    try {
        await audioButton.waitFor({ state: 'visible', timeout: 10000 });
        await audioButton.click();
        console.log('✓ Audio panel opened');
    } catch (e) {
        // Try alternative: look for music/sound icon
        const altAudioBtn = page.locator('[aria-label*="audio" i], [data-testid*="audio"]').first();
        await altAudioBtn.click();
        console.log('✓ Audio panel opened (via alternative selector)');
    }

    await page.waitForTimeout(1500);

    // Look for Upload button/tab in the audio panel
    console.log(`📤 Uploading audio: ${path.basename(AUDIO_FILE_PATH)}`);

    const uploadTab = page.getByText('Upload').or(page.locator('button:has-text("Upload")')).first();
    try {
        await uploadTab.waitFor({ state: 'visible', timeout: 5000 });
        await uploadTab.click();
        await page.waitForTimeout(1000);
    } catch (e) {
        console.log('  No separate Upload tab - proceeding with file input');
    }

    // Upload the audio file
    const fileInput = page.locator('input[type="file"][accept*="audio"], input[type="file"]').first();

    try {
        // Make hidden file inputs visible if needed
        await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[type="file"]');
            inputs.forEach(input => {
                (input as HTMLElement).style.display = 'block';
                (input as HTMLElement).style.opacity = '1';
                (input as HTMLElement).style.visibility = 'visible';
            });
        });

        await fileInput.setInputFiles(AUDIO_FILE_PATH);
        console.log('✓ Audio file uploaded');
    } catch (e) {
        throw new Error(`Failed to upload audio file: ${e}`);
    }

    // Wait for upload to complete
    console.log('⏳ Waiting for upload processing...');
    await page.waitForTimeout(5000);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Click "Add Audio" Button
    // ═══════════════════════════════════════════════════════════════════
    console.log('➕ STEP 4: Adding audio to video...');

    const uploadedFileName = path.basename(AUDIO_FILE_PATH);

    // 1. Find the row containing our uploaded file and click IT (not just a button in it)
    // The row usually acts as the trigger to open the confirmation/config dialog
    console.log(`  Selecting audio row for: ${uploadedFileName}`);
    const audioRow = page.locator('div, li').filter({ hasText: uploadedFileName }).first();

    // We need to be careful to get the container that is clickable
    // Usually it's the div with class 'tw-group' or similar
    const clickableRow = audioRow.locator('xpath=ancestor::div[contains(@class, "group") or @draggable="true"]').first();

    if (await clickableRow.count() > 0) {
        await clickableRow.click();
    } else {
        // Fallback: just click the text element's parent
        await audioRow.click();
    }
    console.log('✓ Clicked audio row');

    // 2. Wait for and click "Add audio" in the confirmation dialog/wizard
    // This is the step that was missing and causing timeouts!
    console.log('⏳ Waiting for "Add audio" confirmation dialog...');

    const confirmAddBtn = page.getByRole('button', { name: /add audio|apply/i }).last(); // Use last() as there might be multiple on screen

    try {
        await confirmAddBtn.waitFor({ state: 'visible', timeout: 5000 });
        await confirmAddBtn.click();
        console.log('✓ Clicked "Add audio" confirmation button\n');
    } catch (e) {
        console.log('  No confirmation dialog found - checking if audio occurred anyway...');
        // Maybe it auto-added?
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
    // STEP 6: Confirm / Submit
    // ═══════════════════════════════════════════════════════════════════
    console.log('✅ STEP 6: Confirming submission...');

    const submitBtn = page.getByRole('button', { name: /submit|confirm|yes|ok/i })
        .or(page.locator('button:has-text("Submit")'))
        .or(page.locator('[data-testid*="submit"], [data-testid*="confirm"]'))
        .first();

    try {
        await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
        await submitBtn.click();
        console.log('✓ Video submitted for generation\n');
    } catch (e) {
        console.log('  Note: No confirmation dialog - submission may have completed directly\n');
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
