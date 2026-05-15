import { useEffect, useState } from "react";
import { isBackendOnline, invalidateHealth } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

export function BackendStatusBadge() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      invalidateHealth();
      const ok = await isBackendOnline();
      if (mounted) setOnline(ok);
    };
    check();
    const id = setInterval(check, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const label =
    online === null ? "checking…" : online ? "Backend online" : "Mock mode";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground"
      title={
        online
          ? "Connected to FastAPI backend at BACKEND_API_URL"
          : "FastAPI backend unreachable. Using mock pipeline."
      }
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          online === null
            ? "bg-muted-foreground"
            : online
              ? "bg-emerald-500"
              : "bg-amber-500",
        )}
      />
      {label}
    </span>
  );
}
