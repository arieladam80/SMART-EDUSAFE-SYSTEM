import React, { useState, useRef, useEffect } from 'react';
import { Shield, Radio, Activity, Camera, Mic, Info, CheckCircle2, AlertCircle, LogOut, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, UserRole, Report } from '../types';
import { socket } from '../lib/socket';

export const useSmartEduSafe = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('smartedusafe_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [reports, setReports] = useState<Report[]>([]);
  const [isCctvActive, setIsCctvActive] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [dbStatus, setDbStatus] = useState<{ status: string; error?: string }>({ status: 'checking' });

  // Sync state helpers
  const syncState = async () => {
    try {
      const reportsRes = await fetch('/api/reports').catch(() => null);
      const cctvRes = await fetch('/api/cctv').catch(() => null);
      const dbRes = await fetch('/api/db-status').catch(() => null);

      if (reportsRes && reportsRes.ok) {
        const data: Report[] = await reportsRes.json();
        // Deduplicate incoming data
        setReports(prev => {
          const uniqueMap = new Map<string, Report>();
          data.forEach(r => uniqueMap.set(r.id, r));
          return Array.from(uniqueMap.values());
        });
      }

      if (cctvRes && cctvRes.ok) {
        const data = await cctvRes.json();
        setIsCctvActive(data.isCctvActive);
      }

      if (dbRes && dbRes.ok) {
        const data = await dbRes.json();
        setDbStatus(data);
      }
    } catch (err) {
      console.error('State sync critical failure:', err);
    }
  };

  useEffect(() => {
    // Initial fetch
    syncState();

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('init', (data) => {
      const uniqueMap = new Map<string, Report>();
      data.reports.forEach((r: Report) => uniqueMap.set(r.id, r));
      setReports(Array.from(uniqueMap.values()));
      setIsCctvActive(data.isCctvActive);
    });

    socket.on('report_added', (report) => {
      setReports(prev => {
        if (prev.some(r => r.id === report.id)) return prev;
        return [report, ...prev];
      });
    });

    socket.on('reports_updated', (updatedReports: Report[]) => {
      const uniqueMap = new Map<string, Report>();
      updatedReports.forEach(r => uniqueMap.set(r.id, r));
      setReports(Array.from(uniqueMap.values()));
    });

    socket.on('cctv_toggled', (active) => {
      setIsCctvActive(active);
    });

    socket.on('reports_cleared', () => {
      setReports([]);
    });

    // Polling fallback every 10s if not connected via socket
    const pollInterval = setInterval(() => {
      if (!socket.connected) {
        syncState();
      }
    }, 10000);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('init');
      socket.off('report_added');
      socket.off('reports_updated');
      socket.off('cctv_toggled');
      socket.off('reports_cleared');
      clearInterval(pollInterval);
    };
  }, []);

  const login = (id: string, role: UserRole) => {
    const name = role === 'warden' 
      ? (id === 'warden@asrama.edu' ? 'Head Warden' : `Warden ${id}`)
      : `Student ${id}`;
    const newUser = { id, role, name };
    setUser(newUser);
    localStorage.setItem('smartedusafe_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('smartedusafe_user');
  };

  const addReport = async (report: Omit<Report, 'id' | 'timestamp' | 'status'>) => {
    const newReport: Report = {
      ...report,
      id: `EMG-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      timestamp: Date.now(),
      status: 'pending'
    };
    
    // Always emit via socket for instant update if connected
    socket.emit('add_report', newReport);

    // Fallback POST for serverless environments
    try {
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReport)
      });
    } catch (e) {
      console.warn('POST fallback failed, relying on socket');
    }
  };

  const markAsReviewed = async (id: string) => {
    socket.emit('mark_reviewed', id);
    // Add API support later if needed, current socket.emit works in persistent environments
  };

  const toggleCctv = () => {
    socket.emit('toggle_cctv');
  };

  const clearReports = () => {
    socket.emit('clear_reports');
  };

  return { user, reports, isCctvActive, dbStatus, login, logout, addReport, markAsReviewed, toggleCctv, clearReports };
};

// --- Components ---

export const LoginView = ({ onLogin }: { onLogin: (id: string, role: UserRole) => void }) => {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [isTapping, setIsTapping] = useState(false);
  const [nfcSuccess, setNfcSuccess] = useState(false);

  const handleNFCScan = () => {
    setIsTapping(true);
    // Simulate NFC tap delay
    setTimeout(() => {
      setNfcSuccess(true);
      setTimeout(() => {
        onLogin('BIO-STUDENT-01', 'student');
        setIsTapping(false);
        setNfcSuccess(false);
      }, 800);
    }, 1200);
  };

  const AUTHORIZED_STUDENTS = ['S2024-001', 'S2024-002', 'S2024-003', 'BIO-STUDENT-01'];

  const handleLogin = () => {
    if (role === 'warden') {
      if (id === 'warden@asrama.edu' && password === 'admin123') {
        onLogin(id, role);
      } else {
        alert('Invalid Warden Credentials. Use: warden@asrama.edu / admin123');
      }
    } else {
      if (AUTHORIZED_STUDENTS.includes(id)) {
        onLogin(id, role);
      } else if (!id) {
        alert('Please enter Student ID or use NFC Card');
      } else {
        alert('Student ID Unauthorized. Please register with the warden office.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100"
      >
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
            <Shield className="text-white w-8 h-8" />
          </div>
        </div>
        
        <h1 className="text-3xl font-display text-center mb-2">SMART EDUSAFE SYSTEM</h1>
        <p className="text-slate-500 text-center mb-8">Hostel Safety & Monitoring System</p>

        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-6">
          <button 
            onClick={() => { setRole('student'); setPassword(''); }}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${role === 'student' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
          >
            Student
          </button>
          <button 
            onClick={() => setRole('warden')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${role === 'warden' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
          >
            Warden
          </button>
        </div>

        <div className="space-y-6">
          {role === 'student' && (
            <div className="text-center space-y-4">
              <div className="relative inline-block">
                <motion.button 
                  animate={isTapping ? { 
                    y: [0, -10, 0],
                    rotate: [0, -5, 5, 0]
                  } : {}}
                  transition={{ duration: 1, repeat: isTapping ? Infinity : 0 }}
                  onClick={handleNFCScan}
                  disabled={isTapping}
                  className={`w-24 h-24 rounded-3xl flex items-center justify-center transition-all ${isTapping ? 'bg-blue-50 text-blue-500' : nfcSuccess ? 'bg-green-50 text-green-500' : 'bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-500 active:scale-95 shadow-inner'}`}
                >
                  <CreditCard className={`w-12 h-12 ${isTapping ? 'animate-pulse' : ''}`} />
                  
                  {isTapping && (
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1.2, opacity: [0, 1, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="absolute -top-4 w-full flex justify-center"
                    >
                      <div className="h-1 w-8 bg-blue-400 rounded-full blur-[2px]" />
                    </motion.div>
                  )}
                </motion.button>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">NFC Card Sensor</p>
                <p className="text-xs text-slate-400">Tap your student card to login</p>
              </div>

              <div className="flex items-center gap-4 py-2">
                <div className="h-px bg-slate-100 flex-1" />
                <span className="text-[10px] font-bold text-slate-300 uppercase">OR</span>
                <div className="h-px bg-slate-100 flex-1" />
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {role === 'student' ? 'Student' : 'Warden'} ID
              </label>
              <input 
                type="text" 
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="e.g. 2024001"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
              />
            </div>

            {role === 'warden' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </motion.div>
            )}
          </div>

          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-200"
          >
            Access Dashboard
          </button>
        </div>
      </motion.div>
      <style>{`
        @keyframes scan-rotate {
          from { stroke-dashoffset: 276; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
};

export const CCTVMonitor = ({ isActive, isRecording, label }: { isActive: boolean, isRecording?: boolean, label?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isActive) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(err => console.error("CCTV feed error:", err));
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }
  }, [isActive]);

  return (
    <div className={`relative w-full aspect-video rounded-2xl overflow-hidden bg-black border-4 ${isRecording ? 'border-red-600' : 'border-slate-800'} shadow-2xl transition-all`}>
      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 space-y-2">
          <Camera className="w-12 h-12 opacity-20" />
          <span className="font-mono text-sm uppercase tracking-widest opacity-40">Location: {label || 'Standby'} | Connection Offline</span>
        </div>
      )}
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover grayscale opacity-80" />
      
      {isActive && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur px-3 py-1 rounded-full border border-white/20">
          <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
          <span className="text-[10px] font-mono text-white tracking-widest uppercase">LIVE: {label}</span>
        </div>
      )}
      
      {isRecording && (
        <div className="absolute top-4 right-4 bg-red-600 px-3 py-1 rounded text-[10px] font-bold text-white animate-pulse">
          REC
        </div>
      )}

      <div className="absolute bottom-4 left-4 right-4 flex justify-between">
        <div className="text-[10px] font-mono text-white/50">{new Date().toLocaleString()}</div>
        <div className="text-[10px] font-mono text-white/50 tracking-tighter">HD || 30FPS || BSI-CMOS</div>
      </div>

      <div className="absolute inset-0 pointer-events-none border-[1px] border-white/5 opacity-20" 
           style={{ backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03))', backgroundSize: '100% 4px, 3px 100%' }} 
      />
    </div>
  );
};
