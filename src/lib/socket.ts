import { io } from 'socket.io-client';

// Configure socket with explicit websocket-only transport to bypass polling issues in proxies
export const socket = io({
  transports: ['websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 60000,
});

if (typeof window !== 'undefined') {
  socket.on('connect', () => {
    console.log('%c--- SYSTEM CONNECTED (WEBSOCKET) ---', 'color: green; font-weight: bold;');
  });
  socket.on('connect_error', (err) => {
    console.error('%c--- CONNECTION ERROR ---', 'color: red; font-weight: bold;', err.message);
    // If websocket fails entirely, we log it, but we stay on websocket as polling is likely blocked or broken
  });
  socket.on('disconnect', (reason) => {
    console.warn('%c--- DISCONNECTED ---', 'color: orange; font-weight: bold;', reason);
  });
}
