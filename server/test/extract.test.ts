import { describe, it, expect } from 'vitest';
import {
  extractSymbols,
  extractReferences,
  extractEndpoints,
  extractCrons,
} from '../src/adapters/codeindex/extract.js';

/**
 * A3 — unit tests for the enhanced TS/JS symbol/reference extractor (L04).
 * Pure (no DB/network) — the core of blast-radius accuracy.
 */
describe('extractSymbols', () => {
  it('finds functions, arrows, classes, methods, interfaces, types', () => {
    const src = `
export function rateLimit(req) { return true; }
const helper = (x) => x + 1;
export const compute = async (n: number) => n * 2;
export class Bucket {
  refill(now: number) { return now; }
  static make() { return new Bucket(); }
}
export interface Config { port: number }
export type Id = string;
`;
    const syms = extractSymbols(src);
    const names = syms.map((s) => s.name);
    expect(names).toContain('rateLimit');
    expect(names).toContain('helper');
    expect(names).toContain('compute');
    expect(names).toContain('Bucket');
    expect(names).toContain('refill'); // class method (bare)
    expect(names).toContain('Bucket.refill'); // class method (qualified)
    expect(names).toContain('Config');
    expect(names).toContain('Id');
    expect(syms.find((s) => s.name === 'Bucket')?.kind).toBe('class');
    expect(syms.find((s) => s.name === 'Config')?.kind).toBe('interface');
  });

  it('ignores keywords and comment lines', () => {
    const src = `
// function notReal(x) {}
/* class AlsoNot {} */
if (x) { doThing(); }
`;
    const syms = extractSymbols(src);
    expect(syms.map((s) => s.name)).not.toContain('notReal');
    expect(syms.map((s) => s.name)).not.toContain('AlsoNot');
    expect(syms.map((s) => s.name)).not.toContain('if');
  });
});

describe('extractReferences (downstream callers)', () => {
  it('finds call sites and excludes the declaration', () => {
    const caller = `
import { rateLimit } from './mw';
export function handler(req) {
  if (!rateLimit(req)) return 429;
  return 200;
}
`;
    const refs = extractReferences(caller, 'rateLimit');
    // exactly the call site on the if-line, NOT the import line
    expect(refs.length).toBe(1);
    expect(refs[0]!.line).toBe(4);
  });

  it('matches member calls, new, and JSX usage', () => {
    expect(extractReferences('obj.compute(1)', 'compute').length).toBe(1);
    expect(extractReferences('const b = new Bucket()', 'Bucket').length).toBe(1);
    expect(extractReferences('return <Widget id={1} />', 'Widget').length).toBe(1);
  });

  it('does not count the declaration line as a reference', () => {
    const decl = `export function rateLimit(req) { return true; }`;
    expect(extractReferences(decl, 'rateLimit').length).toBe(0);
  });
});

describe('extractEndpoints / extractCrons', () => {
  it('detects fastify/express route registrations', () => {
    const src = `
app.get('/users', handler);
router.post("/users/:id", update);
app.get<{ Params: { id: string } }>('/pulls/:id/blast', blast);
`;
    const eps = extractEndpoints(src);
    expect(eps).toContain('GET /users');
    expect(eps).toContain('POST /users/:id');
    expect(eps).toContain('GET /pulls/:id/blast');
  });

  it('detects cron expressions and background job kinds', () => {
    const src = `
cron.schedule('*/5 * * * *', poll);
jobs.register('poll_repo', handler);
`;
    const crons = extractCrons(src);
    expect(crons.some((c) => c.includes('*/5'))).toBe(true);
    expect(crons).toContain('job:poll_repo');
  });
});

describe('extractEndpoints — Next.js App Router (T8)', () => {
  const src = `
export async function GET(request: Request) {
  return Response.json([]);
}

export async function POST(request: Request) {
  return Response.json({}, { status: 201 });
}

export async function DELETE(request: Request) {
  return new Response(null, { status: 204 });
}
`;

  it('maps src/app/**/route.ts exported verbs to "METHOD /path"', () => {
    const eps = extractEndpoints(src, 'src/app/api/reviews/route.ts');
    expect(eps).toContain('GET /api/reviews');
    expect(eps).toContain('POST /api/reviews');
    expect(eps).toContain('DELETE /api/reviews');
    expect(eps.length).toBe(3);
  });

  it('keeps a [param] dynamic segment as-is', () => {
    const single = `export async function GET(request: Request) { return Response.json({}); }`;
    const eps = extractEndpoints(single, 'src/app/api/reviews/[id]/route.ts');
    expect(eps).toContain('GET /api/reviews/[id]');
  });

  it('drops a (group) route group segment from the path', () => {
    const single = `export async function GET(request: Request) { return Response.json({}); }`;
    const eps = extractEndpoints(single, 'src/app/(dashboard)/api/settings/route.ts');
    expect(eps).toContain('GET /api/settings');
    expect(eps).not.toContain('GET /(dashboard)/api/settings');
  });

  it('does not fold src/app/**/page.tsx into endpoints', () => {
    const page = `export default function Page() { return null; }`;
    const eps = extractEndpoints(page, 'src/app/api/reviews/page.tsx');
    expect(eps).toEqual([]);
  });

  it('ignores non-app-router files even when a filePath is passed', () => {
    const notRoute = `export async function GET(request: Request) { return Response.json({}); }`;
    expect(extractEndpoints(notRoute, 'src/lib/http.ts')).toEqual([]);
  });

  it('still matches Express/Fastify patterns when filePath is provided (regression)', () => {
    const mixed = `app.get('/legacy', handler);\n${src}`;
    const eps = extractEndpoints(mixed, 'src/app/api/reviews/route.ts');
    expect(eps).toContain('GET /legacy');
    expect(eps).toContain('GET /api/reviews');
  });

  it('still matches Express/Fastify patterns with no filePath argument at all (regression)', () => {
    const eps = extractEndpoints("app.get('/users', handler);");
    expect(eps).toContain('GET /users');
  });
});
