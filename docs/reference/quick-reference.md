# NexureJS Quick Reference

This quick reference guide provides code examples for common NexureJS operations. For more detailed information, see the [API Reference](./API_REFERENCE.md) and [Main Guide](./MAIN_GUIDE.md).

## Table of Contents
- [Installation](#installation)
- [Basic Server](#basic-server)
- [Routing](#routing)
- [Middleware](#middleware)
- [Request Handling](#request-handling)
- [Response Handling](#response-handling)
- [Error Handling](#error-handling)
- [Streaming](#streaming)
- [Native Modules](#native-modules)
- [WebSockets](#websockets)

## Installation

```bash
# Install NexureJS
npm install nexurejs

# Install with TypeScript (automatically included)
npm install nexurejs
```

## Basic Server

```javascript
import { Nexure, HttpMethod } from 'nexurejs';

// Create app instance
const app = new Nexure();

// Define a route
app.route({
  path: '/',
  method: HttpMethod.GET,
  handler: (req, res) => {
    res.status(200).json({ message: 'Hello, World!' });
  }
});

// Start server
app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
```

## Routing

### Basic Routes

```javascript
// GET request
app.get('/', (req, res) => {
  res.status(200).json({ message: 'GET request' });
});

// POST request
app.post('/users', (req, res) => {
  res.status(201).json({ message: 'POST request' });
});

// PUT request
app.put('/users/:id', (req, res) => {
  res.status(200).json({ message: 'PUT request' });
});

// DELETE request
app.delete('/users/:id', (req, res) => {
  res.status(204).end();
});
```

### Route Parameters

```javascript
app.get('/users/:id', (req, res) => {
  const userId = req.params.id;
  res.status(200).json({ id: userId });
});
```

### Query Parameters

```javascript
app.get('/search', (req, res) => {
  const query = req.query.q;
  const page = parseInt(req.query.page) || 1;
  res.status(200).json({ query, page });
});
```

### Route Groups

```javascript
// Create a router
const router = new Router();

// Define routes on the router
router.get('/users', (req, res) => {
  res.status(200).json({ message: 'Get all users' });
});

router.get('/users/:id', (req, res) => {
  res.status(200).json({ message: 'Get user ' + req.params.id });
});

// Apply router with prefix
app.use('/api', router);
```

## Middleware

### Global Middleware

```javascript
// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
```
