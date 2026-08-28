/**
 * 应用常量定义
 * 统一管理应用中使用的常量
 */
//后端端口
export const port=32068

//持久化存储的key
export const DOCUMENTMODEL='documentModel'//memo编辑采用的模型

import { Memory } from "@type";

// 子文件夹内容
export const SUB_FOLDER_CONTENTS: Record<string, Memory[]> = {};

// 应用名称
export const APP_title = "多功能记事本";

// 默认路径
export const DEFAULT_PATH = ["根目录"];

// AI 快捷提示
export const AI_PROMPTS = [
  {
    title: "帮我写自我介绍",
    description: "生成专业的自我介绍文本",
    prompt: "帮我写一段自我介绍",
  },
  {
    title: "总结内容要点",
    description: "提取文本的核心信息",
    prompt: "总结以下内容的核心要点：",
  },
  {
    title: "优化文字表达",
    description: "改进文案的流畅度和专业性",
    prompt: "帮我优化这段文字的表达：",
  },
  {
    title: "生成待办清单",
    description: "创建结构化的任务列表",
    prompt: "生成一个待办事项清单：",
  },
];

export const webListcontent = [
  {
    name: "掘金",
    url: "https://juejin.cn/",
    iconType: "image",
    imageType: "url",
    imageUrl:
      "https://ts4.tc.mm.bing.net/th/id/ODF.c7-meklXx3pbAJ3Yd0_ZzQ?w=32&h=32&qlt=90&pcl=fffffc&o=6&pid=1.2",
  },
  {
    name: "知乎",
    url: "https://www.zhihu.com/",
    iconType: "image",
    imageType: "url",
    imageUrl:
      "https://ts3.tc.mm.bing.net/th/id/ODF.IZLJjDFkxzF8L18jciUW9Q?w=32&h=32&qlt=90&pcl=fffffc&o=6&pid=1.2",
  },
  {
    name: "微博",
    url: "https://weibo.com/",
    iconType: "image",
    imageType: "url",
    imageUrl:
      "https://ts3.tc.mm.bing.net/th/id/ODF.qJ-ykoFwP262TObc-fcbNQ?w=32&h=32&qlt=90&pcl=fffffc&o=6&pid=1.2",
  },
  {
    name: "百度贴吧",
    url: "https://tieba.baidu.com/",
    iconType: "image",
    imageType: "url",
    imageUrl:
      "https://ts4.tc.mm.bing.net/th/id/ODF.cokqhjcBQYZTocM74-i6XA?w=32&h=32&qlt=90&pcl=fffffa&o=6&pid=1.2",
  },
  {
    name: "简书",
    url: "https://www.jianshu.com/",
    iconType: "image",
    imageType: "url",
    imageUrl:
      "https://ts4.tc.mm.bing.net/th/id/ODF.95bNdsmoIrcwkFf28dHfRQ?w=32&h=32&qlt=90&pcl=fffffa&o=6&pid=1.2",
  },
  {
    name: "CSDN",
    url: "https://www.csdn.net/",
    iconType: "image",
    imageType: "url",
    imageUrl:
      "https://ts4.tc.mm.bing.net/th/id/ODF.XgN2n5Bhof8syOMYSfYpGg?w=32&h=32&qlt=90&pcl=fffffc&o=6&pid=1.2",
  },
];
