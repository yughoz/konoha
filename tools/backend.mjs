import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { appendFile, chmod, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = '0.40.6';
const binary = join(root, '.local/bin/pocketbase');

function apiUrl(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('REPLIZ_API_URL harus origin HTTPS, atau HTTP localhost untuk pengujian.');
  }
  return url.origin;
}

async function install() {
  if (existsSync(binary)) {
    if (execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim() !== `pocketbase version ${version}`) {
      throw new Error(`PocketBase lokal harus v${version}; pindahkan ${binary} lalu jalankan ulang.`);
    }
    return;
  }
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (!['darwin', 'linux'].includes(process.platform) || !arch) {
    throw new Error('Launcher mendukung macOS/Linux x64 dan arm64.');
  }
  const archive = `pocketbase_${version}_${process.platform}_${arch}.zip`;
  const base = `https://github.com/pocketbase/pocketbase/releases/download/v${version}`;
  const download = async (name) => {
    const response = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Unduh PocketBase gagal: HTTP ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  };
  const [zip, sums] = await Promise.all([download(archive), download('checksums.txt')]);
  const checksum = sums.toString().split('\n').find((line) => line.trim().endsWith(` ${archive}`))?.trim().split(/\s+/)[0];
  if (!checksum || createHash('sha256').update(zip).digest('hex') !== checksum) {
    throw new Error('Checksum PocketBase tidak cocok; instalasi dibatalkan.');
  }
  await mkdir(dirname(binary), { recursive: true });
  const temporary = await mkdtemp(join(dirname(binary), '.install-'));
  try {
    const zipPath = join(temporary, archive);
    const executable = join(temporary, 'pocketbase');
    await writeFile(zipPath, zip);
    await writeFile(executable, execFileSync('unzip', ['-p', zipPath, 'pocketbase'], { maxBuffer: 64 * 1024 * 1024 }));
    await chmod(executable, 0o755);
    if (execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim() !== `pocketbase version ${version}`) {
      throw new Error('Versi unduhan PocketBase tidak cocok.');
    }
    await rename(executable, binary);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  console.log(`PocketBase v${version} terpasang; checksum SHA-256 sesuai rilis resmi.`);
}

async function environment() {
  const envPath = join(root, '.env');
  const existed = existsSync(envPath);
  if (existed) process.loadEnvFile(envPath);
  const additions = [];
  if (!process.env.DESA_ADMIN_EMAIL) {
    process.env.DESA_ADMIN_EMAIL = 'admin@desa.local';
    additions.push(`DESA_ADMIN_EMAIL=${process.env.DESA_ADMIN_EMAIL}`);
  }
  if (!process.env.DESA_ADMIN_PASSWORD) {
    process.env.DESA_ADMIN_PASSWORD = randomBytes(24).toString('base64url');
    additions.push(`DESA_ADMIN_PASSWORD=${process.env.DESA_ADMIN_PASSWORD}`);
  }
  if (additions.length || !existed) await appendFile(envPath, `\n${additions.join('\n')}\n${!existed ? '\nREPLIZ_ACCESS_KEY=\nREPLIZ_SECRET_KEY=\n' : ''}`, { mode: 0o600 });
  await chmod(envPath, 0o600);
  const access = process.env.REPLIZ_ACCESS_KEY;
  const secret = process.env.REPLIZ_SECRET_KEY;
  if (Boolean(access) !== Boolean(secret)) throw new Error('Isi kedua REPLIZ_ACCESS_KEY dan REPLIZ_SECRET_KEY.');
  if (access && secret) process.env.REPLIZ_AUTHORIZATION = `Basic ${Buffer.from(`${access}:${secret}`).toString('base64')}`;
  process.env.REPLIZ_ACCOUNT_ID ||= '6a88116362caae1e04010787';
  process.env.REPLIZ_API_URL = apiUrl(process.env.REPLIZ_API_URL || 'https://api.repliz.com');
}

try {
  const flag = process.argv[2];
  if (process.argv.length > 3 || (flag && !['--install-only', '--check'].includes(flag))) throw new Error('Gunakan --install-only atau --check.');
  if (flag === '--check') {
    assert.equal(apiUrl('https://api.repliz.com/'), 'https://api.repliz.com');
    assert.equal(apiUrl('http://127.0.0.1:9000'), 'http://127.0.0.1:9000');
    assert.equal(apiUrl('http://[::1]:9000'), 'http://[::1]:9000');
    for (const url of ['http://api.repliz.com', 'ftp://localhost', 'https://user:pass@api.repliz.com', 'https://api.repliz.com/path', 'https://api.repliz.com?key=secret', 'http://127.0.0.1.example.com']) assert.throws(() => apiUrl(url));
    console.log('Backend launcher checks passed.');
  } else {
    await environment();
    await install();
    if (flag !== '--install-only') {
      console.log('Backend: http://127.0.0.1:8090 — login admin menggunakan email/password di .env.');
      const child = spawn(binary, ['serve', '--http=127.0.0.1:8090', `--dir=${join(root, 'pb_data')}`, `--hooksDir=${join(root, 'pb_hooks')}`, `--migrationsDir=${join(root, 'pb_migrations')}`, `--publicDir=${join(root, 'dist')}`], { cwd: root, env: process.env, stdio: 'inherit' });
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
      child.on('error', () => { console.error('PocketBase gagal dijalankan.'); process.exitCode = 1; });
      child.on('exit', (code) => { process.exitCode = code ?? 0; });
    }
  }
} catch (error) {
  // Avoid echoing network requests or environment values that may contain keys.
  console.error(error instanceof Error && !['TypeError', 'SyntaxError'].includes(error.name) ? error.message : 'Konfigurasi atau unduhan backend gagal.');
  process.exitCode = 1;
}
