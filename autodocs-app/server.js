// Minimal custom server, used only to raise Node's default HTTP timeouts
// (requestTimeout 300000ms / headersTimeout 60000ms) so a CPU-inference
// upload that legitimately takes tens of minutes isn't killed mid-request.
// See AUTODOC.md Step 7. Everything else is stock `next start` behavior.
const { createServer } = require('http');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '127.0.0.1';
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));

  // 0 = no timeout. An upload's actual bound is the ML service's own
  // per-request logic, not this server.
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.keepAliveTimeout = 65000;

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
