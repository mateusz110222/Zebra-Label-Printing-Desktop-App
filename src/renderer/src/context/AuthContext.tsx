import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface AuthContextType {
  isLoggedIn: boolean;
  login: string | null;
  CanEdit: boolean;
  canConfigurePrinter: boolean;
  setLogin: (
    login: string,
    CanEdit: boolean,
    canConfigurePrinter: boolean,
    expiresAt: number,
  ) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [login, setLoginState] = useState<string | null>(null);
  const [CanEdit, setCanEdit] = useState<boolean>(false);
  const [canConfigurePrinter, setCanConfigurePrinter] =
    useState<boolean>(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const sessionVersion = useRef(0);

  const clearLogin = useCallback((): void => {
    sessionVersion.current++;
    setLoginState(null);
    setIsLoggedIn(false);
    setCanEdit(false);
    setCanConfigurePrinter(false);
    setExpiresAt(null);
  }, []);

  const syncSession = useCallback(async (): Promise<void> => {
    const version = sessionVersion.current;
    const active = await window.api.HasActiveSession().catch(() => undefined);
    if (active === false && version === sessionVersion.current) clearLogin();
  }, [clearLogin]);

  useEffect(() => {
    if (expiresAt === null) return;

    const unsubscribe = window.api.OnSessionExpired((expiredDeadline) => {
      if (expiredDeadline === expiresAt) clearLogin();
    });
    const checkSession = (): void => {
      if (document.visibilityState === "visible") void syncSession();
    };
    void syncSession();
    window.addEventListener("focus", checkSession);
    document.addEventListener("visibilitychange", checkSession);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", checkSession);
      document.removeEventListener("visibilitychange", checkSession);
    };
  }, [clearLogin, expiresAt, syncSession]);

  const setLogin = (
    loginValue: string,
    CanEdit: boolean,
    printerAccess: boolean,
    sessionExpiresAt: number,
  ): void => {
    sessionVersion.current++;
    setLoginState(loginValue);
    setCanEdit(CanEdit);
    setCanConfigurePrinter(printerAccess);
    setIsLoggedIn(true);
    setExpiresAt(sessionExpiresAt);
  };

  const logout = (): void => {
    void window.api.Logout();
    clearLogin();
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        login,
        CanEdit,
        canConfigurePrinter,
        setLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
