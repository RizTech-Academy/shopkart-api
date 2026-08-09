const groups = [
  { title: 'Catalogue', rows: [
    ['GET', '/api/products', 'search, category, sort, page, pageSize'],
    ['GET', '/api/products/:id', 'single product'],
    ['GET', '/api/categories', 'categories with counts'],
  ]},
  { title: 'Session', rows: [['POST', '/api/sessions', 'create an anonymous session']] },
  { title: 'Cart', rows: [
    ['GET', '/api/cart', 'current cart'],
    ['POST', '/api/cart', '{ productId, quantity }'],
    ['PATCH', '/api/cart/items/:productId', '{ quantity } — 0 removes'],
    ['DELETE', '/api/cart/items/:productId', 'remove a line'],
    ['DELETE', '/api/cart', 'empty the cart'],
  ]},
  { title: 'Favourites', rows: [
    ['GET', '/api/favourites', 'list'],
    ['POST', '/api/favourites', '{ productId } — toggles'],
  ]},
  { title: 'Orders', rows: [
    ['POST', '/api/orders', 'checkout, empties the cart'],
    ['GET', '/api/orders', 'order history'],
    ['GET', '/api/orders/:id', 'single order'],
  ]},
];

export default function Home() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.25rem' }}>
      <h1 style={{ fontSize: '1.9rem', margin: 0 }}>ShopKart API</h1>
      <p style={{ color: '#9a9aae' }}>
        Catalogue, cart, favourites and orders for the ShopKart Android sample app. All write
        endpoints require an <code>x-session-id</code> header from <code>POST /api/sessions</code>.
      </p>
      {groups.map((g) => (
        <section key={g.title} style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1rem', color: '#7fd1ff' }}>{g.title}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {g.rows.map(([m, p, d]) => (
              <li key={`${m}${p}`} style={{ padding: '0.55rem 0', borderTop: '1px solid #23232e' }}>
                <code>
                  <strong>{m}</strong> {p}
                </code>
                <div style={{ color: '#9a9aae', fontSize: '0.85rem' }}>{d}</div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p style={{ marginTop: '2.5rem', color: '#6c6c80', fontSize: '0.85rem' }}>
        Built by <a href="https://www.riztechacademy.com" style={{ color: '#9a9aae' }}>RizTech Academy</a>
      </p>
    </main>
  );
}
