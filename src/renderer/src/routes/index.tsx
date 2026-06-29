import { createBrowserRouter, RouteObject } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import ChatPage from "../pages/chat";
import HomePage from "../pages/home";
import SettingPage from "../pages/settings";
import MemoPage from "../pages/memo";
import DiaryPage from "../pages/diary";
import PersonPage from "../pages/personPage";
import WebPage from "../pages/web";
import TextEditorPage from "../pages/textEditor";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "chat", element: <ChatPage /> },
      { path: "home", element: <HomePage /> },
      { path: "memo", element: <MemoPage /> },
      { path: "settings", element: <SettingPage /> },
      { path: "diary", element: <DiaryPage /> },
      { path: "person", element: <PersonPage /> },
      { path: "web", element: <WebPage /> },
      { path: "textEditor", element: <TextEditorPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
