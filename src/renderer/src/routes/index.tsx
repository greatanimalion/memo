import { createBrowserRouter, RouteObject } from "react-router-dom";
import MainLayout from "@renderer/layouts/MainLayout";
import ChatPage from "@renderer/pages/chat/chat";
import HomePage from "@renderer/pages/home/home";
import SettingPage from "@renderer/pages/settings/settings";
import MemoPage from "@renderer/pages/memo/memo";
import DiaryPage from "@renderer/pages/diary/diary";
import PersonPage from "@renderer/pages/person/person";
import WebPage from "@renderer/pages/web/web";
import TextEditorPage from "@renderer/pages/book/book";

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
