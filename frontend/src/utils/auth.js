export const getAuth = () => {
  try {
    return JSON.parse(localStorage.getItem("auth")) || null;
  } catch {
    return null;
  }
};

export const isLoggedIn = () => {
  const auth = getAuth();
  return !!(auth && auth.token);
};

export const getRole = () => {
  const auth = getAuth();
  return auth?.role || null;
};

export const logout = () => {
  localStorage.removeItem("auth");
};
