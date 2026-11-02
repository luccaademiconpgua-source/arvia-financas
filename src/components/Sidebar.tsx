import { NavLink } from "react-router";
import { Settings } from "lucide-react";
import { sidebarGroups } from "./nav";
import { useAuth } from "../store/auth";

export function Sidebar() {
  const name = useAuth((s) => s.profile?.name ?? "");
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[260px] flex-col bg-brand-dark p-6 text-white lg:flex" aria-label="Menu principal">
      <p className="font-display mb-8 text-2xl font-semibold">Arvia</p>
      <nav className="flex flex-1 flex-col gap-6">
        {sidebarGroups.map((g) => (
          <div key={g.title} className="flex flex-col gap-1">
            <p className="mb-1 px-3 text-xs font-medium text-white/60">{g.title}</p>
            {g.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${
                    isActive ? "bg-white/15 font-medium" : "text-white/85 hover:bg-white/10"
                  }`
                }
              >
                <item.icon size={20} aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-3 border-t border-white/15 pt-4">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-white/15 text-sm font-semibold uppercase">
          {name.trim().slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <NavLink to="/ajustes" className="flex min-h-11 items-center gap-1 text-xs text-white/70 hover:text-white">
            <Settings size={16} aria-hidden="true" />
            Ajustes
          </NavLink>
        </div>
      </div>
    </aside>
  );
}
