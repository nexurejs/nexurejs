# Build Your First NexureJS Application

In this tutorial, you'll build a complete REST API for a simple task management system. This will introduce you to NexureJS's core concepts and features.

## What You'll Build

A task management API with the following features:
- Create, read, update, and delete tasks
- User authentication with JWT
- Input validation
- Error handling
- Performance monitoring

## Prerequisites

- Node.js 18.0.0 or higher
- Basic knowledge of JavaScript/TypeScript
- Completed [Installation Guide](installation.md)

## Project Setup

### 1. Create Project Structure

```bash
mkdir nexure-todo-api
cd nexure-todo-api
npm init -y
npm install nexurejs
npm install -D typescript @types/node nodemon
```

### 2. Configure TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3. Update package.json

```json
{
  "type": "module",
  "scripts": {
    "dev": "nodemon --exec \"npx tsc && node dist/server.js\"",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

### 4. Create Project Structure

```bash
mkdir -p src/{models,controllers,middleware,utils}
touch src/{server.ts,models/task.ts,controllers/taskController.ts,middleware/auth.ts,utils/validation.ts}
```

## Building the Application

### 1. Create the Server

Create `src/server.ts`:

```typescript
import { createApp, HttpContext } from 'nexurejs';
import { taskController } from './controllers/taskController.js';
import { authMiddleware } from './middleware/auth.js';

const app = createApp({
  performance: {
    simd: true,
    nativeAcceleration: true,
    monitoring: true
  },
  security: {
    cors: true,
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    }
  },
  logging: {
    level: 'info',
    format: 'pretty'
  }
});

// Global middleware
app.use(async (ctx: HttpContext, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${duration}ms`);
});

// JSON body parser
app.use(async (ctx: HttpContext, next) => {
  if (ctx.request.headers['content-type']?.includes('application/json')) {
    let body = '';
    ctx.request.on('data', chunk => body += chunk);
    ctx.request.on('end', () => {
      try {
        ctx.request.body = JSON.parse(body);
      } catch (error) {
        ctx.request.body = {};
      }
    });
  }
  await next();
});

// Health check endpoint
app.get('/health', (ctx: HttpContext) => {
  ctx.response.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    performance: ctx.app.getMetrics()
  });
});

// Authentication routes
app.post('/auth/login', taskController.login);
app.post('/auth/register', taskController.register);

// Protected task routes
app.get('/tasks', authMiddleware, taskController.getAllTasks);
app.get('/tasks/:id', authMiddleware, taskController.getTask);
app.post('/tasks', authMiddleware, taskController.createTask);
app.put('/tasks/:id', authMiddleware, taskController.updateTask);
app.delete('/tasks/:id', authMiddleware, taskController.deleteTask);

// Global error handler
app.use(async (ctx: HttpContext, next) => {
  try {
    await next();
  } catch (error: any) {
    console.error('Application error:', error);

    ctx.response.status = error.status || 500;
    ctx.response.json({
      error: error.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack
      })
    });
  }
});

const PORT = process.env.PORT || 3000;

await app.start(PORT);
console.log(`🚀 Server running at http://localhost:${PORT}`);
```

### 2. Create Task Model

Create `src/models/task.ts`:

```typescript
export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  createdAt: Date;
}

// In-memory storage (use a database in production)
export const tasks: Task[] = [];
export const users: User[] = [];

export class TaskModel {
  static generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  static findByUserId(userId: string): Task[] {
    return tasks.filter(task => task.userId === userId);
  }

  static findById(id: string): Task | undefined {
    return tasks.find(task => task.id === id);
  }

  static create(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
    const task: Task = {
      id: this.generateId(),
      ...taskData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    tasks.push(task);
    return task;
  }

  static update(id: string, updates: Partial<Task>): Task | null {
    const taskIndex = tasks.findIndex(task => task.id === id);
    if (taskIndex === -1) return null;

    tasks[taskIndex] = {
      ...tasks[taskIndex],
      ...updates,
      updatedAt: new Date()
    };

    return tasks[taskIndex];
  }

  static delete(id: string): boolean {
    const taskIndex = tasks.findIndex(task => task.id === id);
    if (taskIndex === -1) return false;

    tasks.splice(taskIndex, 1);
    return true;
  }
}

export class UserModel {
  static generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  static findByEmail(email: string): User | undefined {
    return users.find(user => user.email === email);
  }

  static findById(id: string): User | undefined {
    return users.find(user => user.id === id);
  }

  static create(userData: Omit<User, 'id' | 'createdAt'>): User {
    const user: User = {
      id: this.generateId(),
      ...userData,
      createdAt: new Date()
    };

    users.push(user);
    return user;
  }
}
```

### 3. Create Authentication Middleware

Create `src/middleware/auth.ts`:

```typescript
import { HttpContext } from 'nexurejs';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/task.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthenticatedContext extends HttpContext {
  user?: {
    id: string;
    username: string;
    email: string;
  };
}

export const authMiddleware = async (ctx: AuthenticatedContext, next: () => Promise<void>) => {
  const token = ctx.request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    ctx.response.status = 401;
    ctx.response.json({ error: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = UserModel.findById(decoded.userId);

    if (!user) {
      ctx.response.status = 401;
      ctx.response.json({ error: 'Invalid token' });
      return;
    }

    ctx.user = {
      id: user.id,
      username: user.username,
      email: user.email
    };

    await next();
  } catch (error) {
    ctx.response.status = 401;
    ctx.response.json({ error: 'Invalid token' });
  }
};
```

### 4. Create Validation Utilities

Create `src/utils/validation.ts`:

```typescript
export interface ValidationError {
  field: string;
  message: string;
}

export class ValidationResult {
  constructor(
    public isValid: boolean,
    public errors: ValidationError[] = []
  ) {}
}

export const validateTask = (data: any): ValidationResult => {
  const errors: ValidationError[] = [];

  if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required and must be a non-empty string' });
  }

  if (data.title && data.title.length > 100) {
    errors.push({ field: 'title', message: 'Title must be less than 100 characters' });
  }

  if (data.description && typeof data.description !== 'string') {
    errors.push({ field: 'description', message: 'Description must be a string' });
  }

  if (data.completed !== undefined && typeof data.completed !== 'boolean') {
    errors.push({ field: 'completed', message: 'Completed must be a boolean' });
  }

  return new ValidationResult(errors.length === 0, errors);
};

export const validateUser = (data: any): ValidationResult => {
  const errors: ValidationError[] = [];

  if (!data.username || typeof data.username !== 'string' || data.username.trim().length === 0) {
    errors.push({ field: 'username', message: 'Username is required' });
  }

  if (!data.email || typeof data.email !== 'string' || !isValidEmail(data.email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }

  if (!data.password || typeof data.password !== 'string' || data.password.length < 6) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters' });
  }

  return new ValidationResult(errors.length === 0, errors);
};

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
```

### 5. Create Task Controller

Create `src/controllers/taskController.ts`:

```typescript
import { HttpContext } from 'nexurejs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { TaskModel, UserModel } from '../models/task.js';
import { validateTask, validateUser } from '../utils/validation.js';
import { AuthenticatedContext } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const taskController = {
  // Authentication
  async register(ctx: HttpContext) {
    const validation = validateUser(ctx.request.body);
    if (!validation.isValid) {
      ctx.response.status = 400;
      ctx.response.json({ errors: validation.errors });
      return;
    }

    const { username, email, password } = ctx.request.body;

    // Check if user already exists
    if (UserModel.findByEmail(email)) {
      ctx.response.status = 409;
      ctx.response.json({ error: 'User already exists' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = UserModel.create({
      username,
      email,
      password: hashedPassword
    });

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    ctx.response.status = 201;
    ctx.response.json({
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  },

  async login(ctx: HttpContext) {
    const { email, password } = ctx.request.body;

    if (!email || !password) {
      ctx.response.status = 400;
      ctx.response.json({ error: 'Email and password are required' });
      return;
    }

    // Find user
    const user = UserModel.findByEmail(email);
    if (!user) {
      ctx.response.status = 401;
      ctx.response.json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      ctx.response.status = 401;
      ctx.response.json({ error: 'Invalid credentials' });
      return;
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    ctx.response.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  },

  // Task CRUD operations
  async getAllTasks(ctx: AuthenticatedContext) {
    const tasks = TaskModel.findByUserId(ctx.user!.id);
    ctx.response.json({ tasks });
  },

  async getTask(ctx: AuthenticatedContext) {
    const { id } = ctx.params;
    const task = TaskModel.findById(id);

    if (!task || task.userId !== ctx.user!.id) {
      ctx.response.status = 404;
      ctx.response.json({ error: 'Task not found' });
      return;
    }

    ctx.response.json({ task });
  },

  async createTask(ctx: AuthenticatedContext) {
    const validation = validateTask(ctx.request.body);
    if (!validation.isValid) {
      ctx.response.status = 400;
      ctx.response.json({ errors: validation.errors });
      return;
    }

    const { title, description } = ctx.request.body;

    const task = TaskModel.create({
      title,
      description: description || '',
      completed: false,
      userId: ctx.user!.id
    });

    ctx.response.status = 201;
    ctx.response.json({
      message: 'Task created successfully',
      task
    });
  },

  async updateTask(ctx: AuthenticatedContext) {
    const { id } = ctx.params;
    const task = TaskModel.findById(id);

    if (!task || task.userId !== ctx.user!.id) {
      ctx.response.status = 404;
      ctx.response.json({ error: 'Task not found' });
      return;
    }

    const validation = validateTask({ ...task, ...ctx.request.body });
    if (!validation.isValid) {
      ctx.response.status = 400;
      ctx.response.json({ errors: validation.errors });
      return;
    }

    const updatedTask = TaskModel.update(id, ctx.request.body);

    ctx.response.json({
      message: 'Task updated successfully',
      task: updatedTask
    });
  },

  async deleteTask(ctx: AuthenticatedContext) {
    const { id } = ctx.params;
    const task = TaskModel.findById(id);

    if (!task || task.userId !== ctx.user!.id) {
      ctx.response.status = 404;
      ctx.response.json({ error: 'Task not found' });
      return;
    }

    TaskModel.delete(id);

    ctx.response.json({ message: 'Task deleted successfully' });
  }
};
```

### 6. Install Additional Dependencies

```bash
npm install jsonwebtoken bcryptjs
npm install -D @types/jsonwebtoken @types/bcryptjs
```

## Running the Application

### 1. Start the Development Server

```bash
npm run dev
```

### 2. Test the API

#### Register a new user:
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "password123"
  }'
```

#### Login:
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

#### Create a task (use the token from login):
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "title": "Learn NexureJS",
    "description": "Build a todo API with NexureJS"
  }'
```

#### Get all tasks:
```bash
curl -X GET http://localhost:3000/tasks \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## What You've Learned

In this tutorial, you've built a complete REST API with NexureJS that includes:

1. **Server Setup**: Created a NexureJS application with configuration
2. **Routing**: Defined routes for authentication and CRUD operations
3. **Middleware**: Implemented authentication and logging middleware
4. **Validation**: Added input validation for requests
5. **Error Handling**: Implemented global error handling
6. **Security**: Added JWT authentication and rate limiting
7. **Performance**: Enabled native acceleration and monitoring

## Next Steps

Now that you've built your first application:

1. **[Learn Core Concepts](../core/application.md)** - Understand the framework architecture
2. **[Explore Middleware](../core/middleware.md)** - Add more functionality
3. **[Implement Security](../security/overview.md)** - Add more security features
4. **[Optimize Performance](../performance/optimization.md)** - Enable more optimizations
5. **[Deploy to Production](../deployment/production.md)** - Get your app live

## Improvements for Production

Consider these improvements for a production application:

- Use a real database (PostgreSQL, MongoDB, etc.)
- Add comprehensive logging
- Implement proper error handling
- Add API documentation (OpenAPI/Swagger)
- Set up monitoring and health checks
- Add unit and integration tests
- Implement proper environment configuration
- Add database migrations
- Implement caching strategies
- Add API versioning

## Resources

- [API Reference](../reference/api.md)
- [Examples](../reference/examples.md)
- [Security Guide](../security/overview.md)
- [Performance Guide](../performance/optimization.md)
