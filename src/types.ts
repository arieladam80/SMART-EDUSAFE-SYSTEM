export type UserRole = 'student' | 'warden' | 'superadmin';

export interface User {
  id: string;
  role: UserRole;
  name: string;
}

export interface Report {
  id: string;
  reporterId: string;
  timestamp: number;
  voiceUrl?: string; // Data URL or Blob URL
  videoUrl?: string; // Simulated CCTV clip
  status: 'pending' | 'reviewed';
  dorm?: string;
  description?: string;
}

export interface AppState {
  currentUser: User | null;
  reports: Report[];
  isCctvGlobalActive: boolean;
}
