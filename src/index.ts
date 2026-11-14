import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { apiRouter } from './routes.js';
import { db } from './db.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root Health / API Info
app.get('/', (_req, res) => {
  res.json({
    name: 'FamiTube API',
    status: 'ok',
    apiBase: '/api',
  });
});

// REST API Endpoints
app.use('/api', apiRouter);

// Error Handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API error:', err);
  res.status(500).json({
    success: false,
    message: err instanceof Error ? err.message : 'Internal server error',
  });
});

async function start() {
  await db.init();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 FamiTube API (MySQL) running at:`);
    console.log(`   Local API Base URL:         http://localhost:${PORT}/api`);
    console.log(`   Android API Base URL:       http://10.0.2.2:${PORT}/api (Android Emulator)`);
    console.log(`   LAN API Base URL:           http://<Your-IP>:${PORT}/api (Physical Device)`);
    console.log(`=======================================================`);
  });
}

start().catch((err) => {
  console.error('Failed to start FamiTube API:', err);
  process.exit(1);
});
