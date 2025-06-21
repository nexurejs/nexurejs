// @ts-nocheck
// Simple NexureJS Server Example
import 'reflect-metadata';
import {
  Nexure,
  Controller,
  Get,
  Post,
  Injectable,
  HttpException
} from '../src/index.js';
import { PerformanceMonitor } from '../src/utils/performance-monitor.js';
import { getAllPerformanceMetrics } from '../src/native/index.js';

// Create a performance monitor
const monitor = new PerformanceMonitor({
  memoryMonitoring: true,
  eventLoopMonitoring: true,
  gcMonitoring: false
});

// Start monitoring
monitor.start();

// Define the request context interface
interface RequestContext {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
  req?: any;
  res?: any;
}

// Create a service for user operations
@Injectable()
class UserService {
  getUsers(): { id: number; name: string }[] {
    return [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' }
    ];
  }

  createUser(name: string): { id: number; name: string; created: string } {
    if (!name) {
      throw HttpException.badRequest('Name is required');
    }

    return {
      id: Date.now(),
      name,
      created: new Date().toISOString()
    };
  }
}

// Create a service for metrics
@Injectable()
class MetricsService {
  private monitor: PerformanceMonitor;

  constructor() {
    this.monitor = monitor;
  }

  getAllMetrics(): {
    native: any;
    memory: any;
    eventLoop: any;
    customMetrics: any;
  } {
    const nativeMetrics = getAllPerformanceMetrics();
    const perfReport = this.monitor.createReport();

    return {
      native: nativeMetrics,
      memory: perfReport.memory,
      eventLoop: perfReport.eventLoop,
      customMetrics: perfReport.metrics
    };
  }
}

// Create controllers
@Controller('/')
class HomeController {
  @Get('/')
  index(): { message: string } {
    return { message: 'Welcome to NexureJS!' };
  }

  @Get('/hello/:name')
  getHello({ params }: RequestContext): { message: string } {
    const name = params?.name || 'World';
    return { message: `Hello, ${name}!` };
  }
}

@Controller('/api/users')
class UserController {
  constructor(private userService: UserService) {}

  @Get('/')
  getUsers(): { id: number; name: string }[] {
    return this.userService.getUsers();
  }

  @Post('/')
  createUser({ body }: RequestContext): { id: number; name: string; created: string } {
    return this.userService.createUser(body?.name);
  }
}

@Controller('/metrics')
class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @Get('/')
  getMetrics(): {
    native: any;
    memory: any;
    eventLoop: any;
    customMetrics: any;
  } {
    return this.metricsService.getAllMetrics();
  }
}

// Add middleware to measure response time
const responseTimeMiddleware = async (req: any, res: any, next: () => void): Promise<void> => {
  const start = process.hrtime();

  // Add response finished listener
  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const ms = seconds * 1000 + nanoseconds / 1000000;
    console.log(`${req.method} ${req.url} - ${ms.toFixed(2)}ms`);

    // Record the metric
    monitor.recordMetric(`http.${req.method.toLowerCase()}.${req.url}`, ms, 'ms');
  });

  await next();
};

// Create the application
const app = new Nexure({
  logging: true,
  prettyJson: true
});

// Add middleware
app.use(responseTimeMiddleware);

// Register the controllers
app.register(HomeController);
app.register(UserController);
app.register(MetricsController);

// Start the server
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`NexureJS server is running at http://localhost:${PORT}`);
  console.log('\nTry the following routes:');
  console.log('  GET  / - Welcome message');
  console.log('  GET  /hello/:name - Personalized greeting');
  console.log('  GET  /api/users - List of users');
  console.log('  POST /api/users - Create a user (requires JSON body: {"name": "Your Name"})');
  console.log('  GET  /metrics - View performance metrics');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  monitor.stop();
  process.exit(0);
});
