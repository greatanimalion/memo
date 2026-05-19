// src/css-modules.d.ts (文件名可自定义)

// 声明 .module.css 文件
declare module '*.css' {
  const classes: { [key: string]: string };
  export default classes;
}

// 如果还使用 SCSS/SASS，也可以一并声明
declare module '*.scss' {
  const classes: { [key: string]: string };
  export default classes;
}