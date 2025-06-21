import { Nexure } from '../dist/core/nexure.js';
import { Router } from '../dist/routing/router.js';

// Create a server instance
const app = new Nexure({
  logging: true,
  prettyJson: true
});

// Create a router
const router = new Router();

// Define routes
router.get('/', (req, res) => {
  res.end(JSON.stringify({
    message: 'Welcome to NexureJS!',
    timestamp: new Date().toISOString()
  }, null, 2));
});

router.get('/hello/:name', (req, res) => {
  const name = req.params?.name || 'World';
  res.end(JSON.stringify({
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString()
  }, null, 2));
});

// Add middleware for logging requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  return next();
});

// Add router as middleware
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
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Try these routes:
- GET /
- GET /hello/:name
`);
});
