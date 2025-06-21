/**
 * Simple Server Example
 *
 * This example demonstrates a basic HTTP server using Node.js http module.
 * It's provided as a comparison point to show the raw implementation before
 * using NexureJS features. Key aspects demonstrated:
 * - Manual request routing
 * - Request body parsing
 * - Response formatting
 * - Error handling
 * - CORS headers
 *
 * For NexureJS equivalents with improved developer experience, see:
 * - API Reference: ./docs/API_REFERENCE.md
 * - Examples Guide: ./docs/EXAMPLES.md
 */

// Import the HTTP module
import http from 'node:http';

// Create an HTTP server
const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Simple router
  if (req.method === 'GET' && req.url === '/') {
    res.setHeader('Content-Type', 'text/plain');
    res.statusCode = 200;
    res.end('Hello from Nexure.js Simple Server!');
  }
  // API endpoint for creating users
  else if (req.method === 'POST' && req.url === '/api/users') {
    let body = '';

    // Collect request body data
    req.on('data', chunk => {
      body += chunk.toString();
    });

    // Process the complete request body
    req.on('end', () => {
      try {
        // Parse JSON body
        const userData = JSON.parse(body);

        // Validate user data
        if (!userData.name || !userData.email) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Name and email are required fields' }));
          return;
        }

        // Return success response
        res.statusCode = 201;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          message: 'User created successfully',
          user: userData
        }));
      } catch (error) {
        // Handle JSON parsing errors
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
      }
    });
  }
  // Handle 404 for all other routes
  else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
