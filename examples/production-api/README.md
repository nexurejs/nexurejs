# NexureJS Production API Example

A production-ready REST API server demonstrating the full power of NexureJS native modules.

## Features

- ⚡ **Native HTTP Parsing** - C++ powered request parsing
- 🚀 **Native Routing** - 300,000+ route matches/sec
- 🗜️ **Native Compression** - Automatic gzip compression
- 💾 **Native LRU Cache** - 200,000+ cache operations/sec
- 🔄 **Native JSON Processing** - Fast JSON parse/stringify
- 🔐 **Authentication Middleware** - Token-based auth
- 📊 **Performance Monitoring** - Built-in stats tracking
- 🛡️ **Error Handling** - Graceful error recovery

## Quick Start

```bash
# From the nexurejs root directory
cd examples/production-api
npm install
npm start
```

The server will start on port 3000 (or PORT env variable).

## API Endpoints

### Health Check
```bash
GET /health
```
Returns server health, stats, and native module status.

### List Users (Cached)
```bash
GET /api/users?page=1&limit=10
```
Returns paginated user list. Cached for 1 minute.

### Get User (Cached)
```bash
GET /api/users/:id
```
Returns user details. Cached for 5 minutes.

### Create User (Authenticated)
```bash
POST /api/users
Authorization: Bearer nexure-secret-token
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}
```
Creates a new user. Requires authentication.

### Get Comment (Cached)
```bash
GET /api/posts/:postId/comments/:commentId
```
Demonstrates nested route parameters. Cached for 2 minutes.

### Benchmark
```bash
GET /api/benchmark
```
Runs performance benchmarks on JSON and compression modules.

## Performance

With native modules enabled:

- **HTTP Parsing**: 71,000+ requests/sec
- **Routing**: 300,000+ route matches/sec
- **JSON Processing**: 174,000+ parse operations/sec
- **Compression**: 32,000+ compress operations/sec
- **Cache Operations**: 235,000+ set operations/sec

## Architecture

```
Request → HTTP Parser (Native)
         ↓
       Router (Native) → Route Match
         ↓
       Middleware Chain:
         • Logging
         • Compression (Native)
         • Cache (Native)
         • Authentication
         ↓
       Handler
         ↓
       JSON Response (Native)
```

## Middleware

1. **Logging** - Logs all requests with response time
2. **Compression** - Auto-compresses responses when client supports gzip
3. **Cache** - Caches GET responses with configurable TTL
4. **Authentication** - Token-based auth for protected endpoints

## Monitoring

The `/health` endpoint provides:
- Request counts and error rates
- Average response times
- Cache hit/miss ratios
- Memory usage
- Native module status

## Production Considerations

1. **Environment Variables**
   - `PORT` - Server port (default: 3000)
   - `NODE_ENV` - Environment (hides stack traces in production)
   - `AUTH_TOKEN` - Authentication token

2. **Security**
   - Use proper JWT tokens instead of static bearer tokens
   - Add rate limiting (when native module is fixed)
   - Implement CORS as needed
   - Use HTTPS in production

3. **Scaling**
   - Add clustering for multi-core usage
   - Use Redis for distributed caching
   - Add database connection pooling

4. **Monitoring**
   - Export metrics to Prometheus/Grafana
   - Add structured logging
   - Implement distributed tracing

## Load Testing

```bash
# Install autocannon
npm install -g autocannon

# Test health endpoint
autocannon -c 100 -d 10 http://localhost:3000/health

# Test users endpoint
autocannon -c 100 -d 10 http://localhost:3000/api/users

# Test with authentication
autocannon -c 50 -d 10 \
  -H "Authorization: Bearer nexure-secret-token" \
  -H "Content-Type: application/json" \
  -m POST \
  -b '{"name":"Test","email":"test@example.com"}' \
  http://localhost:3000/api/users
```

## Native vs JavaScript Performance

Run the benchmark endpoint to see real-time performance comparison:

```bash
curl http://localhost:3000/api/benchmark
```

This will test JSON and compression performance, showing operations per second.
