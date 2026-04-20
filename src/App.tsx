import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Track from "./pages/Track";
import Shipping from "./pages/Shipping";
import Admin from "./pages/Admin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminRmaList from "./pages/AdminRmaList";
import AdminSettings from "./pages/AdminSettings";
import AdminCsvImport from "./pages/AdminCsvImport";
import AdminLogistics from "./pages/AdminLogistics";
import AdminEmailKnowledge from "./pages/AdminEmailKnowledge";
import RmaConfirmation from "./pages/RmaConfirmation";
import RmaMultiConfirmation from "./pages/RmaMultiConfirmation";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/rma-confirmation" element={<RmaConfirmation />} />
            <Route path="/rma-multi-confirmation" element={<RmaMultiConfirmation />} />
            <Route path="/track" element={<Track />} />
            <Route path="/shipping" element={<Shipping />} />
            <Route path="/admin" element={<Admin />} />
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/rma-list"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminRmaList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/csv-import"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminCsvImport />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/logistics"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminLogistics />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
