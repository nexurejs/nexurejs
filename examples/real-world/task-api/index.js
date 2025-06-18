/**
 * Task Management API
 *
 * A complete RESTful API showcasing NexureJS features:
 * - CRUD operations
 * - Authentication middleware
 * - Validation
 * - Error handling
 * - Native performance features
 */

import { Nexure, HttpMethod } from '../../../dist/index.js';
import { StringEncoder } from '../../../dist/native/index.js';
import crypto from 'crypto';

// Initialize app with native modules
const app = new Nexure({
  logger: { level: 'info', prettyPrint: true },
  performance: { nativeModules: true }
});

// In-memory database (for demo purposes)
const db = {
  users: new Map(),
  tasks: new Map(),
  sessions: new Map()
};

// Native string encoder for tokens
const encoder = new StringEncoder();

// Middleware: Parse JSON body
async function parseBody(req, res, next) {
  if (req.headers['content-type']?.includes('application/json')) {
    try {
      req.body = await req.json();
    } catch (error) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }
  next();
}

// Middleware: Authentication
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = db.sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = db.users.get(session.userId);
  next();
}

// Helper: Generate secure token
function generateToken() {
  const random = crypto.randomBytes(32).toString('hex');
  return encoder.base64Encode(random);
}

// Routes: Authentication
app.route({
  path: '/api/register',
  method: HttpMethod.POST,
  middleware: [parseBody],
  handler: (req, res) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (Array.from(db.users.values()).find(u => u.email === email)) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const userId = crypto.randomUUID();
    const hashedPassword = encoder.base64Encode(password); // In production, use bcrypt

    const user = {
      id: userId,
      email,
      name,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    db.users.set(userId, user);

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    });
  }
});

app.route({
  path: '/api/login',
  method: HttpMethod.POST,
  middleware: [parseBody],
  handler: (req, res) => {
    const { email, password } = req.body;

    const user = Array.from(db.users.values()).find(u => u.email === email);
    if (!user || user.password !== encoder.base64Encode(password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken();
    db.sessions.set(token, {
      userId: user.id,
      createdAt: new Date().toISOString()
    });

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  }
});

// Routes: Tasks CRUD
app.route({
  path: '/api/tasks',
  method: HttpMethod.GET,
  middleware: [authenticate],
  handler: (req, res) => {
    const userTasks = Array.from(db.tasks.values())
      .filter(task => task.userId === req.user.id)
      .map(({ userId, ...task }) => task);

    res.status(200).json({
      tasks: userTasks,
      count: userTasks.length
    });
  }
});

app.route({
  path: '/api/tasks',
  method: HttpMethod.POST,
  middleware: [authenticate, parseBody],
  handler: (req, res) => {
    const { title, description, priority = 'medium' } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const task = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      title,
      description: description || '',
      priority,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.tasks.set(task.id, task);

    const { userId, ...taskResponse } = task;
    res.status(201).json(taskResponse);
  }
});

app.route({
  path: '/api/tasks/:id',
  method: HttpMethod.GET,
  middleware: [authenticate],
  handler: (req, res) => {
    const task = db.tasks.get(req.params.id);

    if (!task || task.userId !== req.user.id) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { userId, ...taskResponse } = task;
    res.status(200).json(taskResponse);
  }
});

app.route({
  path: '/api/tasks/:id',
  method: HttpMethod.PUT,
  middleware: [authenticate, parseBody],
  handler: (req, res) => {
    const task = db.tasks.get(req.params.id);

    if (!task || task.userId !== req.user.id) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updates = {
      title: req.body.title || task.title,
      description: req.body.description ?? task.description,
      priority: req.body.priority || task.priority,
      status: req.body.status || task.status,
      updatedAt: new Date().toISOString()
    };

    const updatedTask = { ...task, ...updates };
    db.tasks.set(task.id, updatedTask);

    const { userId, ...taskResponse } = updatedTask;
    res.status(200).json(taskResponse);
  }
});

app.route({
  path: '/api/tasks/:id',
  method: HttpMethod.DELETE,
  middleware: [authenticate],
  handler: (req, res) => {
    const task = db.tasks.get(req.params.id);

    if (!task || task.userId !== req.user.id) {
      return res.status(404).json({ error: 'Task not found' });
    }

    db.tasks.delete(req.params.id);
    res.status(204).end();
  }
});

// Routes: Stats
app.route({
  path: '/api/stats',
  method: HttpMethod.GET,
  middleware: [authenticate],
  handler: (req, res) => {
    const userTasks = Array.from(db.tasks.values())
      .filter(task => task.userId === req.user.id);

    const stats = {
      total: userTasks.length,
      byStatus: {
        pending: userTasks.filter(t => t.status === 'pending').length,
        inProgress: userTasks.filter(t => t.status === 'in-progress').length,
        completed: userTasks.filter(t => t.status === 'completed').length
      },
      byPriority: {
        low: userTasks.filter(t => t.priority === 'low').length,
        medium: userTasks.filter(t => t.priority === 'medium').length,
        high: userTasks.filter(t => t.priority === 'high').length
      }
    };

    res.status(200).json(stats);
  }
});

// Health check
app.route({
  path: '/health',
  method: HttpMethod.GET,
  handler: (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      native: {
        stringEncoder: !!encoder
      }
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Task Management API running at http://localhost:${PORT}`);
  console.log('\n📖 API Endpoints:');
  console.log('  POST   /api/register     - Create account');
  console.log('  POST   /api/login        - Login');
  console.log('  GET    /api/tasks        - List tasks');
  console.log('  POST   /api/tasks        - Create task');
  console.log('  GET    /api/tasks/:id    - Get task');
  console.log('  PUT    /api/tasks/:id    - Update task');
  console.log('  DELETE /api/tasks/:id    - Delete task');
  console.log('  GET    /api/stats        - Task statistics');
  console.log('  GET    /health           - Health check');
  console.log('\n🔐 Authentication: Add "Authorization: Bearer <token>" header');
});
