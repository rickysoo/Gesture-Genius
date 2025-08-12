# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gesture Genius is a public speaking body language quiz web application that generates interactive questions about reading body language for public speakers. The app uses OpenAI's GPT models and DALL-E 3 to create dynamic quiz content with a hybrid system combining fresh AI-generated questions and database-stored questions for optimal performance.

**Live Application**: https://gesture.rickysoo.com

## Architecture

- **Frontend**: Single-page vanilla HTML/CSS/JavaScript application (`index.html`)
- **Backend**: Serverless Vercel functions with comprehensive security middleware
- **Database**: Neon PostgreSQL serverless database for question storage and reuse
- **Storage**: AWS S3 with signed URLs for secure image storage
- **Hybrid System**: 1 fresh AI-generated question + 4 database questions per quiz

## API Routes

### Core APIs
- `/api/openai/chat.js` - Secured OpenAI Chat Completions API proxy
- `/api/openai/images.js` - Secured OpenAI Image Generation API proxy
- `/api/images.js` - Legacy image endpoint (secured with validation)

### Database APIs
- `/api/database/get-questions.js` - Retrieve random questions from database
- `/api/database/save-quiz.js` - Save generated questions and images to database

### Storage APIs
- `/api/storage/upload.js` - Upload images to S3 with validation and security
- `/api/storage/proxy-image.js` - Proxy S3 images with CORS headers
- `/api/storage/get-signed-url.js` - Generate signed URLs for S3 access

### Security Middleware
- `/api/middleware/security.js` - Comprehensive security layer with rate limiting, CORS, input validation, and security headers

## Development Commands

- **Start local development server**: `node dev-server.js` (full-featured with real APIs and database)
- **Start simple static server**: `npm start` (uses `serve` package, for frontend-only testing)
- **Deploy to production**: `npx vercel --prod`

## Environment Variables

### Required for Production (Vercel Dashboard)
- `OPENAI_API_KEY` - OpenAI API key for GPT and DALL-E access
- `AWS_ACCESS_KEY_ID` - AWS access key for S3 storage
- `AWS_SECRET_ACCESS_KEY` - AWS secret key for S3 storage
- `AWS_S3_BUCKET` - S3 bucket name for image storage
- `AWS_REGION` - AWS region (default: us-east-1)
- `DATABASE_URL` - Neon PostgreSQL connection string

### Local Development (.env.local)
All the above variables should be configured in `.env.local` for local development using the `dev-server.js`.

## Key Features

### Hybrid Question System
- **Fresh Generation**: First question is always AI-generated for variety
- **Database Reuse**: Questions 2-5 come from database for instant loading
- **Smart Caching**: Generated questions are automatically saved to database for future reuse

### Security Implementation
- **Comprehensive Input Validation**: All API endpoints have strict validation
- **Rate Limiting**: 10 requests per minute per IP
- **CORS Protection**: Strict origin allowlists for all domains
- **Security Headers**: CSP, HSTS, X-Frame-Options, etc.
- **Error Handling**: Generic error responses to prevent information disclosure
- **File Upload Security**: Magic number validation, size limits, and content verification

### Image Handling
- **AI Generation**: DALL-E 3 creates unique cartoon illustrations
- **S3 Storage**: Secure upload with server-side encryption
- **Proxy Access**: CORS-compliant image serving via proxy endpoint
- **Meaningful Descriptions**: Database questions show contextual loading descriptions

## Code Structure

### Frontend (`index.html`)
- Single-page application with embedded JavaScript
- Hybrid question generation system with prefetching
- Progressive image loading with fetch-to-blob approach
- Real-time scoring and coaching feedback system
- Responsive design for all device types

### Backend Architecture
- All API endpoints wrapped with `secureEndpoint()` middleware
- Parameterized database queries to prevent SQL injection
- Environment variable configuration for all credentials
- Comprehensive error logging with sanitized client responses

### Development Server (`dev-server.js`)
- Full-featured local development environment
- Real OpenAI API integration with timeout handling
- Neon database connectivity with proper error handling
- S3 storage operations with retry logic
- CORS configuration for local and production origins

## Security Notes

### Current Security Measures
- **No Hardcoded Credentials**: All secrets use environment variables
- **Input Sanitization**: XSS protection and data validation on all inputs
- **SQL Injection Prevention**: Parameterized queries throughout
- **Rate Limiting**: Per-IP request throttling
- **CORS Lockdown**: Restricted to approved origins only
- **Security Headers**: Full complement including CSP and HSTS
- **File Upload Security**: Content validation and size limits
- **Error Boundary**: Prevents sensitive information disclosure

### Infrastructure Security
- **Serverless Architecture**: Reduced attack surface with Vercel functions
- **Database Security**: SSL-required connections to Neon PostgreSQL
- **Storage Security**: S3 server-side encryption and signed URL access
- **Transport Security**: HTTPS everywhere with security headers

## Production Deployment

The application is deployed on Vercel with custom domain configuration. All environment variables must be configured in the Vercel dashboard. The build process automatically handles ESM to CommonJS compilation for serverless functions.