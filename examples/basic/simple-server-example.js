/**
 * Simple NexureJS Example Server
 *
 * This example demonstrates how to create a basic HTTP server using NexureJS.
 */

import { createServer } from '../dist/index.js';
import { Router } from '../dist/routing/index.js';

// Create a server instance
const app = createServer({
  logging: true,
  prettyJson: true // Format JSON responses for readability
});

// Create a router
const router = new Router();

// Define routes
router.get('/', (req, res) => {
  res.end(JSON.stringify({
    message: 'Welcome to NexureJS!',
    timestamp: new Date().toISOString(),
    node_version: process.version
  }, null, 2));
});

router.get('/hello/:name', (req, res) => {
  const name = req.params?.name || 'World';
  res.end(JSON.stringify({
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString()
  }, null, 2));
});

router.post('/echo', (req, res) => {
  // Echo back request body
  res.end(JSON.stringify({
    echo: req.body,
    timestamp: new Date().toISOString()
  }, null, 2));
});

// Add middleware for logging requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  return next();
});

// Add router middleware
app.use(async (req, res, next) => {
  try {
    await router.process(req, res);
  } catch (error) {
    console.error('Error processing request:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Try these routes:
- GET /
- GET /hello/:name
- POST /echo (with request body)
`);
});
