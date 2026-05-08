import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data.json');

// Server-side state
let reports: any[] = [];
let isCctvActive = false;

// Load initial state
if (fs.existsSync(DB_PATH)) {
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    reports = data.reports || [];
    isCctvActive = data.isCctvActive || false;
  } catch (err) {
    console.error("Failed to load persistence data:", err);
  }
}

const saveState = () => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify({ reports, isCctvActive }, null, 2));
  } catch (err) {
    console.error("Failed to save state:", err);
  }
};

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    maxHttpBufferSize: 1e8, // 100MB for large base64 audio payloads
    pingTimeout: 120000,
    pingInterval: 30000
  });

  const PORT = 3000;

  app.use(cors({
    origin: "*",
    methods: ["GET", "POST"]
  }));
  app.use(express.json({ limit: '100mb' }));

  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      socketConnected: io.sockets.sockets.size,
      uptime: process.uptime()
    });
  });

  // Polling Fallback Endpoints
  app.get('/api/reports', (req, res) => {
    console.log(`[API] GET /api/reports - Count: ${reports.length}`);
    res.json(reports);
  });

  app.get('/api/cctv', (req, res) => {
    console.log(`[API] GET /api/cctv - State: ${isCctvActive}`);
    res.json({ isCctvActive });
  });

  app.post('/api/reports', (req, res) => {
    const report = req.body;
    console.log(`[API] POST /api/reports - ID: ${report?.id}`);
    reports = [report, ...reports];
    saveState();
    io.emit('report_added', report);
    res.status(201).json(report);
  });

  // Socket.io logic
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Send initial state
    socket.emit('init', { reports, isCctvActive });

    socket.on('add_report', (report) => {
      console.log('--- NEW REPORT RECEIVED ---');
      console.log('ID:', report.id);
      console.log('Dorm:', report.dorm);
      console.log('Reporter:', report.reporterId);
      reports = [report, ...reports];
      saveState();
      io.emit('report_added', report);
      console.log('Broadcasted to all clients.');
    });

    socket.on('mark_reviewed', (id) => {
      reports = reports.map(r => r.id === id ? { ...r, status: 'reviewed' } : r);
      saveState();
      io.emit('reports_updated', reports);
    });

    socket.on('toggle_cctv', () => {
      isCctvActive = !isCctvActive;
      saveState();
      io.emit('cctv_toggled', isCctvActive);
    });

    socket.on('clear_reports', () => {
      reports = [];
      saveState();
      io.emit('reports_cleared');
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
