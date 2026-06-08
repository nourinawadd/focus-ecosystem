import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

let seq = 0;
async function makeUser() {
  const reg = await request(app).post('/api/auth/register')
    .send({ name: 'Task User', email: `task-${seq++}@example.test`, password: 'sup3rsecret' });
  return reg.body.accessToken;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('tasks', () => {
  it('creates a task with a trimmed name and default priority', async () => {
    const token = await makeUser();
    const res = await request(app).post('/api/tasks').set(auth(token)).send({ name: '  Write thesis  ' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Write thesis');
    expect(res.body.priority).toBe('medium');
  });

  it('honors an explicit priority', async () => {
    const token = await makeUser();
    const res = await request(app).post('/api/tasks').set(auth(token)).send({ name: 'Urgent', priority: 'high' });
    expect(res.status).toBe(201);
    expect(res.body.priority).toBe('high');
  });

  it('rejects a task with no name (400)', async () => {
    const token = await makeUser();
    const res = await request(app).post('/api/tasks').set(auth(token)).send({ priority: 'low' });
    expect(res.status).toBe(400);
  });

  it('lists the user tasks oldest-first', async () => {
    const token = await makeUser();
    await request(app).post('/api/tasks').set(auth(token)).send({ name: 'First' });
    await request(app).post('/api/tasks').set(auth(token)).send({ name: 'Second' });

    const res = await request(app).get('/api/tasks').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.map(t => t.name)).toEqual(['First', 'Second']);
  });

  it('deletes own task and 404s on an unknown id', async () => {
    const token = await makeUser();
    const created = await request(app).post('/api/tasks').set(auth(token)).send({ name: 'Temp' });

    const del = await request(app).delete(`/api/tasks/${created.body._id}`).set(auth(token));
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    const missing = await request(app)
      .delete('/api/tasks/64b7f0000000000000000000').set(auth(token));
    expect(missing.status).toBe(404);
  });

  it('isolates tasks per user', async () => {
    const owner    = await makeUser();
    const intruder = await makeUser();
    const created  = await request(app).post('/api/tasks').set(auth(owner)).send({ name: 'Private' });

    // Intruder cannot see it…
    const list = await request(app).get('/api/tasks').set(auth(intruder));
    expect(list.body).toHaveLength(0);

    // …nor delete it.
    const del = await request(app).delete(`/api/tasks/${created.body._id}`).set(auth(intruder));
    expect(del.status).toBe(404);
  });
});
