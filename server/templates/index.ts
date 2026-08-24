// Layout único de livro do Sambu Ebooks — sem seleção de "templates" visuais.
// Existiam 9 templates coloridos antes; foram eliminados porque diluíam a garantia de
// qualidade de diagramação entre combinações. Agora há só este layout, testado e estável.
// A única variação estrutural que sobrevive é funcional (não estética): ebooks da
// categoria "tecnico" usam um layout mais sóbrio/plano (ver BookStyle.plainInformative
// em server/lib/pdf.ts), o resto usa o layout literário com capitulares.

export type Decoration = "thin_border";

export interface BookTemplate {
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

export const BOOK_TEMPLATE: BookTemplate = {
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
};
