import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
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

  const clearLogin = useCallback((): void => {
    setLoginState(null);
    setIsLoggedIn(false);
    setCanEdit(false);
    setCanConfigurePrinter(false);
    setExpiresAt(null);
  }, []);

  useEffect(() => {
    if (expiresAt === null) return;

    // Use the backend deadline; checking on resume also covers suspended PCs.
    const checkExpiration = (): void => {
      if (Date.now() >= expiresAt) clearLogin();
    };
    const timer = window.setTimeout(
      checkExpiration,
      Math.max(0, expiresAt - Date.now()),
    );
    window.addEventListener("focus", checkExpiration);
    document.addEventListener("visibilitychange", checkExpiration);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkExpiration);
      document.removeEventListener("visibilitychange", checkExpiration);
    };
  }, [clearLogin, expiresAt]);

  const setLogin = (
    loginValue: string,
    CanEdit: boolean,
    printerAccess: boolean,
    sessionExpiresAt: number,
  ): void => {
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
