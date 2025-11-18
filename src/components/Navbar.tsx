import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface NavbarProps {
    userEmail: string;
    initialBudget: number;
}

const Navbar: React.FC<NavbarProps> = ({ userEmail, initialBudget }) => {
    const [budget, setBudget] = useState<number>(initialBudget);
    const [currentPath, setCurrentPath] = useState<string>('');
    const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

    useEffect(() => {
        setCurrentPath(window.location.pathname);
    }, []);

    // Actualizar presupuesto cuando cambie
    useEffect(() => {
        setBudget(initialBudget);
    }, [initialBudget]);

    // Escuchar eventos de actualización de presupuesto desde otros componentes
    useEffect(() => {
        const handleBudgetUpdate = (event: CustomEvent<number>) => {
            setBudget(event.detail);
        };

        window.addEventListener('budgetUpdated' as any, handleBudgetUpdate as EventListener);

        return () => {
            window.removeEventListener('budgetUpdated' as any, handleBudgetUpdate as EventListener);
        };
    }, []);

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
        { href: '/my-team', label: 'Mi Equipo', icon: '👥' },
        { href: '/market', label: 'Mercado', icon: '🛒' },
        { href: '/clasificacion', label: 'Clasificación', icon: '📊' },
        { href: '/', label: 'Jugadores NBA', icon: '🏀' },
    ];

    const handleSignOut = async () => {
        try {
            const response = await fetch('/api/auth/signout', {
                method: 'POST',
                credentials: 'include', // Incluir cookies en la petición
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Sesión cerrada:', data.message);
                // Redirigir después de un pequeño delay para asegurar que las cookies se eliminen
                setTimeout(() => {
                    window.location.href = '/signin';
                }, 100);
                return;
            } else {
                console.error('Error en la respuesta de signout:', response.status);
            }
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
        }

        // Fallback: redirigir directamente incluso si hay error
        window.location.href = '/signin';
    };

    return (
        <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-4">
                <div className="flex h-16 items-center justify-between">
                    {/* Logo y navegación */}
                    <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
                        <a href="/dashboard" className="flex items-center gap-1 sm:gap-2 font-bold text-base sm:text-xl text-foreground hover:text-primary transition-colors">
                            <span>🏀</span>
                            <span className="hidden sm:inline">Fantasy NBA</span>
                            <span className="sm:hidden">NBA</span>
                        </a>

                        {/* Navegación desktop */}
                        <div className="hidden lg:flex items-center gap-1">
                            {navItems.map((item) => (
                                <a
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "px-2 xl:px-3 py-2 rounded-md text-xs xl:text-sm font-medium transition-colors",
                                        currentPath === item.href
                                            ? "bg-primary text-primary-foreground"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    )}
                                >
                                    <span className="mr-1 xl:mr-2">{item.icon}</span>
                                    {item.label}
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Información del usuario y presupuesto */}
                    <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                        {/* Presupuesto - Desktop */}
                        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-md border border-primary/20">
                            <span className="text-sm font-medium">💰</span>
                            <span className="text-sm font-semibold">${budget.toLocaleString()}</span>
                        </div>

                        {/* Presupuesto compacto - Tablet */}
                        <div className="hidden sm:flex md:hidden items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md border border-primary/20">
                            <span className="text-xs">💰</span>
                            <span className="text-xs font-semibold">${(budget / 1000).toFixed(0)}k</span>
                        </div>

                        {/* Usuario */}
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className="hidden lg:flex flex-col items-end">
                                <span className="text-sm font-medium text-foreground truncate max-w-[150px]">{userEmail}</span>
                                <span className="text-xs text-muted-foreground">Usuario</span>
                            </div>

                            {/* Avatar */}
                            <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary text-primary-foreground font-semibold text-xs sm:text-sm">
                                {userEmail.charAt(0).toUpperCase()}
                            </div>

                            {/* Botón cerrar sesión - Desktop */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleSignOut}
                                className="hidden lg:flex"
                            >
                                Cerrar sesión
                            </Button>
                        </div>

                        {/* Menú móvil toggle */}
                        <div className="lg:hidden">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="w-8 h-8 sm:w-10 sm:h-10"
                                aria-label="Toggle menu"
                            >
                                {mobileMenuOpen ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Menú móvil */}
                {mobileMenuOpen && (
                    <div className="lg:hidden pb-4 border-t border-border mt-2 pt-4 animate-in slide-in-from-top-2">
                        {/* Información del usuario en móvil */}
                        <div className="flex items-center gap-3 px-3 py-2 mb-3 bg-muted/50 rounded-md">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-semibold text-sm">
                                {userEmail.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{userEmail}</p>
                                <p className="text-xs text-muted-foreground">Usuario</p>
                            </div>
                        </div>

                        {/* Presupuesto en móvil */}
                        <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-primary/10 text-primary rounded-md border border-primary/20 mx-3">
                            <span className="text-sm font-medium">💰</span>
                            <span className="text-sm font-semibold">${budget.toLocaleString()}</span>
                        </div>

                        {/* Navegación móvil */}
                        <div className="flex flex-col gap-1">
                            {navItems.map((item) => (
                                <a
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={cn(
                                        "px-3 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center",
                                        currentPath === item.href
                                            ? "bg-primary text-primary-foreground"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    )}
                                >
                                    <span className="mr-3 text-base">{item.icon}</span>
                                    {item.label}
                                </a>
                            ))}
                        </div>

                        {/* Botón cerrar sesión en móvil */}
                        <div className="mt-3 pt-3 border-t border-border">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setMobileMenuOpen(false);
                                    handleSignOut();
                                }}
                                className="w-full justify-start"
                            >
                                Cerrar sesión
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
};

export default Navbar;

