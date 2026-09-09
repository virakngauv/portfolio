import http from 'node:http';

const server = http.createServer((req, res) => {
  if (req.url === '/healthz' && !process.env.NEVER_READY) {
    res.setHeader('content-type', 'application/json');
    res.end('{"status":"ok"}');
  } else { res.writeHead(503); res.end(); }
});
server.listen(Number(process.env.PORT), '127.0.0.1');
process.on('SIGTERM', () => {
  if (!process.env.IGNORE_TERM) server.close(() => process.exit(0));
});
// Posted by ChatGPT Chat on behalf of @virakngauv.
