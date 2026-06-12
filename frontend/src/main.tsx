import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./styles/tokens.css";
import "./index.css";
import { Library } from "./screens/Library";
import { Workspace } from "./screens/Workspace";

const router = createBrowserRouter([
  { path: "/", element: <Library /> },
  { path: "/c/:id", element: <Workspace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
