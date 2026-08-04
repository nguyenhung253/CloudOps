import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/cloudops?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // Ensure lowercase email index
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS users_lower_email_idx ON users (lower(email));'
  );
  console.log('Unique index on lower(email) created successfully.');

  // Create default workspace if not exists
  const existingWorkspace = await prisma.workspace.findUnique({
    where: { slug: 'default' },
  });

  if (!existingWorkspace) {
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Default Workspace',
        slug: 'default',
        description: 'Default workspace created during seed',
        timezone: 'Asia/Ho_Chi_Minh',
        icon: 'cloud',
        color: '#c23910',
      },
    });
    console.log(`Default workspace created: ${workspace.id} (slug: ${workspace.slug})`);

    // Assign existing active admins as workspace owners
    const admins = await prisma.user.findMany({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    for (const admin of admins) {
      await prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: workspace.id,
            userId: admin.id,
          },
        },
        create: {
          workspaceId: workspace.id,
          userId: admin.id,
          role: 'ADMIN',
          isOwner: true,
        },
        update: {
          role: 'ADMIN',
          isOwner: true,
        },
      });
      console.log(`Admin ${admin.email} added as workspace owner`);
    }

    if (admins.length === 0) {
      console.log('No admin users found yet — workspace members will be assigned on first admin registration.');
    }
  } else {
    console.log(`Default workspace already exists: ${existingWorkspace.id}`);
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
