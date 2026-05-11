
import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Database, 
  Terminal, 
  ShieldAlert, 
  Users, 
  Settings, 
  Activity, 
  AlertCircle,
  CheckCircle2,
  Lock,
  Search,
  Plus,
  Trash2,
  RefreshCcw,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LogEntry {
  timestamp: number;
  level: 'info' | 'error' | 'warn';
  message: string;
  source: string;
}

interface DBStatus {
  firebase: string;
  supabase: string;
}

export function SuperAdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [dbStatus, setDbStatus] = useState<DBStatus>({ firebase: 'checking', supabase: 'checking' });
  const [activeTab, setActiveTab] = useState<'overview' | 'database' | 'users' | 'logs'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [featureFlags, setFeatureFlags] = useState<any>({});
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);
  const [stats, setStats] = useState({
    reports: 0,
    wardens: 0,
    students: 1240, 
    uptime: '99.9%'
  });

  const [newUserId, setNewUserId] = useState('');
  const [newUserRole, setNewUserRole] = useState<'student' | 'warden'>('student');
  const [newUserPass, setNewUserPass] = useState('');

  const fetchData = async () => {
    try {
      const [logsRes, dbRes, reportsRes, configRes, usersRes] = await Promise.all([
        fetch('/api/system/logs').catch(() => ({ ok: false })),
        fetch('/api/db-status').catch(() => ({ ok: false })),
        fetch('/api/reports').catch(() => ({ ok: false })),
        fetch('/api/system/config').catch(() => ({ ok: false })),
        fetch('/api/users').catch(() => ({ ok: false }))
      ]);
      
      if (logsRes.ok) setLogs(await (logsRes as any).json());
      if (dbRes.ok) setDbStatus(await (dbRes as any).json());
      if (configRes.ok) {
        const cfg = await (configRes as any).json();
        setFeatureFlags(cfg.featureFlags);
      }

      let currentWardens = 0;
      if (usersRes.ok) {
        const users = await (usersRes as any).json();
        setRegisteredUsers(users);
        currentWardens = users.filter((u: any) => u.role === 'warden').length;
      }

      if (reportsRes.ok) {
        const reports = await (reportsRes as any).json();
        setStats(prev => ({ 
          ...prev, 
          reports: reports.length, 
          wardens: currentWardens || prev.wardens 
        }));
      }
    } catch (e) {
      // Silently fail to avoid console Spam during HMR/Restarts
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFeature = async (key: string, current: boolean) => {
    const updatedFlags = { ...featureFlags, [key]: !current };
    try {
      await fetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureFlags: updatedFlags })
      });
      setFeatureFlags(updatedFlags);
    } catch (e) {}
  };

  const addUser = async () => {
    if (!newUserId) return;
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newUserId, role: newUserRole, password: newUserPass })
      });
      setNewUserId('');
      setNewUserPass('');
      fetchData();
    } catch (e) {}
  };

  const removeUser = async (uid: string) => {
    try {
      await fetch(`/api/users/${uid}`, { method: 'DELETE' });
      fetchData();
    } catch (e) {}
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-300 font-sans">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0d1117] border-r border-white/5 z-50 flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center border border-red-500/30">
              <ShieldAlert className="w-5 h-5 text-red-500" />
            </div>
            <span className="font-bold text-white tracking-tight uppercase text-sm">System Core</span>
          </div>
          <div className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em] font-bold pl-11">
            Super Admin
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          <TabButton 
            active={activeTab === 'overview'} 
            onClick={() => setActiveTab('overview')} 
            icon={<BarChart3 className="w-4 h-4" />} 
            label="Overview" 
          />
          <TabButton 
            active={activeTab === 'database'} 
            onClick={() => setActiveTab('database')} 
            icon={<Database className="w-4 h-4" />} 
            label="Database Stack" 
          />
          <TabButton 
            active={activeTab === 'logs'} 
            onClick={() => setActiveTab('logs')} 
            icon={<Terminal className="w-4 h-4" />} 
            label="System Logs" 
          />
          <TabButton 
            active={activeTab === 'users'} 
            onClick={() => setActiveTab('users')} 
            icon={<Users className="w-4 h-4" />} 
            label="Warden & Students" 
          />
        </nav>

        <div className="p-4 border-t border-white/5">
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-red-400 hover:bg-red-500/10 group"
          >
            <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span className="text-sm font-medium">Terminate Session</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8 min-h-screen">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Control
            </h1>
            <p className="text-sm text-slate-500">Managing Kitabuddy Edge Infrastructure</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] font-bold uppercase tracking-wider animate-pulse">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Live Feed Active
            </div>
            <button 
              onClick={() => { setIsLoading(true); fetchData(); }}
              className="p-2 rounded-lg bg-white/5 border border-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-all"
            >
              <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-4 gap-6">
                  <StatCard label="Total Reports" value={stats.reports} trend="+12% Since Last Week" icon={<Activity className="w-5 h-5 text-blue-500"/>} />
                  <StatCard label="Registered Wardens" value={stats.wardens} trend="Stable" icon={<Users className="w-5 h-5 text-purple-500"/>} />
                  <StatCard label="Student Population" value={stats.students} trend="+2 New Registration" icon={<ShieldAlert className="w-5 h-5 text-red-500"/>} />
                  <StatCard label="Service Uptime" value={stats.uptime} trend="Target Met" icon={<CheckCircle2 className="w-5 h-5 text-green-500"/>} />
                </div>

                <div className="grid grid-cols-3 gap-6">
                  <div className="col-span-2 bg-[#0d1117] rounded-3xl border border-white/5 p-6 h-[400px]">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-white flex items-center gap-2">
                         <Terminal className="w-4 h-4 text-white/40" />
                         Real-time Telemetry
                      </h3>
                      <button className="text-[10px] uppercase font-bold text-blue-400 hover:text-blue-300 transition-colors tracking-widest">
                         Export Diagnostics
                      </button>
                    </div>
                    <div className="font-mono text-[11px] leading-relaxed space-y-1 overflow-auto max-h-[300px] custom-scrollbar">
                      {logs.slice(0, 10).map((log, i) => (
                        <div key={i} className="flex gap-4 p-2 rounded hover:bg-white/5 border-l-2 border-transparent hover:border-blue-500 transition-all">
                          <span className="text-white/20">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          <span className={`uppercase font-bold w-12 ${
                            log.level === 'error' ? 'text-red-500' : 
                            log.level === 'warn' ? 'text-amber-500' : 'text-blue-500'
                          }`}>{log.level}</span>
                          <span className="text-white/40 w-16">[{log.source}]</span>
                          <span className="text-white/80">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#0d1117] rounded-3xl border border-white/5 p-6">
                     <h3 className="font-bold text-white mb-6">Active Database Engines</h3>
                     <div className="space-y-4">
                        <EngineCard 
                          name="Google Cloud Firestore" 
                          status={dbStatus.firebase} 
                          type="NoSQL Document"
                          isMain={true}
                        />
                        <EngineCard 
                          name="Supabase (PostgreSQL)" 
                          status={dbStatus.supabase} 
                          type="Relational Storage"
                          isMain={false}
                        />
                     </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'database' && (
               <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <DatabaseSection 
                      title="Firestore Configuration"
                      status={dbStatus.firebase}
                      description="Main persistent landing engine. Used for real-time syncing and structured document storage."
                      fields={['Service Account', 'Project ID', 'Private Key']}
                    />
                    <DatabaseSection 
                      title="Supabase Edge Config"
                      status={dbStatus.supabase}
                      description="Relational backup and edge caching. Handles SQL queries and Vercel-optimized data."
                      fields={['Anon Key', 'Project URL', 'Service Role']}
                    />
                  </div>
                  <div className="bg-[#0d1117] rounded-3xl border border-white/5 p-8">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                       <Settings className="w-5 h-5 text-blue-500" />
                       Engine Toggles & Feature Flags
                    </h3>
                    <div className="space-y-6">
                       <FeatureToggle 
                         label="Hybrid Sync Persistence"
                         description="Write to both databases simultaneously for maximum data safety."
                         enabled={featureFlags.hybridSync}
                         onToggle={() => toggleFeature('hybridSync', featureFlags.hybridSync)}
                       />
                       <FeatureToggle 
                         label="Smart CCTV Failover"
                         description="Automatic fallback to local storage if internet latency exceeds 500ms."
                         enabled={featureFlags.cctvFailover}
                         onToggle={() => toggleFeature('cctvFailover', featureFlags.cctvFailover)}
                       />
                       <FeatureToggle 
                         label="Warden Push Notifications"
                         description="Enable web-hooks for instant warden notifications on high-priority reports."
                         enabled={featureFlags.pushNotifications}
                         onToggle={() => toggleFeature('pushNotifications', featureFlags.pushNotifications)}
                       />
                       <FeatureToggle 
                         label="AI Report Sentiment Analysis"
                         description="Automatically flag aggressive or distressed report descriptions."
                         enabled={featureFlags.aiSentiment}
                         onToggle={() => toggleFeature('aiSentiment', featureFlags.aiSentiment)}
                       />
                    </div>
                  </div>
               </div>
            )}

            {activeTab === 'logs' && (
              <div className="bg-[#0d1117] rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[70vh]">
                 <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-3">
                       <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                          <Terminal className="w-4 h-4 text-white/50" />
                       </div>
                       <span className="font-bold text-white">Kernel Logs</span>
                    </div>
                    <div className="flex gap-2">
                       <LogFilter label="Errors" count={logs.filter(l => l.level === 'error').length} active={true} />
                       <LogFilter label="Warnings" count={logs.filter(l => l.level === 'warn').length} active={false} />
                       <LogFilter label="Info" count={logs.filter(l => l.level === 'info').length} active={false} />
                    </div>
                 </div>
                 <div className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed bg-black/10">
                    {logs.length > 0 ? (
                      logs.map((log, i) => (
                        <div key={i} className="group flex gap-4 p-2.5 rounded-lg hover:bg-white/5 transition-all border border-transparent hover:border-white/5 mb-1">
                           <span className="text-white/20 tabular-nums shrink-0">{new Date(log.timestamp).toISOString()}</span>
                           <span className={`uppercase font-bold w-12 shrink-0 ${
                             log.level === 'error' ? 'text-red-500 underline decoration-red-500/30 underline-offset-4' : 
                             log.level === 'warn' ? 'text-amber-500' : 'text-blue-400'
                           }`}>{log.level}</span>
                           <span className="text-white/30 w-20 shrink-0 font-bold tracking-tight">[{log.source}]</span>
                           <span className={log.level === 'error' ? 'text-red-400' : 'text-slate-100'}>{log.message}</span>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-white/20">
                         <Activity className="w-12 h-12 mb-4 opacity-20" />
                         <span className="text-sm font-medium">Listening for system events...</span>
                      </div>
                    )}
                 </div>
              </div>
            )}

            {activeTab === 'users' && (
               <div className="grid grid-cols-2 gap-8">
                  <div className="bg-[#0d1117] rounded-3xl border border-white/5 p-8 space-y-6">
                    <h3 className="text-lg font-bold text-white mb-6">Register New Identity</h3>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Identity Role</label>
                        <select 
                          value={newUserRole}
                          onChange={(e) => setNewUserRole(e.target.value as any)}
                          className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/5 text-sm focus:outline-none focus:border-blue-500 appearance-none"
                        >
                          <option value="student">Student</option>
                          <option value="warden">Warden</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Identifier (ID/Email)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. S2024-004"
                          value={newUserId}
                          onChange={(e) => setNewUserId(e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/5 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      {newUserRole === 'warden' && (
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Access Password</label>
                          <input 
                            type="password" 
                            placeholder="••••••••"
                            value={newUserPass}
                            onChange={(e) => setNewUserPass(e.target.value)}
                            className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/5 text-sm focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      )}
                      <button 
                        onClick={addUser}
                        className="w-full py-4 rounded-2xl bg-blue-500 text-white font-bold text-sm shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                      >
                         Generate Identity
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <UserManagementSection 
                      title="Warden Directory"
                      icon={<Users className="w-5 h-5 text-purple-400" />}
                      users={registeredUsers.filter(u => u.role === 'warden')}
                      onRemove={removeUser}
                    />
                    <UserManagementSection 
                      title="Student Registry"
                      icon={<Users className="w-5 h-5 text-blue-400" />}
                      users={registeredUsers.filter(u => u.role === 'student')}
                      onRemove={removeUser}
                      isStudent={true}
                    />
                  </div>
               </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        active 
          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
          : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
      }`}
    >
      <div className={`${active ? 'text-blue-400' : 'text-slate-500'}`}>
        {icon}
      </div>
      <span className="text-sm font-medium">{label}</span>
      {active && <div className="ml-auto w-1 h-4 bg-blue-500 rounded-full" />}
    </button>
  );
}

function StatCard({ label, value, trend, icon }: any) {
  return (
    <div className="bg-[#0d1117] rounded-3xl border border-white/5 p-6 hover:border-white/10 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
          {icon}
        </div>
        <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
          {trend}
        </span>
      </div>
      <div className="space-y-1">
        <h4 className="text-white text-2xl font-bold tracking-tight tabular-nums">{value}</h4>
        <p className="text-xs text-white/30 uppercase font-bold tracking-widest">{label}</p>
      </div>
    </div>
  );
}

function EngineCard({ name, status, type, isMain }: any) {
  const isActive = status === 'active' || status === 'connected' || status === 'initialized';
  return (
    <div className={`p-4 rounded-2xl border ${isMain ? 'bg-blue-500/5 border-blue-500/10' : 'bg-white/5 border-white/5'} transition-all hover:translate-x-1`}>
      <div className="flex items-center justify-between mb-2">
         <span className="text-xs font-bold text-white/90">{name}</span>
         <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 animate-pulse'}`} />
      </div>
      <div className="flex justify-between items-center text-[10px] font-mono">
         <span className="text-white/30 tracking-tight">{type}</span>
         <span className={`uppercase font-bold ${isActive ? 'text-green-500/80' : 'text-red-400'}`}>
            {status}
         </span>
      </div>
    </div>
  );
}

function FeatureToggle({ label, description, enabled, onToggle }: any) {
  return (
    <div className="flex items-start justify-between gap-6 p-4 rounded-2xl bg-white/5 border border-white/5">
       <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white/90">{label}</span>
            {enabled && <span className="text-[9px] font-bold text-blue-400 px-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 uppercase tracking-tighter">Enabled</span>}
          </div>
          <p className="text-xs text-white/40 leading-relaxed">{description}</p>
       </div>
       <button 
         onClick={onToggle}
         className={`w-10 h-6 shrink-0 rounded-full transition-all duration-300 relative ${enabled ? 'bg-blue-500' : 'bg-white/10'}`}
       >
         <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-lg ${enabled ? 'left-5' : 'left-1'}`} />
       </button>
    </div>
  );
}

function DatabaseSection({ title, status, description, fields }: any) {
  return (
    <div className="bg-[#0d1117] rounded-3xl border border-white/5 p-6 space-y-4">
       <div className="flex items-center justify-between">
          <h3 className="font-bold text-white">{title}</h3>
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
            status === 'active' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
          }`}>
             {status}
          </span>
       </div>
       <p className="text-xs text-white/40 leading-relaxed">{description}</p>
       <div className="grid grid-cols-2 gap-4">
          {fields.map((f: string) => (
             <div key={f} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-tight">{f}</span>
                <Lock className="w-3 h-3 text-white/20" />
             </div>
          ))}
       </div>
    </div>
  );
}

function LogFilter({ label, count, active }: any) {
   return (
      <button className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${
         active 
         ? 'bg-white/10 border-white/20 text-white' 
         : 'text-white/30 border-transparent hover:border-white/5 hover:text-white/50'
      }`}>
         {label} <span className="opacity-40 font-mono ml-1">{count}</span>
      </button>
   );
}

function UserManagementSection({ title, icon, users, onRemove, isStudent }: any) {
   return (
      <div className="bg-[#0d1117] rounded-3xl border border-white/5 p-6 h-[350px] flex flex-col">
         <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
               <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
                  {icon}
               </div>
               <div>
                  <h3 className="font-bold text-white text-sm">{title}</h3>
                  <p className="text-[10px] text-white/30 uppercase">{users.length} Active Records</p>
               </div>
            </div>
         </div>

         <div className="flex-1 overflow-auto space-y-2 custom-scrollbar">
            {users.map((u: any) => (
               <div key={u.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 group hover:bg-white/10 transition-all">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Users className="w-4 h-4 text-blue-400" />
                     </div>
                     <div className="min-w-0">
                        <p className="text-xs font-bold text-white/90 truncate">{u.id}</p>
                        <p className="text-[9px] font-mono text-white/30 truncate">
                           {isStudent ? 'STUDENT_L1' : 'WARDEN_STAFF'}
                        </p>
                     </div>
                  </div>
                  <button 
                    onClick={() => onRemove(u.id)}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all"
                  >
                     <Trash2 className="w-3.5 h-3.5" />
                  </button>
               </div>
            ))}
            {users.length === 0 && (
              <div className="h-full flex items-center justify-center text-white/10 italic text-[10px]">
                No users registered
              </div>
            )}
         </div>
      </div>
   );
}
