import React, { useState, useRef, useEffect } from 'react';
import { Camera, Radio, Bell, CheckCircle2, AlertCircle, Eye, Play, Pause, Calendar, User as UserIcon, LogOut, ChevronRight, Activity, Mic, Power, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Report } from '../types';
import { CCTVMonitor } from './AsramaContext';
import { socket } from '../lib/socket';

interface WardenProps {
  user: User;
  reports: Report[];
  dbStatus: any;
  onMarkReviewed: (id: string) => void;
  onClearReports: () => void;
  onLogout: () => void;
}

export const WardenDashboard = ({ user, reports, dbStatus, onMarkReviewed, onClearReports, onLogout }: WardenProps) => {
  const [activeCamera, setActiveCamera] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'surveillance' | 'reports'>('surveillance');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const alarmRef = useRef<HTMLAudioElement>(null);
  const prevPendingCount = useRef(reports.filter(r => r.status === 'pending').length);

  const pendingReports = reports.filter(r => r.status === 'pending');

  // Trigger alarm when new reports arrive
  useEffect(() => {
    const currentPendingCount = pendingReports.length;
    if (currentPendingCount > prevPendingCount.current) {
      setIsAlarmActive(true);
    }
    prevPendingCount.current = currentPendingCount;
    
    // Auto-silence if no pending reports exist
    if (currentPendingCount === 0) {
      setIsAlarmActive(false);
    }
  }, [pendingReports.length]);

  // Handle alarm audio, vibration and notifications
  useEffect(() => {
    if (isAlarmActive) {
      // 1. Audio Alarm
      if (alarmRef.current) {
        alarmRef.current.volume = 1.0;
        alarmRef.current.play().catch(err => console.error("Alarm play blocked:", err));
      }

      // 2. Device Vibration (pattern: long pulse)
      if ("vibrate" in navigator) {
        navigator.vibrate([500, 200, 500, 200, 500]);
      }

      // 3. Browser Notification
      if (Notification.permission === "granted") {
        new Notification("🚨 EMERGENCY ALERT", {
          body: `New incident reported in ${pendingReports[0]?.dorm || 'Hostel'}. Open dashboard immediately.`,
          icon: "/favicon.ico",
          tag: "emergency-alert"
        });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    } else {
      if (alarmRef.current) {
        alarmRef.current.pause();
        alarmRef.current.currentTime = 0;
      }
    }
  }, [isAlarmActive]);

  // Request Notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }, []);

  const silenceAlarm = () => setIsAlarmActive(false);

  const enableSystemAlerts = async () => {
    // Prime the audio engine
    if (alarmRef.current) {
      try {
        const audio = alarmRef.current;
        audio.muted = true;
        await audio.play();
        audio.pause();
        audio.muted = false;
      } catch (e) {
        console.error("Audio priming failed", e);
      }
    }

    // Request Notification permission
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        new Notification("Security System Active", {
          body: "You will now receive emergency alerts and audible alarms.",
          icon: "/favicon.ico"
        });
      }
    }

    // Prime vibration
    if ("vibrate" in navigator) {
      navigator.vibrate(50);
    }

    setAlertsEnabled(true);
  };

  const testAlarm = () => {
    setIsAlarmActive(true);
    setTimeout(() => setIsAlarmActive(false), 3000);
  };

  // Sort reports by most recent first
  const sortedReports = [...reports].sort((a, b) => b.timestamp - a.timestamp);

  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    setIsConnected(socket.connected);

    function onConnect() { 
      setIsConnected(true); 
      setLastError(null);
    }
    function onDisconnect() { setIsConnected(false); }
    function onError(err: any) { 
      setIsConnected(false);
      setLastError(err.message || String(err));
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
    };
  }, []);

  const cameras = ['MOZAC 1', 'MOZAC 2', 'MOZAC 3'];

  // Individual Privacy Locks
  const isPrivacyLocked = (cam: string) => !pendingReports.some(r => r.dorm === cam);
  const isAnyPrivacyLocked = pendingReports.length === 0;

  useEffect(() => {
    if (activeCamera && isPrivacyLocked(activeCamera)) {
      setActiveCamera(null);
    }
  }, [pendingReports, activeCamera]);

  useEffect(() => {
    // Reset audio state when switching reports
    setIsPlaying(false);
    setAudioProgress(0);
  }, [selectedReport]);

  const togglePlay = async () => {
    if (audioRef.current) {
      try {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          // Reset progress if it was at the end
          if (audioRef.current.ended) {
            audioRef.current.currentTime = 0;
            setAudioProgress(0);
          }
          await audioRef.current.play();
          setIsPlaying(true);
        }
      } catch (err) {
        console.error("Audio playback error:", err);
        setIsPlaying(false);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setAudioProgress(progress || 0);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setAudioProgress(0);
  };

  const selectCamera = (cam: string) => {
    if (isPrivacyLocked(cam)) return;
    if (activeCamera === cam) {
      setActiveCamera(null);
    } else {
      setActiveCamera(cam);
    }
  };

  const turnOffCameras = () => setActiveCamera(null);

  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const handleClearAll = () => {
    if (isConfirmingClear) {
      onClearReports();
      setSelectedReport(null);
      setIsConfirmingClear(false);
    } else {
      setIsConfirmingClear(true);
      setTimeout(() => setIsConfirmingClear(false), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[#151619] text-white flex flex-col md:flex-row">
      {/* Alert Ticker - Global Scrolling Feed */}
      {pendingReports.length > 0 && (
        <div className="fixed top-[64px] md:top-0 md:left-72 right-0 h-8 bg-red-600/90 backdrop-blur-sm z-30 flex items-center overflow-hidden border-b border-red-500/30">
          <div className="flex whitespace-nowrap animate-[marquee_20s_linear_infinity]">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-8 px-4">
                {pendingReports.map((report) => (
                  <div key={report.id} className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-wider">
                    <AlertCircle className="w-3 h-3 animate-pulse" />
                    <span>EMERGENCY SIGNAL FROM {report.dorm}</span>
                    <span className="text-white/40">-</span>
                    <span>STUDENT {report.reporterId}</span>
                    <span className="ml-4 w-1 h-1 rounded-full bg-white/30" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Header */}
      <header className="md:hidden h-16 border-b border-white/5 flex items-center justify-between px-4 bg-[#1a1b1e] sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-red-500" />
          <span className="font-display font-bold uppercase tracking-tight text-sm">SMART EDUSAFE SYSTEM</span>
        </div>
        <div className="flex items-center gap-2">
          {isAlarmActive && (
             <button 
               onClick={silenceAlarm}
               className="p-2 bg-red-600 rounded-lg animate-pulse text-white"
             >
               <Power className="w-4 h-4" />
             </button>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-white/5 rounded-lg"
          >
          <div className="w-5 h-0.5 bg-white mb-1" />
          <div className="w-5 h-0.5 bg-white mb-1" />
          <div className="w-5 h-0.5 bg-white" />
        </button>
        </div>
      </header>

      {/* Sidebar - Desktop & Mobile Overlay */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-[#1a1b1e] border-r border-white/5 flex flex-col p-6 space-y-8 transition-transform duration-300
        md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-600/20">
              <Radio className="w-8 h-8" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-display text-lg font-bold leading-tight tracking-tight">SMART EDUSAFE</h1>
              <h1 className="font-display text-xl font-bold leading-tight tracking-tight">SYSTEM</h1>
              <div className="mt-1">
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.3em]">Monitor Alpha</span>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <button 
            onClick={() => setActiveView('surveillance')}
            className={`w-full text-left p-3.5 rounded-xl flex items-center gap-4 transition-all duration-300 ${activeView === 'surveillance' ? 'bg-white/5 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white/60'}`}
          >
            <Camera className={`w-5 h-5 ${activeView === 'surveillance' ? 'text-red-500' : 'text-white/20'}`} />
            <span className="font-bold tracking-wide">Surveillance Hub</span>
          </button>
          <button 
            onClick={() => setActiveView('reports')}
            className={`w-full text-left p-3.5 rounded-xl flex items-center gap-4 transition-all duration-300 ${activeView === 'reports' ? 'bg-white/5 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white/60'}`}
          >
            <Bell className={`w-5 h-5 ${activeView === 'reports' ? 'text-red-500' : 'text-white/20'}`} />
            <div className="flex-1 flex items-center justify-between">
              <span className="font-bold tracking-wide">Report Data</span>
              {pendingReports.length > 0 && (
                <span className="w-5 h-5 bg-red-600 text-white text-[10px] font-bold rounded-lg flex items-center justify-center animate-pulse shadow-lg shadow-red-600/40">
                  {pendingReports.length}
                </span>
              )}
            </div>
          </button>
        </nav>

        <div className="pt-8 border-t border-white/5 space-y-4">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-4">
             <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest font-bold">Persistence Layer</span>
            </div>

            {/* Firebase Status */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                <Shield className={`w-4 h-4 ${dbStatus.firebase === 'active' ? 'text-green-500' : 'text-white/20'}`} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-white/80">Firestore (Main)</span>
                <span className={`text-[9px] font-mono uppercase tracking-tight truncate ${
                  dbStatus.firebase === 'active' ? 'text-green-500/80' : 'text-red-400'
                }`}>
                  {dbStatus.firebase === 'active' ? 'Connected' : dbStatus.firebase === 'disconnected' ? 'Offline' : 'Config Error'}
                </span>
              </div>
            </div>

            {/* Supabase Status */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                <Activity className={`w-4 h-4 ${dbStatus.supabase === 'active' ? 'text-blue-500' : 'text-white/20'}`} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-white/80">Supabase (Backup)</span>
                <span className={`text-[9px] font-mono uppercase tracking-tight truncate ${
                  dbStatus.supabase === 'active' ? 'text-blue-500/80' : 'text-amber-400'
                }`}>
                  {dbStatus.supabase === 'active' ? 'Synced' : dbStatus.supabase || 'Not Ready'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 mb-4">
            <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-white/60" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{user.name}</p>
              <p className="text-[10px] font-mono text-white/40 uppercase">ID: {user.id}</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full p-3 rounded-lg text-red-400 hover:bg-red-950/30 flex items-center gap-3 transition-colors text-sm font-bold"
          >
            <LogOut className="w-4 h-4" />
            Sign Out System
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Monitor Bar - Desktop Only hidden on mobile since it has its own header */}
        <header className="hidden md:flex h-16 border-b border-white/5 items-center justify-between px-8 bg-[#1a1b1e]">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-blue-500 shadow-[0_0_8px_#3b82f6]' : 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'}`} />
                <div className="flex flex-col">
                  <span className="text-xs font-mono font-bold tracking-tighter uppercase whitespace-nowrap">
                    Signal: {isConnected ? 'Stable' : 'Sync Active'}
                  </span>
                  {!isConnected && (
                    <span className="text-[8px] font-mono opacity-50 uppercase tracking-tighter">Hybrid Polling</span>
                  )}
                </div>
                {!isConnected && (
                  <button 
                    onClick={() => socket.connect()}
                    className="text-[9px] bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded border border-white/10 transition-colors"
                  >
                    Resync Core
                  </button>
                )}
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${activeCamera ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-white/20'}`} />
                <span className="text-xs font-mono font-bold tracking-tighter uppercase whitespace-nowrap">
                  Feed: {activeCamera ? 'Active' : 'Idle'}
                </span>
              </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2 text-white/60">
              <Calendar className="w-4 h-4" />
              <span className="text-xs font-mono">{new Date().toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
             {isAlarmActive && (
               <button 
                 onClick={silenceAlarm}
                 className="flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest animate-bounce shadow-lg shadow-red-500/40"
               >
                 <Power className="w-3 h-3" /> Silence Alarm
               </button>
             )}

             {pendingReports.length > 0 && (
               <button 
                 onClick={() => setIsAlertsOpen(true)}
                 className="relative p-2 bg-red-600 rounded-lg animate-pulse hover:scale-105 transition-transform"
               >
                 <Bell className="w-5 h-5 text-white" />
                 <span className="absolute -top-1 -right-1 w-4 h-4 bg-white text-red-600 text-[10px] font-bold rounded-full flex items-center justify-center">
                   {pendingReports.length}
                 </span>
               </button>
             )}
             
             <button 
               onClick={() => setIsAlertsOpen(true)}
               className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
             >
               <Activity className="w-5 h-5" />
             </button>

             {activeCamera && (
               <div className="flex items-center gap-4">
                 <div className="bg-red-600/10 border border-red-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-mono font-bold text-red-500 uppercase">Monitoring: {activeCamera}</span>
                 </div>
                 <button 
                   onClick={turnOffCameras}
                   className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
                 >
                   <Power className="w-3.5 h-3.5" />
                   Disconnect
                 </button>
               </div>
             )}
          </div>
        </header>

        {/* Dashboard Area */}
        <div className={`flex-1 overflow-hidden transition-all duration-300 ${pendingReports.length > 0 ? 'pt-8' : ''}`}>
          {activeView === 'surveillance' ? (
            <>
              {/* Security Status Banner */}
              {!alertsEnabled && (
                <div className="mx-4 md:mx-8 mt-4 p-4 bg-blue-600 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg shadow-blue-900/20">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-lg">
                      <Shield className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">System Alerts Not Active</p>
                      <p className="text-[10px] text-white/70 font-mono">Enable notifications, audio, and vibration to receive emergency alerts.</p>
                    </div>
                  </div>
                  <button 
                    onClick={enableSystemAlerts}
                    className="bg-white text-blue-600 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-blue-50 transition-colors whitespace-nowrap"
                  >
                    Enable System Alerts
                  </button>
                </div>
              )}

              {alertsEnabled && (
                <div className="mx-4 md:mx-8 mt-4 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-green-500">Global Security Node Active</span>
                  </div>
                  <button 
                    onClick={testAlarm}
                    className="text-[10px] text-white/30 hover:text-white underline decoration-dotted underline-offset-4"
                  >
                    Test Device Alarm
                  </button>
                </div>
              )}

              {/* Surveillance Feed */}
              <section className="h-full p-4 md:p-8 overflow-y-auto space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                  <h2 className="text-sm font-mono font-bold uppercase tracking-[0.2em] text-white/40">Active Surveillance Network</h2>
                  <div className="flex items-center gap-4">
                    {isAnyPrivacyLocked ? (
                      <span className="text-[10px] font-mono text-blue-400 flex items-center gap-1.5 bg-blue-400/10 px-2 py-0.5 rounded">
                        <Shield className="w-3 h-3" /> GLOBAL PRIVACY SHIELD ACTIVE
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-green-500 animate-pulse">● SELECTIVE STREAM ACCESS</span>
                    )}
                    {!activeCamera && !isAnyPrivacyLocked && <span className="text-[10px] font-mono text-white/20">SELECT AUTHENTICATED SOURCE</span>}
                  </div>
                </div>
                
                <div className="relative">
                  <CCTVMonitor isActive={!!activeCamera} label={activeCamera || (isAnyPrivacyLocked ? 'PRIVACY PROTECTED' : 'LOCKED')} />
                  
                  {!activeCamera && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 z-10 bg-[#1a1b1e]/90 flex flex-col items-center justify-center text-center p-8 backdrop-blur-sm rounded-2xl border-2 border-white/5"
                    >
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isAnyPrivacyLocked ? 'bg-blue-500/10' : 'bg-red-500/10'}`}>
                        <Shield className={`w-8 h-8 ${isAnyPrivacyLocked ? 'text-blue-500' : 'text-red-500'}`} />
                      </div>
                      <h3 className="text-xl font-bold font-display mb-2 uppercase tracking-wide">
                        {isAnyPrivacyLocked ? 'Privacy Shield Active' : 'Select Authorized Feed'}
                      </h3>
                      <p className="text-white/40 text-sm max-w-sm font-mono leading-relaxed">
                        {isAnyPrivacyLocked 
                          ? 'Surveillance is locked. Access only unlocks when a report specifying a dorm location is received.' 
                          : 'Emergency signals detected. Only cameras associated with reporting dorms are authorized for viewing.'}
                      </p>
                    </motion.div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                   {cameras.map(cam => {
                    const isLocked = isPrivacyLocked(cam);
                    return (
                      <button 
                        key={cam}
                        disabled={isLocked}
                        onClick={() => selectCamera(cam)}
                        className={`relative group overflow-hidden bg-[#1a1b1e] border-2 h-40 rounded-2xl transition-all p-6 text-left ${
                          activeCamera === cam 
                            ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]' 
                            : isLocked 
                              ? 'border-white/5 opacity-40 cursor-not-allowed' 
                              : 'border-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="flex flex-col h-full justify-between">
                          <div className="flex justify-between items-start">
                            {isLocked ? (
                              <Shield className="w-6 h-6 text-white/10" />
                            ) : (
                              <Camera className={`w-6 h-6 ${activeCamera === cam ? 'text-red-500' : 'text-white/20'}`} />
                            )}
                            
                            {activeCamera === cam && (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-red-600 rounded text-[8px] font-bold uppercase tracking-widest text-white">
                                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                Live
                              </div>
                            )}
                            
                            {isLocked && (
                              <div className="bg-white/5 px-2 py-1 rounded text-[8px] font-bold text-white/20 uppercase tracking-widest">
                                Locked
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-1">Source Label</p>
                            <h4 className="text-xl font-bold font-display">{cam}</h4>
                          </div>
                        </div>
                      </button>
                    );
                   })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6 relative group overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Activity className="w-12 h-12" />
                    </div>
                    <h4 className="text-[10px] font-mono text-white/40 uppercase mb-2">Total System Reports</h4>
                    <div className="text-4xl font-display font-bold">{reports.length}</div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6 relative group overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity font-display italic text-6xl">!</div>
                    <h4 className="text-[10px] font-mono text-white/40 uppercase mb-2">Reports Awaiting Review</h4>
                    <div className="text-4xl font-display font-bold text-red-500">{pendingReports.length}</div>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <div className="h-full flex flex-col bg-[#151619]">
              <div className="p-10 pb-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-white/5">
                  <div>
                    <h2 className="text-3xl font-bold font-display uppercase tracking-tight mb-2">Alert Center</h2>
                    <p className="text-xs text-white/30 font-mono uppercase tracking-[0.2em]">System Logs & Incident Signals Database</p>
                  </div>
                </div>
                
                <div className="mt-8">
                  <button 
                    onClick={handleClearAll}
                    className={`w-full py-3.5 rounded-xl text-[10px] font-mono font-bold tracking-[0.2em] uppercase transition-all duration-300 border ${
                      isConfirmingClear 
                        ? 'bg-red-600 border-red-500 text-white animate-pulse shadow-lg shadow-red-600/20' 
                        : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10 hover:text-white/60 hover:border-white/20'
                    }`}
                  >
                    {isConfirmingClear ? 'Confirm System Reset' : 'Clear All Logs'}
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto px-10 pb-10 space-y-6">
                {sortedReports.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-white/5 border-2 border-dashed border-white/5 rounded-[2.5rem] space-y-6">
                    <Radio className="w-16 h-16 opacity-5" />
                    <p className="text-[10px] font-mono uppercase tracking-[0.3em]">No incident signals detected</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                    {sortedReports.map(report => (
                      <motion.button
                        layoutId={`grid-alert-${report.id}`}
                        key={report.id}
                        onClick={() => setSelectedReport(report)}
                        className={`text-left p-8 rounded-[2rem] border transition-all duration-300 group relative overflow-hidden bg-[#1a1b1e] ${
                          report.status === 'pending' 
                            ? 'border-red-600/30 hover:border-red-600/60 shadow-lg shadow-red-900/10' 
                            : 'border-white/5 hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-8">
                          <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest ${
                            report.status === 'pending' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                          }`}>
                            {report.status}
                          </span>
                          <span className="text-[10px] font-mono text-white/20 font-bold uppercase tracking-tighter">
                            {new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        
                        <div className="space-y-4">
                          <h3 className="text-xl font-bold font-display tracking-tight text-white/90">Student {report.reporterId}</h3>
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
                            <span className="text-[10px] font-mono text-white/40 uppercase font-bold tracking-widest">Dorm: {report.dorm}</span>
                          </div>
                        </div>
                        
                        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Mic className={`w-4 h-4 ${report.status === 'pending' ? 'text-red-500' : 'text-white/10'}`} />
                            <span className="text-[10px] font-mono text-white/30 italic font-medium">Voice evidence attached</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-white/10 group-hover:text-white group-hover:translate-x-1 transition-all" />
                        </div>

                        {report.status === 'pending' && (
                          <div className="absolute top-0 right-0 p-6">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse shadow-[0_0_15px_#dc2626]" />
                          </div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Alerts Drawer */}
      <AnimatePresence>
        {isAlertsOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAlertsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed right-0 inset-y-0 w-full max-w-sm bg-[#1a1b1e] border-l border-white/10 z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#151619]">
                <div>
                  <h2 className="text-sm font-mono font-bold uppercase tracking-widest">Alert Center</h2>
                  <p className="text-[10px] text-white/40 uppercase">System Logs & Incident Signals</p>
                </div>
                <button onClick={() => setIsAlertsOpen(false)} className="p-2 hover:bg-white/5 rounded-lg">
                  <LogOut className="w-5 h-5 opacity-40 rotate-180" />
                </button>
              </div>

              <div className="p-4 border-b border-white/5 flex gap-2">
                <button 
                  onClick={handleClearAll}
                  className={`flex-1 text-[10px] font-mono tracking-widest uppercase py-2 rounded transition-all ${
                    isConfirmingClear ? 'bg-red-600 text-white animate-pulse' : 'bg-white/5 text-white/40 hover:text-red-400'
                  }`}
                >
                  {isConfirmingClear ? 'Confirm Purge' : 'Clear All Logs'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {sortedReports.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-white/10 p-12 text-center space-y-4">
                    <Radio className="w-12 h-12 opacity-5" />
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em]">Silence Detected</p>
                  </div>
                ) : (
                  sortedReports.map(report => (
                    <motion.button
                      layoutId={`alert-${report.id}`}
                      key={report.id}
                      animate={report.status === 'pending' ? { 
                        boxShadow: [
                          '0 0 0px rgba(239, 68, 68, 0)',
                          '0 0 20px rgba(239, 68, 68, 0.2)',
                          '0 0 0px rgba(239, 68, 68, 0)'
                        ]
                      } : {}}
                      transition={{ duration: 2, repeat: Infinity }}
                      onClick={() => {
                        setSelectedReport(report);
                        setIsAlertsOpen(false);
                      }}
                      className={`w-full text-left p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden bg-[#151619] ${
                        report.status === 'pending' 
                          ? 'border-red-600/30' 
                          : 'border-white/5 opacity-60'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-6 relative z-10">
                         <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest ${report.status === 'pending' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
                          {report.status}
                         </span>
                         <span className="text-[9px] font-mono text-white/30 font-bold">{new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-base font-bold truncate mb-2 text-white/90">Student {report.reporterId}</p>
                      <div className="flex flex-wrap gap-2 mb-6">
                        <span className="text-[9px] font-mono bg-white/5 px-2 py-0.5 rounded text-white/40 border border-white/5 uppercase font-bold tracking-widest">
                          Dorm: {report.dorm}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                        <Mic className={`w-3.5 h-3.5 ${report.status === 'pending' ? 'text-red-500' : 'text-white/10'}`} />
                        <span className="text-[10px] font-mono text-white/30 italic">Voice evidence attached</span>
                      </div>
                    </motion.button>
                  ))
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Incident Detail Modal */}
      <AnimatePresence>
        {selectedReport && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReport(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-[#1a1b1e] rounded-[1.5rem] md:rounded-[2rem] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,1)] overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]"
            >
              <div className="p-4 md:p-8 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-red-600/20 to-transparent">
                 <div>
                   <h3 className="text-lg md:text-2xl font-bold font-display uppercase tracking-tight">Incident Evidence File</h3>
                   <p className="text-[9px] md:text-xs font-mono text-white/40 uppercase tracking-widest">Reporter: Student {selectedReport.reporterId} | Dorm: {selectedReport.dorm} | System ID: #{selectedReport.id}</p>
                 </div>
                 <button onClick={() => setSelectedReport(null)} className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white">
                   <LogOut className="w-5 h-5 md:w-6 h-6 rotate-90" />
                 </button>
              </div>

              <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 overflow-y-auto custom-scrollbar">
                 <div className="space-y-6">
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-mono font-bold text-red-500 uppercase flex items-center gap-2">
                        <Camera className="w-3 h-3" /> Encrypted Playback
                      </h4>
                      <CCTVMonitor isActive={true} isRecording={false} label="Recorded Event" />
                    </div>

                    <div className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-4">
                       <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Voice Log</h4>
                       {selectedReport.voiceUrl ? (
                         <div className="flex items-center gap-4">
                            <button 
                              onClick={togglePlay}
                              className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-white hover:scale-105 transition-transform active:scale-95 shadow-lg"
                            >
                              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                            </button>
                            <div className="flex-1">
                               <div className="h-1.5 bg-white/10 rounded-full w-full overflow-hidden mb-2">
                                  <motion.div 
                                    initial={{ width: 0 }} 
                                    animate={{ width: `${audioProgress}%` }} 
                                    className="h-full bg-red-600" 
                                  />
                               </div>
                               <audio 
                                 ref={audioRef}
                                 src={selectedReport.voiceUrl} 
                                 onTimeUpdate={handleTimeUpdate}
                                 onEnded={handleAudioEnded}
                                 className="hidden" 
                               />
                               <span className="text-[10px] font-mono text-white/40 uppercase">Smart-Capture Audio Stream</span>
                            </div>
                         </div>
                       ) : <p className="text-xs text-white/20 italic">No audio capture found</p>}
                    </div>
                 </div>

                 <div className="space-y-8">
                    <div className="space-y-4">
                       <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Relay Path</h4>
                       <div className="space-y-4">
                          <div className="flex gap-4">
                            <div className="w-0.5 bg-red-500 relative">
                               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                            </div>
                            <div>
                               <p className="text-xs font-bold uppercase tracking-wide">Signal Received</p>
                               <p className="text-[10px] text-white/40 font-mono italic">Timestamp verified via EDU-BLOCK chain</p>
                            </div>
                          </div>
                          <div className="flex gap-4">
                            <div className="w-0.5 bg-white/10 relative">
                               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/10" />
                            </div>
                            <div>
                               <p className="text-xs font-bold uppercase tracking-wide text-white/40">Cloud Sync Complete</p>
                               <p className="text-[10px] text-white/20 font-mono">Biometric signature attached to file</p>
                            </div>
                          </div>
                       </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-4">
                       <AlertCircle className="w-6 h-6 text-amber-500" />
                       <div>
                          <p className="text-xs font-bold uppercase mb-1">Administrative Note</p>
                          <p className="text-[11px] text-white/60 leading-relaxed">Closing this file marks the incident as 'Resolved' in the student's behavior database.</p>
                       </div>
                    </div>

                    <button 
                      onClick={() => {
                        onMarkReviewed(selectedReport.id);
                        setSelectedReport(null);
                      }}
                      className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl shadow-red-900/40"
                    >
                      <CheckCircle2 className="w-6 h-6" />
                      Resolve Incident Report
                    </button>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <audio 
        ref={alarmRef}
        src="https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3"
        loop
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
      `}</style>
    </div>
  );
};
