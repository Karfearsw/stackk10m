import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';

// Mock storage to avoid DB connection
storage.getUserByEmail = async () => undefined;
storage.createUser = async (user) => ({ ...user, id: 1 });

describe('Auth Routes', () => {
  let app;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    await registerRoutes(app);
  });

  it('POST /api/auth/signup should fail without employee code', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      });
    
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Invalid employee code');
  });
});
