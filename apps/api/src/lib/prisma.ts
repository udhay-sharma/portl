import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

// Prisma 7 new generator uses driver adapters instead of the built-in engine.
// DATABASE_URL is read from the environment (set via dotenv in index.ts).
const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] ?? '' });

// Singleton — one Prisma client instance for the whole API process.
// Prevents connection pool exhaustion during development hot-reloads.
const prisma = new PrismaClient({ adapter });

export default prisma;
