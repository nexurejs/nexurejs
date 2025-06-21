#!/usr/bin/env node

/**
 * Basic Example Server for NexureJS
 *
 * This example demonstrates how to create a simple web server using NexureJS,
 * including:
 * - Routing with parameters and different HTTP methods
 * - Middleware for request logging and processing
 * - Request validation using schemas
 * - Error handling
 * - Proper response formatting
 * - Graceful shutdown
 * - Async route handlers
 *
 * For complete API documentation, see:
 * - API Reference: ./docs/API_REFERENCE.md
 * - Examples Guide: ./docs/EXAMPLES.md
 */

// Import core modules
import {
  Nexure,
  HttpStatus,
  validateBody
} from '../dist/index.js';
import { Router } from '../dist/routing/index.js';
import { Logger } from '../dist/utils/logger.js';

// Optional utility for checking Node.js version
const NODE_VERSION = process.version;
const NODE_MAJOR_VERSION = parseInt(NODE_VERSION.substring(1).split('.')[0], 10);
const NODE_MINOR_VERSION = parseInt(NODE_VERSION.substring(1).split('.')[1], 10);

// Create a logger instance
const logger = new Logger({
  level: 'info', // 'debug', 'info', 'warn', 'error'
  format: 'pretty', // 'json', 'pretty', 'simple'
  timestamp: true
});

// Check Node.js version compatibility
if (NODE_MAJOR_VERSION < 16 || (NODE_MAJOR_VERSION === 16 && NODE_MINOR_VERSION < 14)) {
  logger.error(`NexureJS requires Node.js 16.14.0 or later. Current version: ${NODE_VERSION}`);
  process.exit(1);
}

// Create a new Nexure application
const app = new Nexure();

// Define a validation schema for the request body
const userSchema = {
  path: 'user',
  type: 'object',
  required: true,
  properties: {
    name: {
      path: 'user.name',
      type: 'string',
      required: true
    },
    email: {
      path: 'user.email',
      type: 'string',
      format: 'email',
      required: true
    }
  }
};

// Add a route with validation
app.post('/api/users', validateBody(userSchema), async (req, res) => {
  const user = req.body;

  // Echo the user data back with a success message
  res.status(HttpStatus.CREATED).json({
    message: 'User created successfully',
    user
  });
});

// Simple GET route
app.get('/', async (req, res) => {
  res.status(HttpStatus.OK).json({
    message: 'Nexure.js is running!',
    timestamp: new Date().toISOString()
  });
});

// Create a router for organizing routes
const router = new Router();

// Basic route
router.get('/', (req, res) => {
  res.send({
    message: 'Welcome to NexureJS example server',
    nodeVersion: process.version,
    documentation: 'https://github.com/Braineanear/nexurejs'
  });
});

// Echo endpoint (demonstrates POST handling)
router.post('/echo', (req, res) => {
  // The body is automatically parsed based on Content-Type
  res.send(req.body);
});

// Route with parameters
router.get('/users/:id', (req, res) => {
  const userId = req.params.id;

  res.send({
    id: userId,
    links: {
      self: `/users/${userId}`,
      profile: `/users/${userId}/profile`,
      friends: `/users/${userId}/friends`
    }
  });
});

// Error example
router.get('/error', (req, res) => {
  // This will be caught by the error handler
  throw new Error('This is a test error');
});

// Async route example
router.get('/async', async (req, res) => {
  // Simulate an async operation
  await new Promise(resolve => setTimeout(resolve, 100));

  res.send({
    message: 'Async operation completed',
    timestamp: new Date().toISOString()
  });
});

// Register middleware to log all requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);

  // Add a response time header
  const start = Date.now();

  // When response ends, calculate and set the X-Response-Time header
  res.on('finish', () => {
    const duration = Date.now() - start;
    res.setHeader('X-Response-Time', `${duration}ms`);
  });

  // Continue to the next middleware
  return next();
});

// Register the router
app.use(router);

// Start the server
app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down server...');
  app.close(() => {
    logger.info('Server shut down successfully');
    process.exit(0);
  });
});
