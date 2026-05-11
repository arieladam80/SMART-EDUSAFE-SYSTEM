/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoginView, useSmartEduSafe } from './components/AsramaContext';
import { StudentDashboard } from './components/StudentDashboard';
import { WardenDashboard } from './components/WardenDashboard';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const { 
    user, 
    reports, 
    isCctvActive, 
    dbStatus,
    login, 
    logout, 
    addReport, 
    markAsReviewed, 
    toggleCctv,
    clearReports
  } = useSmartEduSafe();

  return (
    <div className="min-h-screen font-sans selection:bg-blue-100 selection:text-blue-900">
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <LoginView onLogin={login} />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full"
          >
            {user.role === 'superadmin' ? (
              <SuperAdminDashboard onLogout={logout} />
            ) : user.role === 'student' ? (
              <div className="min-h-screen bg-slate-50">
                 <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-30">
                   <div className="max-w-4xl mx-auto flex justify-between items-center">
                     <span className="font-display font-bold text-xl text-blue-600">SMART EDUSAFE SYSTEM</span>
                     <button 
                       onClick={logout}
                       className="text-slate-500 hover:text-red-500 text-sm font-medium transition-colors"
                     >
                       Sign Out
                     </button>
                   </div>
                 </header>
                 <StudentDashboard 
                   user={user} 
                   reports={reports} 
                   onReport={(data) => addReport({ ...data, reporterId: user.id })} 
                 />
              </div>
            ) : (
              <WardenDashboard 
                user={user} 
                reports={reports} 
                dbStatus={dbStatus}
                onMarkReviewed={markAsReviewed}
                onClearReports={clearReports}
                onLogout={logout}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

