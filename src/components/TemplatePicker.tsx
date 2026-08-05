import type { VisualTemplate } from "../lib/api";

function MiniPreview({ t }: { t: VisualTemplate }) {
  return (
    <div
      className="relative aspect-[3/4] w-full overflow-hidden rounded-md border"
      style={{ background: t.pageBg, borderColor: t.accent }}
    >
      {t.decoration === "thin_border" && (
        <span className="pointer-events-none absolute inset-1 rounded-sm" style={{ border: `1px solid ${t.accent}` }} />
      )}
      {t.decoration === "left_bar" && (
        <span className="pointer-events-none absolute inset-y-0 left-0 w-2" style={{ background: t.accent }} />
      )}
      {t.decoration === "top_bar" && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-2" style={{ background: t.accent }} />
      )}
      {t.decoration === "rules" && (
        <>
          <span className="pointer-events-none absolute inset-x-2 top-2 h-px" style={{ background: t.accent }} />
          <span className="pointer-events-none absolute inset-x-2 bottom-2 h-px" style={{ background: t.accent }} />
        </>
      )}
      {t.decoration === "corner_block" && (
        <span className="pointer-events-none absolute left-0 top-0 h-2 w-3/5" style={{ background: t.accent }} />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
        <span
          className="text-[9px] font-bold"
          style={{
            color: t.heading,
            fontFamily: t.headingFont,
            textTransform: t.uppercaseHeadings ? "uppercase" : "none",
          }}
        >
          Título do Ebook
        </span>
        <span className="h-0.5 w-6" style={{ background: t.accent }} />
        <span className="text-[6px]" style={{ color: t.text, fontFamily: t.bodyFont }}>
          Subtítulo de exemplo
        </span>
      </div>
    </div>
  );
}

export default function TemplatePicker({
  templates,
  value,
  onChange,
}: {
  templates: VisualTemplate[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {templates.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`rounded-lg border p-2 text-left transition ${
              selected ? "border-amber-700 ring-2 ring-amber-700/30" : "border-neutral-200 hover:border-amber-400"
            }`}
          >
            <MiniPreview t={t} />
            <p className="mt-2 text-xs font-semibold">{t.name}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{t.description}</p>
          </button>
        );
      })}
    </div>
  );
}
