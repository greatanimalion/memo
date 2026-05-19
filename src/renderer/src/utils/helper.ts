interface IndexConfig {
    name: string;
    keyPath?: string;
    unique?: boolean;
  }
  
  export class IndexedDBHelper<T extends { [key: string]: any }> {
    private dbName: string;
    private version: number;
    private db: IDBDatabase | null = null;
  
    constructor(dbName: string, version: number = 1) {
      this.dbName = dbName;
      this.version = version;
    }
  
    open(storeName: string, keyPath: string = 'id', indexes: IndexConfig[] = []): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);
  
        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const db = (event.target as IDBOpenDBRequest).result;
  
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath });
  
            indexes.forEach(index => {
              store.createIndex(index.name, index.keyPath ?? index.name, { unique: !!index.unique });
            });
          }
        };
  
        request.onsuccess = (event: Event) => {
          this.db = (event.target as IDBOpenDBRequest).result;
          resolve(this.db);
        };
  
        request.onerror = () => reject(request.error);
      });
    }
  
    private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
      if (!this.db) throw new Error("Database not opened.");
      const tx = this.db.transaction(storeName, mode);
      return tx.objectStore(storeName);
    }
  
    add(storeName: string, data: T): Promise<IDBValidKey> {
      return new Promise((resolve, reject) => {
        const store = this.getStore(storeName, 'readwrite');
        const request = store.add(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
  
    get(storeName: string, key: IDBValidKey): Promise<T | undefined> {
      return new Promise((resolve, reject) => {
        const store = this.getStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
  
    getAll(storeName: string): Promise<T[]> {
      return new Promise((resolve, reject) => {
        const store = this.getStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    }
  
    update(storeName: string, data: T): Promise<IDBValidKey> {
      return new Promise((resolve, reject) => {
        const store = this.getStore(storeName, 'readwrite');
        const request = store.put(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
  
    delete(storeName: string, key: IDBValidKey): Promise<void> {
      return new Promise((resolve, reject) => {
        const store = this.getStore(storeName, 'readwrite');
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  
    close(): void {
      if (this.db) {
        this.db.close();
      }
    }
  }
  

function createSingletonDBHelper<T extends { [key: string]: any; }>(dbName: string, version: number): () => IndexedDBHelper<T> {
  let instance: IndexedDBHelper<T> | null = null;
  return () => {
    if (!instance) {
      instance = new IndexedDBHelper<T>(dbName, version);
    }
    return instance;
  };
}

// 使用工厂创建单例
export const getMemoDatabaseHelper = createSingletonDBHelper<any>("MemoDatabase", 1);
export const getDateListDatabaseHelper = createSingletonDBHelper<any>("DateListDatabase", 1);


export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // 月份从0开始
  const day = String(date.getDate()).padStart(2, "0");

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
  
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // 月份从0开始
    const day = String(date.getDate()).padStart(2, "0");  
    return `${year}-${month}-${day}`;
  }

export function getRandomLowercaseString(length: number = 5): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 生成基于时间戳的五位唯一流水号
 * @returns 五位数字字符串
 */
export function generateSerialNumber(): string {
  const timestamp = Date.now();
  const randomNum = Math.floor(Math.random() * 1000);
  const serial = (timestamp % 100000) + randomNum % 100000;
  return serial.toString().padStart(5, '0');
}


export  const debounce = <T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  }
}

export  enum NoteType {
  Document = 'Document', // 文档
  Folder = 'Folder', // 文件夹
}


interface TreeNode {
  id: string;
  parentId: string | null;
  isFolder: boolean;
  title: string;
  content: string;
  created: string;
  updated: string;
  key?: string; // 为 Ant Design Tree 添加的 key 属性
  children?: TreeNode[];
}

/**
 * 将扁平数组转换为树形结构
 * @param items 扁平数组
 * @param parentId 父节点ID，顶层节点为null
 * @returns 树形结构数组
 */
 export function buildTree(items: TreeNode[], parentId: string | null =  null): TreeNode[] {
  const tree: TreeNode[] = [];
  // 找出所有父节点为指定parentId的节点
  const children = items.filter(item => item.parentId == parentId); 
  // 递归构建子树
  for (const child of children) {
    const node: TreeNode = {
      ...child,
      key: child.id, // Ant Design Tree需要key属性
      title: child.title,
      children: buildTree(items, child.id)
    };
    // 如果是文件夹且有子节点，则保留children，否则设为undefined
    if (!node.isFolder || node?.children?.length === 0) {
      delete node.children;
    }
    tree.push(node);
  }
  return tree;
}


export  const getModels = (type: 'qwen-plus' | 'glm-5.1' | 'deepseek' | 'openRouter') => {
    switch (type) {
      case 'qwen-plus':
        return {
          model: 'qwen-plus',
          url: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
        }
      case 'glm-5.1':
        return {
          model: 'glm-5.1',
          url: 'https://open.bigmodel.cn/api/paas/v4'
        }
      case 'deepseek':
        return {
          model: 'deepseek-chat',
          url: 'https://api.deepseek.com'
        }
      case 'openRouter':
        return {
          model: 'openai/gpt-5.2',
          url: 'https://openrouter.ai/api/v1'
        }
      default:
        return {
          model: 'qwen-plus',
          url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        }
    }
  }