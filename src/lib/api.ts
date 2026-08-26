const BASE = "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type EbookCategory = "geral" | "tecnico" | "comportamental";

export interface EbookSummary {
  id: string;
  title: string;
  theme: string;
  status: "draft" | "generating" | "review" | "ready" | "error";
  page_count: number;
  chapters_done: number;
  chapters_total: number;
  audio_status: "none" | "generating" | "ready" | "error";
  category: EbookCategory;
  version: string;
  created_at: string;
}

export interface Chapter {
  id: string;
  idx: number;
  title: string;
  summary: string;
  content: string;
}

export interface EbookDetail extends EbookSummary {
  subtitle: string;
  intro: string | null;
  conclusion: string | null;
  about_author: string | null;
  current_step: string | null;
  error_message: string | null;
  audio_error: string | null;
  epub_path: string | null;
  generate_cover: boolean;
  cover_suggestion: string;
  cover_source: "ai" | "stock" | "local";
  cover_local_file: string;
  cover_path: string | null;
  generate_images: boolean;
  image_count: number;
  image_suggestion: string;
  images_done: number;
  include_about: boolean;
  author_name: string;
  reference_material: string;
  extra_instructions: string;
  chapters: Chapter[];
  chapter_images: ChapterImageSummary[];
}

export interface ChapterImageSummary {
  id: string;
  chapter_id: string;
  alt_text: string;
  credit: string;
}

export interface RegenerateImagePayload {
  source: "ai" | "stock" | "local";
  suggestion?: string;
  stock_url?: string;
  credit?: string;
  alt_text?: string;
  local_file?: string;
}

export interface LocalCoverFile {
  filename: string;
  sizeBytes: number;
}

export interface MarketingCreative {
  id: string;
  tipo: string;
  objetivo: string;
  headline: string;
  subheadline: string;
  cta: string;
  descricao_visual: string;
}

export interface MarketingStrategy {
  publico_principal: string;
  publico_secundario: string;
  angulo_principal: string;
  dores: string[];
  desejos: string[];
  objecoes: string[];
  criativos: MarketingCreative[];
}

export interface NicheIdea {
  id: string;
  category: string;
  name: string;
  description: string;
}

export interface PexelsPhoto {
  id: number;
  thumbUrl: string;
  previewUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  photographer: string;
  photographerUrl: string;
  alt: string;
}

export interface NewEbookPayload {
  theme: string;
  audience: string;
  tone: string;
  language: string;
  page_count: number;
  words_per_page?: number;
  author_name?: string;
  author_bio?: string;
  include_copyright?: boolean;
  include_about?: boolean;
  title_mode: "ai" | "manual";
  custom_title?: string;
  custom_subtitle?: string;
  generate_cover?: boolean;
  cover_suggestion?: string;
  cover_source?: "ai" | "stock" | "local";
  cover_stock_url?: string;
  cover_credit?: string;
  cover_alt_text?: string;
  cover_local_file?: string;
  generate_images?: boolean;
  image_count?: number;
  image_suggestion?: string;
  image_source?: "ai" | "stock";
  category?: EbookCategory;
  reference_material?: string;
  extra_instructions?: string;
  category_main?: string;
  categories_secondary?: string[];
  audio_requested?: boolean;
}

export const api = {
  me: () => request<{ authenticated: boolean }>("/auth/me"),
  login: (username: string, password: string) =>
    request<{ ok: true }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  listLocalCovers: () => request<LocalCoverFile[]>("/local-covers"),
  uploadLocalCover: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/local-covers`, { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({} as { error?: string }));
      throw new Error(data.error || `Erro ${res.status}`);
    }
    return res.json() as Promise<LocalCoverFile>;
  },
  listIdeias: () => request<NicheIdea[]>("/ideias"),
  searchPexels: (query: string, orientation: "portrait" | "landscape") =>
    request<PexelsPhoto[]>(`/pexels/search?query=${encodeURIComponent(query)}&orientation=${orientation}`),
  listEbooks: () => request<EbookSummary[]>("/ebooks"),
  createEbook: (payload: NewEbookPayload) =>
    request<{ id: string }>("/ebooks", { method: "POST", body: JSON.stringify(payload) }),
  importEbook: async (formData: FormData) => {
    const res = await fetch(`${BASE}/ebooks/import`, { method: "POST", body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({} as { error?: string }));
      throw new Error(data.error || `Erro ${res.status}`);
    }
    return res.json() as Promise<{ id: string }>;
  },
  getEbook: (id: string) => request<EbookDetail>(`/ebooks/${id}`),
  updateEbookContent: (
    id: string,
    payload: {
      title?: string;
      subtitle?: string;
      intro?: string;
      conclusion?: string;
      about_author?: string;
      version?: string;
      chapters?: { id: string; title?: string; content?: string }[];
    }
  ) => request<{ ok: true }>(`/ebooks/${id}/content`, { method: "PUT", body: JSON.stringify(payload) }),
  finalizeEbook: (id: string) => request<{ ok: true }>(`/ebooks/${id}/finalize`, { method: "POST" }),
  generateLayoutPreview: (id: string) =>
    request<{ pageCount: number; clippingIssues: number; overflowIssues: number }>(`/ebooks/${id}/layout-preview`, {
      method: "POST",
    }),
  deleteEbook: (id: string) => request<{ ok: true }>(`/ebooks/${id}`, { method: "DELETE" }),
  startAudiobook: (id: string) => request<{ ok: true }>(`/ebooks/${id}/audiobook`, { method: "POST" }),
  retryEbook: (id: string) => request<{ ok: true }>(`/ebooks/${id}/retry`, { method: "POST" }),
  regenerateCover: (id: string, payload: RegenerateImagePayload) =>
    request<{ ok: true }>(`/ebooks/${id}/cover/regenerate`, { method: "POST", body: JSON.stringify(payload) }),
  regenerateChapterImage: (id: string, imageId: string, payload: RegenerateImagePayload) =>
    request<{ ok: true }>(`/ebooks/${id}/images/${imageId}/regenerate`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  sendFeedback: (id: string, feedback: string) =>
    request<{ ok: true }>(`/ebooks/${id}/feedback`, { method: "POST", body: JSON.stringify({ feedback }) }),
  getMarketingStrategy: (id: string) => request<MarketingStrategy>(`/ebooks/${id}/marketing/strategy`),
  generateMarketingStrategy: (id: string) =>
    request<MarketingStrategy>(`/ebooks/${id}/marketing/strategy`, { method: "POST" }),
  renderMarketingCreative: (id: string, creativeId: string) =>
    request<{ ok: true; creative_id: string; url: string }>(`/ebooks/${id}/marketing/render`, {
      method: "POST",
      body: JSON.stringify({ creative_id: creativeId }),
    }),
  extractReferenceUrl: (url: string) =>
    request<{ title: string; text: string }>("/reference/url", { method: "POST", body: JSON.stringify({ url }) }),
  extractReferencePdf: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/reference/pdf`, { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({} as { error?: string }));
      throw new Error(data.error || `Erro ${res.status}`);
    }
    return res.json() as Promise<{ title: string; text: string }>;
  },
};
