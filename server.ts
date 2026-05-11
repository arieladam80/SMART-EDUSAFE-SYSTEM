import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { get } from '@vercel/edge-config';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
const secretsPath = path.resolve(process.cwd(), 'secrets.env');
if (fs.existsSync(secretsPath)) {
  console.log('[Env] Loading secrets from secrets.env (with override)');
  dotenv.config({ path: secretsPath, override: true });
} else {
  dotenv.config();
}

// Supabase Configuration - Use a helper to find the most likely valid key
const getSupabaseKey = () => {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_KEY;
  
  // Ignore keys that look like Edge Config IDs (starting with ecfg_)
  if (serviceKey && !serviceKey.startsWith('ecfg_')) return serviceKey;
  if (anonKey && !anonKey.startsWith('ecfg_')) return anonKey;
  
  return serviceKey || anonKey || '';
};

let supabaseUrl = process.env.SUPABASE_URL || '';
let supabaseKey = getSupabaseKey();
let supabase: any = null;

// Initialize Supabase
async function initSupabase() {
  console.log('[Supabase] Initializing...');
  
  // If keys missing in env, try Edge Config as backup
  if (!supabaseUrl || !supabaseKey) {
    try {
      if (process.env.EDGE_CONFIG) {
        console.log('[Supabase] Missing env vars, checking Edge Config backup...');
        const configUrl = await get('SUPABASE_URL');
        const configKey = (await get('SUPABASE_KEY')) || (await get('SUPABASE_ANON_KEY'));
        
        if (typeof configUrl === 'string') supabaseUrl = configUrl;
        if (typeof configKey === 'string') supabaseKey = configKey;
      }
    } catch (e) {
      console.warn('[Supabase] Edge Config backup fetch failed:', e);
    }
  }

  if (supabaseUrl && supabaseKey) {
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
      console.log('[Supabase] Client initialized successfully at:', supabaseUrl);
    } catch (err) {
      console.error('[Supabase] Client creation failed:', err);
    }
  } else {
    console.warn('[Supabase] No credentials found in ENV, secrets.env, or Edge Config.');
    console.log('[Supabase] Expected: SUPABASE_URL and SUPABASE_KEY/SUPABASE_ANON_KEY');
  }
}


// Server-side state (Cache)
let reports: any[] = [];
let isCctvActive = false;

// Load state from Supabase
async function loadInitialState() {
  if (!supabase) {
    console.warn('[Supabase] Credentials missing. Running in memory-only mode.');
    return;
  }

  const REQUIRED_TABLES = ['reports', 'system_config'];
  
  try {
    console.log('[Supabase] Verification: checking tables...');
    
    // 1. Load Reports
    const { data: reportsData, error: reportsError } = await supabase
      .from('reports')
      .select('*')
      .order('timestamp', { ascending: false });

    if (reportsError) {
      if (reportsError.code === 'PGRST116' || reportsError.message.includes('relation "public.reports" does not exist')) {
        console.error('\n[SUPABASE ACTION REQUIRED] Table "reports" is missing.');
        console.log('Run this SQL in your Supabase SQL Editor:');
        console.log(`
          CREATE TABLE reports (
            id TEXT PRIMARY KEY,
            reporterId TEXT,
            dorm TEXT,
            location TEXT,
            type TEXT,
            priority TEXT,
            timestamp BIGINT,
            status TEXT,
            description TEXT
          );
        \n`);
      } else {
        throw reportsError;
      }
    } else {
      reports = reportsData || [];
    }

    // 2. Load System Config (CCTV state)
    const { data: configData, error: configError } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'isCctvActive')
      .single();

    if (configError) {
      if (configError.code === 'PGRST116' || configError.message.includes('relation "public.system_config" does not exist')) {
        console.error('\n[SUPABASE ACTION REQUIRED] Table "system_config" is missing.');
        console.log('Run this SQL in your Supabase SQL Editor:');
        console.log(`
          CREATE TABLE system_config (
            key TEXT PRIMARY KEY,
            value JSONB
          );
          INSERT INTO system_config (key, value) VALUES ('isCctvActive', false);
        \n`);
      } else if (configError.code !== 'PGRST116') {
         // PGRST116 is just "no rows found", which is fine
         console.warn('[Supabase] system_config loading warning:', configError.message);
      }
    }
    
    if (configData) isCctvActive = configData.value;
    
    console.log(`[Supabase] Initialization check complete.`);
  } catch (err) {
    console.error('[Supabase] Initial load encountered an unexpected error:', err);
    console.log('[Supabase] App will continue with in-memory persistence only.');
  }
}

async function startServer() {
  // Initialize Supabase and fire initial load
  await initSupabase();
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
    if (!supabase) return;
    try {
      await supabase.from('reports').upsert(report);
    } catch (e) {
      console.error('[Supabase] Failed to persist report:', e);
    }
  };

  const persistCctvState = async (active: boolean) => {
    if (!supabase) return;
    try {
      await supabase.from('system_config').upsert({ key: 'isCctvActive', value: active });
    } catch (e) {
      console.error('[Supabase] Failed to persist CCTV state:', e);
    }
  };

  // API routes
  app.get('/api/supabase-status', async (req, res) => {
    const hasUrl = !!supabaseUrl;
    const hasKey = !!supabaseKey;
    const clientExists = !!supabase;

    if (!clientExists) {
      return res.status(200).json({ 
        status: 'missing_config', 
        error: 'Credentials not found.',
        details: { hasUrl, hasKey, env: process.env.NODE_ENV }
      });
    }

    try {
      // Test actual connection
      const { data, error } = await supabase.from('reports').select('count', { count: 'exact', head: true });
      
      if (error) {
        return res.status(200).json({ 
          status: 'error', 
          error: error.message,
          code: error.code,
          details: { hasUrl, hasKey, url: supabaseUrl.substring(0, 15) + '...' }
        });
      }

      res.json({ 
        status: 'connected', 
        tables: ['reports', 'system_config'],
        counts: data,
        url: supabaseUrl.substring(0, 15) + '...'
      });
    } catch (err: any) {
      res.status(200).json({ 
        status: 'failing', 
        error: err.message,
        details: { hasUrl, hasKey }
      });
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
      if (supabase) {
        await supabase.from('reports').delete().neq('id', 'DUMMY_NONE_MATCH');
      }
      io.emit('reports_cleared');
    });
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production (Vercel/others), serve static files from dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Handlers for SPA routing
    app.get('*', (req, res, next) => {
      // Skip API and Socket.io routes
      if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Only listen if we're not running as a Vercel serverless function
  if (process.env.VERCEL !== '1') {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }

  return app;
}

// Start the server
const appPromise = startServer();

// Export for Vercel
export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
