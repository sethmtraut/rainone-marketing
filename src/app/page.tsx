import Link from "next/link";
import SignOutButton from "./SignOutButton";

export const dynamic = "force-dynamic";

const TOOLS = [
  {
    href: "/new-homeowner-addresses",
    icon: "🏠",
    name: "New Homeowner Address Tool",
    desc: "Turn a prospect address list into a clean direct-mail list — removes existing ServiceTitan customers and anyone already mailed, and outputs a dated Excel sheet each run.",
  },
];

export default function MarketingHub() {
  return (
    <div className="min-h-screen">
      <header className="mk-header px-8 py-7 text-white">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-4">
          <div>
            <div className="mk-tag text-amber-100">
              <span className="mk-tag-dot bg-amber-200" />
              RAIN ONE
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Marketing Tools</h1>
            <p className="mt-1 text-sm text-white/85">
              Tools for building and running Rain One marketing campaigns.
            </p>
          </div>
          <SignOutButton className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/20" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-8">
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="card flex flex-col p-5 transition-all hover:shadow-lg"
              style={{ borderColor: "#f0c560" }}
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-2xl">
                {t.icon}
              </div>
              <h3 className="mb-1 text-lg font-bold tracking-tight text-zinc-900">{t.name}</h3>
              <p className="mb-4 grow text-sm leading-relaxed text-zinc-600">{t.desc}</p>
              <span className="btn btn-primary w-full justify-center">Open</span>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-xs text-zinc-400">
          More marketing tools will appear here as they&apos;re built.
        </p>
      </main>
    </div>
  );
}
