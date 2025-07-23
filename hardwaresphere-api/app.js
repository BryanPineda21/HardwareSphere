const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const corsMiddleware = require('./middleware/cors'); // Assuming this handles your CORS configuration
const { verifyFirebaseToken } = require('./middleware/auth'); // Correct destructuring import
const projectRoutes = require('./routes/projects');


// Import routes
const authRoutes = require('./routes/auth'); // Contains auth-related endpoints
const userRoutes = require('./routes/users');

// Initialize Express app
const app = express();

// =====================================================================
// GLOBAL MIDDLEWARE
// Middleware that applies to ALL incoming requests, regardless of route.
// Order matters: Security, CORS, then body parsers, etc.
// =====================================================================

// 1. Security Middleware (Helmet)
// Helmet helps secure your apps by setting various HTTP headers.
app.use(helmet());

// 2. CORS Middleware
// Handles Cross-Origin Resource Sharing. Place before route handlers.
app.use(corsMiddleware); // Ensure your corsMiddleware is correctly configured

// 3. Rate Limiting
// Protects against brute-force attacks and abuse.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes"
});
// Apply the rate limiter globally or to specific routes/groups
app.use(apiLimiter); // Applied globally here. Consider applying only to /api routes.

// 4. Body Parsers
// Parses incoming request bodies (JSON and URL-encoded data).
app.use(express.json({ limit: '100mb' })); // For parsing application/json
app.use(express.urlencoded({ extended: true, limit: '100mb' })); // For parsing application/x-www-form-urlencoded


// =====================================================================
// PUBLIC ROUTES (No Authentication Required)
// Place these before any authentication middleware if they should be publicly accessible.
// =====================================================================

// Health check endpoint (should typically be public)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Example of another public route if you had one
// app.get('/public-info', (req, res) => {
//   res.json({ message: 'This information is public.' });
// });


// =====================================================================
// AUTHENTICATED ROUTES
// Middleware that applies *only* to specific route groups or individual routes.
// =====================================================================

// 1. Authentication Routes (e.g., login, register, password reset, etc.)
// These routes typically handle user authentication. They might or might not
// require verifyFirebaseToken depending on their purpose (e.g., login doesn't,
// but getting user info might). Your authRoutes already apply verifyFirebaseToken
// internally for endpoints like /me and /update.
app.use('/api/auth', authRoutes);
// 2. Project Routes (all require authentication)
// All routes defined in projectRoutes will require a valid Firebase token.
app.use('/api/projects', projectRoutes);

// 3. User Routes
// Public user profile routes (e.g., /api/users/:username) do NOT require authentication
// However, routes like /api/users/me do require authentication and are protected within users.js
// This allows public access to user profiles while protecting sensitive endpoints.
app.use('/api/users', userRoutes);

// 2. Example of another authenticated route group
// If you had other API routes that all require authentication, you would put
// `verifyFirebaseToken` here for that specific group.
// Example:
// const protectedRoutes = require('./routes/protectedRoutes');
// app.use('/api/protected', verifyFirebaseToken, protectedRoutes);


// =====================================================================
// ERROR HANDLING MIDDLEWARE
// This should always be the LAST middleware in your chain.
// =====================================================================

// Catch-all for 404 Not Found errors
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found', message: `The requested URL ${req.originalUrl} was not found on this server.` });
});

// Global error handler
// This middleware catches errors thrown by other middleware or route handlers.
app.use((err, req, res, next) => {
  console.error('Global Error Handler:', err.stack); // Log the full stack trace for debugging

  // Default error message
  let errorMessage = 'An unexpected error occurred.';
  let statusCode = 500;

  // You can add more specific error handling here
  // For example, handle specific custom errors or validation errors
  // if (err instanceof MyCustomError) {
  //   statusCode = err.statusCode;
  //   errorMessage = err.message;
  // } else if (err.name === 'ValidationError') { // Example for validation libraries
  //   statusCode = 400;
  //   errorMessage = err.message; // Or format validation errors specifically
  // }

  // Send a generic error response to prevent exposing sensitive details in production
  res.status(statusCode).json({
    error: errorMessage,
    // In development, you might send more error details for debugging
    // In production, keep error details minimal for security
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;