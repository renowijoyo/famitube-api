import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { apiRouter } from './routes.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root Health / API Info
app.get('/', (req, res) => {
  res.json({
    name: 'KidsTube API',
    status: 'ok',
    apiBase: '/api',
  });
});

// REST API Endpoints
app.use('/api', apiRouter);

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 KidsTube API running at:`);
  console.log(`   Local API Base URL:         http://localhost:${PORT}/api`);
  console.log(`   Android API Base URL:       http://10.0.2.2:${PORT}/api (Android Emulator)`);
  console.log(`   LAN API Base URL:           http://<Your-IP>:${PORT}/api (Physical Device)`);
  console.log(`=======================================================`);
});
