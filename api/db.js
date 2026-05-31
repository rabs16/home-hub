import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const sql = neon(process.env.DATABASE_URL);
  const body = req.method === 'POST' ? req.body : req.query;
  const { action } = body;
  const payload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload || {};

  try {
    if (action === 'get_all') {
      const [tasks, profile, log, seasonal] = await Promise.all([
        sql`select * from tasks order by created_at`,
        sql`select * from home_profile limit 1`,
        sql`select * from work_log order by created_at desc`,
        sql`select * from seasonal_items order by season, id`,
      ]);
      res.json({ tasks, profile: profile[0] || {}, log, seasonal });

    } else if (action === 'add_task') {
      const { title, tier, category, cost, notes } = payload;
      const rows = await sql`
        insert into tasks (title, tier, category, cost, notes, done)
        values (${title}, ${tier}, ${category||''}, ${cost||''}, ${notes||''}, false)
        returning *`;
      res.json(rows[0]);

    } else if (action === 'update_task') {
      const { id, title, tier, category, cost, notes, done } = payload;
      const rows = await sql`
        update tasks set
          title = coalesce(${title}, title),
          tier = coalesce(${tier}, tier),
          category = coalesce(${category}, category),
          cost = coalesce(${cost}, cost),
          notes = coalesce(${notes}, notes),
          done = coalesce(${done}, done),
          updated_at = now()
        where id = ${id} returning *`;
      res.json(rows[0]);

    } else if (action === 'delete_task') {
      await sql`delete from tasks where id = ${payload.id}`;
      res.json({ success: true });

    } else if (action === 'upsert_profile') {
      const { key, value } = payload;
      const existing = await sql`select id from home_profile limit 1`;
      if (existing.length > 0) {
        await sql`update home_profile set updated_at = now() where id = ${existing[0].id}`;
        await sql.unsafe(`update home_profile set "${key}" = $1 where id = $2`, [value, existing[0].id]);
        const row = await sql`select * from home_profile where id = ${existing[0].id}`;
        res.json(row[0]);
      } else {
        await sql.unsafe(`insert into home_profile ("${key}") values ($1)`, [value]);
        const row = await sql`select * from home_profile limit 1`;
        res.json(row[0]);
      }

    } else if (action === 'add_log') {
      const { title, log_date, contractor, cost, notes } = payload;
      const rows = await sql`
        insert into work_log (title, log_date, contractor, cost, notes)
        values (${title}, ${log_date||''}, ${contractor||''}, ${cost||''}, ${notes||''})
        returning *`;
      res.json(rows[0]);

    } else if (action === 'delete_log') {
      await sql`delete from work_log where id = ${payload.id}`;
      res.json({ success: true });

    } else if (action === 'toggle_seasonal') {
      const rows = await sql`
        update seasonal_items set done = ${payload.done}
        where id = ${payload.id} returning *`;
      res.json(rows[0]);

    } else {
      res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
