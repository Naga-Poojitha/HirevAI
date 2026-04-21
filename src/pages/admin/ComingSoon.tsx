import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

interface Props {
  title: string;
  description?: string;
}

const ComingSoon = ({ title, description }: Props) => (
  <div className="container py-16 max-w-2xl">
    <Card className="p-10 glass text-center">
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {description ?? "This view is being polished and will ship in the next iteration."}
      </p>
    </Card>
  </div>
);

export default ComingSoon;
