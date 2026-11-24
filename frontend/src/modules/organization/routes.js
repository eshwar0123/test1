import Dashboard from "./views/dashboard/Dashboard";
import Upload from "./views/upload/Upload";
import Analytics from "./views/analytics/Analytics";
import Profile from "./views/profile/Profile";
import Account from "./views/account/Account";
import Help from "./views/help/Help";
import PrivacyPolicy from "./views/privacy/PrivacyPolicy";
import Terms from "./views/terms/Terms";
import Payment from "./views/payment/Payment";
import BalanceTab from "./views/payment/BalanceTab";
import AddMoneyTab from "./views/payment/AddMoneyTab";

const routes = [
  { path: "dashboard", element: <Dashboard /> },
  { path: "upload",    element: <Upload /> },
  { path: "insights",  element: <Analytics /> },
  { path: "profile",   element: <Profile /> },
  { path: "account",   element: <Account /> },
  { path: "help",      element: <Help /> },
  { path: "privacy",   element: <PrivacyPolicy /> },
  { path: "terms",     element: <Terms /> },
  {
    path: "payment",
    element: <Payment />,
    children: [
      { index: true, element: <BalanceTab /> },
      { path: "add", element: <AddMoneyTab /> },
    ],
  },
];

export default routes;
