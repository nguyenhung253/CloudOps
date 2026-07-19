import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS users_lower_email_idx ON users (lower(email));');
  console.log('Unique index on lower(email) created successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
