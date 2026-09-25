/**
 * Local stand-in for the NowPayments invoice API (development only).
 *
 * Lets the full purchase journey be exercised offline without real funds or a
 * real merchant account. It holds no credentials and is never used in
 * production — point NOWPAYMENTS_API_BASE at it only for local verification.
 */
import http from 'node:http';

const port = Number(process.argv[2] || 5066);
let counter = 0;

http.createServer((req, res) => {
  if (req.method === 'POST' && (req.url || '').startsWith('/v1/invoice')) {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      counter += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: `mock_inv_${counter}`,
        invoice_url: `http://127.0.0.1:${port}/pay/mock_inv_${counter}`,
        order_id: parsed.order_id,
        price_amount: parsed.price_amount,
        pay_currency: parsed.pay_currency,
      }));
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end('{"error":"not found"}');
}).listen(port, '127.0.0.1', () => console.log(`mock nowpayments on http://127.0.0.1:${port}`));
