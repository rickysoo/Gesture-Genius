# Gesture Genius — Public Speaking Body Language Quiz

Fun, colorful quiz web app that teaches body-language reading for public speakers.

## Features
- Generates each question's cartoon with **DALL·E 2**
- Creates 4 answer options with an OpenAI chat model
- Randomizes options, reveals answers, tracks score, shows summary

## Deploy to Vercel
1. Create a project on Vercel (Import this folder).
2. In Vercel dashboard, go to **Settings → Environment Variables**:
   - `OPENAI_API_KEY` = your key
3. Deploy — your quiz is ready!

## Notes
- Default text model: `gpt-4o-mini`; image model: `dall-e-2`
- API key is kept on server (never in the browser)
