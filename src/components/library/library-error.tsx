import { FolderX } from "lucide-react";
import { EmptyState } from "../ui";

export function LibraryError({ error }: { error: string }) {
  return (
    <div className="card mt-2">
      <EmptyState icon={FolderX} title="The study library isn’t available">
        <p>The app couldn’t read its library folder (LIBRARY_DIR).</p>
        <p className="mt-1 font-mono text-[11.5px] text-subtle break-all">{error}</p>
      </EmptyState>
    </div>
  );
}
