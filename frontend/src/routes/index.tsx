import { createHashRouter, RouteObject, useRouteError } from "react-router-dom";
import MainLayout from "@renderer/layouts/MainLayout";
import ChatPage from "@renderer/pages/chat/chat";
import HomePage from "@renderer/pages/home/home";
import SettingPage from "@renderer/pages/settings/settings";
import MemoPage from "@renderer/pages/memo/memo";
import DiaryPage from "@renderer/pages/diary/diary";
import PersonPage from "@renderer/pages/person/person";
import WebPage from "@renderer/pages/web/web";
import BookPage from "@renderer/pages/book/book";

function ErrorPage() {
  const error = useRouteError() as { statusText?: string; message?: string };
  return (
    <div style={{ padding: '2rem', textAlign: 'center',paddingTop:'100px' }}>
      <h1>😢 页面加载失败</h1>
      <p>请重启应用试试，或联系技术支持。</p>
      <p style={{ color: 'gray', fontSize: '0.9rem' }}>
        {error?.statusText || error?.message || '未知错误'}
      </p>
    </div>
  );
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <MainLayout />,
    errorElement: <ErrorPage />, 
    children: [
      { index: true, element: <HomePage /> },
      { path: "chat", element: <ChatPage /> },
      { path: "home", element: <HomePage /> },
      { path: "memo", element: <MemoPage /> },
      { path: "settings", element: <SettingPage /> },
      { path: "diary", element: <DiaryPage /> },
      { path: "person", element: <PersonPage /> },
      { path: "web", element: <WebPage /> },
      { path: "book", element: <BookPage /> },
    ],
  },
];

export const router = createHashRouter(routes);