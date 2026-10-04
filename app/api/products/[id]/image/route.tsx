import { ImageResponse } from 'next/og';
import { getContainer } from '@/src/infrastructure/container';

export const dynamic = 'force-dynamic';

/**
 * Product artwork, generated here rather than linked from a stock-photo host.
 *
 * The seed products are invented, so there is no honest photograph of them.
 * Pointing at a random-image service produced a catalogue where the headphones
 * were illustrated with a photograph of green beans - which looks like a bug to
 * anyone reading the screen, and made the app depend on a third party to render
 * at all. A generated tile is deterministic, works offline, and is obviously a
 * placeholder rather than a wrong photograph.
 *
 * PNG, not SVG: mobile image loaders decode PNG out of the box, and an SVG here
 * would force every client to add a decoder.
 */
const FALLBACK: readonly [string, string] = ['#164e63', '#06b6d4'];

const PALETTE: Record<string, readonly [string, string]> = {
  audio: ['#1e3a8a', '#3b82f6'],
  computing: ['#312e81', '#6366f1'],
  outdoors: ['#14532d', '#22c55e'],
  apparel: ['#7c2d12', '#f97316'],
  kitchen: ['#7f1d1d', '#ef4444'],
  home: ['#164e63', '#06b6d4'],
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { getProduct } = await getContainer();

  let title = 'ShopKart';
  let category = 'home';
  try {
    const product = await getProduct.execute(id);
    title = product.title;
    category = product.category;
  } catch {
    // An image for a product that does not exist is still an image. Returning
    // a 404 here would leave a broken tile in a list that is otherwise fine.
  }

  const [from, to] = PALETTE[category] ?? FALLBACK;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 64,
          background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 8,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.72)',
            marginBottom: 28,
          }}
        >
          {category}
        </div>
        <div
          style={{
            fontSize: 72,
            lineHeight: 1.15,
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            display: 'flex',
          }}
        >
          {title}
        </div>
      </div>
    ),
    { width: 800, height: 800 },
  );
}
