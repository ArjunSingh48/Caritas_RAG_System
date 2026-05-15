import { useTranslation } from "react-i18next";

interface SuggestionChipsProps {
  onSelect: (text: string) => void;
}

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  const { i18n } = useTranslation();
  const map: Record<string, string[]> = {
    en: ["Show trends", "Compare regions", "Find outliers", "Top donors", "Monthly breakdown"],
    de: ["Trends anzeigen", "Regionen vergleichen", "Ausreisser finden", "Top-Spender", "Monatliche Übersicht"],
    fr: ["Afficher les tendances", "Comparer les régions", "Trouver les anomalies", "Meilleurs donateurs", "Répartition mensuelle"],
    it: ["Mostra le tendenze", "Confronta le regioni", "Trova anomalie", "Top donatori", "Riepilogo mensile"],
  };
  const chips = map[i18n.language] ?? map.en;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip}
          onClick={() => onSelect(chip)}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
