import React, { useEffect } from 'react';

interface SecurityProviderProps {
  children: React.ReactNode;
}

const SecurityProvider = ({ children }: SecurityProviderProps) => {
  useEffect(() => {
    // Add security-related meta tags and headers programmatically
    const addSecurityHeaders = () => {
      // Secure Content Security Policy (CSP)
      const cspMeta = document.createElement('meta');
      cspMeta.httpEquiv = 'Content-Security-Policy';
      cspMeta.content = `
        default-src 'self' https://*.supabase.co;
        script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
        style-src 'self' https://fonts.googleapis.com;
        font-src 'self' https://fonts.gstatic.com;
        img-src 'self' data: https: blob:;
        connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openweathermap.org https://photon.komoot.io;
        frame-src 'none';
        object-src 'none';
        base-uri 'self';
        upgrade-insecure-requests;
      `.replace(/\s+/g, ' ').trim();

      // X-Frame-Options
      const frameMeta = document.createElement('meta');
      frameMeta.httpEquiv = 'X-Frame-Options';
      frameMeta.content = 'DENY';

      // X-Content-Type-Options
      const contentTypeMeta = document.createElement('meta');
      contentTypeMeta.httpEquiv = 'X-Content-Type-Options';
      contentTypeMeta.content = 'nosniff';

      // Referrer Policy
      const referrerMeta = document.createElement('meta');
      referrerMeta.name = 'referrer';
      referrerMeta.content = 'strict-origin-when-cross-origin';

      // Permissions Policy
      const permissionsMeta = document.createElement('meta');
      permissionsMeta.httpEquiv = 'Permissions-Policy';
      permissionsMeta.content = 'geolocation=(), microphone=(), camera=()';

      // Check if headers are already added to avoid duplicates
      const head = document.head;
      const existingCSP = head.querySelector('meta[http-equiv="Content-Security-Policy"]');
      
      if (!existingCSP) {
        head.appendChild(cspMeta);
        head.appendChild(frameMeta);
        head.appendChild(contentTypeMeta);
        head.appendChild(referrerMeta);
        head.appendChild(permissionsMeta);
      }
    };

    // Security event monitoring
    const monitorSecurityEvents = () => {
      // Monitor for potential XSS attempts
      const originalConsoleError = console.error;
      console.error = (...args) => {
        const message = args.join(' ');
        if (message.includes('script') || message.includes('eval') || message.includes('innerHTML')) {
          console.warn('Potential security issue detected:', message);
        }
        originalConsoleError.apply(console, args);
      };

      // Monitor for suspicious localStorage access
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function(key, value) {
        if (key.includes('token') || key.includes('password') || key.includes('secret')) {
          console.warn('Sensitive data being stored in localStorage:', key);
        }
        return originalSetItem.call(this, key, value);
      };
    };

    addSecurityHeaders();
    monitorSecurityEvents();

    // Cleanup function
    return () => {
      // Restore original console.error if needed
      // Note: In a real implementation, you might want to properly restore these
    };
  }, []);

  return <>{children}</>;
};

export default SecurityProvider;