import { io } from 'socket.io-client';

// Configure socket with explicit transports and fallback
export const socket = io({
  transports: ['polling', 'websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 60000,
});

if (typeof window !== 'undefined') {
  socket.on('connect', () => {
    console.log('%c--- SYSTEM CONNECTED ---', 'color: green; font-weight: bold;');
  });
  socket.on('connect_error', (err) => {
    console.error('%c--- CONNECTION ERROR ---', 'color: red; font-weight: bold;', err.message);
    // Force transport if it's struggling
    if (socket.io.opts.transports[0] === 'websocket') {
       socket.io.opts.transports = ['polling', 'websocket'];
    }
  });
  socket.on('disconnect', (reason) => {
    console.warn('%c--- DISCONNECTED ---', 'color: orange; font-weight: bold;', reason);
  });
}
