# HeyGen Avatar Automation

This project automates video creation on HeyGen by:
1.  Connecting to an existing logged-in Chrome instance.
2.  Handling the upload of audio files.
3.  Selecting a template.
4.  Generating the video (Simulated submission by default to save credits).

## 📋 Prerequisites

-   Node.js & npm/yarn/pnpm
-   Google Chrome (running with remote debugging enabled)
-   HeyGen Account

## 🛠️ Setup

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Environment Variables**
    Copy `.env.example` to `.env.local` (optional, defaults are usually fine):
    ```bash
    cp .env.example .env.local
    ```
    
    Variables:
    -   `TEMPLATE_NAME`: Name of the HeyGen template to use (Default: "Pratham-Template").
    -   `CDP_ENDPOINT`: Chrome debugging URL (Default: "http://127.0.0.1:9222").

3.  **Launch Chrome for Automation**
    You must start Chrome from the command line on port 9222:
    ```bash
    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-automation-profile"
    ```
    *Log in to HeyGen manually in this browser window before running scripts.*

    open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir="/tmp/chrome-automation-profile"

## 🚀 Usage

### Batch Processing (Recommended)
Automatically process an entire folder of audio files.

```bash
npm run automate:batch -- /absolute/path/to/your/audio_folder
```

**Features:**
-   Processes all `.mp3`, `.wav`, `.m4a` files in the folder.
-   Sets video title to match audio filename.
-   Runs sequentially (one after another).
-   Skips failed files and continues.

### Single File Processing
Run for a specific file manually (mostly for testing).

```bash
AUDIO_PATH="/path/to/audio.mp3" VIDEO_NAME="My Video" npm run generate:video
```
