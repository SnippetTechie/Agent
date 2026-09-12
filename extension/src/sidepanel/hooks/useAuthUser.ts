import { useCallback, useEffect, useState } from "react";
import { loadLocalState, saveLocalState } from "../lib/storage.js";

const SUPABASE_URL = "https://zmnbhuyqncjhwdkgsgxf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_u9Je3QkUZFEvYhjAavfyEg_7eSzkgSd";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  provider: "google" | "guest";
  bucketName: string;
  accessToken?: string;
}

const AUTH_USER_KEY = "varma.auth.user.v1";

export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const redirectUrl = typeof chrome !== "undefined" && chrome.identity?.getRedirectURL
    ? chrome.identity.getRedirectURL()
    : "https://your-extension-id.chromiumapp.org/";

  useEffect(() => {
    let cancelled = false;
    loadLocalState<AuthUser>(AUTH_USER_KEY)
      .then((saved) => {
        if (!cancelled && saved && saved.email) {
          setUser(saved);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loginWithGoogle = useCallback(async (customEmail?: string, customName?: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      // 1. Try real Supabase Google OAuth via chrome.identity.launchWebAuthFlow
      if (!customEmail && typeof chrome !== "undefined" && chrome.identity?.launchWebAuthFlow) {
        const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;

        let responseUrl: string | undefined;
        try {
          responseUrl = await chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true,
          });
        } catch (flowErr: any) {
          const msg = flowErr?.message || String(flowErr);
          if (msg.includes("canceled") || msg.includes("cancelled")) {
            setAuthError("Sign-in cancelled by user.");
            return null;
          }
          console.warn("[supabase-auth] launchWebAuthFlow error:", msg);
          setAuthError(`OAuth flow error: ${msg}. Make sure Google is enabled in Supabase Dashboard.`);
        }

        if (responseUrl) {
          // Supabase returns tokens in the URL hash fragment: #access_token=...&refresh_token=...
          const fragment = responseUrl.split("#")[1] || responseUrl.split("?")[1] || "";
          const params = new URLSearchParams(fragment);

          const errDesc = params.get("error_description") || params.get("error");
          if (errDesc) {
            const cleanErr = decodeURIComponent(errDesc.replace(/\+/g, " "));
            setAuthError(cleanErr);
            console.error("[supabase-auth] OAuth redirect error:", cleanErr);
            return null;
          }

          const accessToken = params.get("access_token");
          if (accessToken) {
            let email = "";
            let fullName = "";
            let avatar = "";
            let userId = "";

            try {
              // Try to fetch authenticated user profile from Supabase
              const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  apikey: SUPABASE_ANON_KEY,
                },
              });

              if (userRes.ok) {
                const data = await userRes.json();
                userId = data.id || "";
                email = data.email || "";
                fullName = data.user_metadata?.full_name || data.user_metadata?.name || email.split("@")[0] || "User";
                avatar = data.user_metadata?.avatar_url || data.user_metadata?.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${data.id}`;
              }
            } catch (userErr) {
              console.warn("[supabase-auth] Failed to fetch /auth/v1/user, attempting JWT decode fallback:", userErr);
            }

            // Fallback: parse JWT payload directly if fetch failed or returned empty
            if (!userId && accessToken.includes(".")) {
              try {
                const parts = accessToken.split(".");
                if (parts[1]) {
                  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                  const parsed = JSON.parse(atob(normalized));
                  userId = parsed.sub || `usr_${Date.now()}`;
                  email = parsed.email || "";
                  fullName = parsed.user_metadata?.full_name || parsed.user_metadata?.name || email.split("@")[0] || "Google User";
                  avatar = parsed.user_metadata?.avatar_url || parsed.user_metadata?.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`;
                }
              } catch (jwtErr) {
                console.warn("[supabase-auth] Failed to decode JWT payload:", jwtErr);
              }
            }

            if (userId || email) {
              const authUser: AuthUser = {
                id: userId || `usr_${Date.now()}`,
                email: email || "user@gmail.com",
                name: fullName || "Google User",
                avatarUrl: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
                provider: "google",
                bucketName: "redacted-screens",
                accessToken,
              };

              setUser(authUser);
              await saveLocalState(AUTH_USER_KEY, authUser);
              return authUser;
            }
          }
        }
      }

      // 2. Direct fallback login if custom email provided
      if (customEmail) {
        const email = customEmail.trim().toLowerCase();
        const rawName = email.split("@")[0] || "vispl";
        const name = customName || rawName.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const cleanId = email.replace(/[^a-zA-Z0-9]/g, "_");

        const authUser: AuthUser = {
          id: `usr_${cleanId}`,
          email,
          name,
          avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanId}`,
          provider: "google",
          bucketName: "redacted-screens",
        };

        setUser(authUser);
        await saveLocalState(AUTH_USER_KEY, authUser);
        return authUser;
      }

      return null;
    } finally {
      setLoading(false);
    }
  }, [redirectUrl]);

  const logout = useCallback(async () => {
    setUser(null);
    await saveLocalState(AUTH_USER_KEY, null);
  }, []);

  return {
    user,
    isAuthenticated: Boolean(user && user.email),
    loading,
    authError,
    clearError: () => setAuthError(null),
    redirectUrl,
    loginWithGoogle,
    logout,
  };
}
