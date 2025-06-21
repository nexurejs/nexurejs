# Installation Guide

This guide will help you install and set up NexureJS for development and production use.

## 🎯 Quick Navigation

| 🚀 **Quick Install** | 🛠️ **Development Setup** | 🏭 **Production** | 🔧 **Troubleshooting** |
|:---:|:---:|:---:|:---:|
| [Basic Installation](#basic-installation) | [Development Environment](#development-environment) | [Production Setup](#production-setup) | [Common Issues](#troubleshooting) |
| [Verify Installation](#verification) | [Native Modules](#native-modules) | [Docker Setup](#docker-deployment) | [Build Tools](#build-tools) |
| [First Steps](#next-steps) | [IDE Setup](#ide-configuration) | [Performance Tuning](#performance-optimization) | [Platform Issues](#platform-specific-issues) |

## 📋 Prerequisites

### System Requirements
- **Node.js**: 18.0.0 or higher (LTS recommended)
- **Operating System**: Linux, macOS, Windows (ARM64 and x86_64)
- **Memory**: 4GB RAM minimum (8GB+ recommended for development)
- **Storage**: 2GB free space for full development setup

### Platform Support Matrix

| Platform | Native Modules | Performance | Status |
|----------|----------------|-------------|---------|
| **Linux x64** | ✅ Full Support | 🚀 Excellent | Recommended |
| **macOS ARM64** | ✅ Full Support | 🚀 Excellent | Recommended |
| **macOS x64** | ✅ Full Support | ⚡ Very Good | Supported |
| **Windows x64** | ✅ Full Support | ⚡ Good | Supported |
| **Linux ARM64** | ⚠️ Limited | ⚡ Good | Beta |

## 🚀 Basic Installation

### Method 1: NPM (Recommended)

```bash
# Install NexureJS
npm install nexurejs

# For TypeScript projects
npm install -D typescript @types/node

# Verify installation
npx nexure --version
```

### Method 2: Project Template

```bash
# Create new project with template
npx create-nexure-app my-app
cd my-app

# Start development
npm run dev
```

### Method 3: Manual Setup

```bash
# Create project directory
mkdir my-nexure-app && cd my-nexure-app

# Initialize package.json
npm init -y

# Install NexureJS
npm install nexurejs

# Create basic app
cat > index.js << 'EOF'
import { createApp } from 'nexurejs';

const app = createApp();

app.get('/', (ctx) => {
  ctx.response.json({ message: 'Hello NexureJS!' });
});

await app.start(3000);
console.log('🚀 Server running at http://localhost:3000');
EOF

# Run the app
node index.js
```

## 🛠️ Development Environment

### Automated Setup

NexureJS includes automated development environment setup:

```bash
# Clone the repository
git clone https://github.com/nexurejs/nexurejs.git
cd nexurejs

# Install dependencies (includes automated setup)
npm install

# Check system information
npm run info

# Run health check
npm run health

# Build everything
npm run build:all
```

The `npm install` process will automatically:
- ✅ Set up Git hooks (if in a Git repository)
- ✅ Check native build tools
- ✅ Create necessary directories
- ✅ Display welcome message with next steps

### Manual Development Setup

If you prefer manual setup or the automated process fails:

```bash
# Install dependencies
npm ci

# Set up Git hooks
npx husky install

# Build TypeScript
npm run build:ts

# Build native modules (optional)
npm run build:native

# Run tests
npm run test

# Start development server
npm run dev
```

## ⚡ Native Modules

NexureJS includes optional native modules for maximum performance.

### Automatic Native Module Installation

```bash
# Install with native modules (recommended)
npm install nexurejs

# The postinstall script will automatically:
# - Check for build tools
# - Attempt to build native modules
# - Fall back to JavaScript if build fails
```

### Manual Native Module Setup

```bash
# Check if native modules are available
npm run info

# Force rebuild native modules
npm run build:native

# Install only native modules
npm run install:native

# Install lightweight version (no native modules)
npm run install:lite
```

### Build Tools Setup

Native modules require C++ build tools:

#### Linux (Ubuntu/Debian)
```bash
# Install build essentials
sudo apt-get update
sudo apt-get install -y build-essential python3 python3-pip

# Install Node.js build tools
npm install -g node-gyp
```

#### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Or install via Homebrew
brew install python3 node-gyp
```

#### Windows
```bash
# Install Visual Studio Build Tools
npm install -g windows-build-tools

# Or manually install:
# - Visual Studio 2019+ with C++ tools
# - Python 3.7+
# - Node.js native addon build tool
npm install -g node-gyp
```

## 📊 Verification

### Quick Verification

```bash
# Check installation
npm run info

# Run health check
npm run health

# Test basic functionality
node -e "
import('nexurejs').then(({ createApp }) => {
  const app = createApp();
  app.get('/', (ctx) => ctx.response.json({ status: 'ok' }));
  console.log('✅ NexureJS installed successfully!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Installation failed:', err.message);
  process.exit(1);
});
"
```

### Comprehensive Verification

```bash
# Run all verification tests
npm run test:all

# Check bundle size
npm run size

# Run benchmarks
npm run benchmark

# Test examples
npm run test:examples:basic
```

### Verification Checklist

Run this verification script to ensure everything is working:

```bash
#!/bin/bash
echo "🔍 NexureJS Installation Verification"
echo "======================================"

# Check Node.js version
node_version=$(node -v)
echo "✅ Node.js: $node_version"

# Check NPM version
npm_version=$(npm -v)
echo "✅ NPM: $npm_version"

# Check NexureJS installation
if npm list nexurejs > /dev/null 2>&1; then
  nexure_version=$(npm list nexurejs --depth=0 | grep nexurejs | cut -d'@' -f2)
  echo "✅ NexureJS: $nexure_version"
else
  echo "❌ NexureJS: Not installed"
  exit 1
fi

# Check TypeScript (if using TypeScript)
if command -v tsc > /dev/null; then
  ts_version=$(tsc -v)
  echo "✅ TypeScript: $ts_version"
fi

# Check native modules
if [ -d "node_modules/nexurejs/build" ]; then
  echo "✅ Native modules: Built"
else
  echo "⚠️  Native modules: Not built (using JavaScript fallback)"
fi

echo ""
echo "🎉 Installation verification complete!"
```

## 🏭 Production Setup

### Optimized Production Installation

```bash
# Install production dependencies only
npm ci --only=production

# Build for production
npm run build:prod

# Optimize bundle
npm run bundle:prod

# Check production readiness
npm run health
```

### Environment Configuration

Create a production configuration file:

```javascript
// nexure.config.js
export default {
  server: {
    port: process.env.PORT || 3000,
    hostname: process.env.HOST || '0.0.0.0',
    clustering: process.env.NODE_ENV === 'production'
  },

  performance: {
    simd: true,
    nativeAcceleration: true,
    memoryOptimization: true,
    compression: true,
    monitoring: true
  },

  security: {
    helmet: true,
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
      credentials: true
    },
    rateLimit: {
      max: parseInt(process.env.RATE_LIMIT_MAX) || 1000,
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000
    }
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json'
  }
};
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build:prod

FROM node:20-alpine AS production

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

CMD ["npm", "start"]
```

### Kubernetes Deployment

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nexure-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nexure-app
  template:
    metadata:
      labels:
        app: nexure-app
    spec:
      containers:
      - name: app
        image: nexure-app:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

## 🔧 IDE Configuration

### Visual Studio Code

Install recommended extensions:

```bash
# Install VS Code extensions
code --install-extension ms-vscode.vscode-typescript-next
code --install-extension bradlc.vscode-tailwindcss
code --install-extension ms-vscode.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension ms-vscode.vscode-json
```

Create `.vscode/settings.json`:

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.autoFixOnSave": true,
  "files.associations": {
    "*.ts": "typescript"
  },
  "typescript.preferences.includePackageJsonAutoImports": "on"
}
```

Create `.vscode/launch.json` for debugging:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug NexureJS App",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/index.js",
      "preLaunchTask": "npm: build",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "envFile": "${workspaceFolder}/.env",
      "console": "integratedTerminal"
    }
  ]
}
```

### IntelliJ IDEA / WebStorm

1. Enable TypeScript support
2. Configure Node.js interpreter
3. Set up ESLint and Prettier
4. Configure run configurations for development and testing

## ⚡ Performance Optimization

### Development Performance

```bash
# Use faster TypeScript compilation
npm run build:ts -- --incremental

# Use watch mode for development
npm run dev:watch

# Enable native modules for maximum performance
npm run build:native
```

### Production Performance

```bash
# Build with optimizations
NODE_ENV=production npm run build:prod

# Enable clustering
export CLUSTERING=true

# Optimize memory usage
export NODE_OPTIONS="--max-old-space-size=4096"

# Enable native performance features
export NEXURE_SIMD=true
export NEXURE_NATIVE_ACCELERATION=true
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Native Module Build Failures

**Problem**: Native modules fail to compile

**Solutions**:
```bash
# Check build tools
npm run info

# Install missing build tools (see Build Tools Setup above)

# Clear cache and rebuild
npm run clean:all
npm install

# Use JavaScript fallback
npm run install:lite
```

#### 2. TypeScript Compilation Errors

**Problem**: TypeScript compilation fails

**Solutions**:
```bash
# Check TypeScript version
npx tsc --version

# Clear TypeScript cache
npx tsc --build --clean

# Rebuild from scratch
npm run clean
npm run build:ts
```

#### 3. Import/Export Errors

**Problem**: Module import errors

**Solutions**:
```bash
# Check module type in package.json
grep '"type"' package.json

# For ES modules, ensure .js extensions in imports
# For CommonJS, use require() syntax

# Check file extensions match import style
```

#### 4. Port Already in Use

**Problem**: Development server port conflicts

**Solutions**:
```bash
# Use different port
PORT=3001 npm run dev

# Find and kill process using port
lsof -ti:3000 | xargs kill -9

# Use automatic port detection
npm run dev -- --port auto
```

### Platform-Specific Issues

#### macOS Issues

```bash
# Xcode Command Line Tools not installed
xcode-select --install

# Permission issues with global packages
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Apple Silicon compatibility
arch -arm64 npm install
```

#### Windows Issues

```bash
# PowerShell execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Long path issues
git config --system core.longpaths true

# Build tools not found
npm install -g windows-build-tools
```

#### Linux Issues

```bash
# Missing build essentials
sudo apt-get install build-essential python3-dev

# Permission issues
sudo chown -R $USER:$USER ~/.npm

# Node.js version issues
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Advanced Troubleshooting

#### Debug Mode

```bash
# Enable debug logging
DEBUG=nexure:* npm run dev

# Enable Node.js debug mode
NODE_OPTIONS="--inspect" npm run dev

# Enable verbose npm logging
npm run build --verbose
```

#### Performance Debugging

```bash
# Profile application startup
npm run profile:cpu

# Check memory usage
npm run profile:memory

# Analyze bundle size
npm run size

# Run performance benchmarks
npm run benchmark
```

#### Health Diagnostics

```bash
# Run comprehensive health check
npm run health

# Check system information
npm run info

# Verify all dependencies
npm run deps:check

# Test all examples
npm run test:examples:all
```

## 📞 Getting Help

### Self-Service Resources

1. **System Information**: `npm run info`
2. **Health Check**: `npm run health`
3. **Documentation**: Browse `docs/` directory
4. **Examples**: Check `examples/` directory
5. **Troubleshooting**: Review error messages and logs

### Community Support

- **GitHub Issues**: [Report bugs and request features](https://github.com/nexurejs/nexurejs/issues)
- **Discussions**: [Community discussions and Q&A](https://github.com/nexurejs/nexurejs/discussions)
- **Documentation**: [Complete documentation](docs/README.md)

### Professional Support

For enterprise support and consulting:
- **Email**: support@nexurejs.com
- **Enterprise**: [Enterprise support packages](https://nexurejs.com/enterprise)

## 🎯 Next Steps

After successful installation:

1. **📖 Read the Documentation**
   - [First App Tutorial](first-app.md) - Build your first API
   - [Core Concepts](../core/) - Understand the framework
   - [Examples](../../examples/) - Learn from examples

2. **🚀 Start Building**
   ```bash
   # Create your first app
   npm run examples:basic

   # Try advanced features
   npm run examples:performance

   # Explore real-time features
   npm run examples:websocket
   ```

3. **⚡ Optimize Performance**
   - [Native Modules Guide](../performance/native-modules/)
   - [Performance Optimization](../performance/optimization.md)
   - [Benchmarking Guide](../performance/benchmarks.md)

4. **🏭 Deploy to Production**
   - [Production Guide](../deployment/production.md)
   - [Docker Setup](../deployment/docker.md)
   - [Monitoring](../deployment/monitoring.md)

---

**🎉 Welcome to NexureJS!** You're now ready to build high-performance Node.js applications with native acceleration and enterprise-grade features.
