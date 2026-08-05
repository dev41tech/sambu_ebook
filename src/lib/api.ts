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

export interface VisualTemplate {
  id: string;
  name: string;
  description: string;
  pageBg: string;
  accent: string;
  accentSoft: string;
  heading: string;
  text: string;
  headingFont: string;
  bodyFont: string;
  decoration: string;
  uppercaseHeadings: boolean;
  headingScale: number;
}

export type EbookCategory = "geral" | "tecnico" | "comportamental";

export interface EbookSummary {
  id: string;
  title: string;
  theme: string;
  status: "draft" | "generating" | "ready" | "error";
  page_count: number;
  chapters_done: number;
  chapters_total: number;
  template: string;
  audio_status: "none" | "generating" | "ready" | "error";
  category: EbookCategory;
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
  generate_cover: number;
  cover_suggestion: string;
  cover_path: string | null;
  generate_images: number;
  image_count: number;
  image_suggestion: string;
  images_done: number;
  include_about: number;
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
  source: "ai" | "stock";
  suggestion?: string;
  stock_url?: string;
  credit?: string;
  alt_text?: string;
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
  template: string;
  page_count: number;
  author_name?: string;
  author_bio?: string;
  include_copyright?: boolean;
  include_about?: boolean;
  title_mode: "ai" | "manual";
  custom_title?: string;
  custom_subtitle?: string;
  generate_cover?: boolean;
  cover_suggestion?: string;
  cover_source?: "ai" | "stock";
  cover_stock_url?: string;
  cover_credit?: string;
  cover_alt_text?: string;
  generate_images?: boolean;
  image_count?: number;
  image_suggestion?: string;
  image_source?: "ai" | "stock";
  category?: EbookCategory;
  reference_material?: string;
  extra_instructions?: string;
}

export const api = {
  me: () => request<{ authenticated: boolean }>("/auth/me"),
  login: (username: string, password: string) =>
    request<{ ok: true }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  templates: () => request<VisualTemplate[]>("/ebooks/templates"),
  listIdeias: () => request<NicheIdea[]>("/ideias"),
  searchPexels: (query: string, orientation: "portrait" | "landscape") =>
    request<PexelsPhoto[]>(`/pexels/search?query=${encodeURIComponent(query)}&orientation=${orientation}`),
  listEbooks: () => request<EbookSummary[]>("/ebooks"),
  createEbook: (payload: NewEbookPayload) =>
    request<{ id: string }>("/ebooks", { method: "POST", body: JSON.stringify(payload) }),
  getEbook: (id: string) => request<EbookDetail>(`/ebooks/${id}`),
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
