import { createContext, useContext, useState } from 'react';

export const ThemeContext = createContext({ isDark: false, toggle: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('adminTheme') === 'dark');

  const toggle = () => {
    setIsDark((d) => {
      const next = !d;
      localStorage.setItem('adminTheme', next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
