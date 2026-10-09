# DSH Better Reasoning Effort — Capsule

基于 [HaoyueQin/dsh-better-reasoning-effort v0.5.2](https://github.com/HaoyueQin/dsh-better-reasoning-effort/tree/v0.5.2) 的私人定制版。

## 界面调整

- 28 px 高的胶囊轨道，32 px 圆形滑钮。
- 保留浅色蓝色系和深色紫色系，使用柔和渐变和轻微光泽。
- 移除辐射、粒子和呼吸动画。
- 档位文字随当前模型自动适配，高亮当前档位。
- 保留上游的拖动、键盘选择、状态同步和失败回退逻辑；后端行为不变。

已在 DeepSeek Harness 0.2.0-rc.2 中检查界面显示及 Medium/High 切换。

## 构建与安装

需要 Node.js ^22.19.0 或 >=24。

```sh
npm install
npm run build
dsh plugin --profile desktop add link:/absolute/path/to/this/repository
```

桌面版使用其内置 dsh 命令也可安装。构建后使用生成的 lib/；如界面仍使用旧缓存，可在插件页面关闭再开启本插件组件。运行任务期间不要重启 Harness。

当前仓库版本标为 private，避免误发布到 npm。仓库不包含会话、个人设置或 API 密钥。

## 主要修改

- src/client/ComposerSlider.tsx：移除动画，增加档位文字和 SVG 圆形滑钮。
- src/client/styles.ts：胶囊滑条、浅深主题和文字样式。
- src/client/locales.ts：更新滑块说明。

## 上游与许可证

原插件使用 MIT 许可证，版权及许可证保留在 LICENSE。完整上游使用文档见 [README.upstream.md](README.upstream.md) 和 [README.zh.md](README.zh.md)。滑块的更早来源为 HanaAyane/dsh-reasoning-effort，相关致谢保留在上游文档。
