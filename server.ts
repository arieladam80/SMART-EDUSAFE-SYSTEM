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
import admin from 'firebase-admin';

// Load environment variables
const secretsPath = path.resolve(process.cwd(), 'secrets.env');
if (fs.existsSync(secretsPath)) {
  console.log('[Env] Loading secrets from secrets.env (with override)');
  dotenv.config({ path: secretsPath, override: true });
} else {
  dotenv.config();
}

// --- Firebase Configuration ---
let firestore: admin.firestore.Firestore | null = null;
try {
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountVar) {
    const serviceAccount = JSON.parse(serviceAccountVar);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    firestore = admin.firestore();
    console.log('[Firebase] Admin SDK initialized successfully.');
  } else {
    // Try individual environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          })
        });
      }
      firestore = admin.firestore();
      console.log('[Firebase] Admin SDK initialized via individual env vars.');
    }
  }
} catch (e) {
  console.error('[Firebase] Initialization error:', e);
}

// --- Supabase Configuration ---
const getSupabaseKey = () => {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_KEY;
  if (serviceKey && !serviceKey.startsWith('ecfg_')) return serviceKey;
  if (anonKey && !anonKey.startsWith('ecfg_')) return anonKey;
  return serviceKey || anonKey || '';
};

let supabaseUrl = process.env.SUPABASE_URL || '';
let supabaseKey = getSupabaseKey();
let supabase: any = null;

async function initSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    try {
      if (process.env.EDGE_CONFIG) {
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
      console.log('[Supabase] Client initialized.');
    } catch (err) {
      console.error('[Supabase] Client creation failed:', err);
    }
  }
}

// --- Unified Persistence Helpers ---
let reports: any[] = [];
let isCctvActive = false;

async function loadInitialState() {
  // Prioritize Firebase if available
  if (firestore) {
    try {
      console.log('[Firebase] Loading initial state...');
      const reportsSnapshot = await firestore.collection('reports').orderBy('timestamp', 'desc').get();
      reports = reportsSnapshot.docs.map(doc => doc.data());
      
      const configDoc = await firestore.collection('system').doc('cctv').get();
      if (configDoc.exists) {
        isCctvActive = configDoc.data()?.active || false;
      }
      console.log('[Firebase] Initial state loaded.');
      return;
    } catch (e) {
      console.error('[Firebase] Initial load failure:', e);
    }
  }

  // Fallback to Supabase
  if (supabase) {
    try {
      console.log('[Supabase] Loading initial state...');
      const { data: reportsData } = await supabase.from('reports').select('*').order('timestamp', { ascending: false });
      if (reportsData) reports = reportsData;

      const { data: configData } = await supabase.from('system_config').select('value').eq('key', 'isCctvActive').single();
      if (configData) isCctvActive = configData.value;
      console.log('[Supabase] Initial state loaded.');
    } catch (e) {
      console.error('[Supabase] Initial load failure:', e);
    }
  }
}

async function persistReport(report: any) {
  if (firestore) {
    try {
      await firestore.collection('reports').doc(report.id).set(report);
    } catch (e) {
      console.error('[Firebase] Failed to persist report:', e);
    }
  }
  if (supabase) {
    try {
      await supabase.from('reports').upsert(report);
    } catch (e) {
      console.error('[Supabase] Failed to persist report:', e);
    }
  }
}

async function persistCctvState(active: boolean) {
  if (firestore) {
    try {
      await firestore.collection('system').doc('cctv').set({ active, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error('[Firebase] Failed to persist CCTV state:', e);
    }
  }
  if (supabase) {
    try {
      await supabase.from('system_config').upsert({ key: 'isCctvActive', value: active });
    } catch (e) {
      console.error('[Supabase] Failed to persist CCTV state:', e);
    }
  }
}

async function clearAllReports() {
  reports = [];
  if (firestore) {
    try {
      const snapshot = await firestore.collection('reports').get();
      const batch = firestore.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } catch (e) {
      console.error('[Firebase] Failed to clear reports:', e);
    }
  }
  if (supabase) {
    try {
      await supabase.from('reports').delete().neq('id', 'DUMMY_NONE_MATCH');
    } catch (e) {
      console.error('[Supabase] Failed to clear reports:', e);
    }
  }
}

async function startServer() {
  await initSupabase();
  await loadInitialState().catch(err => console.error('[Storage] Initial load background failure:', err));

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling'],
  });

  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
  app.use(express.json({ limit: '100mb' }));

  // API Status
  app.get('/api/db-status', async (req, res) => {
    const status: any = {
      firebase: firestore ? 'connected' : 'disconnected',
      supabase: supabase ? 'initialized' : 'missing_config',
    };
    
    if (firestore) {
      try {
        await firestore.collection('reports').limit(1).get();
        status.firebase = 'active';
      } catch (e: any) {
        status.firebase = 'error: ' + e.message;
      }
    }

    if (supabase) {
      try {
        const { error } = await supabase.from('reports').select('count', { count: 'exact', head: true });
        status.supabase = error ? 'error: ' + error.message : 'active';
      } catch (e: any) {
        status.supabase = 'error: ' + e.message;
      }
    }

    res.json(status);
  });

  app.get('/api/reports', (req, res) => res.json(reports));
  app.get('/api/cctv', (req, res) => res.json({ isCctvActive }));

  app.post('/api/reports', async (req, res) => {
    const report = req.body;
    if (reports.some(r => r.id === report.id)) return res.json(report);
    reports = [report, ...reports];
    await persistReport(report);
    io.emit('report_added', report);
    res.status(201).json(report);
  });

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
      await clearAllReports();
      io.emit('reports_cleared');
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.VERCEL !== '1') {
    httpServer.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://0.0.0.0:${PORT}`));
  }
  return app;
}

const appPromise = startServer();
export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
