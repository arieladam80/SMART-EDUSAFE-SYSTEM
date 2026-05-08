import { io } from 'socket.io-client';

// Use a fallback to current origin for better compatibility in proxied environments
const socketUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

export const socket = io(socketUrl, {
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  autoConnect: true,
});
