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

const cart = {
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
          inStock: { type: 'boolean', description: 'False if it sold out after being added. Checkout will reject it.' },
          unitPrice: money,
          quantity: { type: 'integer' },
          lineTotal: money,
        },
      },
    },
    itemCount: { type: 'integer' },
    subtotal: money,
  },
} as const;

const orderSchema = {
  type: 'object',
  description: 'Note there is no `owner` field. Who an order belongs to is decided by the credential on the request, never disclosed in the response.',
  properties: {
    id: { type: 'string' },
    reference: { type: 'string', example: 'ORD-2026-C793AF' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        description: 'Prices are snapshotted at checkout, so an order never changes when the catalogue does.',
        properties: {
          productId: { type: 'string' },
          title: { type: 'string' },
          unitPrice: money,
          quantity: { type: 'integer' },
          lineTotal: money,
        },
      },
    },
    itemCount: { type: 'integer' },
    total: money,
    placedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const user = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string', format: 'email' },
    displayName: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

const authenticated = {
  type: 'object',
  properties: {
    user,
    accessToken: { type: 'string', description: 'Send as `Authorization: Bearer <token>`.' },
    expiresAt: { type: 'string', format: 'date-time' },
  },
} as const;

const errorBody = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', enum: ['validation_failed', 'unauthenticated', 'not_found', 'conflict', 'internal_error'] },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object' } },
      },
    },
  },
} as const;

const sessionHeader = {
  name: 'x-session-id',
  in: 'header',
  required: false,
  schema: { type: 'string' },
  description: 'From POST /api/sessions. Identifies a guest shopper. Ignored when a Bearer token is also sent.',
} as const;

const guestSessionHeader = {
  ...sessionHeader,
  description: 'Optional. Send the guest session id to carry that basket, its favourites and its order history onto the account.',
} as const;

const STATUS_TEXT = {
  '400': 'Invalid request',
  '401': 'Missing, invalid or expired credentials',
  '404': 'Not found',
  '409': 'Conflict',
} as const;

const errors = (...codes: readonly (keyof typeof STATUS_TEXT)[]) =>
  Object.fromEntries(
    codes.map((code) => [
      code,
      { description: STATUS_TEXT[code], content: { 'application/json': { schema: errorBody } } },
    ]),
  );

/** Either credential is accepted; OpenAPI expresses "or" as separate entries. */
const shopperAuth = [{ sessionId: [] }, { bearerAuth: [] }] as const;

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
      'and paste it as `sessionId`. Every basket, favourite and order endpoint needs a credential.\n\n' +
      '**Two ways to be a shopper.** A *guest* is identified by the `x-session-id` header; a ' +
      '*registered user* by `Authorization: Bearer <token>` from `/api/auth/login`. Every basket, ' +
      'favourite and order endpoint accepts either, and behaves identically — what a basket belongs ' +
      'to is a shopper, not a device. When both are sent the token wins, so signing in on a shared ' +
      'device shows your own basket.\n\n' +
      '**Signing up keeps your basket.** Send your `x-session-id` alongside `POST /api/auth/register` ' +
      'or `/api/auth/login` and the guest basket, favourites and order history move onto the account. ' +
      'Quantities are summed where both sides hold the same product.\n\n' +
      'Prices are integer minor units — `12900` means $129.00. There is no payment step.',
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'Catalogue', description: 'Browsing products. No credential needed.' },
    { name: 'Session', description: 'Identifying a guest shopper.' },
    { name: 'Accounts', description: 'Registering, signing in, and carrying a guest basket across.' },
    { name: 'Basket', description: 'Requires a session id or a Bearer token.' },
    { name: 'Favourites', description: 'Requires a session id or a Bearer token.' },
    { name: 'Orders', description: 'Requires a session id or a Bearer token.' },
  ],
  components: {
    securitySchemes: {
      sessionId: { type: 'apiKey', in: 'header', name: 'x-session-id' },
      bearerAuth: { type: 'http', scheme: 'bearer', description: 'The `accessToken` from /api/auth/login or /api/auth/register.' },
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
    '/api/auth/register': {
      post: {
        tags: ['Accounts'],
        summary: 'Create an account',
        description:
          'Returns a Bearer token. Send your `x-session-id` as well to carry the guest basket, ' +
          'favourites and order history onto the new account.',
        parameters: [guestSessionHeader],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'displayName'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'ada@example.com' },
                  password: { type: 'string', minLength: 8, example: 'correct-horse' },
                  displayName: { type: 'string', example: 'Ada Lovelace' },
                },
              },
            },
          },
        },
        responses: { 201: json(authenticated, 'Account created and signed in'), ...errors('400', '409') },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Accounts'],
        summary: 'Sign in',
        description: 'As with register, an `x-session-id` carries the guest basket across.',
        parameters: [guestSessionHeader],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'ada@example.com' },
                  password: { type: 'string', example: 'correct-horse' },
                },
              },
            },
          },
        },
        responses: { 200: json(authenticated, 'Signed in'), ...errors('400', '401') },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Accounts'],
        summary: 'Revoke the current token',
        description: 'Signs out this device only — tokens from other sign-ins keep working. Idempotent.',
        security: [{ bearerAuth: [] }],
        responses: { 200: json({ type: 'object', properties: { revoked: { type: 'boolean' } } }, 'Token revoked'), ...errors('401') },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Accounts'],
        summary: 'The signed-in shopper',
        description: '401 for a guest — a guest has no profile.',
        security: [{ bearerAuth: [] }],
        responses: { 200: json(user, 'Profile'), ...errors('401', '404') },
      },
    },
    '/api/cart': {
      get: { tags: ['Basket'], summary: 'Get the basket', security: shopperAuth, parameters: [sessionHeader], responses: { 200: json(cart, 'The basket'), ...errors('401', '404') } },
      post: {
        tags: ['Basket'], summary: 'Add an item', security: shopperAuth, parameters: [sessionHeader],
        description: 'Adding a product already in the basket increments its quantity. Out-of-stock products are rejected.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['productId'], properties: { productId: { type: 'string', example: 'p-001' }, quantity: { type: 'integer', minimum: 1, maximum: 99, default: 1 } } } } },
        },
        responses: { 200: json(cart, 'Updated basket'), ...errors('400', '401', '404') },
      },
      delete: { tags: ['Basket'], summary: 'Empty the basket', security: shopperAuth, parameters: [sessionHeader], responses: { 200: json(cart, 'Empty basket'), ...errors('401', '404') } },
    },
    '/api/cart/items/{productId}': {
      patch: {
        tags: ['Basket'], summary: 'Set a line quantity', security: shopperAuth,
        description: 'A quantity of 0 removes the line.',
        parameters: [sessionHeader, { name: 'productId', in: 'path', required: true, schema: { type: 'string' }, example: 'p-001' }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 0, maximum: 99 } } } } } },
        responses: { 200: json(cart, 'Updated basket'), ...errors('400', '401', '404') },
      },
      delete: {
        tags: ['Basket'], summary: 'Remove a line', security: shopperAuth,
        parameters: [sessionHeader, { name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: json(cart, 'Updated basket'), ...errors('401', '404') },
      },
    },
    '/api/favourites': {
      get: { tags: ['Favourites'], summary: 'List favourites', security: shopperAuth, parameters: [sessionHeader], responses: { 200: json({ type: 'array', items: product }, 'Favourites'), ...errors('401', '404') } },
      post: {
        tags: ['Favourites'], summary: 'Toggle a favourite', security: shopperAuth, parameters: [sessionHeader],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['productId'], properties: { productId: { type: 'string', example: 'p-001' } } } } } },
        responses: { 200: json({ type: 'object', properties: { favourited: { type: 'boolean' } } }, 'New state'), ...errors('400', '401', '404') },
      },
    },
    '/api/orders': {
      get: { tags: ['Orders'], summary: 'Order history', security: shopperAuth, parameters: [sessionHeader], responses: { 200: json({ type: 'array', items: orderSchema }, 'Orders, newest first'), ...errors('401', '404') } },
      post: {
        tags: ['Orders'], summary: 'Checkout', security: shopperAuth, parameters: [sessionHeader],
        description: 'Snapshots current prices onto the order, then empties the basket. No payment step. Fails if the basket is empty or holds an item that has sold out.',
        responses: { 201: json(orderSchema, 'Order placed'), ...errors('400', '401', '404') },
      },
    },
    '/api/orders/{id}': {
      get: {
        tags: ['Orders'], summary: 'Get one order', security: shopperAuth,
        description: 'Returns 404 if the order belongs to another shopper.',
        parameters: [sessionHeader, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: json(orderSchema, 'The order'), ...errors('401', '404') },
      },
    },
  },
} as const;
