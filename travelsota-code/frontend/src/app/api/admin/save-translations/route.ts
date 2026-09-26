import { NextResponse } from 'next/server';
import { writeFile, mkdir, copyFile, stat } from 'fs/promises';
import { join } from 'path';

export async function POST(request: Request) {
  try {
    const { code, content } = await request.json();

    if (!code || !content) {
      return NextResponse.json({ error: 'code and content required' }, { status: 400 });
    }

    const messagesDir = join(process.cwd(), 'messages');
    await mkdir(messagesDir, { recursive: true });

    const filePath = join(messagesDir, `${code}.json`);
    let backupPath: string | null = null;
    try {
      await stat(filePath);
      backupPath = join(messagesDir, `${code}.backup-${Date.now()}.json`);
      await copyFile(filePath, backupPath);
    } catch {
      // No existing file — nothing to back up.
    }

    await writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');

    return NextResponse.json({ success: true, path: filePath, backupPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
