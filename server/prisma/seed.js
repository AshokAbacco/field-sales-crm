import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const tz = process.env.APP_TIMEZONE || "Asia/Kolkata";
const localDate = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

/**
 * Default categories & products. The `catalog_plans` migration inserts the same rows, but
 * `prisma db push` does not run migration SQL – so the seed makes sure they exist either way.
 * Upserts by name, so items already created/renamed in Settings are left untouched.
 */
const DEFAULT_PRODUCTS = [
  [
    "prod_motor_desk",
    "Motor Desk",
    "Car & bike garages, wash centers – job cards, spares, SMS alerts",
  ],
  [
    "prod_restopos",
    "RestoPOS",
    "Restaurants, cafes & cloud kitchens – tables, KOT, split billing",
  ],
  [
    "prod_superbill",
    "SuperBill",
    "Grocery & supermarkets – barcode, weigh scales, GST",
  ],
];
const DEFAULT_CATEGORIES = [
  ["cat_car_garage", "Car Garage", "Motor Desk"],
  ["cat_bike_garage", "Bike Garage", "Motor Desk"],
  ["cat_wash_center", "Wash Center", "Motor Desk"],
  ["cat_restaurant", "Restaurant / Cafe", "RestoPOS"],
  ["cat_grocery", "Grocery / Supermarket", "SuperBill"],
  ["cat_other", "Other", null],
];

async function ensureCatalog() {
  if ((await prisma.product.count()) === 0) {
    for (const [i, [id, name, description]] of DEFAULT_PRODUCTS.entries()) {
      await prisma.product.upsert({
        where: { name },
        update: {},
        create: { id, name, description, sortOrder: i + 1 },
      });
    }
  }
  const products = Object.fromEntries(
    (await prisma.product.findMany()).map((p) => [p.name, p.id]),
  );
  if ((await prisma.category.count()) === 0) {
    for (const [i, [id, name, productName]] of DEFAULT_CATEGORIES.entries()) {
      await prisma.category.upsert({
        where: { name },
        update: {},
        create: {
          id,
          name,
          sortOrder: i + 1,
          defaultProductId: productName ? products[productName] || null : null,
        },
      });
    }
  }
  const categories = Object.fromEntries(
    (await prisma.category.findMany()).map((c) => [c.name, c.id]),
  );
  console.log(
    `Catalog ready: ${Object.keys(categories).length} categories, ${Object.keys(products).length} products`,
  );
  return { products, categories };
}

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
  const catalog = await ensureCatalog();

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

  // Sample plans for the default products
  const plans = {};
  const pid = (name) => catalog.products[name] || null;
  const cid = (name) =>
    catalog.categories[name] ||
    catalog.categories.Other ||
    Object.values(catalog.categories)[0];
  for (const [productName, name, price, billingCycle] of [
    ["Motor Desk", "Garage Starter", 999, "MONTHLY"],
    ["Motor Desk", "Garage Pro", 9999, "YEARLY"],
    ["RestoPOS", "Resto Basic", 1499, "MONTHLY"],
    ["RestoPOS", "Resto Annual", 14999, "YEARLY"],
    ["SuperBill", "SuperBill Store", 11999, "YEARLY"],
  ]) {
    const productId = pid(productName);
    if (!productId) continue;
    const plan = await prisma.plan.upsert({
      where: { name_productId: { name, productId } },
      update: {},
      create: { name, productId, price, billingCycle },
    });
    plans[productId] ||= plan;
  }
  // Sample incentive rules (edit or remove them in Incentives → Rules)
  if ((await prisma.incentiveRule.count()) === 0) {
    const garagePro =
      Object.values(plans).find((p) => p.name === "Garage Starter") || null;
    await prisma.incentiveRule.createMany({
      data: [
        {
          name: "₹100 per deal",
          description: "Every closed deal earns ₹100",
          appliesTo: "FIELD_VISITOR",
          type: "PER_DEAL",
          rate: 100,
          sortOrder: 1,
        },
        {
          name: "10 deals bonus",
          description: "₹1,000 for every 10 deals in a month",
          appliesTo: "FIELD_VISITOR",
          type: "PER_DEAL_COUNT",
          rate: 1000,
          every: 10,
          sortOrder: 2,
        },
        {
          name: "₹100 per ₹1,000 sold",
          description: "Slab on plan amount",
          appliesTo: "FIELD_VISITOR",
          type: "PER_AMOUNT_SLAB",
          rate: 100,
          every: 1000,
          isActive: false,
          sortOrder: 3,
        },
        ...(garagePro
          ? [
              {
                name: "Garage Starter push",
                appliesTo: "FIELD_VISITOR",
                type: "PER_DEAL",
                rate: 50,
                planId: garagePro.id,
                sortOrder: 4,
              },
            ]
          : []),
        {
          name: "Manager: 2% of team sales",
          appliesTo: "MANAGER",
          type: "PERCENT_OF_AMOUNT",
          rate: 2,
          sortOrder: 5,
        },
        {
          name: "Manager: team target bonus",
          appliesTo: "MANAGER",
          type: "DEAL_TARGET_BONUS",
          rate: 3000,
          every: 8,
          sortOrder: 6,
        },
      ],
    });
  }
  const businesses = [
    ["Speed Auto Garage", "Car Garage", "Motor Desk"],
    ["Shine Car Wash", "Wash Center", "Motor Desk"],
    ["Biryani House", "Restaurant / Cafe", "RestoPOS"],
    ["Fresh Mart", "Grocery / Supermarket", "SuperBill"],
    ["Royal Bike Care", "Bike Garage", "Motor Desk"],
    ["Cafe Mocha", "Restaurant / Cafe", "RestoPOS"],
  ].map(([name, category, product]) => [
    name,
    cid(category),
    pid(product),
    product,
  ]);
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
        const [name, categoryId, productId, product] =
          businesses[(day + ri + k) % businesses.length];
        const plan = plans[productId];
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
            categoryId,
            productId,
            product,
            status,
            phone: `9000${day}${ri}${k}1234`,
            contactPerson: "Owner",
            address: "Koramangala, Bengaluru",
            lat,
            lng,
            visitedAt,
            odometerKm: startKm + (k + 1) * 6,
            ...(status === "DEAL_DONE" && { dealClosedAt: visitedAt }),
            ...(status === "DEAL_DONE" && !plan && { dealValue: 15000 }),
            ...(status === "DEAL_DONE" &&
              plan && {
                planId: plan.id,
                planName: plan.name,
                billingCycle: plan.billingCycle,
                dealValue: plan.price,
                nextPaymentDate: new Date(Date.now() + (k * 3 - 2) * 86400000),
              }),
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
