#!/usr/bin/env node

/**
 * NexureJS CLI Tool
 *
 * A command-line interface for creating and managing NexureJS projects
 */

import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The CLI's reported version and the version it scaffolds new projects against
// both derive from this package's own package.json, so they cannot drift.
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('nexure')
  .description('NexureJS CLI - High-performance Node.js framework')
  .version(pkg.version);

// Create new project command
program
  .command('create <project-name>')
  .description('Create a new NexureJS project')
  .option('-t, --template <type>', 'Project template (basic, api, full)', 'basic')
  .option('--typescript', 'Use TypeScript', false)
  .option('--native', 'Include native modules setup', true)
  .action(async (projectName, options) => {
    await createProject(projectName, options);
  });

// Initialize command for existing directory
program
  .command('init')
  .description('Initialize NexureJS in current directory')
  .option('-t, --template <type>', 'Project template (basic, api, full)', 'basic')
  .option('--typescript', 'Use TypeScript', false)
  .option('--native', 'Include native modules setup', true)
  .action(async (options) => {
    await initProject('.', options);
  });

// Generate command for scaffolding
program
  .command('generate <type> <name>')
  .alias('g')
  .description('Generate project files (controller, middleware, service)')
  .action(async (type, name) => {
    await generateFile(type, name);
  });

// Dev server command
program
  .command('dev')
  .description('Start development server with hot reload')
  .option('-p, --port <number>', 'Port number', '3000')
  .option('--watch', 'Enable file watching', true)
  .action(async (options) => {
    await runDevServer(options);
  });

// Build command
program
  .command('build')
  .description('Build the project for production')
  .option('--native', 'Build native modules', true)
  .option('--prod', 'Production build', false)
  .action(async (options) => {
    await buildProject(options);
  });

// Test command
program
  .command('test')
  .description('Run tests')
  .option('--native', 'Test native modules', false)
  .option('--coverage', 'Generate coverage report', false)
  .action(async (options) => {
    await runTests(options);
  });

program.parse();

/**
 * Create a new NexureJS project
 */
async function createProject(projectName, options) {
  console.log(`🚀 Creating NexureJS project: ${projectName}`);

  try {
    // Create project directory
    const projectPath = path.resolve(projectName);
    await fs.mkdir(projectPath, { recursive: true });

    // Initialize the project
    await initProject(projectPath, options);

    console.log(`✅ Project created successfully!`);
    console.log(`\nNext steps:`);
    console.log(`  cd ${projectName}`);
    console.log(`  npm install`);
    console.log(`  npm run dev`);

  } catch (error) {
    console.error(`❌ Error creating project:`, error.message);
    process.exit(1);
  }
}

/**
 * Initialize NexureJS in existing directory
 */
async function initProject(projectPath, options) {
  const { template, typescript, native } = options;

  console.log(`📁 Initializing NexureJS project with template: ${template}`);

  // Create package.json
  const packageJson = {
    name: path.basename(path.resolve(projectPath)),
    version: '1.0.0',
    description: 'A NexureJS application',
    main: typescript ? 'dist/index.js' : 'src/index.js',
    type: 'module',
    scripts: {
      dev: typescript ? 'npm run build && node dist/index.js' : 'node src/index.js',
      build: typescript ? 'tsc' : 'echo "No build step required"',
      start: typescript ? 'node dist/index.js' : 'node src/index.js',
      test: 'npm run test:unit',
      'test:unit': 'jest',
      'test:native': native ? 'node test/native.test.js' : 'echo "Native tests not configured"'
    },
    dependencies: {
      nexurejs: `^${pkg.version}`
    },
    devDependencies: typescript ? {
      typescript: '^5.8.2',
      '@types/node': '^22.13.10',
      jest: '^29.7.0'
    } : {
      jest: '^29.7.0'
    }
  };

  await fs.writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Create source files based on template
  await createTemplateFiles(projectPath, template, typescript, native);

  console.log(`✅ Initialized ${template} template ${typescript ? 'with TypeScript' : 'with JavaScript'}`);
}

/**
 * Create template files
 */
async function createTemplateFiles(projectPath, template, typescript, native) {
  const srcDir = path.join(projectPath, 'src');
  await fs.mkdir(srcDir, { recursive: true });

  const ext = typescript ? '.ts' : '.js';

  // Create main application file
  const appContent = getAppTemplate(template, typescript, native);
  await fs.writeFile(path.join(srcDir, `index${ext}`), appContent);

  // Create additional files based on template
  switch (template) {
    case 'api':
      await createApiTemplate(projectPath, typescript);
      break;
    case 'full':
      await createFullTemplate(projectPath, typescript);
      break;
    default:
      await createBasicTemplate(projectPath, typescript);
  }

  // Create TypeScript config if needed
  if (typescript) {
    const tsConfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'node',
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist']
    };

    await fs.writeFile(
      path.join(projectPath, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2)
    );
  }

  // Create test directory
  const testDir = path.join(projectPath, 'test');
  await fs.mkdir(testDir, { recursive: true });

  const testContent = getTestTemplate(typescript);
  await fs.writeFile(path.join(testDir, `app.test${ext}`), testContent);

  // Create README
  const readmeContent = getReadmeTemplate(template, typescript);
  await fs.writeFile(path.join(projectPath, 'README.md'), readmeContent);
}

/**
 * Get application template content
 */
function getAppTemplate(template, typescript, native) {
  const imports = typescript
    ? `import { Nexure, HttpMethod } from 'nexurejs';`
    : `import { Nexure, HttpMethod } from 'nexurejs';`;

  return `${imports}

// Create NexureJS application
const app = new Nexure({
  logger: {
    level: 'info',
    prettyPrint: true
  }${native ? `,
  performance: {
    nativeModules: true
  }` : ''}
});

// Basic route
app.route({
  path: '/',
  method: HttpMethod.GET,
  handler: (req, res) => {
    res.status(200).json({
      message: 'Hello from NexureJS!',
      timestamp: new Date().toISOString(),
      template: '${template}'
    });
  }
});

// Health check route
app.route({
  path: '/health',
  method: HttpMethod.GET,
  handler: (req, res) => {
    res.status(200).json({
      status: 'healthy',
      uptime: process.uptime()
    });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(\`🚀 Server running at http://localhost:\${port}\`);
  console.log(\`📖 API endpoints:\`);
  console.log(\`   GET  /       - Welcome message\`);
  console.log(\`   GET  /health - Health check\`);
});`;
}

/**
 * Create API template files
 */
async function createApiTemplate(projectPath, typescript) {
  const ext = typescript ? '.ts' : '.js';
  const routesDir = path.join(projectPath, 'src', 'routes');
  await fs.mkdir(routesDir, { recursive: true });

  const userRoutes = `import { Router, HttpMethod } from 'nexurejs';

const router = new Router();

// Get all users
router.route({
  path: '/users',
  method: HttpMethod.GET,
  handler: (req, res) => {
    res.status(200).json([
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
    ]);
  }
});

// Get user by ID
router.route({
  path: '/users/:id',
  method: HttpMethod.GET,
  handler: (req, res) => {
    const id = parseInt(req.params.id);
    res.status(200).json({
      id,
      name: \`User \${id}\`,
      email: \`user\${id}@example.com\`
    });
  }
});

// Create user
router.route({
  path: '/users',
  method: HttpMethod.POST,
  handler: async (req, res) => {
    const body = await req.json();
    res.status(201).json({
      id: Date.now(),
      ...body,
      created: new Date().toISOString()
    });
  }
});

export default router;`;

  await fs.writeFile(path.join(routesDir, `users${ext}`), userRoutes);
}

/**
 * Create full template files
 */
async function createFullTemplate(projectPath, typescript) {
  await createApiTemplate(projectPath, typescript);

  // Add middleware directory
  const middlewareDir = path.join(projectPath, 'src', 'middleware');
  await fs.mkdir(middlewareDir, { recursive: true });

  const ext = typescript ? '.ts' : '.js';

  const authMiddleware = `export function authMiddleware(req, res, next) {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  // Add user info to request
  req.user = { id: 1, name: 'User' };
  next();
}`;

  await fs.writeFile(path.join(middlewareDir, `auth${ext}`), authMiddleware);
}

/**
 * Create basic template files
 */
async function createBasicTemplate(projectPath, typescript) {
  // Basic template is already handled by the main index file
}

/**
 * Get test template
 */
function getTestTemplate(typescript) {
  const imports = typescript
    ? `import { Nexure, HttpMethod } from 'nexurejs';`
    : `import { Nexure, HttpMethod } from 'nexurejs';`;

  return `${imports}

describe('NexureJS App', () => {
  let app;

  beforeEach(() => {
    app = new Nexure();
  });

  test('should create app instance', () => {
    expect(app).toBeDefined();
  });

  test('should handle basic route', async () => {
    app.route({
      path: '/',
      method: HttpMethod.GET,
      handler: (req, res) => {
        res.status(200).json({ message: 'test' });
      }
    });

    // Add your testing logic here
    expect(true).toBe(true);
  });
});`;
}

/**
 * Get README template
 */
function getReadmeTemplate(template, typescript) {
  return `# NexureJS ${template.charAt(0).toUpperCase() + template.slice(1)} Application

A high-performance Node.js application built with NexureJS${typescript ? ' and TypeScript' : ''}.

## Getting Started

### Installation

\`\`\`bash
npm install
\`\`\`

### Development

\`\`\`bash
npm run dev
\`\`\`

### Production

\`\`\`bash
npm run build
npm start
\`\`\`

### Testing

\`\`\`bash
npm test
\`\`\`

## API Endpoints

- \`GET /\` - Welcome message
- \`GET /health\` - Health check
${template === 'api' || template === 'full' ? `
### User API

- \`GET /users\` - Get all users
- \`GET /users/:id\` - Get user by ID
- \`POST /users\` - Create new user` : ''}

## Learn More

- [NexureJS Documentation](https://github.com/Braineanear/nexurejs)
- [API Reference](https://github.com/Braineanear/nexurejs/docs/API_REFERENCE.md)
- [Examples](https://github.com/Braineanear/nexurejs/examples)
`;
}

/**
 * Generate specific file types
 */
async function generateFile(type, name) {
  console.log(`📄 Generating ${type}: ${name}`);

  try {
    switch (type) {
      case 'controller':
        await generateController(name);
        break;
      case 'middleware':
        await generateMiddleware(name);
        break;
      case 'service':
        await generateService(name);
        break;
      default:
        throw new Error(`Unknown generator type: ${type}`);
    }

    console.log(`✅ Generated ${type} successfully!`);
  } catch (error) {
    console.error(`❌ Error generating ${type}:`, error.message);
    process.exit(1);
  }
}

/**
 * Generate controller file
 */
async function generateController(name) {
  const content = `import { Router, HttpMethod } from 'nexurejs';

const ${name}Controller = new Router();

${name}Controller.route({
  path: '/${name.toLowerCase()}',
  method: HttpMethod.GET,
  handler: (req, res) => {
    res.status(200).json({
      message: 'Hello from ${name} controller'
    });
  }
});

export default ${name}Controller;`;

  await fs.writeFile(`src/controllers/${name.toLowerCase()}.controller.js`, content);
}

/**
 * Generate middleware file
 */
async function generateMiddleware(name) {
  const content = `export function ${name}Middleware(req, res, next) {
  console.log(\`${name} middleware executed\`);

  // Add your middleware logic here

  next();
}`;

  await fs.mkdir('src/middleware', { recursive: true });
  await fs.writeFile(`src/middleware/${name.toLowerCase()}.middleware.js`, content);
}

/**
 * Generate service file
 */
async function generateService(name) {
  const content = `class ${name}Service {
  constructor() {
    console.log(\`${name}Service initialized\`);
  }

  async getData() {
    // Add your service logic here
    return {
      message: 'Data from ${name}Service'
    };
  }
}

export default new ${name}Service();`;

  await fs.mkdir('src/services', { recursive: true });
  await fs.writeFile(`src/services/${name.toLowerCase()}.service.js`, content);
}

/**
 * Run development server
 */
async function runDevServer(options) {
  console.log(`🔥 Starting NexureJS development server on port ${options.port}...`);

  // This would typically start nodemon or a similar tool
  console.log(`📁 Watching for file changes...`);
  console.log(`🌐 Server available at http://localhost:${options.port}`);

  // For now, just run the application
  try {
    const { exec } = await import('child_process');
    exec('npm run dev', (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`⚠️ Warning: ${stderr}`);
        return;
      }
      console.log(stdout);
    });
  } catch (error) {
    console.error(`❌ Failed to start dev server:`, error.message);
  }
}

/**
 * Build project
 */
async function buildProject(options) {
  console.log(`🔨 Building NexureJS project...`);

  try {
    const { exec } = await import('child_process');
    exec('npm run build', (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Build failed: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`⚠️ Build warnings: ${stderr}`);
      }
      console.log(`✅ Build completed successfully!`);
      console.log(stdout);
    });
  } catch (error) {
    console.error(`❌ Build failed:`, error.message);
  }
}

/**
 * Run tests
 */
async function runTests(options) {
  console.log(`🧪 Running tests...`);

  try {
    const { exec } = await import('child_process');
    const command = options.coverage ? 'npm run test:coverage' : 'npm test';

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Tests failed: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`⚠️ Test warnings: ${stderr}`);
      }
      console.log(`✅ Tests completed!`);
      console.log(stdout);
    });
  } catch (error) {
    console.error(`❌ Tests failed:`, error.message);
  }
}
