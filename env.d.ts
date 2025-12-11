declare module "*?worker&url" {
  const url: string;
  export default url;
}

// 构建信息全局变量
declare const __BUILD_COMMIT__: string;
declare const __BUILD_DATE__: string;
