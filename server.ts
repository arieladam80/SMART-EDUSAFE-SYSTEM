import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Server-side state (Cache)
let reports: any[] = [];
let isCctvActive = false;

// Load state from Supabase
async function loadInitialState() {
  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials missing. Running in memory-only mode.');
    return;
  }

  try {
    // 1. Load Reports
    const { data: reportsData, error: reportsError } = await supabase
      .from('reports')
      .select('*')
      .order('timestamp', { ascending: false });

    if (reportsError) throw reportsError;
    reports = reportsData || [];

    // 2. Load System Config (CCTV state)
    const { data: configData, error: configError } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'isCctvActive')
      .single();

    if (configError && configError.code !== 'PGRST116') {
      console.warn('[Supabase] system_config table might be missing or inaccessible.');
    }
    if (configData) isCctvActive = configData.value;
    
    console.log(`[Supabase] Initial state loaded successfully.`);
  } catch (err) {
    console.error('[Supabase] Initial load failed. App will run in-memory until tables are created.', err);
  }
}

async function startServer() {
  // Fire and forget initial load to avoid blocking server start
  loadInitialState().catch(err => console.error('[Supabase] Initial load background failure:', err));

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    maxHttpBufferSize: 1e8,
    pingTimeout: 120000,
    pingInterval: 30000
  });

  const PORT = Number(process.env.PORT) || 3000;

  app.use((req, res, next) => {
    if (req.url.startsWith('/socket.io')) {
      console.log(`[Socket.io Request] ${req.method} ${req.url}`);
    }
    next();
  });

  app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
  app.use(express.json({ limit: '100mb' }));

  // API Persistence Helpers
  const persistReport = async (report: any) => {
    if (!supabaseUrl || !supabaseKey) return;
    try {
      await supabase.from('reports').upsert(report);
    } catch (e) {
      console.error('[Supabase] Failed to persist report:', e);
    }
  };

  const persistCctvState = async (active: boolean) => {
    if (!supabaseUrl || !supabaseKey) return;
    try {
      await supabase.from('system_config').upsert({ key: 'isCctvActive', value: active });
    } catch (e) {
      console.error('[Supabase] Failed to persist CCTV state:', e);
    }
  };

  // API routes
  app.get('/api/supabase-status', async (req, res) => {
    if (!supabaseUrl || !supabaseKey) {
      return res.status(200).json({ status: 'missing_config', error: 'Credentials not provided' });
    }

    try {
      // Test actual connection by reaching out to Supabase
      const { error } = await supabase.from('reports').select('count', { count: 'exact', head: true });
      
      if (error) {
        return res.status(200).json({ 
          status: 'error', 
          error: error.message,
          code: error.code 
        });
      }

      res.json({ status: 'connected', tables: ['reports', 'system_config'] });
    } catch (err: any) {
      res.status(200).json({ status: 'failing', error: err.message });
    }
  });

  app.get('/api/reports', (req, res) => {
    res.json(reports);
  });

  app.get('/api/cctv', (req, res) => {
    res.json({ isCctvActive });
  });

  app.post('/api/reports', async (req, res) => {
    const report = req.body;
    if (reports.some(r => r.id === report.id)) return res.json(report);

    reports = [report, ...reports];
    await persistReport(report);
    io.emit('report_added', report);
    res.status(201).json(report);
  });

  // Socket.io logic
  io.on('connection', (socket) => {
    socket.emit('init', { reports, isCctvActive });

    socket.on('add_report', async (report) => {
      if (reports.some(r => r.id === report.id)) return;
      reports = [report, ...reports];
      await persistReport(report);
      io.emit('report_added', report);
    });

    socket.on('mark_reviewed', async (id) => {
      reports = reports.map(r => r.id === id ? { ...r, status: 'reviewed' } : r);
      const updated = reports.find(r => r.id === id);
      if (updated) await persistReport(updated);
      io.emit('reports_updated', reports);
    });

    socket.on('toggle_cctv', async () => {
      isCctvActive = !isCctvActive;
      await persistCctvState(isCctvActive);
      io.emit('cctv_toggled', isCctvActive);
    });

    socket.on('clear_reports', async () => {
      reports = [];
      if (supabaseUrl && supabaseKey) {
        await supabase.from('reports').delete().neq('id', 'DUMMY_NONE_MATCH');
      }
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
