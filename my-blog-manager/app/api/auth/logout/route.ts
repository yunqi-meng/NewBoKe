import { NextRequest } from 'next/server';
import { buildClearCookie } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const response = Response.json({ success: true });
  response.headers.append('Set-Cookie', buildClearCookie());
  return response;
}
