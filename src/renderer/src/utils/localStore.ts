//输入对象存入localstore
export function setLocalStore(key: string, value: {value:any}) {
  localStorage.setItem(key, JSON.stringify(value));
}

//获取localstore中的对象
export function getLocalStore<T>(key: string):{value:T} | null {
  const value = localStorage.getItem(key);
  if (value) {
    return JSON.parse(value);
  }
  return null;
}

