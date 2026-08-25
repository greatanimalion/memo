//plugins\buildPlugin.ts
import path from "path";
import fs from "fs";

class BuildObj {
  //编译主进程代码
  buildMain() {
    require("esbuild").buildSync({
      entryPoints: ["./src/main/index.ts"],
      bundle: true,
      platform: "node",
      minify: true,
      outfile: "./dist/index.js",
      external: ["electron"],
    });
  }
  //为生产环境准备package.json
  preparePackageJson() {
    let pkgJsonPath = path.join(process.cwd(), "package.json");
    let localPkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    let electronConfig = localPkgJson.devDependencies.electron.replace("^", "");
    localPkgJson.main = "index.js";
    delete localPkgJson.scripts;
    delete localPkgJson.devDependencies;
    localPkgJson.devDependencies = { electron: electronConfig };
    let tarJsonPath = path.join(process.cwd(), "dist", "package.json");
    fs.writeFileSync(tarJsonPath, JSON.stringify(localPkgJson));
    fs.mkdirSync(path.join(process.cwd(), "dist/node_modules"));
  }
  //使用electron-builder制成安装包
  buildInstaller() {
    let options = {
      config: {
        directories: {
          output: path.join(process.cwd(), "release"),
          app: path.join(process.cwd(), "dist"),
        },
        files: ["**"],
        extends: null,
        productName: "Memory",
        appId: "com.memory.desktop",
        asar: true,
        nsis: {
          oneClick: false,
          perMachine: true,
          allowToChangeInstallationDirectory: true,
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          shortcutName: "MemoryDesktop",
        },
        mac: {
          target: ["dmg"],
          artifactName: "${productName}-${version}-${arch}.${ext}",
          type: "distribution",
          icon: "build/icons/icon.icns",
          hardenedRuntime: true,
          category: "public.app-category.productivity",
        },
        publish: [{ provider: "generic", url: "http://localhost:5500/" }],
      },
      project: process.cwd(),
    };
    return require("electron-builder").build(options);
  }
}
export let buildPlugin = () => {
  return {
    name: "build-plugin",
    closeBundle: () => {
      let buildObj = new BuildObj();
      buildObj.buildMain();
      buildObj.preparePackageJson();
      buildObj.buildInstaller();
    },
  };
};

async function afterPack(context) {
  const localeDir = path.join(context.appOutDir, "locales");
  if (fs.existsSync(localeDir)) {
    fs.readdirSync(localeDir)
      // 只保留中文与英文语言包
      .filter((file) => file.includes("zh-CN") || file.includes("en-US"))
      .forEach((file) => fs.unlinkSync(path.join(localeDir, file)));
  }
}

module.exports = afterPack;
