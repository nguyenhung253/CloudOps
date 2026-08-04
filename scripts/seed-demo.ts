/**
 * Demo Data Seed Script
 *
 * Generates 30 days of realistic historical data for CloudOps demo.
 * Run: npx ts-node scripts/seed-demo.ts
 *
 * Creates:
 *  - 30 days of metric points (CPU, Memory, Disk, Network) every 5 minutes
 *  - 150 jobs with realistic status distribution
 *  - 40 alerts triggered by metric spikes
 *  - 20 incidents from critical alerts
 *  - 200 notifications
 *  - 500 audit log entries
 */

import { PrismaClient, JobType, JobStatus, AlertSeverity, AlertStatus, IncidentSeverity, IncidentStatus, NotificationSource, NotificationReadStatus, HealthStatus, CloudProvider, AlertOperator } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/cloudops?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DAYS = 30;
const NOW = new Date();

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function hoursAgo(h: number) { return new Date(NOW.getTime() - h * 3600 * 1000); }

async function main() {
  console.log('🌱 Seeding demo data...\n');

  console.log('🧹 Cleaning previous demo data to ensure a fresh state...');
  await prisma.notification.deleteMany({});
  await prisma.incidentEvidence.deleteMany({});
  await prisma.incidentAlert.deleteMany({});
  await prisma.incidentTimeline.deleteMany({});
  await prisma.incident.deleteMany({});
  await prisma.alertEvent.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.jobExecution.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.metricPoint.deleteMany({});
  await prisma.resourceHealthSnapshot.deleteMany({});
  console.log('  ✅ Previous demo data cleaned!\n');

  // Find existing resources and accounts to attach data to
  const accounts = await prisma.cloudAccount.findMany({ where: { deletedAt: null }, take: 5 });
  const resources = await prisma.cloudResource.findMany({
    where: { isActive: true, resourceType: { in: ['EC2_INSTANCE', 'ec2:instance', 'AWS::EC2::Instance', 'ec2'] } },
    take: 10,
  });
  const users = await prisma.user.findMany({ where: { deletedAt: null }, take: 5 });

  const accountId = accounts[0]?.id || 'demo-account';
  const resourceId = resources[0]?.id || 'demo-resource';
  const userId = users[0]?.id || 'demo-user';

  console.log(`  Accounts: ${accounts.length} | Resources: ${resources.length} | Users: ${users.length}\n`);

  // ─── Metric Definitions ───
  console.log('📊 Creating metric definitions...');
  const metricDefs = await Promise.all([
    prisma.metricDefinition.upsert({
      where: { provider_resourceType_namespace_metricName: { provider: CloudProvider.AWS, resourceType: 'ec2:instance', namespace: 'AWS/EC2', metricName: 'CPUUtilization' } },
      create: { provider: CloudProvider.AWS, resourceType: 'ec2:instance', namespace: 'AWS/EC2', metricName: 'CPUUtilization', defaultStatistic: 'Average', defaultPeriodSeconds: 300, unit: 'Percent', isEnabled: true },
      update: {},
    }),
    prisma.metricDefinition.upsert({
      where: { provider_resourceType_namespace_metricName: { provider: CloudProvider.AWS, resourceType: 'ec2:instance', namespace: 'CWAgent', metricName: 'mem_used_percent' } },
      create: { provider: CloudProvider.AWS, resourceType: 'ec2:instance', namespace: 'CWAgent', metricName: 'mem_used_percent', defaultStatistic: 'Average', defaultPeriodSeconds: 300, unit: 'Percent', isEnabled: true },
      update: {},
    }),
    prisma.metricDefinition.upsert({
      where: { provider_resourceType_namespace_metricName: { provider: CloudProvider.AWS, resourceType: 'ec2:instance', namespace: 'CWAgent', metricName: 'disk_used_percent' } },
      create: { provider: CloudProvider.AWS, resourceType: 'ec2:instance', namespace: 'CWAgent', metricName: 'disk_used_percent', defaultStatistic: 'Average', defaultPeriodSeconds: 300, unit: 'Percent', isEnabled: true },
      update: {},
    }),
    prisma.metricDefinition.upsert({
      where: { provider_resourceType_namespace_metricName: { provider: CloudProvider.AWS, resourceType: 'ec2:instance', namespace: 'AWS/EC2', metricName: 'NetworkIn' } },
      create: { provider: CloudProvider.AWS, resourceType: 'ec2:instance', namespace: 'AWS/EC2', metricName: 'NetworkIn', defaultStatistic: 'Average', defaultPeriodSeconds: 300, unit: 'Bytes', isEnabled: true },
      update: {},
    }),
    prisma.metricDefinition.upsert({
      where: { provider_resourceType_namespace_metricName: { provider: CloudProvider.AWS, resourceType: 'ec2:instance', namespace: 'AWS/EC2', metricName: 'NetworkOut' } },
      create: { provider: CloudProvider.AWS, resourceType: 'ec2:instance', namespace: 'AWS/EC2', metricName: 'NetworkOut', defaultStatistic: 'Average', defaultPeriodSeconds: 300, unit: 'Bytes', isEnabled: true },
      update: {},
    }),
  ]);
  console.log(`  ${metricDefs.length} metric definitions ready\n`);

  // ─── Metric Points (30 days, every 5 min = 8640 points per metric) ───
  console.log('📈 Generating metric points...');
  const cpuDef = metricDefs[0].id;
  const memDef = metricDefs[1].id;
  const diskDef = metricDefs[2].id;
  const netInDef = metricDefs[3].id;
  const netOutDef = metricDefs[4].id;

  let pointsCreated = 0;
  const batchSize = 500;
  const resourcesToUse = resources.length > 0 ? resources : [{ id: resourceId }];

  for (const res of resourcesToUse.slice(0, 3)) {
    const seed = res.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const points: any[] = [];

    for (let d = DAYS; d >= 0; d--) {
      for (let minute = 0; minute < 1440; minute += 5) {
        const ts = new Date(NOW.getTime() - d * 86400000 - minute * 60000);
        const hourOfDay = ts.getHours();
        const dayFactor = ts.getDay() === 0 || ts.getDay() === 6 ? 0.6 : 1.0;

        // CPU: diurnal pattern (low at night, peaks during work hours) + random spikes
        const baseCpu = 15 + Math.sin((hourOfDay - 6) * Math.PI / 12) * 25 * dayFactor;
        const cpu = Math.min(99, Math.max(2, baseCpu + (Math.sin((ts.getTime() + seed) / 500000) * 15)));

        // Memory: slow upward trend + small variations
        const mem = Math.min(95, 35 + (30 - d) * 0.3 + Math.sin((ts.getTime() + seed) / 300000) * 8);

        // Disk: very slow upward trend
        const disk = Math.min(90, 25 + (30 - d) * 0.5 + Math.sin((ts.getTime() + seed) / 600000) * 3);

        // Network: bursty traffic
        const netIn = 1024 * 50 + Math.abs(Math.sin((ts.getTime() + seed) / 200000)) * 1024 * 300;
        const netOut = 1024 * 20 + Math.abs(Math.cos((ts.getTime() + seed) / 200000)) * 1024 * 150;

        points.push(
          { resourceId: res.id, metricDefinitionId: cpuDef, timestamp: ts, value: Number(cpu.toFixed(2)), unit: 'Percent', dimensionsHash: 'demo' },
          { resourceId: res.id, metricDefinitionId: memDef, timestamp: ts, value: Number(mem.toFixed(2)), unit: 'Percent', dimensionsHash: 'demo' },
          { resourceId: res.id, metricDefinitionId: diskDef, timestamp: ts, value: Number(disk.toFixed(2)), unit: 'Percent', dimensionsHash: 'demo' },
          { resourceId: res.id, metricDefinitionId: netInDef, timestamp: ts, value: Number(netIn.toFixed(0)), unit: 'Bytes', dimensionsHash: 'demo' },
          { resourceId: res.id, metricDefinitionId: netOutDef, timestamp: ts, value: Number(netOut.toFixed(0)), unit: 'Bytes', dimensionsHash: 'demo' },
        );

        if (points.length >= batchSize) {
          for (const p of points) {
            try {
              await prisma.metricPoint.create({ data: p });
              pointsCreated++;
            } catch { /* skip duplicates */ }
          }
          points.length = 0;
          process.stdout.write(`  Points: ${pointsCreated}\r`);
        }
      }
    }
    // Flush remaining
    for (const p of points) {
      try { await prisma.metricPoint.create({ data: p }); pointsCreated++; } catch { /* skip */ }
    }
  }
  console.log(`\n  ✅ ${pointsCreated} metric points created\n`);

  // ─── Health Snapshots ───
  console.log('💚 Creating health snapshots...');
  let healthCount = 0;
  for (const res of resourcesToUse.slice(0, 3)) {
    for (let d = DAYS; d >= 0; d--) {
      const ts = new Date(NOW.getTime() - d * 86400000 - rand(0, 23) * 3600000);
      const roll = Math.random();
      const status = roll < 0.85 ? HealthStatus.HEALTHY : roll < 0.95 ? HealthStatus.DEGRADED : HealthStatus.UNHEALTHY;
      await prisma.resourceHealthSnapshot.create({
        data: {
          resourceId: res.id,
          status,
          reason: status === HealthStatus.HEALTHY ? 'All metrics within normal range' : 'CPU utilization exceeded threshold',
          cpuUtilization: rand(10, 95),
          metricsSummary: {},
          evaluatedAt: ts,
        },
      });
      healthCount++;
    }
  }
  console.log(`  ✅ ${healthCount} health snapshots created\n`);

  // ─── Jobs (150) ───
  console.log('⚙️  Creating jobs...');
  const jobTypes = [JobType.RESOURCE_SYNC, JobType.HEALTH_CHECK, JobType.METRIC_COLLECTION];
  const jobStatuses = [JobStatus.SUCCEEDED, JobStatus.SUCCEEDED, JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.TIMED_OUT];
  for (let i = 0; i < 150; i++) {
    const type = pick(jobTypes);
    const status = pick(jobStatuses);
    const createdAt = hoursAgo(rand(1, 720));
    const completedAt = new Date(createdAt.getTime() + rand(5000, 300000));
    await prisma.job.create({
      data: {
        type,
        status,
        cloudAccountId: accounts.length > 0 ? pick(accounts).id : null,
        resourceId: resources.length > 0 ? pick(resources).id : null,
        requestedBy: userId,
        payload: { demo: true },
        priority: rand(0, 5),
        progress: status === JobStatus.SUCCEEDED ? 100 : rand(0, 99),
        attemptsMade: rand(1, 3),
        maxAttempts: 3,
        queuedAt: createdAt,
        startedAt: new Date(createdAt.getTime() + 1000),
        completedAt,
        createdAt,
      },
    });
  }
  console.log(`  ✅ 150 jobs created\n`);

  // ─── Alerts (40) ───
  console.log('🚨 Creating alerts...');
  let alertRule = await prisma.alertRule.findFirst();
  if (!alertRule) {
    alertRule = await prisma.alertRule.create({
      data: {
        name: 'High Resource Utilization Rule',
        cloudAccountId: accountId,
        resourceId: resourceId,
        operator: AlertOperator.GT,
        threshold: 85,
        durationSeconds: 300,
        severity: AlertSeverity.CRITICAL,
        cooldownSeconds: 3600,
        createdBy: userId,
      },
    });
  }
  const alertRuleId = alertRule.id;
  const alertIds: string[] = [];
  const severities = [AlertSeverity.CRITICAL, AlertSeverity.WARNING, AlertSeverity.WARNING, AlertSeverity.INFO, AlertSeverity.INFO];
  const alertStatuses = [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.RESOLVED, AlertStatus.RESOLVED];
  for (let i = 0; i < 40; i++) {
    const severity = pick(severities);
    const status = pick(alertStatuses);
    const triggered = hoursAgo(rand(1, 720));
    const alert = await prisma.alert.create({
      data: {
        alertRuleId,
        resourceId: resources.length > 0 ? pick(resources).id : null,
        status,
        severity,
        fingerprint: `demo-fp-${i}-${Date.now()}`,
        title: severity === AlertSeverity.CRITICAL ? 'CPU utilization exceeded critical threshold' : severity === AlertSeverity.WARNING ? 'Memory usage warning' : 'Disk usage approaching limit',
        message: severity === AlertSeverity.CRITICAL ? `CPU reached ${rand(90, 99)}% on instance` : `Metric value: ${rand(80, 95)}%`,
        observedValue: rand(80, 99),
        thresholdValue: severity === AlertSeverity.CRITICAL ? 90 : 85,
        firstTriggeredAt: triggered,
        lastTriggeredAt: status === AlertStatus.OPEN ? new Date() : hoursAgo(rand(0, 24)),
        acknowledgedAt: status !== AlertStatus.OPEN ? hoursAgo(rand(0, 48)) : null,
        acknowledgedBy: status !== AlertStatus.OPEN ? userId : null,
        resolvedAt: status === AlertStatus.RESOLVED ? hoursAgo(rand(0, 24)) : null,
        resolvedBy: status === AlertStatus.RESOLVED ? userId : null,
      },
    });
    alertIds.push(alert.id);
  }
  console.log(`  ✅ 40 alerts created\n`);

  // ─── Incidents (20) ───
  console.log('🔴 Creating incidents...');
  const incidentIds: string[] = [];
  for (let i = 0; i < 20; i++) {
    const severity = pick([IncidentSeverity.SEV1, IncidentSeverity.SEV2, IncidentSeverity.SEV3, IncidentSeverity.SEV4]);
    const status = pick([IncidentStatus.OPEN, IncidentStatus.INVESTIGATING, IncidentStatus.RESOLVED, IncidentStatus.CLOSED]);
    const opened = hoursAgo(rand(1, 720));
    const incident = await prisma.incident.create({
      data: {
        title: severity === IncidentSeverity.SEV1 ? 'Critical CPU spike on production instance' : severity === IncidentSeverity.SEV2 ? 'Memory usage degradation' : 'Disk usage warning',
        description: 'Automated incident created from alert rule evaluation',
        status,
        severity,
        primaryResourceId: resources.length > 0 ? pick(resources).id : null,
        createdBy: userId,
        createdByType: 'SYSTEM',
        dedupKey: `demo-incident-${i}-${Date.now()}`,
        openedAt: opened,
        resolvedAt: status === IncidentStatus.RESOLVED || status === IncidentStatus.CLOSED ? hoursAgo(rand(0, 48)) : null,
        closedAt: status === IncidentStatus.CLOSED ? hoursAgo(rand(0, 24)) : null,
        occurrenceCount: rand(1, 5),
      },
    });
    incidentIds.push(incident.id);
  }
  console.log(`  ✅ 20 incidents created\n`);

  // ─── Notifications (200) ───
  console.log('🔔 Creating notifications...');
  const notifSources = [NotificationSource.INCIDENT, NotificationSource.MONITORING, NotificationSource.JOB, NotificationSource.SYSTEM];
  const notifTypes = ['INCIDENT_CREATED', 'INCIDENT_RESOLVED', 'ALERT_TRIGGERED', 'JOB_FAILED', 'JOB_RETRY', 'CLOUD_SYNC_COMPLETED'];
  for (let i = 0; i < 200; i++) {
    await prisma.notification.create({
      data: {
        type: pick(notifTypes),
        source: pick(notifSources),
        severity: pick([AlertSeverity.CRITICAL, AlertSeverity.WARNING, AlertSeverity.INFO, AlertSeverity.INFO]),
        title: pick(['CPU Alert', 'Memory Warning', 'Disk Warning', 'Job Failed', 'Sync Completed', 'Incident Created']),
        message: pick(['Metric exceeded threshold', 'Automated notification from monitoring system', 'Resource sync completed successfully', 'Job execution failed after 3 attempts']),
        resourceId: resources.length > 0 ? pick(resources).id : null,
        incidentId: incidentIds.length > 0 ? pick(incidentIds) : null,
        readStatus: pick([NotificationReadStatus.UNREAD, NotificationReadStatus.READ, NotificationReadStatus.READ]),
        createdAt: hoursAgo(rand(0, 720)),
      },
    });
  }
  console.log(`  ✅ 200 notifications created\n`);

  // ─── Audit Logs (500) ───
  console.log('📝 Creating audit logs...');
  const actions = [
    'AUTH_LOGIN', 'AUTH_LOGOUT', 'CLOUD_ACCOUNT_CREATED', 'CLOUD_ACCOUNT_UPDATED',
    'INCIDENT_CREATED', 'INCIDENT_STATUS_UPDATED', 'ALERT_ACKNOWLEDGED', 'ALERT_RESOLVED',
    'ALERT_RULE_UPDATED', 'RESOURCE_SYNC_COMPLETED', 'USER_STATUS_UPDATED', 'USER_ROLE_UPDATED',
  ];
  for (let i = 0; i < 500; i++) {
    const action = pick(actions);
    await prisma.auditLog.create({
      data: {
        actorUserId: pick([userId, null, null]),
        action,
        targetType: action.includes('CLOUD') ? 'cloud_account' : action.includes('INCIDENT') ? 'incident' : action.includes('ALERT') ? 'alert' : action.includes('AUTH') ? 'user' : 'system',
        targetId: null,
        metadata: { demo: true, timestamp: new Date().toISOString() },
        ipAddress: pick(['192.168.1.42', '10.0.1.15', '172.16.0.8', null]),
        createdAt: hoursAgo(rand(0, 720)),
      },
    });
  }
  console.log(`  ✅ 500 audit logs created\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Demo data seeded successfully!');
  console.log(`   ${pointsCreated} metric points (30 days)`);
  console.log('   150 jobs');
  console.log('   40 alerts');
  console.log('   20 incidents');
  console.log('   200 notifications');
  console.log('   500 audit logs');
  console.log('   ' + healthCount + ' health snapshots');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());