// Test fixture worker: echoes each task's id + data back to the pool.
import { parentPort } from 'node:worker_threads';

parentPort.on('message', task => {
  parentPort.postMessage({ taskId: task.id, data: task.data });
});
