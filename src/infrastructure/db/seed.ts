export interface SeedProduct {
  id: string; title: string; description: string; category: string;
  priceMinor: number; imageUrl: string; ratingAverage: number; ratingCount: number; inStock: boolean;
}

/**
 * Product photos ship with this API (public/products), not a stock-photo host:
 * a hotlinked image breaks or changes the day the host moves it, and the
 * catalogue should look the same offline as on day one.
 *
 * Absolute, because mobile clients hand the URL straight to an image loader.
 * SHOPKART_PUBLIC_URL is how the API is reached from *outside* the machine it
 * runs on - the Android emulator sees the host as 10.0.2.2, not localhost - and
 * an empty default leaves the path relative, which is what a browser wants.
 */
const PUBLIC_BASE = process.env.SHOPKART_PUBLIC_URL ?? '';

const img = (id: string) => `${PUBLIC_BASE}/products/${id}.webp`;

const p = (
  id: string, title: string, category: string, priceMinor: number,
  ratingAverage: number, ratingCount: number, inStock: boolean, description: string,
): SeedProduct => ({ id, title, description, category, priceMinor, imageUrl: img(id), ratingAverage, ratingCount, inStock });

/** Seeded once when the products table is empty. */
export const SEED_PRODUCTS: readonly SeedProduct[] = [
  p('p-001', 'Aurora Wireless Headphones', 'audio', 12900, 4.6, 218, true,  'Over-ear headphones with adaptive noise cancelling and 40-hour battery life.'),
  p('p-002', 'Pulse Bluetooth Speaker',    'audio', 5900,  4.3, 512, true,  'Pocket-sized speaker with surprising low end, IPX7 water resistance and 18 hours of playback.'),
  p('p-003', 'Echo Studio Microphone',     'audio', 18500, 4.8, 96,  true,  'Large-diaphragm condenser microphone with a cardioid pattern, built for vocals and voiceover.'),
  p('p-004', 'Nomad Earbuds Pro',          'audio', 8900,  4.1, 733, false, 'True wireless earbuds with transparency mode and a compact charging case.'),
  p('p-010', 'Meridian Mechanical Keyboard','computing', 14900, 4.7, 341, true, 'Hot-swappable 75% keyboard with tactile switches, PBT keycaps and per-key backlighting.'),
  p('p-011', 'Glide Ergonomic Mouse',      'computing', 6900,  4.4, 289, true, 'Vertical ergonomic mouse that keeps the wrist neutral. Six programmable buttons.'),
  p('p-012', 'Vista 27-inch 4K Monitor',   'computing', 42900, 4.5, 154, true, 'A 27-inch 4K IPS panel covering 99% sRGB, with USB-C power delivery.'),
  p('p-013', 'Anchor USB-C Hub',           'computing', 4900,  4.0, 621, true, 'Seven-in-one hub with HDMI, Ethernet, SD and 100W pass-through charging.'),
  p('p-020', 'Trail 30L Backpack',         'outdoors', 11900, 4.6, 187,  true, 'Weather-resistant 30-litre pack with a padded laptop sleeve and load-bearing hip belt.'),
  p('p-021', 'Summit Insulated Bottle',    'outdoors', 3400,  4.9, 1204, true, 'Double-walled stainless bottle keeping drinks cold 24 hours or hot for 12.'),
  p('p-022', 'Beacon Camp Lantern',        'outdoors', 4200,  4.2, 76,   true, 'Collapsible LED lantern with three brightness levels and a USB-rechargeable cell.'),
  p('p-030', 'Loom Merino Sweater',        'apparel', 13900, 4.5, 204, true,  'Fine-gauge merino knit that regulates temperature and resists odour.'),
  p('p-031', 'Drift Canvas Jacket',        'apparel', 21900, 4.4, 88,  true,  'Waxed canvas jacket with a corduroy collar and four external pockets.'),
  p('p-032', 'Everyday Cotton Tee',        'apparel', 2900,  4.1, 940, true,  'Heavyweight combed cotton tee with a clean shoulder seam.'),
  p('p-033', 'Range Wool Socks',           'apparel', 1900,  4.7, 356, false, 'Cushioned merino socks with a reinforced heel and arch support.'),
  p('p-040', 'Brew Pour-Over Set',         'kitchen', 5400, 4.6, 265, true, 'Borosilicate carafe and stainless dripper. No paper filters needed.'),
  p('p-041', 'Grind Burr Coffee Mill',     'kitchen', 9900, 4.8, 412, true, 'Conical burr grinder with forty click-stop settings from espresso to French press.'),
  p('p-042', 'Slate Chef Knife 8-inch',    'kitchen', 8900, 4.9, 178, true, 'High-carbon stainless chef knife, full tang, hand-finished 15-degree edge.'),
  p('p-043', 'Ember Cast Iron Skillet',    'kitchen', 6400, 4.7, 823, true, 'Pre-seasoned 10-inch cast iron skillet. Oven safe and effectively permanent.'),
  p('p-050', 'Focus Desk Lamp',            'home', 7400,  4.3, 143, true,  'Adjustable LED desk lamp with five colour temperatures and a flicker-free driver.'),
  p('p-051', 'Quiet Mist Humidifier',      'home', 5900,  4.5, 297, true,  'Ultrasonic cool-mist humidifier with a 3-litre tank, quiet enough to run overnight.'),
  p('p-052', 'Terra Ceramic Planter',      'home', 3200,  4.2, 61,  true,  'Stoneware planter with a drainage hole and matching saucer.'),
  p('p-053', 'Linen Throw Blanket',        'home', 8400,  4.6, 132, false, 'Stonewashed European linen throw that softens with every wash.'),
];
