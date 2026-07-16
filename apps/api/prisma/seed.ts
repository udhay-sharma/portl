import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../src/lib/prisma.js';

// ---------------------------------------------------------------------------
// Deterministic IDs for Idempotency
// Using fixed UUIDs guarantees that re-running `npx prisma db seed` multiple
// times will update existing rows rather than creating duplicates.
// ---------------------------------------------------------------------------
const SOCIETY_ID = 'a0000000-0000-0000-0000-000000000001';
const TOWER_ID   = 'b0000000-0000-0000-0000-000000000001';
const FLAT_ID    = 'c0000000-0000-0000-0000-000000000001';
const GATE_ID    = 'd0000000-0000-0000-0000-000000000001';

const KNOWN_PASSWORD = 'password123';
const BCRYPT_SALT_ROUNDS = 12;

async function main() {
  console.log('🌱 Starting Portl database seed...');

  // 1. Society
  const society = await prisma.society.upsert({
    where: { id: SOCIETY_ID },
    update: {
      name: 'Portl Seed Society',
      address: '100 Innovation Way, Tech City',
    },
    create: {
      id: SOCIETY_ID,
      name: 'Portl Seed Society',
      address: '100 Innovation Way, Tech City',
    },
  });
  console.log(`  ✅ Society: ${society.name} (${society.id})`);

  // 2. Tower
  const tower = await prisma.tower.upsert({
    where: { id: TOWER_ID },
    update: {
      name: 'Tower Alpha',
      societyId: SOCIETY_ID,
    },
    create: {
      id: TOWER_ID,
      name: 'Tower Alpha',
      societyId: SOCIETY_ID,
    },
  });
  console.log(`  ✅ Tower: ${tower.name} (${tower.id})`);

  // 3. Flat
  const flat = await prisma.flat.upsert({
    where: { id: FLAT_ID },
    update: {
      number: '101',
      floor: 1,
      towerId: TOWER_ID,
    },
    create: {
      id: FLAT_ID,
      number: '101',
      floor: 1,
      towerId: TOWER_ID,
    },
  });
  console.log(`  ✅ Flat: ${flat.number} (${flat.id})`);

  // 4. Gate
  const gate = await prisma.gate.upsert({
    where: { id: GATE_ID },
    update: {
      name: 'Main Gate',
      societyId: SOCIETY_ID,
    },
    create: {
      id: GATE_ID,
      name: 'Main Gate',
      societyId: SOCIETY_ID,
    },
  });
  console.log(`  ✅ Gate: ${gate.name} (${gate.id})`);

  // 5. Hash known password once
  const passwordHash = await bcrypt.hash(KNOWN_PASSWORD, BCRYPT_SALT_ROUNDS);

  // 6. Seed Users directly via Prisma (Guard and Admin do NOT go through HTTP register)
  const residentUser = await prisma.user.upsert({
    where: { email: 'resident@portl.dev' },
    update: {
      name: 'Alice Resident',
      phone: '9876543210',
      passwordHash,
      role: 'RESIDENT',
      societyId: SOCIETY_ID,
      flatId: FLAT_ID,
      gateId: null,
    },
    create: {
      name: 'Alice Resident',
      email: 'resident@portl.dev',
      phone: '9876543210',
      passwordHash,
      role: 'RESIDENT',
      societyId: SOCIETY_ID,
      flatId: FLAT_ID,
      gateId: null,
    },
  });
  console.log(`  ✅ User [RESIDENT]: ${residentUser.email} (flatId: ${residentUser.flatId})`);

  const guardUser = await prisma.user.upsert({
    where: { email: 'guard@portl.dev' },
    update: {
      name: 'Bob Guard',
      phone: '9876543211',
      passwordHash,
      role: 'GUARD',
      societyId: SOCIETY_ID,
      flatId: null,
      gateId: GATE_ID,
    },
    create: {
      name: 'Bob Guard',
      email: 'guard@portl.dev',
      phone: '9876543211',
      passwordHash,
      role: 'GUARD',
      societyId: SOCIETY_ID,
      flatId: null,
      gateId: GATE_ID,
    },
  });
  console.log(`  ✅ User [GUARD]:    ${guardUser.email} (flatId: ${guardUser.flatId}, gateId: ${guardUser.gateId})`);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@portl.dev' },
    update: {
      name: 'Carol Admin',
      phone: '9876543212',
      passwordHash,
      role: 'ADMIN',
      societyId: SOCIETY_ID,
      flatId: null,
      gateId: null,
    },
    create: {
      name: 'Carol Admin',
      email: 'admin@portl.dev',
      phone: '9876543212',
      passwordHash,
      role: 'ADMIN',
      societyId: SOCIETY_ID,
      flatId: null,
      gateId: null,
    },
  });
  console.log(`  ✅ User [ADMIN]:    ${adminUser.email} (flatId: ${adminUser.flatId}, gateId: ${adminUser.gateId})`);

  console.log('\n✨ Database seeding completed successfully.');
  console.log(`🔑 All seeded users can log in with password: "${KNOWN_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
