"use server";

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import util from "util";

const execPromise = util.promisify(exec);

export async function runHeyGenAutomation(audioData: string) {
    try {
        // 1. Save the audio data to a temp file
        // audioData is "data:audio/mpeg;base64,..."
        const base64Data = audioData.split(';base64,').pop();
        if (!base64Data) throw new Error("Invalid audio data");

        const tempDir = path.resolve(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        const audioPath = path.join(tempDir, `upload_audio_${Date.now()}.mp3`);
        fs.writeFileSync(audioPath, base64Data, { encoding: 'base64' });

        console.log(`Saved temporary audio to: ${audioPath}`);

        // 2. Run the Playwright script
        // We pass the audio path as an environment variable
        const command = `npm run generate:video`;

        // Execute command with env var
        console.log("Starting Playwright automation...");
        const { stdout, stderr } = await execPromise(command, {
            env: { ...process.env, AUDIO_PATH: audioPath }
        });

        console.log("Playwright Output:", stdout);
        if (stderr) console.error("Playwright Errors:", stderr);

        return { success: true, message: "Automation completed successfully. check HeyGen." };

    } catch (error: any) {
        console.error("Automation Failed:", error);
        return { success: false, message: error.message || "Automation failed" };
    }
}
