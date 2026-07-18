import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, type VisitorRequest } from './api';

let socket: Socket | null = null;

export function connectSocket(
  flatId: string,
  onNewVisitor?: (visitor: VisitorRequest) => void,
  onDecidedVisitor?: (visitor: VisitorRequest) => void
): () => void {
  if (socket) {
    socket.disconnect();
  }

  socket = io(API_BASE_URL, {
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    // Step 2.5: join flat:{flatId} room
    socket?.emit('join', `flat:${flatId}`);
  });

  if (onNewVisitor) {
    socket.on('visitor:new', (data: VisitorRequest) => {
      onNewVisitor(data);
    });
  }

  if (onDecidedVisitor) {
    socket.on('visitor:decided', (data: VisitorRequest) => {
      onDecidedVisitor(data);
    });
  }

  return () => {
    if (socket) {
      socket.off('visitor:new');
      socket.off('visitor:decided');
      socket.disconnect();
      socket = null;
    }
  };
}
