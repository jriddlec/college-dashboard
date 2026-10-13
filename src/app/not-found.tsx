import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="card flex flex-col items-center text-center px-6 py-14">
      <div className="size-10 rounded-full bg-surface-2 grid place-items-center mb-4">
        <Compass className="size-5 text-subtle" />
      </div>
      <p className="text-[15px] font-medium">Not found</p>
      <p className="text-[13px] text-muted mt-1.5">That page or class doesn’t exist in the current data.</p>
      <Link href="/" className="mt-5 text-[13px] font-medium text-accent hover:underline underline-offset-2">
        Back to home
      </Link>
    </div>
  );
}
