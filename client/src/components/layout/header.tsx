import { useState } from "react";
import { useLocation } from "wouter";
import { Star, Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export default function Header() {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { key: "dashboard", path: "/dashboard", label: "Dashboard" },
    { key: "patients", path: "/patients", label: "Pacientes" },
    { key: "whatsapp", path: "/whatsapp", label: "WhatsApp" },
  ];

  const currentPath = location;

  const handleNavigation = (path: string) => {
    setLocation(path);
    setMobileMenuOpen(false); // Close mobile menu after navigation
  };

  return (
    <header className="bg-card border-b border-border px-4 md:px-6 py-4" data-testid="header-main">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Star className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-foreground">NutriChatBot</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Painel de Gestão</p>
          </div>
        </div>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-6">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => handleNavigation(item.path)}
              className={`font-medium hover:text-primary/80 transition-colors ${
                currentPath === item.path || (currentPath === "/" && item.path === "/dashboard")
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
          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="md:hidden p-2"
                data-testid="mobile-menu-trigger"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 p-0" data-testid="mobile-menu-content">
              <div className="flex flex-col h-full">
                <div className="p-4 border-b border-border">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                      <Star className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">NutriChatBot</h2>
                      <p className="text-sm text-muted-foreground">Painel de Gestão</p>
                    </div>
                  </div>
                </div>
                <nav className="flex-1 p-4">
                  <div className="space-y-2">
                    {navItems.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => handleNavigation(item.path)}
                        className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${
                          currentPath === item.path || (currentPath === "/" && item.path === "/dashboard")
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                        data-testid={`mobile-nav-${item.key}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </nav>
              </div>
            </SheetContent>
          </Sheet>

          {/* User Avatar */}
          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
            <div className="w-4 h-4 bg-muted-foreground rounded-full" />
          </div>
        </div>
      </div>
    </header>
  );
}
