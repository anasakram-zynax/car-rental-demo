import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";

interface RoutePlaceholderProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function RoutePlaceholder({
  description,
  eyebrow,
  title,
}: RoutePlaceholderProps) {
  return (
    <PageContainer className="py-10 sm:py-16">
      <Card className="max-w-2xl" variant="glass" padding="lg">
        <Badge variant="accent">{eyebrow}</Badge>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-xl leading-7 text-muted">{description}</p>
      </Card>
    </PageContainer>
  );
}
