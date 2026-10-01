import { prisma } from './prisma.js';
import { config } from './config.js';

export async function getFuelRate() {
  const row = await prisma.setting.findUnique({ where: { key: 'fuelRatePerKm' } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : config.defaultFuelRate;
}
