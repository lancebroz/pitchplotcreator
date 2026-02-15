# Pitch Plot Creator

A tool to visualize baseball pitch shapes from FanGraphs data screenshots.

## Features

- Upload a screenshot of FanGraphs pitch data
- Automatically extracts pitch movement data via OCR
- Generates a four-quadrant pitch movement plot
- Displays detailed pitch statistics table
- Light/dark mode toggle
- Download plot as screenshot

## Setup (Local Development)

```bash
npm install
npm run dev
```

## Deployment on Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repo
3. **Important:** Add your Anthropic API key as an environment variable:
   - Go to Settings → Environment Variables
   - Add: `ANTHROPIC_API_KEY` = `your-api-key-here`
4. Deploy!

## Getting an Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Go to API Keys and create a new key
4. Copy the key and add it to Vercel as described above
