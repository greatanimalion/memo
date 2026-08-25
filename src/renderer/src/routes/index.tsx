import { createBrowserRouter, RouteObject } from "react-router-dom";
import MainLayout from "@renderer/layouts/MainLayout";
import ChatPage from "@renderer/pages/chat";
import HomePage from "@renderer/pages/home";
import SettingPage from "@renderer/pages/settings";
import MemoPage from "@renderer/pages/memo";
import DiaryPage from "@renderer/pages/diary";
import PersonPage from "@renderer/pages/personPage";
import WebPage from "@renderer/pages/web";
import TextEditorPage from "@renderer/pages/textEditor";

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
