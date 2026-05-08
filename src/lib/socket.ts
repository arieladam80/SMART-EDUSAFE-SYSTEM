import { io } from 'socket.io-client';

// Use standard auto-discovery for Socket.io
export const socket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

if (typeof window !== 'undefined') {
  socket.on('connect', () => console.log('--- SYSTEM CONNECTED ---'));
  socket.on('connect_error', (err) => console.error('--- CONNECTION ERROR ---', err.message));
  socket.on('disconnect', (reason) => console.warn('--- DISCONNECTED ---', reason));
}
