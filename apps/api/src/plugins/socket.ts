import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Server, type ServerOptions } from 'socket.io';

// Decorate fastify with fastify.io so route handlers can broadcast events: fastify.io.to(...).emit(...)
declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

const socketPlugin: FastifyPluginAsync<Partial<ServerOptions>> = async (fastify, options) => {
  // Attach Socket.IO to the underlying Fastify HTTP/HTTPS server
  const io = new Server(fastify.server, {
    cors: { origin: '*' },
    ...options,
  });

  fastify.decorate('io', io);

  fastify.addHook('onClose', (_instance, done) => {
    io.close();
    done();
  });

  io.on('connection', (socket) => {
    fastify.log.info({ socketId: socket.id }, 'Socket connected');

    // Step 2.5: Provide a way for a client to join a specific flat's room.
    // Client emits 'join' with flatId payload to join flat:{flatId} room.
    // Note (Rule 4 gap): No auth is enforced yet when joining rooms at this step.
    socket.on('join', (flatId: unknown) => {
      if (typeof flatId === 'string' && flatId.trim() !== '') {
        const room = `flat:${flatId.trim()}`;
        socket.join(room);
        fastify.log.info({ socketId: socket.id, room }, 'Socket joined room');
      }
    });

    socket.on('disconnect', () => {
      fastify.log.info({ socketId: socket.id }, 'Socket disconnected');
    });
  });
};

export default fp(socketPlugin, { name: 'socket-plugin' });
