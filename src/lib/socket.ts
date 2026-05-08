import { io } from 'socket.io-client';

// In multi-device apps, the socket should be shared
export const socket = io();
