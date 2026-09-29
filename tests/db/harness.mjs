import pg from 'pg';
export const CONN = { host: '127.0.0.1', port: 54999, user: 'postgres', password: 'postgres', database: 'postgres' };
export async function client() { const c = new pg.Client(CONN); await c.connect(); return c; }
export const pool = new pg.Pool({ ...CONN, max: 10 });

export const q = (sql, params) => pool.query(sql, params);

export async function reset() {
  await q(`delete from orders where customer_email like '%@e2e.test'`);
  await q(`delete from group_buy_bunuan_grants`);
  await q(`delete from group_buy_product_kits`);
  await q(`delete from products where name like 'E2E %'`);
  await q(`delete from group_buys where title like 'E2E %'`);
}

let gbSeq = 0;
export async function seedRound({ status = 'active', title } = {}) {
  gbSeq += 1;
  const t = title || `E2E Round ${gbSeq}`;
  const r = await q(
    `insert into group_buys (gb_number, title, status, created_at)
     values ($1, $2, $3, now() + ($4 || ' seconds')::interval) returning *`,
    [`E2E-${Date.now()}-${gbSeq}`, t, status, String(gbSeq)],
  );
  return r.rows[0];
}

export async function seedProduct({ name, gb, moq = null, kit = null, price = 100, stock = 1000, available = true }) {
  const r = await q(
    `insert into products (name, description, category, base_price, national_price, international_price,
                           stock_quantity, available, group_buy_id, min_order_quantity, kit_size)
     values ($1,'E2E','research',$2,$2,$2,$3,$4,$5,$6,$7) returning *`,
    [`E2E ${name}`, price, stock, available, gb.id, moq, kit],
  );
  return r.rows[0];
}

/** An order created the OLD way (direct insert) — i.e. pre-existing history. */
export async function legacyOrder({ gb, name, email, phone, items, order_status = 'new', payment_status = 'pending' }) {
  const r = await q(
    `insert into orders (customer_name, customer_email, customer_phone, shipping_address, shipping_barangay,
                         shipping_city, shipping_state, shipping_zip_code, order_items, total_price,
                         order_status, payment_status, group_buy_id, group_buy_number)
     values ($1,$2,$3,'addr','brgy','city','state','1000',$4::jsonb,0,$5,$6,$7,$8) returning *`,
    [name, email, phone, JSON.stringify(items), order_status, payment_status, gb.id, gb.gb_number],
  );
  return r.rows[0];
}

export async function placeOrder(items, customer = {}, mode = 'national', conn = pool) {
  const order = {
    customer_name: 'E2E Buyer',
    customer_email: 'buyer@e2e.test',
    customer_phone: '09270000001',
    shipping_address: 'addr', shipping_barangay: 'brgy', shipping_city: 'city',
    shipping_state: 'state', shipping_zip_code: '1000',
    ...customer,
  };
  const r = await conn.query(`select place_group_buy_order($1::jsonb,$2,$3::jsonb) as res`,
    [JSON.stringify(items), mode, JSON.stringify(order)]);
  return r.rows[0].res;
}

export async function kitState(gb, p) {
  const r = await q(`select * from gb_kit_state($1,$2)`, [gb.id, p.id]);
  return r.rows[0];
}

export async function viewRows(gb) {
  const r = await q(`select * from group_buy_kit_status where group_buy_id = $1 order by product_name`, [gb.id]);
  return r.rows;
}
