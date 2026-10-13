import React, { createContext, useContext, useEffect, useState } from "react";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load auth on refresh
  useEffect(() => {
    const stored = localStorage.getItem("auth");

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
      } catch {
        localStorage.removeItem("auth");
      }
    }

    setLoading(false);
  }, []);

  // LOGIN
  const login = (authData) => {
    localStorage.setItem("auth", JSON.stringify(authData));
    setUser(authData);
  };

  // LOGOUT
  const logout = () => {
    localStorage.removeItem("auth");
    setUser(null);
  };

  return (
    <UserContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
