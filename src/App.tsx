
import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from '@/components/ErrorBoundary';
import QueryProvider from '@/components/QueryProvider';
import SecurityProvider from '@/components/SecurityProvider';
import AuthGuard from '@/components/AuthGuard';
import LoadingState from '@/components/LoadingState';
import NetworkStatusIndicator from '@/components/NetworkStatusIndicator';

// Lazy load pages for better performance
const ComingSoon = React.lazy(() => import("./pages/ComingSoon"));
const Index = React.lazy(() => import("./pages/Index"));
const Auth = React.lazy(() => import("./pages/Auth"));
const Wardrobe = React.lazy(() => import("./pages/Wardrobe"));


const Community = React.lazy(() => import("./pages/Community"));
const Profile = React.lazy(() => import("./pages/Profile"));
const Admin = React.lazy(() => import("./pages/Admin"));
const PaymentSuccess = React.lazy(() => import("./pages/PaymentSuccess"));
const PaymentCanceled = React.lazy(() => import("./pages/PaymentCanceled"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const AppRoutes = () => (
  <Suspense fallback={<LoadingState message="Loading page..." />}>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/wardrobe" element={<AuthGuard><Wardrobe /></AuthGuard>} />
      
      
      <Route path="/community" element={<Community />} />
      <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/payment-success" element={<AuthGuard><PaymentSuccess /></AuthGuard>} />
      <Route path="/payment-canceled" element={<AuthGuard><PaymentCanceled /></AuthGuard>} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
);

const App = () => {
  return (
    <ErrorBoundary>
      <SecurityProvider>
        <QueryProvider>
          <TooltipProvider>
            <NetworkStatusIndicator />
            <Toaster />
            <Sonner />
            <ErrorBoundary>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </ErrorBoundary>
          </TooltipProvider>
        </QueryProvider>
      </SecurityProvider>
    </ErrorBoundary>
  );
};

export default App;
