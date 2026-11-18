/**
 * Renders every email the platform sends (Supabase auth emails + backend notification emails) to static
 * HTML files plus an index page, so the design can be reviewed in a browser without sending anything.
 *
 *   npx tsx scripts/render-email-previews.ts      ->  backend/email-previews/index.html
 *
 * Sample data is placeholder text only. Nothing is sent and no environment variables are needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The Supabase templates are Deno code; give them the one Deno API they touch.
(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => undefined } };

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../email-previews');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const authMod = await import('../../supabase/functions/auth-send-email/templates/index.ts');
const domainMod = (await import('../src/lib/domain-email-templates.js')) as Record<string, unknown>;

const rows: Array<{ group: string; name: string; subject: string; file: string }> = [];
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

function save(group: string, name: string, subject: string, html: string) {
  const file = `${group}-${slug(name)}.html`;
  fs.writeFileSync(path.join(out, file), html);
  rows.push({ group, name, subject, file });
}

for (const type of ['signup', 'recovery', 'invite', 'magiclink', 'email_change', 'reauthentication', 'other']) {
  const r = authMod.renderAuthEmail(type, 'https://example.com/confirm?token=SAMPLE', '123456');
  save('auth', type, r.subject, r.html);
}

// Any value a template asks for is filled with readable placeholder text.
const sample = new Proxy({}, { get: (_t, key) => (typeof key === 'string' ? `Sample ${key}` : undefined) });
for (const [name, fn] of Object.entries(domainMod)) {
  if (typeof fn !== 'function' || !name.startsWith('build')) continue;
  const r = (fn as (p: unknown) => { subject: string; html: string })(sample);
  save('notification', name.replace(/^build|Email$/g, ''), r.subject, r.html);
}

const li = rows
  .map((r) => `<tr><td>${r.group}</td><td><a href="${r.file}">${r.name}</a></td><td>${r.subject.replace(/</g, '&lt;')}</td></tr>`)
  .join('\n');
fs.writeFileSync(
  path.join(out, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Email previews</title>
<style>body{font:15px system-ui;margin:32px;color:#14202D}td,th{padding:6px 14px;text-align:left;border-bottom:1px solid #D3DEE9}</style>
<h1>Email previews (${rows.length})</h1><p>Open each file in a browser. For dark mode, switch your system to dark appearance.</p>
<table><tr><th>Type</th><th>Email</th><th>Subject</th></tr>${li}</table>`,
);
console.log(`rendered ${rows.length} emails to ${out}`);
