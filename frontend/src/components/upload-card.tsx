import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UploadCardProps {
  onUploadComplete?: (file: File) => void;
}

export function UploadCard({ onUploadComplete }: UploadCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; rows: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setUploading(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setUploading(false);
          setUploadedFile({ name: file.name, rows: Math.floor(Math.random() * 2000) + 500 });
          onUploadComplete?.(file);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <Card
      className={cn(
        "mx-auto max-w-md border-2 border-dashed transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-border",
        uploadedFile && "border-success bg-success/5"
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.tsv"
          className="hidden"
          onChange={handleFileSelect}
        />
        {uploadedFile ? (
          <>
            <CheckCircle2 className="mb-3 h-12 w-12 text-success" />
            <h3 className="text-lg font-semibold text-foreground">Upload Complete</h3>
            <p className="mt-1 text-sm text-muted-foreground">{uploadedFile.name} • {uploadedFile.rows.toLocaleString()} rows</p>
          </>
        ) : uploading ? (
          <>
            <FileSpreadsheet className="mb-3 h-12 w-12 text-primary animate-pulse" />
            <h3 className="text-lg font-semibold text-foreground">Uploading…</h3>
            <Progress value={progress} className="mt-3 w-48" />
            <p className="mt-2 text-xs text-muted-foreground">{progress}% complete</p>
          </>
        ) : (
          <>
            <Upload className="mb-3 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground">Upload your dataset</h3>
            <p className="mt-1 text-sm text-muted-foreground">CSV, Excel, TSV supported</p>
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Choose File
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">or drag and drop</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
