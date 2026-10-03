import { prisma } from './prisma.js';
import { config } from './config.js';

export async function getFuelRate() {
  const row = await prisma.setting.findUnique({ where: { key: 'fuelRatePerKm' } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : config.defaultFuelRate;
}

/** Odometer photo at punch-in / punch-out – required unless Admin turns it off (default: required) */
export async function getRequireOdometerPhoto() {
  const row = await prisma.setting.findUnique({ where: { key: 'requireOdometerPhoto' } });
  return row ? row.value === 'true' : true;
}
