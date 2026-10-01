export const CATEGORIES = [
  { value: 'CAR_GARAGE', label: 'Car Garage', product: 'Motor Desk' },
  { value: 'BIKE_GARAGE', label: 'Bike Garage', product: 'Motor Desk' },
  { value: 'WASH_CENTER', label: 'Wash Center', product: 'Motor Desk' },
  { value: 'RESTAURANT', label: 'Restaurant / Cafe', product: 'RestoPOS' },
  { value: 'GROCERY', label: 'Grocery / Supermarket', product: 'SuperBill' },
  { value: 'OTHER', label: 'Other', product: 'Motor Desk' },
];

export const PRODUCTS = [
  { value: 'Motor Desk', desc: 'Car & bike garages, wash centers – job cards, spares, SMS alerts' },
  { value: 'RestoPOS', desc: 'Restaurants, cafes & cloud kitchens – tables, KOT, split billing' },
  { value: 'SuperBill', desc: 'Grocery & supermarkets – barcode, weigh scales, GST' },
];

export const STATUSES = [
  { value: 'OPEN', label: 'Open', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  { value: 'FOLLOW_UP', label: 'Follow-Up', cls: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  { value: 'DEAL_DONE', label: 'Deal Done', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  { value: 'LEAVE_OUT', label: 'Leave Out', cls: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
];
export const statusMeta = (v) => STATUSES.find((s) => s.value === v) || STATUSES[0];
export const categoryLabel = (v) => CATEGORIES.find((c) => c.value === v)?.label || v;

export const STATES = ['Karnataka', 'Maharashtra', 'Tamil Nadu', 'Telangana', 'Kerala', 'Andhra Pradesh', 'Delhi NCR', 'Gujarat', 'Uttar Pradesh', 'West Bengal', 'Rajasthan', 'Other'];
export const SEGMENTS = ['Garages & Bike Detailing Hub', 'Restaurants & Cloud Kitchens', 'Supermarkets & Groceries', 'Multi-Segment Commercial'];
