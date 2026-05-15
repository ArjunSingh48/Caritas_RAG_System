import { Bot, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AIInsightsPanel() {
  return (
    <Card className="shadow-sm border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <div className="flex gap-2">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            <strong className="text-foreground">Strong growth in Bern:</strong> Donations increased 18% year-over-year,
            the highest growth rate across all regions. This aligns with the new community engagement program launched in Q2.
          </p>
        </div>
        <div className="flex gap-2">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            <strong className="text-foreground">Seasonal pattern detected:</strong> Individual donations peak in November-December,
            accounting for 35% of annual individual contributions. Consider targeted campaigns during this period.
          </p>
        </div>
        <div className="flex gap-2">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            <strong className="text-foreground">Ticino decline:</strong> The 3% decline in Ticino is primarily driven by
            reduced corporate giving in Q3. Recommend outreach to key corporate donors in the region.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
