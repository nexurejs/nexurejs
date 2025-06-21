
const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const crypto = require('crypto');

const app = new Koa();
const router = new Router();

// Test data
const testData = {
  users: Array.from({length: 1000}, (_, i) => ({
    id: i + 1,
    name: `User ${i + 1}`,
    email: `user${i + 1}@example.com`
  }))
};

app.use(bodyParser({ jsonLimit: '50mb' }));
app.use(async (ctx, next) => {
  ctx.set('X-Framework', 'Koa');
  await next();
});

router.get('/api/hello', (ctx) => {
  ctx.body = { message: 'Hello from Koa!', timestamp: Date.now() };
});

router.post('/api/users', (ctx) => {
  const user = { id: crypto.randomUUID(), ...ctx.request.body, created: Date.now() };
  ctx.body = user;
});

router.get('/api/users', (ctx) => {
  const page = parseInt(ctx.query.page) || 1;
  const limit = parseInt(ctx.query.limit) || 10;
  const start = (page - 1) * limit;
  const users = testData.users.slice(start, start + limit);
  ctx.body = { data: users, pagination: { page, limit, total: testData.users.length } };
});

router.post('/api/compute', (ctx) => {
  const { numbers } = ctx.request.body;
  let result = 0;
  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < 50; j++) {
      result += Math.sqrt(numbers[i] * numbers[i] + j);
    }
  }
  ctx.body = { result: result.toFixed(2), operations: numbers.length * 50 };
});

router.get('/api/export/large', (ctx) => {
  const largeData = {
    users: testData.users,
    metadata: { exported: Date.now(), size: 'large' }
  };
  ctx.body = largeData;
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(3004, () => {
  console.log('Koa server running on port 3004');
});
