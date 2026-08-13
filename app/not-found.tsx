import Link from "next/link";
import Logo from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="rise mx-auto max-w-md py-16 text-center">
      <Logo size={56} className="mx-auto" />
      <p className="mt-5 font-display text-5xl font-extrabold tracking-tightest text-accent">404</p>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tightest">
        Nothing here
      </h1>
      <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed text-mute">
        That page does not exist. It might have been a league that was deleted, or a
        gameweek that has not happened yet.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/" className="press rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink hover:bg-accent2">
          Back home
        </Link>
        <Link href="/squad" className="press rounded-lg border border-line px-4 py-2 text-sm font-bold text-mute hover:text-white">
          My team
        </Link>
      </div>
    </div>
  );
}
