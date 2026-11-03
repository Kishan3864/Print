// Small helpers shared by the shop's order dashboard and order page.

export const COLOR_LABEL = { color: 'Colour', bw: 'Black & white' };
export const COLOR_SHORT = { color: 'Colour', bw: 'B&W' };
export const SIDES_LABEL = { single: 'Single side', both: 'Both sides' };

export const plural = (n, one, many = one + 's') => `${n} ${Number(n) === 1 ? one : many}`;
export const qtyText = (n) => plural(n, 'copy', 'copies');

/** "A4 · 100 copies · Colour · Both sides" */
export const jobLine = (o) => [o.size, qtyText(o.quantity), COLOR_SHORT[o.color_mode], SIDES_LABEL[o.sides]].filter(Boolean).join(' · ');

export const orderPath = (o) => `/shop/orders/${o.order_no}`;
export const filePath = (o, f) => `/shop/orders/${o.order_no}/files/${f.id}`;
