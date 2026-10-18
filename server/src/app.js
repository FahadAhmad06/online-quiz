import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from './config.js';
import requireAdmin from './middleware/requireAdmin.js';
import requireOwner from './middleware/requireOwner.js';
import errorHandler from './middleware/errorHandler.js';
import publicRoutes from './routes/publicRoutes.js';
import adminAuthRoutes from './routes/adminAuthRoutes.js';
import adminPaperRoutes from './routes/adminPaperRoutes.js';
import adminResultRoutes from './routes/adminResultRoutes.js';
import adminAdminRoutes from './routes/adminAdminRoutes.js';
import adminRollRoutes from './routes/adminRollRoutes.js';
import adminRetakeRoutes from './routes/adminRetakeRoutes.js';
import studentAuthRoutes from './routes/studentAuthRoutes.js';
import attachStudent from './middleware/attachStudent.js';

const app = express();
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '300kb' }));

app.use('/api/students', studentAuthRoutes);                              // POST /register, /login
app.use('/api', attachStudent, publicRoutes);
app.use('/api/admin', adminAuthRoutes);                                   // POST /login
app.use('/api/admin/admins', requireAdmin, requireOwner, adminAdminRoutes); // owner only
app.use('/api/admin', requireAdmin, adminPaperRoutes, adminResultRoutes, adminRollRoutes, adminRetakeRoutes); // every other admin route
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// In production, serve the built React app from the same server.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use(errorHandler);
export default app;
