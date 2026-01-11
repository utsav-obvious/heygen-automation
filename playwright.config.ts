import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './src/automation',

    // Run tests in files in parallel
    fullyParallel: false,

    // Fail the build on CI if you accidentally left test.only in the source code
    forbidOnly: !!process.env.CI,

    // Retry on CI only
    retries: process.env.CI ? 2 : 0,

    // Reporter
    reporter: 'list',

    // Shared settings for all the projects below
    use: {
        // Base URL to use in actions like `await page.goto('/')`.
        baseURL: 'https://app.heygen.com',

        // Collect trace when retrying the failed test
        trace: 'on-first-retry',

        // Timeout for each action
        actionTimeout: 30000,
    },

    // Configure projects for major browsers
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // Global timeout for each test
    timeout: 120000, // 2 minutes - HeyGen pages can be slow
});
