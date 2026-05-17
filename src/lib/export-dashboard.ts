import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";

export async function exportDashboardToPDF(element: HTMLElement, filename = "dashboard.pdf") {
  const tId = toast.loading("Generating PDF…");
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [canvas.width, canvas.height],
    });
    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(filename);
    toast.success("Dashboard downloaded", { id: tId });
  } catch (e) {
    console.error(e);
    toast.error("Failed to export dashboard", { id: tId });
  }
}

export async function exportDashboardToPNG(element: HTMLElement, filename = "dashboard.png") {
  const tId = toast.loading("Generating image…");
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error("Failed to export image", { id: tId });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Image downloaded", { id: tId });
    }, "image/png");
  } catch (e) {
    console.error(e);
    toast.error("Failed to export image", { id: tId });
  }
}

export async function shareDashboard(element: HTMLElement, title = "Dashboard") {
  const shareUrl = window.location.href;
  // Try Web Share with file first (mobile / supported browsers)
  try {
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: "#ffffff", logging: false });
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (blob && navigator.canShare) {
      const file = new File([blob], "dashboard.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title, text: "Dashboard from Caritas AI", files: [file], url: shareUrl });
        return;
      }
    }
    if (navigator.share) {
      await navigator.share({ title, text: "Dashboard from Caritas AI", url: shareUrl });
      return;
    }
  } catch (e) {
    // Fall through to clipboard
  }
  try {
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied to clipboard");
  } catch {
    toast.error("Unable to share — copy the URL manually");
  }
}
