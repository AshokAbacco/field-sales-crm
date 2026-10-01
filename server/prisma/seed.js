import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const tz = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const localDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@gmail.com').toLowerCase();
  const adminPass = process.env.SEED_ADMIN_PASSWORD || '12345678';

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { name: 'System Admin', email: adminEmail, role: 'ADMIN', passwordHash: await bcrypt.hash(adminPass, 10) },
  });
  await prisma.setting.upsert({ where: { key: 'fuelRatePerKm' }, update: {}, create: { key: 'fuelRatePerKm', value: process.env.DEFAULT_FUEL_RATE || '4.5' } });
  console.log(`Admin ready: ${adminEmail} / ${adminPass}`);

  if (process.env.SEED_DEMO_DATA !== 'true') return;
  if (await prisma.user.count({ where: { role: 'FIELD_VISITOR' } })) {
    console.log('Demo data already present, skipping.');
    return;
  }

  const zone = await prisma.zone.create({ data: { name: 'North Auto Hub', state: 'Karnataka', district: 'Bengaluru Urban', focusSegment: 'Garages & Bike Detailing Hub' } });
  const team = await prisma.team.create({ data: { name: 'Bengaluru North', zoneId: zone.id, visitsTarget: 120, dealsTarget: 20, revenueTarget: 300000 } });
  const pass = await bcrypt.hash('Field@12345', 10);
  const reps = await Promise.all(
    [
      ['Amit Verma', 'amit@company.com', 'Honda Shine', 55],
      ['Priya Nair', 'priya@company.com', 'TVS Jupiter', 50],
      ['Rohit Kumar', 'rohit@company.com', 'Bajaj Pulsar 150', 45],
    ].map(([name, email, bikeName, bikeMileage], i) =>
      prisma.user.create({
        data: {
          name, email, bikeName, bikeMileage, passwordHash: pass, role: 'FIELD_VISITOR', teamId: team.id, zoneId: zone.id,
          state: 'Karnataka', district: 'Bengaluru Urban', phone: `98450000${10 + i}`, employeeCode: `FV-00${i + 1}`,
        },
      }),
    ),
  );

  const businesses = [
    ['Speed Auto Garage', 'CAR_GARAGE', 'Motor Desk'],
    ['Shine Car Wash', 'WASH_CENTER', 'Motor Desk'],
    ['Biryani House', 'RESTAURANT', 'RestoPOS'],
    ['Fresh Mart', 'GROCERY', 'SuperBill'],
    ['Royal Bike Care', 'BIKE_GARAGE', 'Motor Desk'],
    ['Cafe Mocha', 'RESTAURANT', 'RestoPOS'],
  ];
  const statuses = ['OPEN', 'FOLLOW_UP', 'DEAL_DONE', 'LEAVE_OUT'];
  const base = { lat: 13.0358, lng: 77.597 };

  for (let day = 6; day >= 1; day--) {
    for (const [ri, rep] of reps.entries()) {
      const start = new Date(Date.now() - day * 86400000);
      start.setUTCHours(3, 30 + ri * 10, 0, 0);
      const startKm = 12000 + ri * 5000 + (6 - day) * 40;
      const dist = 25 + ((day * 7 + ri * 3) % 20);
      const shift = await prisma.shift.create({
        data: {
          userId: rep.id, date: localDate(start), status: 'COMPLETED', startTime: start, startKm, startLat: base.lat + ri * 0.01, startLng: base.lng,
          startAddress: 'Office, Hebbal', endTime: new Date(start.getTime() + 9 * 3600000), endKm: startKm + dist,
          endLat: base.lat + ri * 0.01, endLng: base.lng + 0.01, endAddress: 'Office, Hebbal', distanceKm: dist, fuelRate: 4.5, allowance: dist * 4.5,
        },
      });
      const pings = [];
      for (let k = 0; k < 3; k++) {
        const [name, category, product] = businesses[(day + ri + k) % businesses.length];
        const status = statuses[(day + ri + k) % 4];
        const lat = base.lat + ri * 0.01 + (k + 1) * 0.008;
        const lng = base.lng + (k + 1) * 0.006 * (k % 2 ? -1 : 1);
        const visitedAt = new Date(start.getTime() + (k + 1) * 2 * 3600000);
        pings.push({ userId: rep.id, shiftId: shift.id, lat, lng, recordedAt: visitedAt });
        await prisma.visit.create({
          data: {
            userId: rep.id, shiftId: shift.id, companyName: `${name} ${day}${ri}`, category, product, status, phone: `9000${day}${ri}${k}1234`,
            contactPerson: 'Owner', address: 'Hebbal, Bengaluru', lat, lng, visitedAt, odometerKm: startKm + (k + 1) * 6,
            dealValue: status === 'DEAL_DONE' ? 15000 : null,
            nextFollowUp: status === 'FOLLOW_UP' ? new Date(Date.now() + (k - 1) * 86400000) : null,
            notes: 'Demo walkthrough done',
          },
        });
      }
      await prisma.locationPing.createMany({ data: pings });
    }
  }
  console.log('Demo data seeded. Field visitor logins: amit@company.com / priya@company.com / rohit@company.com — password Field@12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
