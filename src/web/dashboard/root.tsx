/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/web/globals.css"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet, Link, useLocation } from "react-router";
import DashboardIndex from "./pages/index";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/web/components/ui/sidebar";

import { LayoutDashboardIcon, Rows3Icon } from "lucide-react";
import { IconInnerShadowTop } from "@tabler/icons-react";
import { Button } from "@/web/components/ui/button"
import { Separator } from "@/web/components/ui/separator"
import { DashboardQueues } from "./pages/queues";
import { queryClient } from "@/web/trpc/client";

// Dashboard route configuration
const DASHBOARD_ROUTES = [
  {
    name: "Dashboard",
    path: "/",
    icon: LayoutDashboardIcon,
    component: DashboardIndex
  },
  {
    name: "Queues",
    path: "queues",
    icon: Rows3Icon,
    component: DashboardQueues
  }
  // Add more routes here as needed
];

export function SiteHeader() {
  const location = useLocation();

  // Find the current route based on the location
  const currentRoute = DASHBOARD_ROUTES.find(route => {
    const routePath = `/dashboard/${route.path === '/' ? '' : route.path}`;
    return location.pathname === routePath;
  });

  // Fallback to the route name or a default
  const pageTitle = currentRoute?.name || `${process.env.BUN_PUBLIC_APP_NAME} Dashboard`;

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{pageTitle}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" asChild size="sm" className="hidden sm:flex">
            <a
              href="https://github.com/constantan-framework/constantan"
              rel="noopener noreferrer"
              target="_blank"
              className="dark:text-foreground"
            >
              GitHub
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}

// Navigation component that uses DASHBOARD_ROUTES
function DashboardNavigation() {
  const location = useLocation();

  return (
    <SidebarMenu>
      {DASHBOARD_ROUTES.map((route) => {
        const Icon = route.icon;
        const isActive = location.pathname === `/dashboard/${route.path === '/' ? '' : route.path}`;

        return (
          <SidebarMenuItem key={route.path}>
            <SidebarMenuButton
              asChild
              className={isActive ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear" : ""}
            >
              <Link to={`/dashboard/${route.path === '/' ? '' : route.path}`}>
                <Icon className="!size-4" />
                <span>{route.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function DashboardLayout() {
  return <Outlet />;
}

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SidebarProvider
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 72)",
              "--header-height": "calc(var(--spacing) * 12)",
            } as React.CSSProperties
          }
        >
          <Sidebar collapsible="offcanvas" variant="inset">
            <SidebarHeader>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className="data-[slot=sidebar-menu-button]:!p-1.5"
                  >
                    <a href="#">
                      <IconInnerShadowTop className="!size-5" />
                      <span className="text-base font-semibold">{process.env.BUN_PUBLIC_APP_NAME}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
              <DashboardNavigation />
            </SidebarContent>
            <SidebarFooter>
              {/* Add user navigation or other footer content here */}
            </SidebarFooter>
          </Sidebar>
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col p-2">
              <Routes>
                <Route path="/dashboard" element={<DashboardLayout />}>
                  {DASHBOARD_ROUTES.map((route) => {
                    const Component = route.component;
                    return (
                      <Route
                        key={route.path}
                        path={route.path === "/" ? "" : route.path} // Use index route for "/"
                        index={route.path === "/"} // Set index for root route
                        element={<Component />}
                      />
                    );
                  })}
                </Route>
              </Routes>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);



if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  // The hot module reloading API is not available in production.
  createRoot(elem).render(app);
}
