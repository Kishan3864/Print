// Live updates over Server-Sent Events. Services call publish(channel) after
// any change; every open page subscribed to that channel re-renders itself.
// Channels: 'admin', 'shop:<id>', 'order:<id>'.

const subs = new Map();

export function publish(...channels) {
  for (const ch of channels) {
    const set = subs.get(ch);
    if (!set) continue;
    for (const res of set) res.write(`event: change\ndata: ${ch}\n\n`);
  }
}

export const publishShop = (shopId) => publish(`shop:${shopId}`, 'admin');
export const publishOrder = (order) => publish(`order:${order.id}`, `shop:${order.shop_id}`, 'admin');

/** Express handler: keeps the response open and registers it on the given channels. */
export function stream(req, res, channels) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  for (const ch of channels) {
    if (!subs.has(ch)) subs.set(ch, new Set());
    subs.get(ch).add(res);
  }
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    for (const ch of channels) {
      const set = subs.get(ch);
      set?.delete(res);
      if (set && !set.size) subs.delete(ch);
    }
  });
}
