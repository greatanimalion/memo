import { create } from "zustand";
import { ViewMode, SortBy } from "../types/common";
import { Memory } from "../../../types";
import { getMemoryChildById, starredMemory } from "../services/memory";
interface FileStoreState {
  currentFileIdsArr: string[];
  setCurrentFileIdsArr: (id: string[]) => void;
  // 当前路径
  currentPathArr: string[];
  setCurrentPathArr: (path: string[]) => void;
  // 当前文件夹内容
  currentFolderItemsArr: Memory[];
  setCurrentFolderItemsArr: (items: Memory[]) => void;
  // 选中的文件
  selectedFile: Memory | null;
  setSelectedFile: (file: Memory | null) => void;
  // 视图模式
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  // 排序方式
  sortBy: SortBy;
  setSortBy: (sort: SortBy) => void;
  // 是否显示编辑器
  showEditor: boolean;
  setShowEditor: (show: boolean) => void;
  toggleStar: (id: string) => void;
  // 重置状态
  reset: () => void;
  refreshCurrentFolderItemsArr: () => void;
  clearSelectedFile: () => void;
}

const initialState = {
  currentPathArr: ["根目录"],
  currentFolderItemsArr: [],
  currentFileIdsArr: ["root"],
  selectedFile: null,
  viewMode: "list" as ViewMode,
  sortBy: "name" as SortBy,
  showEditor: false,
};

const useFileStore = create<FileStoreState>((set) => ({
  ...initialState,
  setCurrentFileIdsArr: (currentFileIdsArr: string[]) =>
    set({ currentFileIdsArr }),
  setCurrentPathArr: (currentPath) => set({ currentPathArr: currentPath }),
  setCurrentFolderItemsArr: (items: Memory[]) => {
    const { sortBy } = useFileStore.getState();
    const sorted = [...items];
    if (sortBy === "date") {
      sorted.sort((a, b) => b.updated - a.updated);
    } else {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    set({ currentFolderItemsArr: sorted });
  },
  refreshCurrentFolderItemsArr: async () => {
    const ids = useFileStore.getState().currentFileIdsArr;
    const id = ids.at(-1);
    if (!id) return;
    const newChildFile = await getMemoryChildById(id);
    useFileStore.getState().setCurrentFolderItemsArr(newChildFile);
  },
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  clearSelectedFile: () => set({ selectedFile: null }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSortBy: (sortBy) => set({ sortBy }),
  setShowEditor: (showEditor) => set({ showEditor }),
  toggleStar: async (id) => {
    await starredMemory(id);
    useFileStore.getState().refreshCurrentFolderItemsArr();
  },
  reset: () => set(initialState),
}));
export default useFileStore;
