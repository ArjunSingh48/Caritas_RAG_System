import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function exportDashboardToPDF(
  element: HTMLElement,
  filename = "dashboard.pdf",
): Promise<Blob> {
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
  const blob = pdf.output("blob");

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return blob;
}

export async function shareDashboard(
  element: HTMLElement,
  filename = "dashboard.pdf",
): Promise<void> {
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  // Try Web Share API with files
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({
        files: [file],
        title: "Dashboard",
        text: "Sharing dashboard report",
      });
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      // fall through to mailto
    }
  }

  // Fallback: download + open mailto
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  window.location.href = `mailto:?subject=${encodeURIComponent(
    "Dashboard report",
  )}&body=${encodeURIComponent(
    "The dashboard PDF has been downloaded to your device. Please attach it to this email before sending.",
  )}`;
}
