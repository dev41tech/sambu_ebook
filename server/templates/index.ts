// Definição pura de dados dos templates visuais — sem dependências de Node,
// para poder ser importada tanto pelo servidor (PDF/DOCX) quanto pelo frontend (preview).

export type Decoration =
  | "thin_border"
  | "left_bar"
  | "top_bar"
  | "rules"
  | "corner_block"
  | "bottom_bar"
  | "brackets"
  | "double_rule";

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
  {
    id: "diario",
    name: "Diário de Viagem",
    description: "Papel kraft, tons terrosos e linhas de caderno — clima artesanal de diário ou relato pessoal.",
    pageBg: "#f3e9d8",
    accent: "#b5651d",
    accentSoft: "#e8d5b8",
    heading: "#4a2e18",
    text: "#3f2f22",
    headingFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "Georgia, 'Times New Roman', serif",
    decoration: "rules",
    uppercaseHeadings: false,
    headingScale: 1.05,
  },
  {
    id: "nordico",
    name: "Nórdico Escandinavo",
    description: "Fundo claro e arejado, verde-sálvia suave e linhas finas — minimalismo calmo e respirável.",
    pageBg: "#f7f9f7",
    accent: "#5b7a6e",
    accentSoft: "#e6ece9",
    heading: "#2f3b36",
    text: "#3a4642",
    headingFont: "'Segoe UI', Helvetica, Arial, sans-serif",
    bodyFont: "'Segoe UI', Helvetica, Arial, sans-serif",
    decoration: "bottom_bar",
    uppercaseHeadings: false,
    headingScale: 0.95,
  },
  {
    id: "noturno",
    name: "Noturno Sofisticado",
    description: "Fundo escuro elegante com dourado de destaque — visual premium para conteúdo mais denso ou exclusivo.",
    pageBg: "#1c1e22",
    accent: "#c9a227",
    accentSoft: "#2a2d33",
    heading: "#f5f1e6",
    text: "#d8d3c4",
    headingFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "Georgia, 'Times New Roman', serif",
    decoration: "brackets",
    uppercaseHeadings: true,
    headingScale: 1.05,
  },
  {
    id: "botanico",
    name: "Botânico Orgânico",
    description: "Verde-folha suave e traços naturais — ideal para bem-estar, saúde e temas de estilo de vida.",
    pageBg: "#f4f7f0",
    accent: "#4f7942",
    accentSoft: "#e2ecd9",
    heading: "#2e4a24",
    text: "#33402c",
    headingFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "'Segoe UI', Helvetica, Arial, sans-serif",
    decoration: "double_rule",
    uppercaseHeadings: false,
    headingScale: 1,
  },
  {
    id: "retro",
    name: "Retrô Editorial",
    description: "Laranja queimado, títulos grandes em caixa alta — energia de revista de banca vintage.",
    pageBg: "#fff3e2",
    accent: "#e0552b",
    accentSoft: "#ffe0c2",
    heading: "#7a2e12",
    text: "#4a2f22",
    headingFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "'Segoe UI', Helvetica, Arial, sans-serif",
    decoration: "rules",
    uppercaseHeadings: true,
    headingScale: 1.15,
  },
];

export function getTemplate(id: string): VisualTemplate {
  return VISUAL_TEMPLATES.find((t) => t.id === id) ?? VISUAL_TEMPLATES[0];
}
