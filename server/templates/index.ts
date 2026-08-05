// Definição pura de dados dos templates visuais — sem dependências de Node,
// para poder ser importada tanto pelo servidor (PDF/DOCX) quanto pelo frontend (preview).

export type Decoration = "thin_border" | "left_bar" | "top_bar" | "rules" | "corner_block";

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
  decoration: Decoration;
  uppercaseHeadings: boolean;
  headingScale: number;
}

export const VISUAL_TEMPLATES: VisualTemplate[] = [
  {
    id: "editorial",
    name: "Editorial Clássico",
    description: "Fundo levemente creme, serifada elegante e borda fina — clima de livro impresso tradicional.",
    pageBg: "#faf6ee",
    accent: "#8a5a3b",
    accentSoft: "#efe3d3",
    heading: "#2b2420",
    text: "#3a332d",
    headingFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "Georgia, 'Times New Roman', serif",
    decoration: "thin_border",
    uppercaseHeadings: false,
    headingScale: 1,
  },
  {
    id: "moderno",
    name: "Minimalista Moderno",
    description: "Branco limpo, sans-serif e uma barra lateral de cor — direto ao ponto, foco total no texto.",
    pageBg: "#ffffff",
    accent: "#1f2937",
    accentSoft: "#eef1f5",
    heading: "#111827",
    text: "#1f2937",
    headingFont: "'Segoe UI', Helvetica, Arial, sans-serif",
    bodyFont: "'Segoe UI', Helvetica, Arial, sans-serif",
    decoration: "left_bar",
    uppercaseHeadings: false,
    headingScale: 1.05,
  },
  {
    id: "vibrante",
    name: "Vibrante Criativo",
    description: "Fundo claro com toque de cor, títulos em caixa alta e barra no topo — energia para conteúdo descontraído.",
    pageBg: "#fff7f0",
    accent: "#d9534f",
    accentSoft: "#ffe4d6",
    heading: "#8a2b25",
    text: "#3a2a26",
    headingFont: "'Segoe UI', Helvetica, Arial, sans-serif",
    bodyFont: "'Segoe UI', Helvetica, Arial, sans-serif",
    decoration: "top_bar",
    uppercaseHeadings: true,
    headingScale: 1.1,
  },
  {
    id: "corporativo",
    name: "Corporativo Elegante",
    description: "Cinza claro sofisticado, azul-marinho e bloco de canto — visual sério para negócios e carreira.",
    pageBg: "#f4f5f7",
    accent: "#1e3a5f",
    accentSoft: "#e2e8f0",
    heading: "#152a45",
    text: "#2b3440",
    headingFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "'Segoe UI', Helvetica, Arial, sans-serif",
    decoration: "corner_block",
    uppercaseHeadings: false,
    headingScale: 1,
  },
];

export function getTemplate(id: string): VisualTemplate {
  return VISUAL_TEMPLATES.find((t) => t.id === id) ?? VISUAL_TEMPLATES[0];
}
