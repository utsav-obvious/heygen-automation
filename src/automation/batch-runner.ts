
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * HeyGen Automation Batch Runner
 * 
 * Usage: npx ts-node src/automation/batch-runner.ts /path/to/audio/folder
 * 
 * This script scans a directory for audio files and runs the HeyGen Playwright automation
 * for each file sequentially. It automatically sets:
 * - AUDIO_PATH: Absolute path to the audio file
 * - VIDEO_NAME: The filename of the audio (without extension)
 */

// 1. Parse Arguments
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('❌ Error: Please provide a directory path containing audio files.');
    console.log('Usage: npm run automate:batch -- /path/to/audio/folder');
    process.exit(1);
}

const audioDir = args[0];
if (!fs.existsSync(audioDir)) {
    console.error(`❌ Error: Directory not found: ${audioDir}`);
    process.exit(1);
}

// 2. Scan for Audio Files
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'];
const files = fs.readdirSync(audioDir)
    .filter(file => ALLOWED_EXTENSIONS.includes(path.extname(file).toLowerCase()))
    .sort(); // Sort for deterministic order

if (files.length === 0) {
    console.log(`⚠️  No audio files found in ${audioDir} with extensions: ${ALLOWED_EXTENSIONS.join(', ')}`);
    process.exit(0);
}

console.log('════════════════════════════════════════════════════════════');
console.log('🚀 HeyGen Batch Automation Runner');
console.log('════════════════════════════════════════════════════════════');
console.log(`📂 Source Directory: ${audioDir}`);
console.log(`found ${files.length} audio files to process.`);
console.log('════════════════════════════════════════════════════════════\n');

// 3. Process Each File
let successCount = 0;
let failCount = 0;

for (const [index, file] of files.entries()) {
    const fullPath = path.resolve(audioDir, file);
    const videoName = path.parse(file).name + "-auto";

    console.log(`[${index + 1}/${files.length}] Processing: ${file}`);
    console.log(`   -> Video Title: "${videoName}"`);

    try {
        // Construct the command
        // We use spawnSync or execSync. execSync is simpler for sequential execution.
        // We must pass the current environment plus our specific variables.

        execSync('npx playwright test src/automation/heygen-generate.spec.ts --project=chromium', {
            stdio: 'inherit', // Pipe output to parent console so user can see progress
            env: {
                ...process.env,
                AUDIO_PATH: fullPath,
                VIDEO_NAME: videoName,
                // TEMPLATE_NAME: process.env.TEMPLATE_NAME // Inherit if set, else uses default in spec
            }
        });

        console.log(`✅ Successfully processed: ${file}\n`);
        successCount++;

    } catch (error) {
        console.error(`❌ Failed to process: ${file}`);
        console.error('   Continuing to next file...\n');
        failCount++;
    }

    // Optional: Add a small delay between runs to let system settle?
    // AtSync implementation effectively waits, but a small buffer is nice.
    if (index < files.length - 1) {
        // sleep 2 seconds
        const waitUntil = Date.now() + 2000;
        while (Date.now() < waitUntil) { }
    }
}

// 4. Summary
console.log('════════════════════════════════════════════════════════════');
console.log('🏁 Batch Processing Complete');
console.log('════════════════════════════════════════════════════════════');
console.log(`✅ Successful: ${successCount}`);
console.log(`❌ Failed:     ${failCount}`);
console.log('════════════════════════════════════════════════════════════');

if (failCount > 0) {
    process.exit(1);
}
