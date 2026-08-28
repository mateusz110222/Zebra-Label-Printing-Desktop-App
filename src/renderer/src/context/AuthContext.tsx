import React, { createContext, ReactNode, useContext, useState } from "react";

interface AuthContextType {
  isLoggedIn: boolean;
  login: string | null;
  CanEdit: boolean;
  canConfigurePrinter: boolean;
  setLogin: (
    login: string,
    CanEdit: boolean,
    canConfigurePrinter: boolean,
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

  const setLogin = (
    loginValue: string,
    CanEdit: boolean,
    printerAccess: boolean,
  ): void => {
    setLoginState(loginValue);
    setCanEdit(CanEdit);
    setCanConfigurePrinter(printerAccess);
    setIsLoggedIn(true);
  };

  const logout = (): void => {
    void window.api.Logout();
    setLoginState(null);
    setIsLoggedIn(false);
    setCanEdit(false);
    setCanConfigurePrinter(false);
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
