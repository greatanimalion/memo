import { useEffect, useMemo, useState } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";
import { zh } from "@blocknote/core/locales";
import { zh as aiZh } from "@blocknote/xl-ai/locales";
import {
  FormattingToolbar,
  FormattingToolbarController,
  SuggestionMenuController,
  useCreateBlockNote,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
} from "@blocknote/react";
import { getLocalUrl } from '@renderer/utils'
import { BlockNoteEditor, filterSuggestionItems } from "@blocknote/core";
import { AIExtension } from "@blocknote/xl-ai";
import "@blocknote/xl-ai/style.css";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { X, Save, FileBraces } from "lucide-react";
import { ClientSideTransport } from "@blocknote/xl-ai";
import {
  AIMenuController,
  AIToolbarButton,
  getAISlashMenuItems,
} from "@blocknote/xl-ai";
import { AIKey } from "@renderer/types/common";

const darkThemes = new Set([0, 2, 4, 7, 6]);
function getThemeMode(): "light" | "dark" {
  const val = getLocalStore<number>("theme")?.value ?? 7;
  return darkThemes.has(val) ? "dark" : "light";
}
import {
  deleteFile,
  getMemoryById,
  updateMemory,
  uploadImage,
} from "@renderer/services/memeoy";
import { Button, Dropdown, MenuProps, message, Typography } from "antd";
import { fileToText, getCurrentTime, getExtension } from "@renderer/utils";
import { getLocalStore } from "@renderer/utils/localStore";
import { getModels } from "@renderer/utils/helper";
import {
  ExportOutlined,
  FileMarkdownOutlined,
  Html5Outlined,
  ImportOutlined,
} from "@ant-design/icons";
import { exportFile as platformExportFile } from "../platform";
import useFileStore from "@renderer/store/useFileStore";
import axios from "axios";
import { DOCUMENTMODEL } from "@renderer/constants";

function exportFile(editor: any, type: "md" | "html" | "json", name?: string) {
  let endFixed = "." + type;
  let markdownFromBlocks: any;
  if (type == "md")
    markdownFromBlocks = editor.blocksToMarkdownLossy(editor.document);
  else if (type == "html")
    markdownFromBlocks = editor.blocksToFullHTML(editor.document);
  else if (type == "json") markdownFromBlocks = JSON.stringify(editor.document);
  try {
    platformExportFile((name || getCurrentTime()) + endFixed, markdownFromBlocks);
  } catch (error) {
    message.open({
      type: "error",
      content: "导出失败:" + error,
    });
  }
}
const Editor = ({ selectedFile }) => {
  const [html, setHTML] = useState<string>("");
  const [themeMode, setThemeMode] = useState<"light" | "dark">(getThemeMode);
  const [messageApi, contextHolder] = message.useMessage();
  const { clearSelectedFile } = useFileStore();
  const getTransport = useMemo(() => {
    let currentModelName = getLocalStore<any>(DOCUMENTMODEL)?.value;
    const model = getModels(currentModelName);
    let key =
      getLocalStore<AIKey[]>("model")?.value.find(
        (item) => item.model === currentModelName,
      )?.key || "";
    return new ClientSideTransport({
      model: createOpenAICompatible({
        apiKey: key,
        baseURL: model.url,
        name: model.model,
      })(model.model),
    });
  }, []);
  const changeURL = useMemo(() => {
    return {
      addMap: new Map<string, string>(),
      deleteMap: new Map<string, string>(),
    };
  }, []);
  const editor = useCreateBlockNote({
    dictionary: {
      ...zh,
      ai: aiZh,
    },
    extensions: [
      AIExtension({
        transport: getTransport,
      }),
    ],
    uploadFile: async (file: File) => {
      const res = await uploadImage(file);
      changeURL.addMap.set(
        new Date().getTime().toString(),
        getLocalUrl(res.url),
      );
      return getLocalUrl(res.url);
    },
  });
  editor.onChange((_editor, { getChanges }) => {
    const changes = getChanges()[0];
    if (
      changes.block.type == "audio" ||
      changes.block.type == "image" ||
      changes.block.type == "video"
    ) {
      if (changes.type == "delete" && changes.source.type == "local") {
        changeURL.deleteMap.set(changes.block.id, changes.block.props.url);
      }
      if (changes.type == "insert" && changes.source.type == "local") {
        changeURL.addMap.set(changes.block.id, changes.block.props.url);
      }
      if (changes.source.type == "undo") {
        if (changes.type == "insert") {
          changeURL.addMap.set(changes.block.id, changes.block.props.url);
          changeURL.deleteMap.delete(changes.block.id);
        } else if (changes.type == "delete") {
          changeURL.deleteMap.set(changes.block.id, changes.block.props.url);
          changeURL.addMap.delete(changes.block.id);
        }
      }
      if (changes.source.type == "redo") {
        if (changes.type == "insert") {
          changeURL.addMap.set(changes.block.id, changes.block.props.url);
          changeURL.deleteMap.delete(changes.block.id);
        } else if (changes.type == "delete") {
          changeURL.deleteMap.set(changes.block.id, changes.block.props.url);
          changeURL.addMap.delete(changes.block.id);
        }
      }
    }
  });
  const onInputChange = async () => {
    const _html = editor.blocksToFullHTML(editor.document);
    setHTML(_html);
  };
  const handleSave = async () => {
    changeURL.deleteMap.forEach((url) => {
      deleteFile(url);
    });
    changeURL.addMap.clear();
    const res = await updateMemory(selectedFile.id, {
      ...selectedFile,
      content: html,
      updated: Date.now(),
    });
    if (res.code === 200) {
      messageApi.open({
        type: "success",
        content: "保存成功",
      });
    } else {
      messageApi.open({
        type: "error",
        content: "保存失败",
      });
    }
  };
  const handleExport = async (type: "md" | "html" | "json") => {
    await handleSave();
    exportFile(editor, type, selectedFile.title);
  };
  const items: MenuProps["items"] = [
    {
      key: "1",
      label: (
        <div
          className="flex items-center gap-1"
          onClick={() => handleExport("md")}
        >
          {" "}
          <FileMarkdownOutlined />
          markdown（有损）
        </div>
      ),
    },
    {
      key: "2",
      label: (
        <div
          className="flex items-center gap-1"
          onClick={() => handleExport("html")}
        >
          <Html5Outlined /> html
        </div>
      ),
    },
    {
      key: "3",
      label: (
        <div
          className="flex items-center gap-1"
          onClick={() => handleExport("json")}
        >
          <FileBraces size={16} />
          json
        </div>
      ),
    },
  ];
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeMode(getThemeMode()));
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "s") {
        document.getElementById("____Btn")?.click();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    async function loadInitialHTML() {
      const file = await getMemoryById(selectedFile.id);
      if (!file) return;
      const content = await axios
        .get(getLocalUrl(file.fileUrl!))//////////////////////////////////////
        .then((res) => res.data)
        .catch((err) => {
          messageApi.open({
            type: "error",
            content: "获取文件内容失败:" + err,
          });
          return "";
        });
      const blocks = editor.tryParseHTMLToBlocks(content);
      editor.replaceBlocks(editor.document, blocks);
    }
    loadInitialHTML();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-full">
        加载编辑器...
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full w-full">
      {contextHolder}
      {/* 工具栏 */}
      <div className="flex items-center justify-between p-3  border-b shadow-sm relative z-10">
        <div className="flex items-center  gap-2">
          <Button>
            <ImportOutlined />
            导入文件
            <input
              type="file"
              className="absolute top-0 left-0 w-full h-full opacity-0"
              accept=".html,.htm,.markdown,.md,.json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const ext = getExtension(file.name);
                const res: string = (await fileToText(file)) as string;
                let blocks;
                if (ext === "html" || ext === "htm")
                  blocks = await editor.tryParseHTMLToBlocks(res);
                else if (ext === "markdown" || ext === "md")
                  blocks = await editor.tryParseMarkdownToBlocks(res);
                else if (ext === "json") blocks = JSON.parse(res);
                editor.replaceBlocks(editor.document, blocks);
              }}
            />
          </Button>
          <Dropdown menu={{ items }} placement="bottomLeft">
            <Button>
              {" "}
              <ExportOutlined />
              导出文件
            </Button>
          </Dropdown>
        </div>
        <div style={{ width: "30%" }}>
          <Typography.Text
            style={{
              fontSize: "1.25rem",
              fontWeight: 500,
              color: "#4B5563",
              marginRight: "1.25rem",
            }}
            ellipsis={{ tooltip: selectedFile.title }}
          >
            {selectedFile.title}
          </Typography.Text>
        </div>
        <div className="flex items-center gap-2">
          <Button color="primary" variant="outlined" onClick={handleSave}>
            <div className="flex gap-1 items-center">
              <Save size={16} /> 保存
            </div>
          </Button>
          <Button
            variant="outlined"
            color="danger"
            onClick={() => {
              changeURL.addMap.forEach((url) => {
                deleteFile(url);
              });
              clearSelectedFile();
            }}
          >
            <div className="flex gap-1 items-center">
              {" "}
              <X size={16} />
              退出{" "}
            </div>
          </Button>
        </div>
      </div>
      {/* 编辑器 */}
      <div className="overflow-y-auto  h-full" style={{backgroundColor:'var(--bg-color)'}}>
        <BlockNoteView
          editor={editor}
          theme={themeMode}
          formattingToolbar={false}
          slashMenu={false}
          onChange={onInputChange}
        >
          <AIMenuController />
          <FormattingToolbarWithAI />
          <SuggestionMenuWithAI editor={editor} />
        </BlockNoteView>
      </div>
    </div>
  );
};

export default Editor;

function FormattingToolbarWithAI() {
  return (
    <FormattingToolbarController
      formattingToolbar={() => (
        <FormattingToolbar>
          {...getFormattingToolbarItems()}
          {/* Add the AI button */}
          <AIToolbarButton />
        </FormattingToolbar>
      )}
    />
  );
}
// Slash menu with the AI option added
function SuggestionMenuWithAI(props: {
  editor: BlockNoteEditor<any, any, any>;
}) {
  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={async (query) =>
        filterSuggestionItems(
          [
            ...getDefaultReactSlashMenuItems(props.editor).filter((item) => {
              return item.title !== "文件";
            }),
            ...getAISlashMenuItems(props.editor),
          ],
          query,
        )
      }
    />
  );
}
