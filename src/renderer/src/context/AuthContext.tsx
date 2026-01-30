import { createContext, useState, ReactNode, useContext } from 'react'

interface AuthContextType {
  isLoggedIn: boolean
  login: string | null
  CanEdit: boolean
  setLogin: (login: string, CanEdit: boolean) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [login, setLoginState] = useState<string | null>(null)
  const [CanEdit, setCanEdit] = useState<boolean>(false)

  const setLogin = (loginValue: string, CanEdit: boolean) => {
    setLoginState(loginValue)
    setCanEdit(CanEdit)
    setIsLoggedIn(true)
  }

  const logout = (): void => {
    setLoginState(null)
    setIsLoggedIn(false)
    setCanEdit(false)
  }

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, CanEdit, setLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
