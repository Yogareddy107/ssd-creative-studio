import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ServiceItem, PortfolioItem, ClientItem, InquiryItem, SiteContent } from '../types';
import { INITIAL_SITE_CONTENT } from '../data/initialData';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseClient: SupabaseClient | undefined;

async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach Supabase. Check the project URL, project status, and network connection.');
    }
    throw error;
  }
}

function getSupabaseClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.');
  }

  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { fetch: supabaseFetch }
    });
  }

  return supabaseClient;
}

function throwIfError(error: { message: string } | null): void {
  if (error) {
    throw new Error(`Supabase request failed: ${error.message}`);
  }
}

// ----------------- SITE CONTENT -----------------
export async function getSiteContent(): Promise<SiteContent> {
  const { data, error } = await getSupabaseClient().from('site_content').select('*').eq('id', 'main').maybeSingle();
  throwIfError(error);

  const content = { ...INITIAL_SITE_CONTENT, ...data };
  if (!content.hero_reel_url || content.hero_reel_url.includes('BigBuckBunny')) {
    content.hero_reel_url = '/showreel.mp4';
  }
  return content;
}

export async function saveSiteContent(content: SiteContent): Promise<void> {
  const { error } = await getSupabaseClient().from('site_content').upsert({
    id: 'main',
    ...content,
    updated_at: new Date().toISOString()
  });
  throwIfError(error);
}

// ----------------- SERVICES -----------------
function fromServiceRow(row: Record<string, any>): ServiceItem {
  const { visual_type, ...service } = row;
  return {
    ...service,
    visualType: visual_type ?? row.visualType,
    items: row.items ?? []
  } as ServiceItem;
}

function toServiceRow(service: ServiceItem) {
  const { visualType, ...rest } = service;
  return { ...rest, visual_type: visualType };
}

export async function getServices(): Promise<ServiceItem[]> {
  const { data, error } = await getSupabaseClient().from('services').select('*');
  throwIfError(error);
  return (data ?? []).map(fromServiceRow);
}

export async function saveServices(services: ServiceItem[]): Promise<void> {
  await saveRows('services', services, toServiceRow);
}

// ----------------- PORTFOLIO -----------------
function fromPortfolioRow(row: Record<string, any>): PortfolioItem {
  const { category_label, video_url, aspect_ratio, ...project } = row;
  return {
    ...project,
    categoryLabel: category_label ?? row.categoryLabel,
    videoUrl: video_url ?? row.videoUrl ?? undefined,
    aspectRatio: aspect_ratio ?? row.aspectRatio
  } as PortfolioItem;
}

function toPortfolioRow(project: PortfolioItem) {
  const { categoryLabel, videoUrl, aspectRatio, ...rest } = project;
  return {
    ...rest,
    category_label: categoryLabel,
    video_url: videoUrl ?? null,
    aspect_ratio: aspectRatio ?? 'landscape'
  };
}

export async function getPortfolio(): Promise<PortfolioItem[]> {
  const { data, error } = await getSupabaseClient().from('portfolio').select('*');
  throwIfError(error);
  return (data ?? []).map(fromPortfolioRow);
}

export async function savePortfolio(portfolio: PortfolioItem[]): Promise<void> {
  await saveRows('portfolio', portfolio, toPortfolioRow);
}

// ----------------- CLIENTS -----------------
function fromClientRow(row: Record<string, any>): ClientItem {
  return row as ClientItem;
}

function toClientRow(client: ClientItem) {
  const { logoText: _logoText, logoUrl: _logoUrl, ...storedClient } = client;
  return storedClient;
}

export async function getClients(): Promise<ClientItem[]> {
  const { data, error } = await getSupabaseClient().from('clients').select('*');
  throwIfError(error);
  return (data ?? []).map(fromClientRow);
}

export async function saveClients(clients: ClientItem[]): Promise<void> {
  await saveRows('clients', clients, toClientRow);
}

async function saveRows<T extends { id: string }, R extends { id: string }>(
  table: 'services' | 'portfolio' | 'clients',
  rows: T[],
  toRow: (row: T) => R
): Promise<void> {
  const client = getSupabaseClient();
  const { data: existingRows, error: selectError } = await client.from(table).select('id');
  throwIfError(selectError);

  if (rows.length > 0) {
    const { error: upsertError } = await client.from(table).upsert(rows.map(toRow));
    throwIfError(upsertError);
  }

  const retainedIds = new Set(rows.map(row => row.id));
  const obsoleteIds = (existingRows ?? [])
    .map(row => row.id)
    .filter(id => !retainedIds.has(id));

  if (obsoleteIds.length > 0) {
    const { error: deleteError } = await client.from(table).delete().in('id', obsoleteIds);
    throwIfError(deleteError);
  }
}

// ----------------- INQUIRIES -----------------
export async function getInquiries(): Promise<InquiryItem[]> {
  const { data, error } = await getSupabaseClient().from('inquiries').select('*').order('created_at', { ascending: false });
  throwIfError(error);
  return (data ?? []) as InquiryItem[];
}

export async function submitInquiry(
  inquiry: Omit<InquiryItem, 'id' | 'created_at' | 'status'>
): Promise<{ success: boolean; id: string }> {
  const { data, error } = await getSupabaseClient()
    .from('inquiries')
    .insert([{ ...inquiry, status: 'new' }])
    .select('id')
    .single();
  throwIfError(error);
  if (!data) {
    throw new Error('Supabase did not return the saved inquiry ID.');
  }
  return { success: true, id: data.id };
}
