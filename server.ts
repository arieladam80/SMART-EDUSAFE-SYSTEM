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
  let serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountVar) {
    // Clean up potential quotes from env loading
    if (serviceAccountVar.startsWith("'") && serviceAccountVar.endsWith("'")) {
      serviceAccountVar = serviceAccountVar.slice(1, -1);
    }
    
    const serviceAccount = JSON.parse(serviceAccountVar);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    firestore = admin.firestore();
    console.log('[Firebase] Admin SDK initialized.');
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
      console.log('[Firebase] Admin SDK initialized via vars.');
    }
  }
} catch (e) {
  console.error('[Firebase] Init error:', e);
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
let systemLogs: { timestamp: number; level: 'info' | 'error' | 'warn'; message: string; source: string }[] = [];
let authorizedUsers: { id: string; role: 'student' | 'warden'; password?: string }[] = [
  { id: 'S2024-001', role: 'student' },
  { id: 'S2024-002', role: 'student' },
  { id: 'S2024-003', role: 'student' },
  { id: 'BIO-STUDENT-01', role: 'student' },
  { id: 'warden@asrama.edu', role: 'warden', password: 'admin123' }
];
let featureFlags = {
  hybridSync: true,
  cctvFailover: true,
  pushNotifications: false,
  aiSentiment: false
};

function addLog(level: 'info' | 'error' | 'warn', message: string, source: string) {
  systemLogs.unshift({ timestamp: Date.now(), level, message, source });
  if (systemLogs.length > 50) systemLogs.pop();
  console[level](`[${source}] ${message}`);
}

async function loadInitialState() {
  addLog('info', 'Starting initial state load...', 'Storage');
  // Prioritize Firebase if available
  if (firestore) {
    try {
      addLog('info', 'Attempting to load from Firebase...', 'Firebase');
      const reportsSnapshot = await firestore.collection('reports').orderBy('timestamp', 'desc').get();
      reports = reportsSnapshot.docs.map(doc => doc.data());
      
      const configDoc = await firestore.collection('system').doc('config').get();
      if (configDoc.exists) {
        const data = configDoc.data();
        if (data?.featureFlags) featureFlags = { ...featureFlags, ...data.featureFlags };
        if (data?.isCctvActive !== undefined) isCctvActive = data.isCctvActive;
      }

      const usersSnapshot = await firestore.collection('users').get();
      if (!usersSnapshot.empty) {
        authorizedUsers = usersSnapshot.docs.map(doc => doc.data() as any);
      }
      
      addLog('info', `Successfully loaded data from Firebase.`, 'Firebase');
      return;
    } catch (e: any) {
      addLog('error', `Initial load failure: ${e.message}`, 'Firebase');
    }
  }

  // Fallback to Supabase
  if (supabase) {
    try {
      addLog('info', 'Attempting to load from Supabase...', 'Supabase');
      const { data: reportsData } = await supabase.from('reports').select('*').order('timestamp', { ascending: false });
      if (reportsData) reports = reportsData;

      const { data: configData } = await supabase.from('system_config').select('value').eq('key', 'system_config').single();
      if (configData) {
        if (configData.value.featureFlags) featureFlags = configData.value.featureFlags;
        if (configData.value.isCctvActive !== undefined) isCctvActive = configData.value.isCctvActive;
      }
      addLog('info', `Successfully loaded reports from Supabase.`, 'Supabase');
    } catch (e: any) {
      addLog('error', `Initial load failure: ${e.message}`, 'Supabase');
    }
  }
}

async function persistReport(report: any) {
  if (firestore) try { await firestore.collection('reports').doc(report.id).set(report); } catch (e) {}
  if (supabase) try { await supabase.from('reports').upsert(report); } catch (e) {}
}

async function persistSystemConfig() {
  const config = { featureFlags, isCctvActive, updatedAt: Date.now() };
  if (firestore) {
    try { await firestore.collection('system').doc('config').set(config, { merge: true }); } catch (e) {}
  }
  if (supabase) {
    try { await supabase.from('system_config').upsert({ key: 'system_config', value: config }); } catch (e) {}
  }
}

async function persistUser(user: any) {
  if (firestore) {
    try { await firestore.collection('users').doc(user.id).set(user); } catch (e) {}
  }
}

async function deleteUser(userId: string) {
  authorizedUsers = authorizedUsers.filter(u => u.id !== userId);
  if (firestore) {
    try { await firestore.collection('users').doc(userId).delete(); } catch (e) {}
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
  app.get('/api/system/logs', (req, res) => res.json(systemLogs));
  app.get('/api/system/config', (req, res) => res.json({ featureFlags, isCctvActive }));
  app.get('/api/users', (req, res) => res.json(authorizedUsers));

  app.post('/api/system/config', async (req, res) => {
    const { featureFlags: newFlags, isCctvActive: newCctv } = req.body;
    if (newFlags) featureFlags = { ...featureFlags, ...newFlags };
    if (newCctv !== undefined) isCctvActive = newCctv;
    await persistSystemConfig();
    addLog('info', 'System configuration updated by Admin', 'Admin');
    res.json({ success: true });
  });

  app.post('/api/users', async (req, res) => {
    const newUser = req.body;
    authorizedUsers.push(newUser);
    await persistUser(newUser);
    addLog('info', `New ${newUser.role} added: ${newUser.id}`, 'Admin');
    res.json({ success: true });
  });

  app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    await deleteUser(id);
    addLog('warn', `User removed: ${id}`, 'Admin');
    res.json({ success: true });
  });

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
      await persistSystemConfig();
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
