
import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
const ChallengeDetail = React.lazy(() => import("./pages/ChallengeDetail"));
const Profile = React.lazy(() => import("./pages/Profile"));
const Admin = React.lazy(() => import("./pages/Admin"));
const PaymentSuccess = React.lazy(() => import("./pages/PaymentSuccess"));
const PaymentCanceled = React.lazy(() => import("./pages/PaymentCanceled"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const UserProfile = React.lazy(() => import("./pages/UserProfile"));
const OAuthConsent = React.lazy(() => import("./pages/OAuthConsent"));

const AppRoutes = () => (
  <Suspense fallback={<LoadingState message="Loading page..." />}>
    <Routes>
      {/* Default landing → Community while Serena chat is in coming-soon mode */}
      <Route path="/" element={<Navigate to="/community" replace />} />
      <Route path="/app" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/wardrobe" element={<AuthGuard><Wardrobe /></AuthGuard>} />
      
      
      <Route path="/community" element={<Community />} />
      <Route path="/community/challenges/:id" element={<ChallengeDetail />} />
      <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />
      <Route path="/profile/:userId" element={<UserProfile />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/payment-success" element={<AuthGuard><PaymentSuccess /></AuthGuard>} />
      <Route path="/payment-canceled" element={<AuthGuard><PaymentCanceled /></AuthGuard>} />
      <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
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
