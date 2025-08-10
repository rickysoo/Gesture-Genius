// Security middleware for API endpoints
// Provides authentication, rate limiting, and security headers

const crypto = require('crypto');

// Rate limiting store (in-memory for demo - use Redis for production)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per IP

// Simple API key validation (use environment variable)
const API_SECRET = process.env.API_SECRET || crypto.randomBytes(32).toString('hex');

// Security headers
function setSecurityHeaders(res) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Powered-By', ''); // Remove X-Powered-By header
  
  // CORS headers (restrictive by default)
  const allowedOrigins = [
    'https://gesture-genius-gd1s4stri-rickys-projects-c77239e3.vercel.app',
    'https://gesture-genius-rog748qge-rickys-projects-c77239e3.vercel.app'
  ];
  const allowedOrigin = process.env.ALLOWED_ORIGIN || allowedOrigins[0];
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

// Rate limiting middleware
function rateLimit(req, res, next) {
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  // Clean old entries
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.firstRequest > RATE_LIMIT_WINDOW) {
      rateLimitStore.delete(key);
    }
  }
  
  // Check rate limit
  const clientData = rateLimitStore.get(clientIP) || { firstRequest: now, requests: 0 };
  
  if (now - clientData.firstRequest < RATE_LIMIT_WINDOW) {
    clientData.requests++;
    if (clientData.requests > RATE_LIMIT_MAX_REQUESTS) {
      res.status(429).json({ 
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - clientData.firstRequest)) / 1000)
      });
      return;
    }
  } else {
    // Reset counter for new window
    clientData.firstRequest = now;
    clientData.requests = 1;
  }
  
  rateLimitStore.set(clientIP, clientData);
  next();
}

// API authentication middleware
function authenticate(req, res, next) {
  // Skip authentication for OPTIONS requests
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  
  // Allow requests from the same origin without API key
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  
  // Check if request is from allowed origins
  const allowedOrigins = [
    'https://gesture-genius-gd1s4stri-rickys-projects-c77239e3.vercel.app',
    'https://gesture-genius-rog748qge-rickys-projects-c77239e3.vercel.app'
  ];
  
  const isFromAllowedOrigin = origin && allowedOrigins.includes(origin) || 
    referer && allowedOrigins.some(allowed => referer.startsWith(allowed));
  
  if (isFromAllowedOrigin) {
    return next();
  }
  
  // For other requests, require API key
  if (!apiKey) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  // Validate API key if provided
  if (apiKey && apiKey !== API_SECRET) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }
  
  next();
}

// Input validation helpers
function validateRequired(obj, fields) {
  const missing = fields.filter(field => !obj[field] || obj[field].toString().trim().length === 0);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

function sanitizeString(str, maxLength = 1000) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

function validateImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Error handling middleware
function handleApiError(error, req, res, next) {
  console.error('API Error:', error);
  
  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (error.name === 'ValidationError') {
    res.status(400).json({ error: 'Invalid input data' });
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'File too large' });
  } else if (error.message.includes('duplicate key value')) {
    res.status(409).json({ error: 'Resource already exists' });
  } else {
    res.status(500).json({ 
      error: isDevelopment ? error.message : 'Internal server error' 
    });
  }
}

// Security middleware wrapper
function secureEndpoint(handler) {
  return async (req, res) => {
    try {
      // Set security headers
      setSecurityHeaders(res);
      
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }
      
      // Apply rate limiting
      await new Promise((resolve, reject) => {
        rateLimit(req, res, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      
      // Apply authentication
      await new Promise((resolve, reject) => {
        authenticate(req, res, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      
      // Execute the handler
      await handler(req, res);
      
    } catch (error) {
      handleApiError(error, req, res);
    }
  };
}

module.exports = {
  secureEndpoint,
  setSecurityHeaders,
  rateLimit,
  authenticate,
  validateRequired,
  sanitizeString,
  validateImageUrl,
  handleApiError
};