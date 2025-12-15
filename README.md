<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ggcfQNwQs0cGrbzb1oapySzBvuP5I1ha

## Feature (Github Version)

- [x] **WebGL Fluid Background**: Implements a dynamic fluid background effect using WebGL shaders. [Reference](https://www.shadertoy.com/view/wdyczG)
- [x] **Canvas Lyric Rendering**: High-performance, custom-drawn lyric visualization on HTML5 Canvas.
- [x] **Music Import & Search**: Seamlessly search and import music from external providers or local files.
- [x] **Audio Manipulation**: Real-time control over playback speed and pitch shifting.
- [x] **QQ Music Retry Logic**: Automatic retry mechanism for expired/invalid QQ Music stream URLs with configurable retry attempts and delays.

## QQ Music URL Retry Mechanism

QQ Music stream URLs are time-limited and may expire during playback. The application implements an automatic retry mechanism to handle expired URLs:

- **Max Retries**: 3 attempts (configurable via `QQ_MUSIC_RETRY_CONFIG.MAX_RETRIES` in `hooks/usePlayer.ts`)
- **Retry Delay**: 1000ms between attempts (configurable via `QQ_MUSIC_RETRY_CONFIG.RETRY_DELAY_MS`)
- **Behavior**: When a QQ Music track fails to play, the app automatically:
  1. Detects the error and checks if it's a QQ Music track
  2. Fetches a fresh stream URL from the API
  3. Updates the audio source and retries playback
  4. Logs each retry attempt for debugging
  5. Gives up after max retries and pauses playback

**Logging**: All retry attempts are logged to the browser console with `[QQ Music Retry]` prefix for easy debugging.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Screenshot

![Screenshot1](./images/screenshot1.png)
![Screenshot2](./images/screenshot2.png)
![Screenshot3](./images/screenshot3.png)
![Screenshot4](./images/screenshot4.png)

> Shader source: https://www.shadertoy.com/view/wdyczG

> Vibe coding with gemini3-pro, gpt-5.1-codex-mini, and claude-sonnet-4.5. The first version only took 10 mins.
