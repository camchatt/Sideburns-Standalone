import { BrowserRouter } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import { AppRouter } from "@/app/router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  return (
    <AppProviders>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </TooltipProvider>
    </AppProviders>
  );
}
