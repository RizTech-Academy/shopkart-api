import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'ShopKart API — Swagger UI' };

/**
 * Swagger UI, loaded from a CDN rather than bundled.
 *
 * Keeps swagger-ui-react and its transitive tree out of the dependency list
 * for what is a development aid. The spec itself is served locally from
 * /api/openapi.json, so the contract is not dependent on the network.
 */
export default function Docs() {
  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" />
      <div id="swagger-ui" />
      <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js" async />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('load', function () {
              var start = function () {
                if (!window.SwaggerUIBundle) return setTimeout(start, 50);
                window.SwaggerUIBundle({
                  url: '/api/openapi.json',
                  dom_id: '#swagger-ui',
                  persistAuthorization: true,
                  tryItOutEnabled: true,
                  docExpansion: 'list',
                });
              };
              start();
            });
          `,
        }}
      />
    </>
  );
}
