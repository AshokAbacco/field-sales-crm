import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const tz = process.env.APP_TIMEZONE || "Asia/Kolkata";
const localDate = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

async function main() {
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL || "admin@company.com"
  ).toLowerCase();
  const adminPass = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "System Admin",
      email: adminEmail,
      role: "ADMIN",
      passwordHash: await bcrypt.hash(adminPass, 10),
    },
  });
  await prisma.setting.upsert({
    where: { key: "fuelRatePerKm" },
    update: {},
    create: {
      key: "fuelRatePerKm",
      value: process.env.DEFAULT_FUEL_RATE || "4.5",
    },
  });
  console.log(`Admin ready: ${adminEmail} / ${adminPass}`);

  if (process.env.SEED_DEMO_DATA !== "true") return;
  if (
    await prisma.user.count({
      where: { role: { in: ["FIELD_VISITOR", "MANAGER"] } },
    })
  ) {
    console.log("Demo data already present, skipping.");
    return;
  }

  const [z1, z2] = await Promise.all([
    prisma.zone.create({
      data: {
        name: "North Auto Hub",
        state: "Karnataka",
        district: "Bengaluru Urban",
        focusSegment: "Garages & Bike Detailing Hub",
      },
    }),
    prisma.zone.create({
      data: {
        name: "Central Retail & Dining",
        state: "Karnataka",
        district: "Bengaluru Urban",
        focusSegment: "Restaurants & Cloud Kitchens",
      },
    }),
    prisma.zone.create({
      data: {
        name: "South Combined Zone",
        state: "Karnataka",
        district: "Bengaluru Rural",
        focusSegment: "Multi-Segment Commercial",
      },
    }),
  ]);

  const mgrPass = await bcrypt.hash("Manager@12345", 10);
  const [m1, m2] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Rajesh Sharma",
        email: "rajesh@company.com",
        role: "MANAGER",
        passwordHash: mgrPass,
        phone: "9811122334",
        state: "Karnataka",
        district: "Bengaluru Urban",
        zoneId: z1.id,
      },
    }),
    prisma.user.create({
      data: {
        name: "Neha Kapoor",
        email: "neha@company.com",
        role: "MANAGER",
        passwordHash: mgrPass,
        phone: "9822233445",
        state: "Karnataka",
        district: "Bengaluru Urban",
        zoneId: z2.id,
      },
    }),
  ]);
  await prisma.team.create({
    data: {
      name: "Alpha Auto Warriors",
      managerId: m1.id,
      zoneId: z1.id,
      visitsTarget: 60,
      dealsTarget: 8,
      revenueTarget: 120000,
    },
  });
  await prisma.team.create({
    data: {
      name: "Retail & Dine Express",
      managerId: m2.id,
      zoneId: z2.id,
      visitsTarget: 50,
      dealsTarget: 6,
      revenueTarget: 90000,
    },
  });

  const pass = await bcrypt.hash("Field@12345", 10);
  const reps = [];
  for (const [i, [name, email, bikeName, bikeMileage, mgr, zone]] of [
    ["Amit Verma", "amit@company.com", "Hero Splendor Plus", 62, m1, z1],
    ["Priya Sen", "priya@company.com", "Honda Activa 6G", 50, m1, z1],
    ["Rahul Roy", "rahul@company.com", "Bajaj Pulsar 150", 45, m2, z2],
    ["Sneha Iyer", "sneha@company.com", "TVS Jupiter", 52, m2, z2],
  ].entries()) {
    reps.push(
      await prisma.user.create({
        data: {
          name,
          email,
          bikeName,
          bikeMileage,
          passwordHash: pass,
          role: "FIELD_VISITOR",
          managerId: mgr.id,
          zoneId: zone.id,
          state: "Karnataka",
          district: "Bengaluru Urban",
          phone: `98765000${10 + i}`,
          employeeCode: `FE-00${i + 1}`,
        },
      }),
    );
  }

  const businesses = [
    ["Speed Auto Garage", "CAR_GARAGE", "Motor Desk"],
    ["Shine Car Wash", "WASH_CENTER", "Motor Desk"],
    ["Biryani House", "RESTAURANT", "RestoPOS"],
    ["Fresh Mart", "GROCERY", "SuperBill"],
    ["Royal Bike Care", "BIKE_GARAGE", "Motor Desk"],
    ["Cafe Mocha", "RESTAURANT", "RestoPOS"],
  ];
  const statuses = ["OPEN", "FOLLOW_UP", "DEAL_DONE", "LEAVE_OUT"];
  const base = { lat: 12.9279, lng: 77.6271 };

  for (let day = 6; day >= 1; day--) {
    for (const [ri, rep] of reps.entries()) {
      const start = new Date(Date.now() - day * 86400000);
      start.setUTCHours(3, 30 + ri * 10, 0, 0);
      const startKm = 12000 + ri * 5000 + (6 - day) * 40;
      const dist = 25 + ((day * 7 + ri * 3) % 20);
      const shift = await prisma.shift.create({
        data: {
          userId: rep.id,
          date: localDate(start),
          status: "COMPLETED",
          startTime: start,
          startKm,
          startLat: base.lat + ri * 0.012,
          startLng: base.lng,
          startAddress: "Office check-in",
          endTime: new Date(start.getTime() + 9 * 3600000),
          endKm: startKm + dist,
          endLat: base.lat + ri * 0.012,
          endLng: base.lng + 0.01,
          endAddress: "Office check-out",
          distanceKm: dist,
          fuelRate: 4.5,
          allowance: dist * 4.5,
        },
      });
      const pings = [];
      for (let k = 0; k < 3; k++) {
        const [name, category, product] =
          businesses[(day + ri + k) % businesses.length];
        const status = statuses[(day + ri + k) % 4];
        const lat = base.lat + ri * 0.012 + (k + 1) * 0.008;
        const lng = base.lng + (k + 1) * 0.006 * (k % 2 ? -1 : 1);
        const visitedAt = new Date(start.getTime() + (k + 1) * 2 * 3600000);
        pings.push({
          userId: rep.id,
          shiftId: shift.id,
          lat,
          lng,
          recordedAt: visitedAt,
        });
        await prisma.visit.create({
          data: {
            userId: rep.id,
            shiftId: shift.id,
            companyName: `${name} ${day}${ri}`,
            category,
            product,
            status,
            phone: `9000${day}${ri}${k}1234`,
            contactPerson: "Owner",
            address: "Koramangala, Bengaluru",
            lat,
            lng,
            visitedAt,
            odometerKm: startKm + (k + 1) * 6,
            dealValue: status === "DEAL_DONE" ? 15000 : null,
            nextFollowUp:
              status === "FOLLOW_UP"
                ? new Date(Date.now() + (k - 1) * 86400000)
                : null,
            notes: "Demo walkthrough done",
          },
        });
      }
      await prisma.locationPing.createMany({ data: pings });
    }
  }
  console.log("Demo data seeded.");
  console.log(
    "  Managers:  rajesh@company.com / neha@company.com  — Manager@12345",
  );
  console.log(
    "  Employees: amit@ / priya@ / rahul@ / sneha@company.com — Field@12345",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
