import Dashboard from "./views/dashboard/Dashboard";
import Upload from "./views/upload/Upload";
import Profile from "./views/profile/Profile";
import Account from "./views/account/Account";
import Help from "./views/help/Help";
import PrivacyPolicy from "./views/privacy/PrivacyPolicy";
import Terms from "./views/terms/Terms";

const routes = [
  { path: "dashboard", element: <Dashboard /> },
  { path: "upload",    element: <Upload /> },
  { path: "profile",   element: <Profile /> },
  { path: "account",   element: <Account /> },
  { path: "help",      element: <Help /> },
  { path: "privacy",   element: <PrivacyPolicy /> },
  { path: "terms",     element: <Terms /> },
];

export default routes;
