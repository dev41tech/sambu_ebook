export default function KindleFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="rounded-[2rem] bg-neutral-900 p-4 pb-9 shadow-xl">
        <div className="flex aspect-[3/4] flex-col overflow-hidden rounded-lg bg-[#f7f2e7] px-7 py-8">
          {children}
        </div>
        <div className="mx-auto mt-3.5 h-1.5 w-12 rounded-full bg-neutral-700" />
      </div>
    </div>
  );
}
