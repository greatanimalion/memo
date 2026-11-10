import BlockNoteEditor from "@renderer/components/BlockNoteEditor";
import useFileStore from "@renderer/store/useFileStore";
import FileManager from "./components/FileManager";
import RecentVisited from "./components/RecentVisited";

function MemoPage() {
  const selectedFile = useFileStore((state) => state.selectedFile);

  return (
    <>
      {!selectedFile ? (
        <div className="flex flex-1 h-full min-w-0 overflow-hidden">
          <FileManager />
          <RecentVisited />
        </div>
      ) : (
        <BlockNoteEditor selectedFile={selectedFile}></BlockNoteEditor>
      )}
    </>
  );
}

export default MemoPage;