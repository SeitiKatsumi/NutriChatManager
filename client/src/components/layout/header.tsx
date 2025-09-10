import { useLocation } from "wouter";
import { Star } from "lucide-react";

export default function Header() {
  const [location, setLocation] = useLocation();

  const navItems = [
    { key: "register", path: "/register", label: "Cadastro" },
    { key: "dashboard", path: "/dashboard", label: "Dashboard" },
    { key: "users", path: "/users", label: "Usuários" },
    { key: "whatsapp", path: "/whatsapp", label: "WhatsApp" },
  ];

  const currentPath = location;

  return (
    <header className="bg-card border-b border-border px-6 py-4" data-testid="header-main">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Star className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">NutriChatBot</h1>
            <p className="text-sm text-muted-foreground">Painel de Gestão</p>
          </div>
        </div>
        
        <nav className="hidden md:flex items-center space-x-6">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setLocation(item.path)}
              className={`font-medium hover:text-primary/80 transition-colors ${
                currentPath === item.path || (currentPath === "/" && item.path === "/register")
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`nav-${item.key}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
            <div className="w-4 h-4 bg-muted-foreground rounded-full" />
          </div>
        </div>
      </div>
    </header>
  );
}
