import Link from "next/link";
import { useTranslations } from "next-intl";

export function AppFooter() {
  const t = useTranslations("Footer");
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-background border-t border-sidebar-border">
      <div className="container flex justify-between items-center p-4 md:px-6">
        <p className="text-xs text-muted-foreground md:text-sm">
          © {currentYear}{" "}
          <Link
            href="/"
            className="text-foreground font-medium hover:underline inline"
          >
            TravelsOTA
          </Link>
          . {t("allRightsReserved")}.
        </p>
        <p className="text-xs text-muted-foreground md:text-sm">
          {t("adminTagline")}
        </p>
      </div>
    </footer>
  );
}
