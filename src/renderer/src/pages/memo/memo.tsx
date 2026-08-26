import BlockNoteEditor from "@renderer/components/BlockNoteEditor";
import useFileStore from "@renderer/store/useFileStore";
import FileManager from "./components/FileManager";

function MemoPage() {
  const selectedFile = useFileStore((state) => state.selectedFile);

  return (
    <>
      {!selectedFile ? (
        <FileManager />
      ) : (
        <BlockNoteEditor selectedFile={selectedFile}></BlockNoteEditor>
      )}
    </>
  );
}

export default MemoPage;