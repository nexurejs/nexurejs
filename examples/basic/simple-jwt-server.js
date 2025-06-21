/**
 * Simple JWT Authentication Server
 *
 * This is a minimal implementation of a JWT authentication server using plain Node.js.
 */

import http from 'node:http';
import { signJwt, verifyJwt } from '../src/security/jwt.js';

// Mock user database
const users = [
  { id: '1', username: 'admin', password: 'admin123', role: 'admin' },
  { id: '2', username: 'user', password: 'user123', role: 'user' }
];

// JWT secret
const JWT_SECRET = 'your-secret-key-should-be-long-and-secure';

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    // Home route
    if (path === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Simple JWT Authentication Server',
        endpoints: {
          '/': 'This information',
          '/login': 'Login to get a JWT token (POST)',
          '/profile': 'Get user profile (requires JWT)',
          '/admin': 'Admin only endpoint (requires JWT with admin role)'
        }
      }));
      return;
    }

    // Login route
    if (path === '/login' && req.method === 'POST') {
      // Read request body
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
      }

      // Parse JSON
      let data;
      try {
        data = JSON.parse(body);
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      // Validate credentials
      const { username, password } = data;
      const user = users.find(u => u.username === username && u.password === password);

      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid username or password' }));
        return;
      }

      // Generate JWT token
      const token = signJwt({
        sub: user.id,
        username: user.username,
        role: user.role
      }, JWT_SECRET);

      // Return token
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      }));
      return;
    }

    // Protected routes - verify JWT token
    if (path === '/profile' || path === '/admin') {
      // Get authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No authentication token provided' }));
        return;
      }

      // Extract token
      const token = authHeader.substring(7);

      // Verify token
      let payload;
      try {
        payload = verifyJwt(token, JWT_SECRET);
      } catch (error) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Invalid authentication token: ${error.message}` }));
        return;
      }

      // Profile route
      if (path === '/profile') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Protected profile route',
          user: payload
        }));
        return;
      }

      // Admin route - check role
      if (path === '/admin') {
        if (payload.role !== 'admin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Access denied. Admin role required.' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Protected admin route',
          user: payload,
          adminData: {
            serverStats: {
              uptime: process.uptime(),
              memory: process.memoryUsage(),
              nodeVersion: process.version
            }
          }
        }));
        return;
      }
    }

    // Route not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));

  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Simple JWT Authentication Server running at http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET  / - Public welcome page');
  console.log('  POST /login - Login with username/password to get JWT token');
  console.log('  GET  /profile - Protected route (requires JWT)');
  console.log('  GET  /admin - Protected admin route (requires JWT with admin role)');
  console.log('\nTest credentials:');
  console.log('  Admin: username=admin, password=admin123');
  console.log('  User:  username=user, password=user123');
});
