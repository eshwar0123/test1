import Dashboard from "./views/dashboard/Dashboard";
import Organizations from "./views/organizations/Organizations";
import Radiologists from "./views/radiologists/Radiologists";

const routes = [
  { path: "dashboard",     element: Dashboard },
  { path: "organizations", element: Organizations },
  { path: "radiologists",  element: Radiologists },
];

export default routes;
