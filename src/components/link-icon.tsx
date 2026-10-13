import { BookOpen, Code, FileCheck, Globe, GraduationCap, HardDrive, Landmark, Library, Mail, NotebookPen, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "graduation-cap": GraduationCap,
  landmark: Landmark,
  "file-check": FileCheck,
  mail: Mail,
  "hard-drive": HardDrive,
  github: Code,
  code: Code,
  "notebook-pen": NotebookPen,
  library: Library,
  book: BookOpen,
};

export function LinkIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = (name && ICONS[name]) || Globe;
  return <Icon className={className} strokeWidth={1.8} />;
}
