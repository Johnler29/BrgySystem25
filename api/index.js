// Vercel serverless function handler
// This file exports the Express app for Vercel deployment

// Set VERCEL environment variable so welcome.js knows it's running on Vercel
process.env.VERCEL = '1';

// Import the Express app
const app = require('../welcome');

// Export as Vercel serverless function
module.exports = app;

