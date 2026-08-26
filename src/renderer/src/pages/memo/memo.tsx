import { useState } from "react";
import CommandPanel from "@renderer/components/CommandPanel";
import BlockNoteEditor from "@renderer/components/BlockNoteEditor";
import useFileStore from "@renderer/store/useFileStore";
import FileManager from "./components/FileManager";

function MemoPage() {
  const selectedFile = useFileStore((state) => state.selectedFile);

  return (
    <>
      {!selectedFile ? (
        <FileManager onFileSelect={(file) => {}} />
      ) : (
        <BlockNoteEditor selectedFile={selectedFile}></BlockNoteEditor>
      )}
    </>
  );
}

export default MemoPage;