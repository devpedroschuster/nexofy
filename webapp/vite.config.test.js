import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { swCacheVersionPlugin } from './vite.config';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('swCacheVersionPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('substitui %%CACHE_VERSION%% em sw.js quando o arquivo existe no outDir resolvido', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue('const CACHE_NAME = "nexofy-%%CACHE_VERSION%%";\n');
    const plugin = swCacheVersionPlugin();
    plugin.configResolved({ root: '/app', build: { outDir: 'dist' } });
    const errorFn = vi.fn();

    plugin.closeBundle.call({ error: errorFn });

    expect(errorFn).not.toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const [, conteudoEscrito] = writeFileSync.mock.calls[0];
    expect(conteudoEscrito).not.toContain('%%CACHE_VERSION%%');
  });

  it('resolve o caminho de sw.js a partir de root + build.outDir capturados em configResolved, não de process.cwd()', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue('const CACHE_NAME = "nexofy-%%CACHE_VERSION%%";\n');
    const plugin = swCacheVersionPlugin();
    plugin.configResolved({ root: '/app', build: { outDir: 'build-custom' } });

    plugin.closeBundle.call({ error: vi.fn() });

    const [caminhoLido] = readFileSync.mock.calls[0];
    expect(caminhoLido).toBe(resolve('/app', 'build-custom', 'sw.js'));
  });

  it('chama this.error em vez de retornar em silêncio quando sw.js não existe no outDir resolvido', () => {
    existsSync.mockReturnValue(false);
    const plugin = swCacheVersionPlugin();
    plugin.configResolved({ root: '/app', build: { outDir: 'dist' } });
    const errorFn = vi.fn();

    plugin.closeBundle.call({ error: errorFn });

    expect(errorFn).toHaveBeenCalledTimes(1);
    expect(writeFileSync).not.toHaveBeenCalled();
  });
});
