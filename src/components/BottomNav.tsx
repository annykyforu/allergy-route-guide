import { Link } from "@tanstack/react-router";
import { Map, Route as RouteIcon, CalendarDays } from "lucide-react";

export function BottomNav() {
  const items = [
    { to: "/", label: "Map", Icon: Map },
    { to: "/safe-route", label: "Routes", Icon: RouteIcon },
    { to: "/forecast", label: "Forecast", Icon: CalendarDays },
  ] as const;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {items.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact: to === "/" }}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs font-medium transition-colors hover:text-foreground"
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}