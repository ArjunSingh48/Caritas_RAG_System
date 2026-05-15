import { FileSpreadsheet, X } from "lucide-react";

interface FilePreviewChipProps {
  file: File;
  onRemove: () => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePreviewChip({ file, onRemove }: FilePreviewChipProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs">
      <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
      <span className="max-w-[160px] truncate font-medium text-foreground">{file.name}</span>
      <span className="text-muted-foreground">{formatSize(file.size)}</span>
      <button
        onClick={onRemove}
        className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Remove file"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
