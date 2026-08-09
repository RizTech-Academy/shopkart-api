/**
 * OpenAPI description of the HTTP surface.
 *
 * Lives in the interface layer because it describes the *transport*, not the
 * domain — the same use cases could be exposed over gRPC and none of this
 * would apply. Written by hand rather than generated so it stays readable as
 * documentation in its own right.
 */

const money = {
  type: 'object',
  required: ['amountMinor', 'currency'],
  properties: {
    amountMinor: { type: 'integer', example: 12900, description: 'Integer minor units. 12900 is $129.00.' },
    currency: { type: 'string', enum: ['USD'] },
  },
} as const;

const product = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'p-001' },
    title: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string', example: 'audio' },
    price: money,
    imageUrl: { type: 'string', format: 'uri' },
    rating: {
      type: 'object',
      properties: { average: { type: 'number', example: 4.6 }, count: { type: 'integer' } },
    },
    inStock: { type: 'boolean' },
  },
} as const;

const cartView = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          title: { type: 'string' },
          imageUrl: { type: 'string' },
          unitPrice: { type: 'integer' },
          quantity: { type: 'integer' },
          lineTotal: { type: 'integer' },
        },
      },
    },
    itemCount: { type: 'integer' },
    subtotalMinor: { type: 'integer' },
    currency: { type: 'string', enum: ['USD'] },
  },
} as const;

const errorBody = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', enum: ['validation_failed', 'not_found', 'conflict', 'internal_error'] },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object' } },
      },
    },
  },
} as const;

const sessionHeader = {
  name: 'x-session-id',
  in: 'header',
  required: true,
  schema: { type: 'string' },
  description: 'From POST /api/sessions. Identifies the shopper who owns the basket.',
} as const;

const errors = (...codes: readonly ('400' | '404' | '409')[]) =>
  Object.fromEntries(
    codes.map((code) => [
      code,
      { description: { '400': 'Invalid request', '404': 'Not found', '409': 'Conflict' }[code], content: { 'application/json': { schema: errorBody } } },
    ]),
  );

const json = (schema: unknown, description = 'Success') => ({
  description,
  content: { 'application/json': { schema: { type: 'object', properties: { data: schema } } } },
});

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'ShopKart API',
    version: '1.0.0',
    description:
      'Catalogue, basket, favourites and orders for the ShopKart Android sample app.\n\n' +
      '**Start here:** call `POST /api/sessions`, copy the returned `id`, then click **Authorize** ' +
      'and paste it. Every basket, favourite and order endpoint needs it.\n\n' +
      'Prices are integer minor units — `12900` means $129.00. There is no payment step.',
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'Catalogue', description: 'Browsing products. No session needed.' },
    { name: 'Session', description: 'Identifying a shopper.' },
    { name: 'Basket', description: 'Requires a session.' },
    { name: 'Favourites', description: 'Requires a session.' },
    { name: 'Orders', description: 'Requires a session.' },
  ],
  components: {
    securitySchemes: {
      sessionId: { type: 'apiKey', in: 'header', name: 'x-session-id' },
    },
  },
  paths: {
    '/api/products': {
      get: {
        tags: ['Catalogue'],
        summary: 'List products',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Matches title, description and category.' },
          { name: 'category', in: 'query', schema: { type: 'string', example: 'audio' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['relevance', 'price_asc', 'price_desc', 'rating_desc', 'title_asc'], default: 'relevance' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          200: {
            description: 'A page of products',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: product },
                    meta: {
                      type: 'object',
                      properties: {
                        page: { type: 'integer' }, pageSize: { type: 'integer' },
                        totalItems: { type: 'integer' }, totalPages: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          ...errors('400'),
        },
      },
    },
    '/api/products/{id}': {
      get: {
        tags: ['Catalogue'],
        summary: 'Get one product',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'p-001' }],
        responses: { 200: json(product, 'The product'), ...errors('404') },
      },
    },
    '/api/categories': {
      get: {
        tags: ['Catalogue'],
        summary: 'List categories with product counts',
        responses: {
          200: json({ type: 'array', items: { type: 'object', properties: { slug: { type: 'string' }, name: { type: 'string' }, productCount: { type: 'integer' } } } }, 'Categories'),
        },
      },
    },
    '/api/sessions': {
      post: {
        tags: ['Session'],
        summary: 'Create a shopper session',
        description: 'Call this first. Copy the returned id into **Authorize**.',
        responses: {
          201: json({ type: 'object', properties: { id: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } } }, 'Session created'),
        },
      },
    },
    '/api/cart': {
      get: { tags: ['Basket'], summary: 'Get the basket', security: [{ sessionId: [] }], parameters: [sessionHeader], responses: { 200: json(cartView, 'The basket'), ...errors('400', '404') } },
      post: {
        tags: ['Basket'], summary: 'Add an item', security: [{ sessionId: [] }], parameters: [sessionHeader],
        description: 'Adding a product already in the basket increments its quantity. Out-of-stock products are rejected.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['productId'], properties: { productId: { type: 'string', example: 'p-001' }, quantity: { type: 'integer', minimum: 1, maximum: 99, default: 1 } } } } },
        },
        responses: { 200: json(cartView, 'Updated basket'), ...errors('400', '404') },
      },
      delete: { tags: ['Basket'], summary: 'Empty the basket', security: [{ sessionId: [] }], parameters: [sessionHeader], responses: { 200: json(cartView, 'Empty basket'), ...errors('400', '404') } },
    },
    '/api/cart/items/{productId}': {
      patch: {
        tags: ['Basket'], summary: 'Set a line quantity', security: [{ sessionId: [] }],
        description: 'A quantity of 0 removes the line.',
        parameters: [sessionHeader, { name: 'productId', in: 'path', required: true, schema: { type: 'string' }, example: 'p-001' }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 0, maximum: 99 } } } } } },
        responses: { 200: json(cartView, 'Updated basket'), ...errors('400', '404') },
      },
      delete: {
        tags: ['Basket'], summary: 'Remove a line', security: [{ sessionId: [] }],
        parameters: [sessionHeader, { name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: json(cartView, 'Updated basket'), ...errors('400', '404') },
      },
    },
    '/api/favourites': {
      get: { tags: ['Favourites'], summary: 'List favourites', security: [{ sessionId: [] }], parameters: [sessionHeader], responses: { 200: json({ type: 'array', items: product }, 'Favourites'), ...errors('400', '404') } },
      post: {
        tags: ['Favourites'], summary: 'Toggle a favourite', security: [{ sessionId: [] }], parameters: [sessionHeader],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['productId'], properties: { productId: { type: 'string', example: 'p-001' } } } } } },
        responses: { 200: json({ type: 'object', properties: { favourited: { type: 'boolean' } } }, 'New state'), ...errors('400', '404') },
      },
    },
    '/api/orders': {
      get: { tags: ['Orders'], summary: 'Order history', security: [{ sessionId: [] }], parameters: [sessionHeader], responses: { 200: json({ type: 'array', items: { type: 'object' } }, 'Orders'), ...errors('400', '404') } },
      post: {
        tags: ['Orders'], summary: 'Checkout', security: [{ sessionId: [] }], parameters: [sessionHeader],
        description: 'Snapshots current prices onto the order, then empties the basket. No payment step. Fails if the basket is empty.',
        responses: {
          201: json({ type: 'object', properties: { id: { type: 'string' }, reference: { type: 'string', example: 'ORD-2026-C793AF' }, total: money, placedAt: { type: 'string', format: 'date-time' } } }, 'Order placed'),
          ...errors('400', '404'),
        },
      },
    },
    '/api/orders/{id}': {
      get: {
        tags: ['Orders'], summary: 'Get one order', security: [{ sessionId: [] }],
        description: 'Returns 404 if the order belongs to another shopper.',
        parameters: [sessionHeader, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: json({ type: 'object' }, 'The order'), ...errors('400', '404') },
      },
    },
  },
} as const;
