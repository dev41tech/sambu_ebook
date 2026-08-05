export default function KindleFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="rounded-[1.75rem] bg-neutral-900 p-3 pb-7 shadow-xl">
        <div className="flex aspect-[3/4] flex-col overflow-hidden rounded-md bg-[#f7f2e7] px-5 py-6">
          {children}
        </div>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-neutral-700" />
      </div>
    </div>
  );
}
