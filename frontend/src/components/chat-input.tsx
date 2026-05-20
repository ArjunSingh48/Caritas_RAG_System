import { useRef, useState } from "react";
import { Mic, Send, Paperclip } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilePreviewChip } from "@/components/file-preview-chip";
import { DataPreviewModal } from "@/components/data-preview-modal";
import { parseFile, type ParsedFile } from "@/lib/parse-file";
import { toast } from "sonner";

interface ChatInputProps {
  onSend: (message: string, parsed?: ParsedFile[]) => void;
}

const ALLOWED_EXT = [".csv", ".xlsx", ".xls"];

export function ChatInput({ onSend }: ChatInputProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previewing, setPreviewing] = useState<ParsedFile | null>(null);
  const [previewQueue, setPreviewQueue] = useState<File[]>([]);
  const [confirmedParsed, setConfirmedParsed] = useState<ParsedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!message.trim() && confirmedParsed.length === 0) return;
    onSend(message, confirmedParsed.length ? confirmedParsed : undefined);
    setMessage("");
    setFiles([]);
    setConfirmedParsed([]);
  };

  const startPreview = async (file: File) => {
    try {
      const parsed = await parseFile(file);
      setPreviewing(parsed);
    } catch {
      toast.error(`Failed to parse ${file.name}`);
    }
  };

  const validateAndQueue = async (selected: FileList | File[]) => {
    const arr = Array.from(selected);
    const ok: File[] = [];
    let rejected = false;
    for (const f of arr) {
      const lower = f.name.toLowerCase();
      if (ALLOWED_EXT.some((ext) => lower.endsWith(ext))) ok.push(f);
      else rejected = true;
    }
    if (rejected) toast.error("Only CSV and Excel files supported");
    if (!ok.length) return;
    setFiles((prev) => [...prev, ...ok]);
    const [first, ...rest] = ok;
    setPreviewQueue((q) => [...q, ...rest]);
    await startPreview(first);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void validateAndQueue(e.target.files);
    e.target.value = "";
  };

  const handlePreviewConfirm = () => {
    if (previewing) setConfirmedParsed((arr) => [...arr, previewing]);
    setPreviewing(null);
    setPreviewQueue((q) => {
      if (q.length === 0) return q;
      const [next, ...rest] = q;
      void startPreview(next);
      return rest;
    });
  };

  const handlePreviewReplace = () => {
    const replacingName = previewing?.name;
    setPreviewing(null);
    if (replacingName) {
      setFiles((prev) => prev.filter((f) => f.name !== replacingName));
    }
    fileInputRef.current?.click();
  };

  const handlePreviewCancel = () => {
    setPreviewing(null);
    setPreviewQueue([]);
    setFiles([]);
  };

  const handleVoice = () => toast.info("Voice input coming soon");

  return (
    <>
      <div className="space-y-2">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((file, i) => (
              <FilePreviewChip
                key={`${file.name}-${i}`}
                file={file}
                onRemove={() => {
                  setFiles((prev) => prev.filter((_, idx) => idx !== i));
                  setConfirmedParsed((prev) => prev.filter((p) => p.name !== file.name));
                }}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            className="h-9 w-9 shrink-0 rounded-xl"
            aria-label="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={handleVoice}
            className="h-9 w-9 shrink-0 rounded-xl"
            aria-label="Voice input"
          >
            <Mic className="h-4 w-4" />
          </Button>

          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={t("chat.placeholder")}
            className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />

          <Button
            onClick={handleSend}
            disabled={!message.trim() && confirmedParsed.length === 0}
            className="shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Send className="mr-1 h-4 w-4" />
            {t("chat.send")}
          </Button>
        </div>
      </div>

      <DataPreviewModal
        open={!!previewing}
        parsed={previewing}
        onConfirm={handlePreviewConfirm}
        onReplace={handlePreviewReplace}
        onCancel={handlePreviewCancel}
      />
    </>
  );
}
