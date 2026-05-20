import { useEffect, useMemo, useState } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import '@blocknote/core/fonts/inter.css';
import { zh } from "@blocknote/core/locales";
import { zh as aiZh } from "@blocknote/xl-ai/locales";
import {
  FormattingToolbar, FormattingToolbarController, SuggestionMenuController, useCreateBlockNote, getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
} from "@blocknote/react";
import { BlockNoteEditor, filterSuggestionItems } from "@blocknote/core";
//@ts-expect-error
import { BlockNoteAIExtension } from "@blocknote/xl-ai";
import { AIExtension } from "@blocknote/xl-ai";
import "@blocknote/xl-ai/style.css";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { X, Save, FileBraces } from 'lucide-react';
import { ClientSideTransport } from "@blocknote/xl-ai";
import { AIMenuController, AIToolbarButton, getAISlashMenuItems } from "@blocknote/xl-ai";
import { AIKey } from '../types/common';
import { deleteFile, getMemoryById, updateMemory, uploadImage } from '../services/memeoy';
import { Button, Dropdown, MenuProps, message, Typography } from 'antd';
import { fileToText, getCurrentTime, getExtension, getReadableByteSize } from '../utils';
import { getLocalStore } from '../utils/localStore';
import { getModels } from '../utils/helper';
import { ExportOutlined, FileMarkdownOutlined, Html5Outlined, ImportOutlined } from '@ant-design/icons';
import { ipcRenderer } from 'electron';
import useFileStore from '../store/useFileStore';

function exportFile(editor: any, type: 'md' | 'html' | 'json', name?: string) {
  let endFixed = '.' + type
  let markdownFromBlocks
  if (type == 'md') markdownFromBlocks = editor.blocksToMarkdownLossy(editor.document);
  else if (type == 'html') markdownFromBlocks = editor.blocksToFullHTML(editor.document);
  else if (type == 'json') markdownFromBlocks = JSON.stringify(editor.document)
  try {
    ipcRenderer.send('exportFile',
      {
        filename: (name || getCurrentTime()) + endFixed,
        content: markdownFromBlocks
      }
    );
  } catch (error) {
    message.open({
      type: 'error',
      content: '导出失败:' + error,
    });
  }
}
const Editor= ({ selectedFile }) => {
  const [html, setHTML] = useState<string>("");
  const [messageApi, contextHolder] = message.useMessage();
  const { clearSelectedFile } = useFileStore();
  const getTransport = useMemo(() => {
    let currentModelName = getLocalStore<any>('documentModel')?.value;
    const model = getModels(currentModelName)
    let key = getLocalStore<AIKey[]>('model')?.value.find((item) => item.model === currentModelName)?.key || ''
    return new ClientSideTransport({
      model: createOpenAICompatible({
        apiKey: key,
        baseURL: model.url,
        name: model.model,
      })(model.model),
    })
  }, [])
  const changeURL = useMemo(() => {
    return {
      addMap: new Map<string, string>(),
      deleteMap: new Map<string, string>(),
    }
  }, [])
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
      const res = await uploadImage(file)
      changeURL.addMap.set(new Date().getTime().toString(), 'http://localhost:32068' + res.url)
      return 'http://localhost:32068' + res.url
    },

  });
  editor.onChange((_editor, { getChanges }) => {
    const changes = getChanges()[0];
    if (changes.block.type == 'audio'
      || changes.block.type == 'image'
      || changes.block.type == 'video'
    ) {
      if (changes.type == 'delete' && changes.source.type == 'local') {
        changeURL.deleteMap.set(changes.block.id, changes.block.props.url)
      }
      if (changes.type == 'insert' && changes.source.type == 'local') {
        changeURL.addMap.set(changes.block.id, changes.block.props.url)
      }
      if (changes.source.type == 'undo') {
        if (changes.type == 'insert') {
          changeURL.addMap.set(changes.block.id, changes.block.props.url)
          changeURL.deleteMap.delete(changes.block.id)
        } else if (changes.type == 'delete') {
          changeURL.deleteMap.set(changes.block.id, changes.block.props.url)
          changeURL.addMap.delete(changes.block.id)
        }
      }
      if (changes.source.type == 'redo') {
        if (changes.type == 'insert') {
          changeURL.addMap.set(changes.block.id, changes.block.props.url)
          changeURL.deleteMap.delete(changes.block.id)
        } else if (changes.type == 'delete') {
          changeURL.deleteMap.set(changes.block.id, changes.block.props.url)
          changeURL.addMap.delete(changes.block.id)
        }
      }
    }
  });
  const onInputChange = async () => {
    const _html = await editor.blocksToFullHTML(editor.document);
    setHTML(_html);
  };
  const handleSave = async () => {
    changeURL.deleteMap.forEach((url => {
      deleteFile(url)
    }))
    changeURL.addMap.clear()
    const res = await updateMemory(selectedFile.id, { ...selectedFile, content: html, size: getReadableByteSize(html), updated: Date.now() })
    if (res.id) {
      messageApi.open({
        type: 'success',
        content: '保存成功',
      });
    } else {
      messageApi.open({
        type: 'error',
        content: '保存失败',
      });
    };
  };
  const handleExport = async (type: 'md' | 'html' | 'json') => {
    await handleSave();
    exportFile(editor, type, selectedFile.title);
  }
  const items: MenuProps['items'] = [
    {
      key: '1',
      label: (
        <div className='flex items-center gap-1' onClick={() => handleExport('md')}> <FileMarkdownOutlined />markdown（有损）</div>
      ),
    },
    {
      key: '2',
      label: (
        <div className='flex items-center gap-1' onClick={() => handleExport('html')}><Html5Outlined /> html</div>
      ),
    }, {
      key: '3',
      label: (
        <div className='flex items-center gap-1' onClick={() => handleExport('json')}><FileBraces size={16} />json</div>
      )
    }
  ];
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 's') {
        document.getElementById('____Btn')?.click();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    async function loadInitialHTML() {
      const file = await getMemoryById(selectedFile.id)
      if (!file) return
      const blocks = await editor.tryParseHTMLToBlocks(file.content || "");
      editor.replaceBlocks(editor.document, blocks);
    }
    loadInitialHTML();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  // 确保 editor 已初始化
  if (!editor) {
    return <div className="flex items-center justify-center h-full text-gray-500">加载编辑器...</div>;
  }
  return (
    <div className="flex flex-col h-full w-full">
      {contextHolder}
      {/* 工具栏 */}
      <div className="flex items-center justify-between p-3 bg-white border-b border-gray-200 shadow-sm relative z-10">
        <div className="flex items-center  gap-2">
          <Button><ImportOutlined />导入文件
            <input type="file"
              className='absolute top-0 left-0 w-full h-full opacity-0'
              accept=".html,.htm,.markdown,.md,.json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const ext = getExtension(file.name)
                const res: string = await fileToText(file) as string;
                let blocks
                if (ext === "html" || ext === "htm") blocks = await editor.tryParseHTMLToBlocks(res);
                else if (ext === "markdown" || ext === "md") blocks = await editor.tryParseMarkdownToBlocks(res);
                else if (ext === "json") blocks = JSON.parse(res);
                editor.replaceBlocks(editor.document, blocks);
              }} /></Button>
          <Dropdown menu={{ items }} placement="bottomLeft">
            <Button> <ExportOutlined />导出文件</Button>
          </Dropdown>
        </div>
        <div style={{ width: "30%" }}>
          <Typography.Text style={{ fontSize: '1.25rem', fontWeight: 500, color: '#4B5563', marginRight: '1.25rem' }} ellipsis={{ tooltip: selectedFile.title }}>
            {selectedFile.title}
          </Typography.Text>
        </div>
        <div className="flex items-center gap-2">
          <Button color="primary" variant="outlined" id='____Btn' onClick={handleSave}>
            <div className='flex gap-1 items-center'>
              <Save size={16} /> 保存</div>
          </Button>
          <Button variant='outlined' color="danger" onClick={() => {
            changeURL.addMap.forEach((url => {
              deleteFile(url)
            }))
            clearSelectedFile()
          }}>
            <div className='flex gap-1 items-center'> <X size={16} />退出 </div>
          </Button>
        </div>
      </div>
      {/* 编辑器 */}
      <div className="overflow-y-auto bg-white h-full">
        <BlockNoteView editor={editor} theme="light" formattingToolbar={false} slashMenu={false} onChange={onInputChange}>
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
            ...getDefaultReactSlashMenuItems(props.editor).filter(
              (item) => {
                return item.title !== '文件'
              }
            ),
            ...getAISlashMenuItems(props.editor),
          ],
          query,
        )
      }
    />
  );
}



