# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gesture Genius is a public speaking body language quiz web application that generates interactive questions about reading body language for public speakers. The app uses OpenAI's GPT models and DALL-E 2 to create dynamic quiz content.

## Architecture

- **Frontend**: Single-page vanilla HTML/CSS/JavaScript application (`index.html`)
- **Backend**: Serverless Vercel functions acting as OpenAI API proxies
- **API Routes**: 
  - `/api/openai/chat.js` - Proxy for OpenAI Chat Completions API
  - `/api/openai/images.js` - Proxy for OpenAI Image Generation API (there's also `api/image.js` which appears to be the same)

## Development Commands

- **Start local server**: `npm start` (uses `serve` package)
- **Deploy**: Push to Vercel (configured with `vercel.json`)

## Key Configuration

- **Environment Variables**: Requires `OPENAI_API_KEY` in Vercel dashboard
- **Models**: Default text model is `gpt-4o-mini`, image model is `dall-e-2`
- **Deployment**: Configured for Vercel with custom routing in `vercel.json`

## Code Structure

The application is a single-file frontend with embedded JavaScript that:
1. Generates quiz questions using OpenAI Chat API with structured JSON responses
2. Creates cartoon images via DALL-E 2 based on body language prompts  
3. Presents multiple-choice questions with immediate feedback
4. Tracks user progress and provides coaching tips

The API proxy functions (`/api/openai/`) handle secure server-side OpenAI API calls to avoid exposing API keys in the browser.

## Security Notes

- API keys are stored server-side only and never exposed to the browser
- All OpenAI API calls are proxied through Vercel serverless functions