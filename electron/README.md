# Electron Build Configuration

This directory contains the Electron wrapper for the Aura Music web application.

## Files

- **main.js**: Main Electron process that creates the browser window and loads the app
- **preload.js**: Preload script that runs before the web page loads (provides secure bridge between Electron and web content)
- **package.json**: Marks this directory as CommonJS (required because the main package.json uses ES modules)

## How it Works

The Electron app loads the built Vite application from the `dist/` directory. When packaged, it bundles the entire `dist/` folder along with these Electron files into a standalone Windows executable.

## Icon

The app icon is located at `build/icon.png` and was created from the AuraLogo SVG in `components/Icons.tsx`.
