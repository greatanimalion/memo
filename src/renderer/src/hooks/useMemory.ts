import { useEffect, useCallback } from "react";
import { SortBy } from "../types/common";
import {
  createMemory,
  getMemoryChildById,
  starredMemory,
} from "../services/memory";
import { generateUUID } from "../utils/helper";
import { toggleFileStar } from "../utils";
import useFileStore from "../store/useFileStore";

export const useMemory = () => {
  const currentPath = useFileStore((state) => state.currentPathArr);
  const setCurrentPath = useFileStore((state) => state.setCurrentPathArr);
  const setSortBy = useFileStore((state) => state.setSortBy);
  const sortBy = useFileStore((state) => state.sortBy);
  const viewMode = useFileStore((state) => state.viewMode);
  const setViewMode = useFileStore((state) => state.setViewMode);
  const setCurrentFolderItemsArr = useFileStore(
    (state) => state.setCurrentFolderItemsArr,
  );
  const currentFolderItems = useFileStore(
    (state) => state.currentFolderItemsArr,
  );
  const currentFileIds = useFileStore((state) => state.currentFileIdsArr);
  const setCurrentFileIds = useFileStore((state) => state.setCurrentFileIdsArr);
  const refreshCurrentFolderItemsArr = useFileStore(
    (state) => state.refreshCurrentFolderItemsArr,
  );
  // 切换排序方式
  const changeSortType = useCallback(
    (type: SortBy) => {
      setSortBy(type);
      if (!currentFolderItems.length) return;
      if (type === "date") {
        setCurrentFolderItemsArr(
          [...currentFolderItems].sort((a, b) => b.updated - a.updated),
        );
      } else {
        setCurrentFolderItemsArr(
          [...currentFolderItems].sort((a, b) =>
            a.title.localeCompare(b.title),
          ),
        );
      }
    },
    [currentFolderItems],
  );

  // 点击文件夹
  const handleFolderClick = useCallback(
    async (folderName: string, fileId: string) => {
      const memorys = await getMemoryChildById(fileId);
      if (memorys) {
        const store = useFileStore.getState();
        store.setCurrentPathArr([...store.currentPathArr, folderName]);
        store.setCurrentFolderItemsArr(memorys);
        store.setCurrentFileIdsArr([...store.currentFileIdsArr, fileId]);
      }
    },
    [],
  );

  // 返回上一级
  const handleBackClick = useCallback(async () => {
    if (currentPath.length > 1) {
      const newPath = [...currentPath];
      newPath.pop();
      const newIds = [...currentFileIds];
      newIds.pop();
      setCurrentPath(newPath);
      setCurrentFileIds(newIds);
      await refreshCurrentFolderItemsArr();
    }
  }, [currentPath, currentFileIds]);

  useEffect(() => {
    let cancelled = false;
    if (currentFolderItems.length == 0) {
      (async () => {
        const memorys = await getMemoryChildById(
          currentFileIds[currentFileIds.length - 1],
        );
        if (!cancelled) setCurrentFolderItemsArr(memorys);
      })();
    }
    return () => {
      cancelled = true;
    };
  }, []);
  // 切换收藏
  const handleToggleStar = useCallback(
    async (fileId: string) => {
      await starredMemory(fileId);
      setCurrentFolderItemsArr(toggleFileStar(currentFolderItems, fileId));
    },
    [currentFolderItems],
  );

  // 创建文件/文件夹
  const createFileOrFolder = useCallback(
    async (name: string, isFolder: number) => {
      const date = new Date().getTime();
      const result = await createMemory({
        title: name,
        isFolder,
        parentId: currentFileIds[currentFileIds.length - 1],
        created: date,
        updated: date,
        visitedTime: date,
        id: generateUUID(),
        size: "0B",
      });

      if (!result.id) {
        return false;
      }
      await refreshCurrentFolderItemsArr();
      return true;
    },
    [currentFileIds],
  );

  // 搜索文件
  const searchFiles = useCallback(
    (value: string) => {
      if (!value) {
        refreshCurrentFolderItemsArr();
      } else {
        const filtered = currentFolderItems.filter((item) =>
          item.title.includes(value),
        );
        setCurrentFolderItemsArr(filtered);
      }
    },
    [currentFolderItems, currentFileIds],
  );

  return {
    viewMode,
    setViewMode,
    sortBy,
    currentPath,
    changeSortType,
    handleFolderClick,
    handleBackClick,
    handleToggleStar,
    createFileOrFolder,
    searchFiles,
  };
};
