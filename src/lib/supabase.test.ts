// Runtime validation coverage for Supabase-backed site content reads and saves.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_SITE_CONTENT } from '../data/initialData';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseMock.from }))
}));

import { getSiteContent, saveSiteContent } from './supabase';

describe('Supabase site content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.from.mockReturnValue({
      select: supabaseMock.select,
      upsert: supabaseMock.upsert
    });
    supabaseMock.select.mockReturnValue({ eq: supabaseMock.eq });
    supabaseMock.eq.mockReturnValue({ maybeSingle: supabaseMock.maybeSingle });
    supabaseMock.maybeSingle.mockResolvedValue({
      data: { hero_title_line1: 'Saved in Supabase' },
      error: null
    });
    supabaseMock.upsert.mockResolvedValue({ error: null });
  });

  it('loads remote content and preserves defaults for unset fields', async () => {
    const content = await getSiteContent();

    expect(supabaseMock.from).toHaveBeenCalledWith('site_content');
    expect(supabaseMock.eq).toHaveBeenCalledWith('id', 'main');
    expect(content.hero_title_line1).toBe('Saved in Supabase');
    expect(content.contact_email).toBe(INITIAL_SITE_CONTENT.contact_email);
  });

  it('upserts content under the shared main record', async () => {
    await saveSiteContent(INITIAL_SITE_CONTENT);

    expect(supabaseMock.from).toHaveBeenCalledWith('site_content');
    expect(supabaseMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'main', hero_title_line1: INITIAL_SITE_CONTENT.hero_title_line1 })
    );
  });

  it('surfaces Supabase write errors instead of reporting success', async () => {
    supabaseMock.upsert.mockResolvedValue({ error: { message: 'permission denied' } });

    await expect(saveSiteContent(INITIAL_SITE_CONTENT)).rejects.toThrow('permission denied');
  });
});
