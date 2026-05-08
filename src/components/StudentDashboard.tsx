import React, { useState, useEffect, useRef } from 'react';
import { Camera, Mic, Radio, Shield, Send, CheckCircle2, History, AlertCircle, Info, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Report } from '../types';
import { socket } from '../lib/socket';

interface StudentProps {
  user: User;
  onReport: (report: { voiceUrl: string, videoUrl?: string, dorm: string }) => void;
  reports: Report[];
}

export const StudentDashboard = ({ user, onReport, reports }: StudentProps) => {
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

  const [isReporting, setIsReporting] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<string | null>(null);
  const [selectedDorm, setSelectedDorm] = useState('MOZAC 1');
  const [isSending, setIsSending] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const getSupportedMimeType = () => {
    const types = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  };

  const startReportingTransition = async () => {
    setIsReporting(true);
  };

  const toggleVoiceRecording = async () => {
    if (!isRecordingVoice) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = getSupportedMimeType();
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];
        
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            const base64data = reader.result as string;
            setVoiceBlob(base64data);
          };
          // Stop stream tracks
          stream.getTracks().forEach(track => track.stop());
        };
        
        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecordingVoice(true);
      } catch (err) {
        console.error("Mic error:", err);
        alert("Microphone access denied or not supported.");
      }
    } else {
      mediaRecorderRef.current?.stop();
      setIsRecordingVoice(false);
    }
  };

  const submitReport = async () => {
    if (voiceBlob) {
      setIsSending(true);
      try {
        // Simulate a small delay for network "feel"
        await new Promise(resolve => setTimeout(resolve, 800));
        onReport({ 
          voiceUrl: voiceBlob,
          dorm: selectedDorm
        });
        setVoiceBlob(null);
        setIsReporting(false);
      } catch (err) {
        console.error("Submit error:", err);
      } finally {
        setIsSending(false);
      }
    }
  };

  const studentReports = reports.filter(r => r.reporterId === user.id);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:py-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-xl md:text-2xl font-display">Student Control</h2>
          <p className="text-slate-500 font-mono text-[10px] md:text-xs">ID: {user.id}</p>
        </div>
        <div className={`px-3 py-1.5 md:px-4 md:py-2 rounded-full font-medium flex items-center gap-2 text-xs md:text-sm transition-colors ${isConnected ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
          <Shield className={`w-3.5 h-3.5 md:w-4 h-4 ${!isConnected ? 'animate-pulse' : ''}`} />
          <div className="flex flex-col items-start leading-none">
            <span className="font-bold">{isConnected ? 'System Connected' : 'Sync Active'}</span>
            {!isConnected && (
              <span className="text-[8px] opacity-70">Polling updates every 10s</span>
            )}
          </div>
          {!isConnected && (
            <button 
              onClick={() => socket.connect()}
              className="ml-2 bg-amber-600 text-white px-2 py-0.5 rounded text-[10px] font-bold hover:bg-amber-700 transition-colors"
            >
              Retry Core
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!isReporting ? (
          <motion.div 
            key="idle"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="space-y-8"
          >
            <div className="bg-white rounded-[2rem] md:rounded-3xl p-8 md:p-12 border border-slate-100 shadow-xl text-center space-y-6">
              <div className="w-20 h-20 md:w-24 md:h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                <Radio className="text-red-500 w-10 h-10 md:w-12 md:h-12" />
              </div>
              <h3 className="text-2xl md:text-4xl font-display font-bold">Emergency Alert</h3>
              <p className="text-slate-500 text-sm md:text-lg max-w-sm mx-auto">
                Press the button below to alert current wardens on duty. CCTV will activate automatically.
              </p>
              <button 
                onClick={startReportingTransition}
                className="group relative inline-flex items-center justify-center p-6 md:p-8 bg-red-600 text-white rounded-full transition-all hover:bg-red-700 active:scale-90 shadow-2xl shadow-red-200"
              >
                <div className="absolute inset-0 bg-red-400 rounded-full animate-ping opacity-20" />
                <span className="text-xl md:text-2xl font-bold uppercase tracking-widest relative z-10">Report Now</span>
              </button>
            </div>

            <div className="space-y-4">
              <h4 className="font-display text-lg md:text-xl flex items-center gap-2">
                <History className="w-5 h-5 text-slate-400" />
                Your Recent Reports
              </h4>
              <div className="grid gap-3">
                {studentReports.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-8 border border-dashed border-slate-200 text-center text-slate-400 text-sm">
                    No reports filed yet
                  </div>
                ) : (
                  studentReports.map(report => (
                    <div key={report.id} className="bg-white p-4 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                      <div className="flex items-center gap-3 md:gap-4 shrink-0">
                        <div className={`p-2 rounded-lg ${report.status === 'reviewed' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                          {report.status === 'reviewed' ? <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" /> : <Activity className="w-4 h-4 md:w-5 md:h-5 animate-pulse" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base truncate">Report #{report.id}</p>
                          <p className="text-[9px] md:text-xs text-slate-400 uppercase font-mono truncate">{new Date(report.timestamp).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[9px] md:text-[10px] font-bold uppercase shrink-0 ${report.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {report.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="reporting"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 border-2 border-red-500 shadow-2xl space-y-6 md:space-y-8"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-red-600 uppercase tracking-tighter">Report in Progress</h3>
                <p className="text-xs md:text-sm text-slate-500 flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5 md:w-4 h-4" /> System: Active & Recording
                </p>
              </div>
              <button 
                onClick={() => setIsReporting(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-white/50 p-4 rounded-2xl border border-slate-200">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Location Context</label>
                <div className="grid grid-cols-3 gap-2">
                  {['MOZAC 1', 'MOZAC 2', 'MOZAC 3'].map(dorm => (
                    <button
                      key={dorm}
                      onClick={() => setSelectedDorm(dorm)}
                      className={`py-2 px-3 rounded-lg text-xs font-mono transition-all border ${
                        selectedDorm === dorm 
                          ? 'bg-red-600 text-white border-red-600 shadow-lg shadow-red-100' 
                          : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      {dorm}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[9px] text-slate-400 italic flex items-center gap-1">
                  <Mic className="w-3 h-3" /> Say "{selectedDorm}" in your recording to auto-link camera.
                </p>
              </div>

              <div className="bg-slate-900 aspect-video rounded-xl md:rounded-2xl overflow-hidden relative border-2 md:border-4 border-red-500/20">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <Camera className="w-8 h-8 md:w-12 md:h-12 text-white/20 mx-auto" />
                    <span className="text-[8px] md:text-[10px] font-mono text-white/40 uppercase tracking-[0.2em]">CCTV Data Link Established</span>
                  </div>
                </div>
                <div className="absolute top-2 left-2 md:top-4 md:left-4 bg-red-600 text-white text-[8px] md:text-[10px] font-bold px-1.5 py-0.5 md:px-2 md:py-1 rounded animate-pulse">REC</div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] md:text-sm font-bold uppercase tracking-wide text-slate-700">Voice Evidence</label>
                  {voiceBlob && <span className="text-[9px] md:text-[10px] font-mono text-green-600 uppercase">Ready to send</span>}
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={toggleVoiceRecording}
                    className={`flex-1 py-3 md:py-4 px-6 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 md:gap-3 font-bold transition-all ${
                      isRecordingVoice 
                        ? 'bg-red-500 text-white animate-pulse' 
                        : voiceBlob ? 'bg-slate-100 text-slate-700 border border-slate-200' : 'bg-slate-900 text-white'
                    }`}
                  >
                    <Mic className="w-5 h-5 md:w-6 h-6" />
                    <span className="text-sm md:text-base">
                      {isRecordingVoice ? 'Stop' : voiceBlob ? 'Redo' : 'Record Voice'}
                    </span>
                  </button>
                  
                  {voiceBlob && (
                    <button 
                      onClick={submitReport}
                      disabled={isSending}
                      className={`bg-blue-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 text-sm md:text-base transition-all ${isSending ? 'opacity-50 cursor-not-allowed scale-95' : 'hover:bg-blue-700'}`}
                    >
                      {isSending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5 md:w-6 h-6" />
                          Send Report
                        </>
                      )}
                    </button>
                  )}
                </div>
                
                {voiceBlob && (
                  <div className="p-3 md:p-4 bg-slate-50 rounded-xl flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <CheckCircle2 className="text-green-500 w-4 h-4 md:w-5 md:h-5" />
                      <span className="text-[11px] md:text-sm font-medium">Capture Okay</span>
                    </div>
                    <audio src={voiceBlob} controls className="w-full h-8 max-w-[200px]" />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-blue-50 p-3 md:p-4 rounded-xl md:rounded-2xl flex gap-3 md:gap-4 items-start">
              <Info className="text-blue-600 w-5 h-5 md:w-6 md:h-6 shrink-0" />
              <p className="text-blue-900 text-[11px] md:text-sm leading-relaxed">
                Emergency reports transmit instantly. CCTV footage is automatically bundled for warden review.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
